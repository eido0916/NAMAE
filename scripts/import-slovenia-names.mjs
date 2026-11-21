import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { writeDataFile } from "./write-data-file.mjs";
import { hasExpectedScript, readDatasets } from "./data-utils.mjs";

const rows = { given_name: [], surname: [] };
const referenceRows = { given_name: [], surname: [] };
let snapshot;
for (const [table, type, gender] of [["05X1005S", "given_name", "male"], ["05X1010S", "given_name", "female"], ...["05X1015S", "05X1016S", "05X1017S", "05X1018S"].map((table) => [table, "surname", undefined])]) {
  const url = `https://pxweb.stat.si/SiStatData/api/v1/en/Data/${table}.px`;
  const cache = `data-sources/rankings/foreign/si-${table}-latest.json.gz`;
  let data;
  if (existsSync(cache)) data = JSON.parse(gunzipSync(readFileSync(cache)));
  else {
    const metadataResponse = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!metadataResponse.ok) throw new Error(`SURS metadata ${table}: ${metadataResponse.status}`);
    const metadata = await metadataResponse.json();
    const query = metadata.variables.map((v) => ({ code: v.code, selection: { filter: "item", values: v.time ? [v.values.at(-1)] : v.code === "MERITVE" ? [v.values[v.valueTexts.indexOf("Number")]] : v.values } }));
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, response: { format: "json-stat2" } }), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`SURS data ${table}: ${response.status}`);
    data = await response.json();
    writeDataFile(cache, gzipSync(JSON.stringify(data)));
  }
  const nameAxis = data.id.find((code) => ["IME", "PRIIMEK"].includes(code));
  if (data.id[0] !== nameAxis || data.size.slice(1).some((n) => n !== 1)) throw new Error("SURS name axes changed");
  const year = Number(Object.keys(data.dimension.LETO.category.index)[0]);
  if (snapshot && year !== snapshot) throw new Error("SURS mixed population snapshots");
  snapshot = year;
  const category = data.dimension[nameAxis].category;
  for (const [code, index] of Object.entries(category.index)) {
    const name = category.label[code].normalize("NFKC").trim();
    const count = data.value[index];
    if (hasExpectedScript("SI", name)) referenceRows[type].push({ name, ...(gender ? { gender } : {}) });
    if (!hasExpectedScript("SI", name) || !Number.isSafeInteger(count) || count < 5) continue;
    rows[type].push({ name, count, ...(gender ? { gender } : {}) });
  }
  console.log(`${table}: ${rows[type].length} rows so far`);
}
const datasets = readDatasets("src/data/si");
const audit = [];
for (const type of ["given_name", "surname"]) {
  const records = [];
  for (const gender of type === "surname" ? [undefined] : ["male", "female"]) {
    const names = new Map();
    for (const row of rows[type].filter((r) => r.gender === gender)) {
      const key = row.name.toLowerCase();
      if (names.has(key) && names.get(key).count !== row.count) throw new Error("SURS duplicate conflicting surname partitions");
      names.set(key, row);
    }
    const cohort = [...names.values()].sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    cohort.forEach((r, index) => records.push({ country: "SI", type, ...r, rank: index + 1, totalEntries: cohort.length, year: snapshot, dataYear: snapshot, isEstimated: false }));
  }
  const target = datasets.find(({ dataset }) => dataset.meta.country === "SI" && dataset.meta.type === type);
  if (!target || records.length < target.dataset.records.length) throw new Error(`Incomplete SURS ${type}`);
  writeDataFile(target.path, JSON.stringify({ meta: { country: "SI", type, source: "Statistical Office of the Republic of Slovenia (SURS)", sourceUrl: `https://pxweb.stat.si/SiStatData/pxweb/en/Data/-/${type === "surname" ? "05X1015S" : "05X1005S"}.px`, dataYear: snapshot, isOfficial: true, isSample: false, coverageLabel: `${snapshot}年1月・住民登録の公開人数順位`, notes: "最新年の公開人数（5人以上）で独自集計。同数は名前順。名字はA–F/G–L/M–R/S–Žの全4分割表を結合。過去年の住民人数を加算しません。" }, records }));
  audit.push({ country: "SI", type, before: target.dataset.records.length, after: records.length, male: records.filter((r) => r.gender === "male").length, female: records.filter((r) => r.gender === "female").length });
}
const path = "data-sources/SOURCES.json";
const provenance = JSON.parse(readFileSync(path, "utf8"));
provenance.sources = provenance.sources.filter((s) => s.id !== "surs-national-names");
provenance.sources.push({ id: "surs-national-names", name: "SURS — all published given and family name tables", url: "https://pxweb.stat.si/SiStatData/pxweb/en/Data/", datasets: ["SI/given_name", "SI/surname"], licenseName: "Free commercial and non-commercial reuse with source attribution", licenseUrl: "https://www.stat.si/StatWeb/en/StaticPages/Index/Copyright", redistributionStatus: "permitted", attribution: `Source: Statistical Office of the Republic of Slovenia (SURS), ${snapshot}. Latest resident counts across all surname partitions, count-sorted by NAMAE.` });
writeDataFile(path, JSON.stringify(provenance, null, 2) + "\n");
const supplementDirectory = "data-sources/rankings/foreign/national-reference-supplements";
mkdirSync(supplementDirectory, { recursive: true });
for (const type of ["given_name", "surname"]) writeDataFile(`${supplementDirectory}/surs-${type}.json.gz`, gzipSync(JSON.stringify({ country: "SI", type, sourceId: "surs-national-names", source: "SURS — names listed across published population snapshots", sourceUrl: "https://pxweb.stat.si/SiStatData/pxweb/en/Data/", dataYear: snapshot, notes: "SURS原本の全期間の掲載名。最新年の公開人数がない名前は順位なしの辞書候補として収録。過去年の人数を足し合わせて人口順位を作りません。", records: referenceRows[type] })));
writeDataFile("reports/slovenia-expansion.json", JSON.stringify(audit, null, 2) + "\n");
console.log(JSON.stringify(audit));
