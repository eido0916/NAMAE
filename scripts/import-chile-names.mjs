import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { readDatasets, hasExpectedScript } from "./data-utils.mjs";
const path = "data-sources/rankings/foreign/cl-1920-2021.csv";
const text = readFileSync(path, "utf8");
const groups = new Map();
for (const line of text.split(/\r?\n/).slice(1)) {
  const fields = line.split(",");
  if (fields.length !== 5) continue;
  const [year, rawName, sex, number] = fields;
  const name = rawName.normalize("NFKC").trim();
  const count = Number(number);
  if (!/^\d{4}$/.test(year) || !["M", "F"].includes(sex) || !Number.isSafeInteger(count) || count <= 0 || !hasExpectedScript("CL", name)) continue;
  const gender = sex === "M" ? "male" : "female";
  const key = `${gender}|${name.toLowerCase()}`;
  const entry = groups.get(key) ?? { name, gender, count: 0 };
  entry.count += count;
  groups.set(key, entry);
}
const records = [];
for (const gender of ["male", "female"]) {
  const rows = [...groups.values()].filter((row) => row.gender === gender).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
  rows.forEach((row, index) => records.push({ ...row, country: "CL", type: "given_name", rank: index + 1, totalEntries: rows.length, year: 2021, dataYear: 2021, isEstimated: false }));
}
const target = readDatasets("src/data").find(({ dataset }) => dataset.meta.country === "CL" && dataset.meta.type === "given_name");
if (!target || records.length < target.dataset.records.length) throw new Error("Chile coverage incomplete");
const sourceUrl = "https://github.com/rivaquiroga/guaguas";
writeFileSync(target.path, JSON.stringify({ meta: { country: "CL", type: "given_name", source: "guaguas / Registro Civil de Chile", sourceUrl, dataYear: 2021, isOfficial: false, isSample: false, coverageLabel: "1920–2021年・チリ出生登録累計", notes: "公開出生登録件数を男女別に全収録年で合算し、人数順に独自集計。同数は名前順。年次順位ではありません。Riva Quirogaによる公開データ整形、CC0 1.0。性別Iは男女へ割り当てず除外。" }, records }));
writeFileSync("data-sources/rankings/foreign/cl-1920-2021.csv.gz", gzipSync(text));
const sourcePath = "data-sources/SOURCES.json";
const provenance = JSON.parse(readFileSync(sourcePath, "utf8"));
provenance.sources = provenance.sources.filter((source) => source.id !== "chile-guaguas");
provenance.sources.push({ id: "chile-guaguas", name: "guaguas — Chile birth registrations", url: sourceUrl, datasets: ["CL/given_name"], licenseName: "CC0 1.0", licenseUrl: sourceUrl + "/blob/main/LICENSE.md", redistributionStatus: "permitted", attribution: "Riva Quiroga, guaguas, Chilean birth registrations 1920–2021, CC0 1.0. Cumulative counts adapted by NAMAE." });
writeFileSync(sourcePath, JSON.stringify(provenance, null, 2) + "\n");
console.log(JSON.stringify({ country: "CL", before: target.dataset.records.length, after: records.length, male: records.filter((r) => r.gender === "male").length, female: records.filter((r) => r.gender === "female").length }));
