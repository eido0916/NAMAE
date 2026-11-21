import { readFileSync } from "node:fs";
import { writeDataFile as writeFileSync } from "./write-data-file.mjs";
import { readDatasets, readReferenceDatasets } from "./data-utils.mjs";

const catalog = JSON.parse(readFileSync("src/data/countries.json", "utf8")).filter((country) => country.enabled);
const ranked = readDatasets("src/data");
const references = readReferenceDatasets();
const oldReport = JSON.parse(readFileSync("reports/name-coverage.json", "utf8"));
const beforePath = "reports/global-expansion-before.json";
// The first audit uses the previous, accepted coverage report, before national imports.
const original = JSON.parse(readFileSync(beforePath, "utf8"));
const oldByCountry = new Map(oldReport.coverage.map((country) => [country.country, country]));
for (const row of original) {
  const old = oldByCountry.get(row.country);
  if (old) for (const band of ["male", "female", "surname"]) row[band] = Math.min(row[band], old[band].names);
}
writeFileSync(beforePath, JSON.stringify(original, null, 2) + "\n");
const before = new Map(original.map((row) => [row.country, row]));
const audit = catalog.map((country) => {
  const bands = {};
  for (const band of ["male", "female", "surname"]) {
    const type = band === "surname" ? "surname" : "given_name";
    const dataset = ranked.find(({ dataset }) => dataset.meta.country === country.code && dataset.meta.type === type)?.dataset;
    const rows = (dataset?.records ?? []).filter((record) => (band === "surname" || record.gender === band) && (country.code !== "JP" || band === "surname" || record.rankingBasis === "overall"));
    const reference = references.find(({ dataset }) => dataset.meta.country === country.code && dataset.meta.type === type)?.dataset;
    const candidates = (reference?.records ?? []).filter((record) => band === "surname" || record.gender === band);
    bands[band] = { before: before.get(country.code)?.[band] ?? 0, ranked: rows.length, maxRank: rows.reduce((max, record) => Math.max(max, record.rank), 0), referenceOnly: candidates.length, totalNames: rows.length + candidates.length, source: dataset?.meta.sourceUrl ?? null, referenceSource: candidates.length ? reference.meta.sourceUrl : null, remainingReason: rows.length + candidates.length < 10000 ? "今回採用した共通原本と取得済みの国別原本では、この区分が1万件に届きません。言語だけを根拠に他国の名前を複製したり、未確認の順位を追加しません。" : null };
  }
  return { country: country.code, name: country.nameJa, ...bands, expanded: Object.values(bands).some((band) => band.totalNames > band.before) };
});
const report = { checkedCountries: audit.length, expandedCountries: audit.filter((country) => country.expanded).length, referenceNames: references.reduce((sum, { dataset }) => sum + dataset.records.length, 0), audit };
writeFileSync("reports/global-expansion.json", JSON.stringify(report, null, 2) + "\n");
writeFileSync("reports/global-expansion.md", "# 全搭載国の名前拡張結果\n\n全" + audit.length + "か国を確認。" + report.expandedCountries + "か国で名前候補を追加。順位付きデータと順位なし辞書候補は別々に数えます。辞書件数は人口順位の対応範囲ではありません。\n\n| 国 | 男性名：順位付き＋辞書 | 女性名：順位付き＋辞書 | 名字：順位付き＋辞書 |\n|---|---:|---:|---:|\n" + audit.map((country) => "| " + country.name + " (" + country.country + ") | " + [country.male, country.female, country.surname].map((band) => `${band.ranked.toLocaleString("ja-JP")}＋${band.referenceOnly.toLocaleString("ja-JP")}`).join(" | ") + " |").join("\n") + "\n\n元の順位は保持し、同順位が存在する場合は必ず順位データを優先します。順位が対応しない場合だけ国別辞書候補を表示し、人気順位は表示しません。未追加・未達の区分の理由と出典はJSON版に記録しています。\n");
console.log(JSON.stringify({ checked: report.checkedCountries, expanded: report.expandedCountries, referenceNames: report.referenceNames }));
