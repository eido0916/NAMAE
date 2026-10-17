import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { gzipSync } from "node:zlib";
import JSZip from "jszip";

const root = resolve(import.meta.dirname, "..");
const cache = join(root, "data-sources/rankings/foreign/ca-17100147.zip");
const url = "https://www150.statcan.gc.ca/n1/tbl/csv/17100147-eng.zip";
if (!existsSync(cache) || process.argv.includes("--refresh")) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Statistics Canada: ${response.status}`);
  writeFileSync(cache, Buffer.from(await response.arrayBuffer()));
}
const zip = await JSZip.loadAsync(readFileSync(cache));
const file = zip.files["17100147.csv"];
if (!file) throw new Error("Statistics Canada CSV not found");
const names = new Map();
let firstYear = Infinity;
let lastYear = 0;
// Stream the large table; unpublished values remain excluded, never counted as zero.
for await (const line of createInterface({ input: file.nodeStream(), crlfDelay: Infinity })) {
  const fields = [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((match) => match[1].replace(/""/g, '"'));
  const [year, geo, , sex, name, indicator] = fields;
  if (geo !== "Canada" || indicator !== "Frequency" || !["Male", "Female"].includes(sex)) continue;
  const count = Number(fields[12]);
  if (!/^\d{4}$/.test(year) || !Number.isSafeInteger(count) || count <= 0 || fields[13]) continue;
  if (!name || !/^[\p{Script=Latin}\p{M} .'-]+$/u.test(name)) continue;
  firstYear = Math.min(firstYear, Number(year));
  lastYear = Math.max(lastYear, Number(year));
  const gender = sex === "Male" ? "male" : "female";
  const key = `${gender}|${name}`;
  const entry = names.get(key) ?? { name, gender, count: 0 };
  entry.count += count;
  names.set(key, entry);
}
const records = [];
for (const gender of ["male", "female"]) {
  const cohort = [...names.values()].filter((entry) => entry.gender === gender)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "en"));
  if (!cohort.length) throw new Error(`Empty Canadian ${gender} cohort`);
  cohort.forEach((entry, index) => records.push({ ...entry, country: "CA", type: "given_name", rank: index + 1, totalEntries: cohort.length, year: lastYear, dataYear: lastYear, isEstimated: false }));
}
const sourceUrl = "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1710014701";
const attribution = `Adapted from Statistics Canada, Table 17-10-0147-01, ${firstYear}–${lastYear}. This does not constitute an endorsement by Statistics Canada of this product.`;
const dataset = { meta: { country: "CA", type: "given_name", source: "Statistics Canada — Table 17-10-0147-01", sourceUrl, dataYear: lastYear, isOfficial: true, isSample: false, coverageLabel: `${firstYear}–${lastYear}年・カナダ出生累計`, notes: `各年の公開人数を男女別に合算し、人数順に独自集計。同数は名前順。年次順位ではありません。非公開の人数は合算せず、公開範囲での累計です。アクセントは出典の表記に従います。 ${attribution}` }, records };
writeFileSync(join(root, "src/data/ca/given-name/onomaverse.json"), JSON.stringify(dataset));
writeFileSync(join(root, "data-sources/rankings/foreign/ca-given.json.gz"), gzipSync(JSON.stringify(dataset)));
const sourcePath = join(root, "data-sources/SOURCES.json");
const provenance = JSON.parse(readFileSync(sourcePath, "utf8"));
provenance.sources = provenance.sources.filter((source) => source.id !== "statcan-names");
provenance.sources.push({ id: "statcan-names", name: "Statistics Canada — First names at birth", url: sourceUrl, datasets: ["CA/given_name"], licenseName: "Statistics Canada Open Licence", licenseUrl: "https://www.statcan.gc.ca/en/terms-conditions/open-licence", redistributionStatus: "permitted", attribution });
writeFileSync(sourcePath, JSON.stringify(provenance, null, 2) + "\n");
console.log(JSON.stringify({ firstYear, lastYear, male: records.filter((entry) => entry.gender === "male").length, female: records.filter((entry) => entry.gender === "female").length }));
