import { existsSync, readFileSync } from "node:fs";
import { collectDatasetFiles } from "./data-utils.mjs";
import { writeDataFile } from "./write-data-file.mjs";

const observedBatch = process.argv.includes("--observed-batch");
const massBatch = process.argv.includes("--mass-batch");
const worldBatch = massBatch || process.argv.includes("--world-batch");
const outputPrefix = massBatch ? "reports/mass-name-expansion" : worldBatch ? "reports/world-ranking-expansion" : observedBatch ? "reports/observed-ranking-expansion" : "reports/priority-country-expansion";
const baselinePath = `${outputPrefix}-before.json`;
const catalog = JSON.parse(readFileSync("src/data/countries.json", "utf8")).filter((c) => c.enabled);
const groups = new Map(catalog.map((c) => [c.code, Object.fromEntries(["male", "female", "surname"].map((band) => [band, new Set()]))]));
const key = (name) => name.normalize("NFKC").trim().toLowerCase();
for (const file of collectDatasetFiles("src/data")) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  const country = groups.get(data.meta.country);
  if (!country) continue;
  for (const record of data.records) {
    const band = data.meta.type === "surname" ? "surname" : record.gender;
    if (!country[band] || (data.meta.country === "JP" && band !== "surname" && record.rankingBasis !== "overall")) continue;
    country[band].add(key(record.name));
  }
}
const index = JSON.parse(readFileSync("src/reference-data/index.json", "utf8"));
const evidenceCounts = new Map(catalog.map((c) => [c.code, { male: 0, female: 0, surname: 0 }]));
for (const file of index.files) {
  const data = JSON.parse(readFileSync(file.path, "utf8"));
  const country = groups.get(data.meta.country);
  if (!country) continue;
  for (const record of data.records) {
    const band = data.meta.type === "surname" ? "surname" : record.gender;
    country[band]?.add(key(record.name));
    if (record.evidenceRank && country[band]) evidenceCounts.get(data.meta.country)[band]++;
  }
}
const counts = catalog.map((c) => ({ country: c.code, name: c.nameJa, ...Object.fromEntries(Object.entries(groups.get(c.code)).map(([band, names]) => [band, names.size])) }));
for (const row of counts) {
  row.givenName = row.male + row.female;
  row.total = row.givenName + row.surname;
}
if (!existsSync(baselinePath)) {
  const byGiven = [...counts].sort((a, b) => a.givenName - b.givenName || a.country.localeCompare(b.country));
  const bySurname = [...counts].sort((a, b) => a.surname - b.surname || a.country.localeCompare(b.country));
  const selected = new Set([...byGiven.slice(0, 30), ...bySurname.slice(0, 30)].map((r) => r.country));
  const priorities = counts.filter((r) => selected.has(r.country)).sort((a, b) => a.total - b.total || a.country.localeCompare(b.country));
  writeDataFile(baselinePath, JSON.stringify({ createdAt: new Date().toISOString(), selection: "Union of the 30 smallest given-name and 30 smallest surname collections; work from smallest combined total", counts, priorities: priorities.map((r) => r.country) }, null, 2) + "\n");
}
const rawBaseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const baseline = { counts: rawBaseline.counts ?? rawBaseline.before, priorities: rawBaseline.priorities ?? rawBaseline.countries };
const before = new Map(baseline.counts.map((r) => [r.country, r]));
const audit = counts.map((r) => ({ ...r, before: before.get(r.country), added: Object.fromEntries(["male", "female", "givenName", "surname", "total"].map((band) => [band, r[band] - (before.get(r.country)?.[band] ?? r[band])])), remainingReason: baseline.priorities.includes(r.country) && r.total === before.get(r.country)?.total ? "取得済みの国別原本と国籍・出生地・居住地の明示記録では、既存登録に含まれない有効名を確認できませんでした。" : null }));
const ordered = (band) => [...audit].sort((a, b) => a[band] - b[band] || a.country.localeCompare(b.country));
const referenceRankCoverage = [...evidenceCounts].map(([country, bands]) => ({ country, ...bands }));
const report = { checkedAt: new Date().toISOString(), countries: counts.length, priorities: baseline.priorities, expandedCountries: audit.filter((r) => r.added.total > 0).length, unexpandedPriorities: audit.filter((r) => r.remainingReason).map((r) => ({ country: r.country, reason: r.remainingReason })), added: Object.fromEntries(["male", "female", "surname", "total"].map((band) => [band, audit.reduce((n, r) => n + r.added[band], 0)])), referenceRankCoverage, byGivenName: ordered("givenName"), bySurname: ordered("surname"), audit };
if (rawBaseline.referenceRankCoverage) {
  const prior = new Map(rawBaseline.referenceRankCoverage.map((r) => [r.country, r]));
  report.addedReferenceRanks = Object.fromEntries(["male", "female", "surname"].map((band) => [band, referenceRankCoverage.reduce((sum, r) => sum + r[band] - (prior.get(r.country)?.[band] ?? 0), 0)]));
  report.addedReferenceRanks.total = Object.values(report.addedReferenceRanks).reduce((sum, n) => sum + n, 0);
}
writeDataFile(`${outputPrefix}.json`, JSON.stringify(report, null, 2) + "\n");
const nf = (n) => n.toLocaleString("ja-JP");
const table = (rows, band) => "|順|国|男性名|女性名|名前合計|名字|今回の追加|\n|---:|---|---:|---:|---:|---:|---:|\n" + rows.map((r, i) => `|${i + 1}|${r.name} (${r.country})|${nf(r.male)}|${nf(r.female)}|${nf(r.givenName)}|${nf(r.surname)}|+${nf(r.added[band])}|`).join("\n") + "\n";
writeDataFile(`${outputPrefix}.md`, (worldBatch ? "# 全対応国の順位根拠付き候補の拡張\n\n" : "# 登録数が少ない国からの拡張\n\n") + (worldBatch ? `全${counts.length}か国を集計。前回対象以外の${baseline.priorities.length}か国に公開人物の国籍からの実人数集計を追加し、前回対象国の集計を維持しました。\n\n` : `全${counts.length}か国を集計。名前（男女合計）と名字それぞれの下位30か国の和集合、${baseline.priorities.length}か国を優先しました。\n\n`) + "綴りを正規化して同一国・同一区分の重複を除外。男女両方の使用例がある名前は各性別に1件ずつ含みます。順位付きデータと順位なし辞書の合計であり、人口順位の対応範囲を示す数字ではありません。公開人物からの辞書は公人に偏りがあります。\n\n" + "## 名前が少ない順\n\n" + table(report.byGivenName, "givenName") + "\n## 名字が少ない順\n\n" + table(report.bySurname, "surname") + "\n## 今回優先した国の変更前後\n\n|国|男性名|女性名|名字|\n|---|---:|---:|---:|\n" + baseline.priorities.map((code) => { const r = audit.find((r) => r.country === code); return `|${r.name} (${code})|${nf(r.before.male)} → ${nf(r.male)}|${nf(r.before.female)} → ${nf(r.female)}|${nf(r.before.surname)} → ${nf(r.surname)}|`; }).join("\n") + "\n\n## 実人数に基づく資料内参考順位の対応数\n\n全国順位ではありません。公開人物の記載・国籍/出生地/居住地に偏りがあり、日本の順位とは比較しません。確認人数・対象人数・同率順位・取得日・集計クエリを表示します。\n\n|国|男性名|女性名|名字|\n|---|---:|---:|---:|\n" + referenceRankCoverage.filter((r) => r.male || r.female || r.surname).map((r) => `|${catalog.find((c) => c.code === r.country).nameJa} (${r.country})|${nf(r.male)}|${nf(r.female)}|${nf(r.surname)}|`).join("\n") + "\n");
if (worldBatch && report.addedReferenceRanks) {
  const path = `${outputPrefix}.md`;
  const total = referenceRankCoverage.reduce((sum, r) => sum + r.male + r.female + r.surname, 0);
  const summary = `資料内参考順位の根拠を新たに **${nf(report.addedReferenceRanks.total)}候補**へ追加。対応総数は **${nf(total)}候補**（国別・男女別の合計）です。全国人口の順位ではありません。名前・名字の収録総数の純増は **${nf(report.added.total)}件**です。\n\n`;
  writeDataFile(path, readFileSync(path, "utf8").replace("\n\n", "\n\n" + summary).replaceAll("|+-", "|-"));
}
if (massBatch) {
  const path = `${outputPrefix}.md`;
  writeDataFile(path, readFileSync(path, "utf8").replace("# 全対応国の順位根拠付き候補の拡張", "# 名前・名字の追加収録").replace(/全\d+か国を集計。前回対象以外の\d+か国に公開人物の国籍からの実人数集計を追加し、前回対象国の集計を維持しました。/, `全${counts.length}か国のWGND 2.0国別原本を取り込み、20か国では国籍・出生地・居住地の明示記録に基づく資料内順位も再集計しました。WGNDの出典重みは人数・人気順位に変換していません。`));
}
console.log(JSON.stringify({ countries: report.countries, priorities: report.priorities, expanded: report.expandedCountries, added: report.added }));
