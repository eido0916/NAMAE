import { readFileSync } from "node:fs";
import { collectDatasetFiles } from "./data-utils.mjs";
import { writeDataFile } from "./write-data-file.mjs";

const selected = ["US", "SE", "FI", "DK", "NO", "PL", "AT"];
const before = JSON.parse(readFileSync("reports/ranking-followup-before.json", "utf8"));
const priorRanks = new Map(before.referenceRankCoverage.map((row) => [row.country, row]));
const groups = new Map(selected.map((country) => [country, { country, names: { male: new Set(), female: new Set(), surname: new Set() }, referenceRanks: { male: 0, female: 0, surname: 0 } }]));
const index = JSON.parse(readFileSync("src/reference-data/index.json", "utf8"));
const paths = collectDatasetFiles("src/data").filter((path) => selected.includes(path.replaceAll("\\", "/").split("/")[2].toUpperCase())).concat(index.files.filter((file) => selected.includes(file.country)).map((file) => file.path));
for (const path of paths) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  const group = groups.get(data.meta.country);
  for (const record of data.records) {
    const band = data.meta.type === "surname" ? "surname" : record.gender;
    group.names[band].add(record.name.normalize("NFKC").trim().toLowerCase());
    if (record.evidenceRank) group.referenceRanks[band]++;
  }
}
const countries = [...groups.values()].map(({ country, names, referenceRanks }) => {
  const prior = priorRanks.get(country);
  const addedReferenceRanks = Object.fromEntries(Object.entries(referenceRanks).map(([band, n]) => [band, n - (prior?.[band] ?? 0)]));
  const previous = before.audit.find((row) => row.country === country);
  const counts = Object.fromEntries(Object.entries(names).map(([band, set]) => [band, set.size]));
  return { country, counts, addedNames: Object.fromEntries(Object.entries(counts).map(([band, n]) => [band, n - previous[band]])), referenceRanks, addedReferenceRanks };
});
const us = JSON.parse(readFileSync("reports/us-historical-name-expansion.json", "utf8"));
const rankDelta = (row) => Object.values(row.addedReferenceRanks).reduce((n, v) => n + v, 0);
const report = { checkedAt: new Date().toISOString(), additionalPrimaryRankedNames: us.totalAdded, us: us.bands, additionalReferenceRanksInSixCountries: countries.filter((row) => row.country !== "US").reduce((sum, row) => sum + rankDelta(row), 0), netAdditionalReferenceRanks: countries.reduce((sum, row) => sum + rankDelta(row), 0), countries };
writeDataFile("reports/ranking-followup.json", JSON.stringify(report, null, 2) + "\n");
writeDataFile("reports/ranking-followup.md", `# ランキング対応の追加\n\n米国の公開出生登録人数を1880–2020年の141年分に拡張。順位付き男性名は${us.bands[0].before.toLocaleString()}件から${us.bands[0].after.toLocaleString()}件、女性名は${us.bands[1].before.toLocaleString()}件から${us.bands[1].after.toLocaleString()}件へ増加しました。合計${us.totalAdded.toLocaleString()}件が新たに順位に対応します。現在の人口順位・単年順位ではありません。既存の1989–2020年原本を優先し、同じ年・性別・名前を二重集計しません。\n\nスウェーデン・フィンランド・デンマーク・ノルウェー・ポーランド・オーストリアでは、国籍・出生地・居住地を明示した公開人物を人物IDで重複除外し参考順位を再集計。以下の数字は公開人口ランキングと区別します。\n\n|国|男性名の参考順位 増分|女性名の参考順位 増分|名字の参考順位 増分|\n|---|---:|---:|---:|\n${countries.filter((row) => row.country !== "US").map((row) => `|${row.country}|${row.addedReferenceRanks.male}|${row.addedReferenceRanks.female}|${row.addedReferenceRanks.surname}|`).join("\n")}\n\n結果画面の根拠・出典の展開欄と長い説明文は削除し、出典情報はデータと出典ページに保持しています。全国順位・資料内参考順位・順位なし辞書の区別は保持します。\n`);
console.log(JSON.stringify(report));
