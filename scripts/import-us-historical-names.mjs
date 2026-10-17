import { readFileSync, readdirSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { writeDataFile } from "./write-data-file.mjs";

const target = "src/data/us/given-name/sample.json";
const previous = JSON.parse(readFileSync(target, "utf8"));
const reportPath = "reports/us-historical-name-expansion.json";
const priorReport = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : undefined;
const cache = "data-sources/rankings/foreign/us-ssa-all-data.txt.gz";
const provenance = JSON.parse(readFileSync("data-sources/rankings/foreign/us-ssa-all-data.meta.json", "utf8"));
const cacheSha256 = createHash("sha256").update(readFileSync(cache)).digest("hex");
if (cacheSha256 !== provenance.sha256) throw new Error("SSA mirror checksum mismatch");
const localFiles = readdirSync("data-sources/rankings").filter((file) => /^us-\d{4}\.txt$/.test(file)).sort();
const localYears = new Set(localFiles.map((file) => Number(file.slice(3, 7))));
const years = new Set();
const seen = new Set();
const names = new Map();
let sourceRows = 0;
function add(name, sex, countText, year) {
  const count = Number(countText);
  if (!/^[A-Za-z]+$/.test(name) || !["M", "F"].includes(sex) || !Number.isSafeInteger(count) || count < 5 || !Number.isInteger(year) || year < 1880 || year > 2020) throw new Error(`Invalid SSA row: ${name}/${sex}/${year}`);
  const key = `${sex}|${name.toLowerCase()}`;
  const observation = `${year}|${key}`;
  if (seen.has(observation)) throw new Error(`Duplicate SSA observation: ${observation}`);
  seen.add(observation);
  years.add(year);
  const row = names.get(key) ?? { name, gender: sex === "M" ? "male" : "female", count: 0 };
  row.count += count;
  names.set(key, row);
  sourceRows++;
}
for (const line of gunzipSync(readFileSync(cache)).toString("utf8").split(/\r?\n/)) {
  if (!line.trim()) continue;
  const [name, sex, count, yearText] = line.split(",");
  const year = Number(yearText);
  // Keep the already imported annual originals for their years; never double count.
  if (!localYears.has(year)) add(name, sex, count, year);
}
for (const file of localFiles) {
  const year = Number(file.slice(3, 7));
  for (const line of readFileSync(`data-sources/rankings/${file}`, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [name, sex, count] = line.split(",");
    add(name, sex, count, year);
  }
}
for (let year = 1880; year <= 2020; year++) if (!years.has(year)) throw new Error(`Missing SSA year: ${year}`);
for (const row of previous.records) if (!names.has(`${row.gender === "male" ? "M" : "F"}|${row.name.toLowerCase()}`)) throw new Error(`Coverage would decrease: ${row.name}`);
const records = [];
const bands = [];
for (const gender of ["male", "female"]) {
  const cohort = [...names.values()].filter((row) => row.gender === gender).sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  cohort.forEach((row, index) => records.push({ country: "US", type: "given_name", ...row, rank: index + 1, totalEntries: cohort.length, year: 2020, dataYear: 2020, isEstimated: false }));
  const before = priorReport?.bands.find((band) => band.gender === gender)?.before ?? previous.records.filter((row) => row.gender === gender).length;
  bands.push({ gender, before, after: cohort.length, added: cohort.length - before });
}
const dataset = { meta: { ...previous.meta, coverageLabel: "1880–2020年・米国出生登録累計", notes: "SSAの男女別公開件数を141年分合算。各年5件未満の非公開人数は加算しません。公開人数の降順、同人数は名前順の連番です。現在の人口順位・単年の出生順位ではありません。1880–1988年はSSA原本の固定コミットのミラー、1989–2020年は既存の年別原本を使用し重複集計しません。" }, records };
writeDataFile(target, JSON.stringify(dataset));
const report = { checkedAt: new Date().toISOString(), country: "US", type: "given_name", sourceUrl: dataset.meta.sourceUrl, mirror: provenance, sha256: cacheSha256, period: [1880, 2020], years: years.size, sourceRows, bands, totalAdded: bands.reduce((n, band) => n + band.added, 0) };
writeDataFile(reportPath, JSON.stringify(report, null, 2) + "\n");
const sourcesPath = "data-sources/SOURCES.json";
const sources = JSON.parse(readFileSync(sourcesPath, "utf8"));
const source = sources.sources.find((row) => row.id === "ssa-baby-names");
if (!source) throw new Error("SSA provenance missing");
source.mirrorUrl = provenance.url;
source.coverage = dataset.meta.coverageLabel;
source.mirrorSha256 = report.sha256;
writeDataFile(sourcesPath, JSON.stringify(sources, null, 2) + "\n");
console.log(JSON.stringify(report));
