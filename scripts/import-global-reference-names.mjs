import { readFileSync, writeFileSync as writeRaw, renameSync, mkdirSync, existsSync, readdirSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { gzipSync, gunzipSync } from "node:zlib";
import { join } from "node:path";
import { readDatasets, collectDatasetFiles } from "./data-utils.mjs";

function writeFileSync(path, contents) {
  writeRaw(path + ".tmp", contents);
  renameSync(path + ".tmp", path);
}

const allCountries = JSON.parse(readFileSync("src/data/countries.json", "utf8")).filter((country) => country.enabled);
const selected = process.argv.find((arg) => arg.startsWith("--countries="))?.slice(12).split(",") ?? (process.argv.includes("--observed-priority") ? JSON.parse(readFileSync("reports/observed-ranking-expansion-before.json", "utf8")).countries : process.argv.includes("--priority") ? JSON.parse(readFileSync("reports/priority-country-expansion-before.json", "utf8")).priorities : undefined);
const catalog = allCountries.filter((country) => !selected || selected.includes(country.code));
const codes = new Set(catalog.map((country) => country.code));
const rankedPaths = new Map(collectDatasetFiles("src/data").map((path) => {
  const parts = path.replaceAll("\\", "/").split("/");
  return [`${parts[2].toUpperCase()}/${parts[3] === "given-name" ? "given_name" : "surname"}`, path];
}));
const japaneseDictionary = JSON.parse(readFileSync("src/data/dictionary/names.json", "utf8"));
const beforePath = "reports/global-expansion-before.json";
if (!existsSync(beforePath)) {
  const ranked = readDatasets("src/data");
  writeFileSync(beforePath, JSON.stringify(catalog.map((country) => ({ country: country.code, ...Object.fromEntries(["male", "female", "surname"].map((band) => [band, ranked.find(({ dataset }) => dataset.meta.country === country.code && dataset.meta.type === (band === "surname" ? "surname" : "given_name"))?.dataset.records.filter((r) => (band === "surname" || r.gender === band) && (country.code !== "JP" || band === "surname" || r.rankingBasis === "overall")).length ?? 0])) })), null, 2) + "\n");
}
const groups = new Map();
const clean = (name) => name.normalize("NFKC").trim().replace(/\s+/g, " ");
const nameKeyFor = (country, name) => {
  const normalized = clean(name).toLowerCase();
  return country === "JP" ? normalized.replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 96)) : normalized;
};
const script = /^[\p{Script=Latin}\p{M} .'-]+$/u;
function add(country, type, name, gender, sourceId, evidenceRank) {
  if (!codes.has(country)) return;
  name = clean(name);
  // Only actual names are retained; initials and language-expanded country copies are excluded.
  const native = country === "JP" && /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]+$/u.test(name) || country === "KR" && /^[\p{Script=Hangul}]+$/u.test(name) || country === "CN" && /^[\p{Script=Han}·]+$/u.test(name) && /\p{Script=Han}/u.test(name);
  if (name.length < (native ? 1 : 2) || name.length > 80 || (!script.test(name) && !native)) return;
  if (!native && (name.match(/\p{Script=Latin}/gu)?.length ?? 0) < 2) return;
  if (!native && /^(\p{Script=Latin})\1{2,}$/iu.test(name)) return;
  if (type === "given_name" && !["male", "female"].includes(gender)) return;
  const key = `${country}/${type}`;
  if (!groups.has(key)) groups.set(key, new Map());
  const names = groups.get(key);
  const nameKey = `${gender ?? ""}|${nameKeyFor(country, name)}`;
  const entry = names.get(nameKey) ?? { country, type, name, ...(gender ? { gender } : {}), sourceIds: [] };
  if (!entry.sourceIds.includes(sourceId)) entry.sourceIds.push(sourceId);
  if (evidenceRank) entry.evidenceRank = evidenceRank;
  names.set(nameKey, entry);
}
for await (const line of createInterface({ input: createReadStream("data-sources/rankings/foreign/wgnd-country.tsv", { encoding: "utf8" }), crlfDelay: Infinity })) {
  const [name, country, sex] = line.split("\t").map((field) => field.replace(/^"|"$/g, "").replace(/""/g, '"'));
  if (!name || !country) continue;
  add(country, "given_name", name, sex === "M" ? "male" : sex === "F" ? "female" : undefined, "wgnd-country");
}
const corpus = JSON.parse(gunzipSync(readFileSync("data-sources/rankings/foreign/recordatlas-surnames.json.gz")));
for (const entry of corpus.surnames) {
  for (const country of entry.countries ?? []) {
    if (!["register", "curated", "archive"].includes(country.how)) continue;
    // No phonetic guesses, population counts or Wiktionary prose are imported.
    add(country.cc.toUpperCase(), "surname", entry.n, undefined, "recordatlas-surnames");
  }
}
const supplements = new Map();
const supplementDir = "data-sources/rankings/foreign/national-reference-supplements";
if (existsSync(supplementDir)) for (const file of readdirSync(supplementDir).filter((file) => file.endsWith(".json.gz"))) {
  const fileCountry = file.match(/^(?:(?:observed|wgnd2|wikidata)-)?([a-z]{2})-/)?.[1]?.toUpperCase();
  if (fileCountry && !codes.has(fileCountry)) continue;
  const data = JSON.parse(gunzipSync(readFileSync(join(supplementDir, file))));
  if (!codes.has(data.country)) continue;
  const key = `${data.country}/${data.type}`;
  const definitions = supplements.get(key) ?? [];
  definitions.push(Object.fromEntries(Object.entries(data).filter(([key]) => key !== "records" && key !== "names")));
  supplements.set(key, definitions);
  for (const record of data.records ?? data.names.map((name) => ({ name }))) add(data.country, data.type, record.name, record.gender, data.sourceId, record.evidenceRank);
}
const previousIndexPath = "src/reference-data/index.json";
const files = selected && existsSync(previousIndexPath) ? JSON.parse(readFileSync(previousIndexPath, "utf8")).files.filter((file) => !codes.has(file.country)) : [];
const sourceDatasets = new Map([["wgnd-country", new Set()], ["recordatlas-surnames", new Set()]]);
for (const [key, names] of groups) {
  const [country, type] = key.split("/");
  const rankedPath = rankedPaths.get(key);
  const existing = rankedPath ? JSON.parse(readFileSync(rankedPath, "utf8")).records : [];
  const known = new Set(existing.flatMap((r) => [r.name, ...(r.aliases ?? [])].map((n) => `${r.gender ?? ""}|${nameKeyFor(country, n)}`)));
  if (country === "JP" && type === "given_name") {
    for (const entry of japaneseDictionary) {
      for (const gender of entry.gender === "unknown" ? ["male", "female"] : [entry.gender]) {
        for (const name of [entry.reading, ...entry.aliases]) known.add(`${gender}|${nameKeyFor(country, name)}`);
      }
    }
  }
  const records = [...names.values()].filter((r) => !known.has(`${r.gender ?? ""}|${nameKeyFor(country, r.name)}`)).sort((a, b) => a.name.localeCompare(b.name) || String(a.gender).localeCompare(String(b.gender)));
  if (!records.length) continue;
  for (const record of records) for (const sourceId of record.sourceIds) sourceDatasets.get(sourceId)?.add(key);
  const meta = { country, type, source: type === "given_name" ? "WGND 1.0 — country-specific name dictionary" : "Record Atlas — attested surname dictionary", sourceUrl: type === "given_name" ? "https://doi.org/10.7910/DVN/YPRQH8" : "https://recordatlas.org/data/", dataYear: type === "given_name" ? 2018 : 2026, isOfficial: false, isSample: false, coverageLabel: "名前辞書・人気順位なし", notes: type === "given_name" ? "WGNDの国別原本のみを使用。言語に基づく他国への複製は使用しません。人数・人気順位・響きの一致を示すものではありません。Raffo & Lax-Martinez (2018), WGND 1.0, CC0." : "国との関連が原本で記録されている名字。音の類似だけの関連は除外。人数・人気順位・現在の人口分布を示すものではありません。Record Atlas, CC0 (Wiktionary fields excluded)." };
  const baseId = type === "given_name" ? "wgnd-country" : "recordatlas-surnames";
  if (!records.some((record) => record.sourceIds.includes(baseId))) {
    meta.source = "";
    meta.notes = "国との関連が出典で確認できる名前を収録した辞書です。人気順位・人口比率を示すものではありません。";
  }
  for (const supplement of supplements.get(key) ?? []) {
    if (!records.some((record) => record.sourceIds.includes(supplement.sourceId))) continue;
    meta.source += `${meta.source ? " / " : ""}${supplement.source}`;
    meta.sourceUrl = supplement.sourceUrl;
    meta.dataYear = supplement.dataYear;
    meta.notes += " " + (supplement.notes ?? "統計局の人数非公開の名字も辞書として収録。非公開人数を推測して順位を付けることはしません。");
    if (supplement.evidenceRanking) meta.evidenceRanking = supplement.evidenceRanking;
  }
  const path = join("src/reference-data", country.toLowerCase(), `${type}.json`);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify({ meta, records }));
  files.push({ country, type, path: path.replaceAll("\\", "/"), records: records.length, male: records.filter((r) => r.gender === "male").length, female: records.filter((r) => r.gender === "female").length });
}
const index = { files, checkedCountries: allCountries.map((country) => country.code), rejectedSources: [{ source: "Thelwall 200-country workbook", reason: "名前の全件表ではなく分位点の要約表のため不採用" }, { source: "WGND language-expanded file", reason: "同じ言語の他国へ複製された行を含むため不採用" }, { source: "prijmeni.eu world_surnames.csv", reason: "公開ページは準備中でダウンロード原本なし" }] };
const fullCatalog = JSON.parse(readFileSync("src/data/countries.json", "utf8"));
for (const file of files) {
  const country = fullCatalog.find((country) => country.code === file.country);
  if (country) country[file.type === "given_name" ? "supportsGivenName" : "supportsSurname"] = true;
}
writeFileSync("src/data/countries.json", JSON.stringify(fullCatalog, null, 2) + "\n");
mkdirSync("src/reference-data", { recursive: true });
writeFileSync("src/reference-data/index.json", JSON.stringify(index, null, 2) + "\n");
const sourcePath = "data-sources/SOURCES.json";
const provenance = JSON.parse(readFileSync(sourcePath, "utf8"));
for (const [id, keys] of sourceDatasets) {
  const existing = provenance.sources.find((source) => source.id === id);
  if (selected) for (const key of existing?.datasets ?? []) if (!codes.has(key.split("/")[0])) keys.add(key);
  provenance.sources = provenance.sources.filter((source) => source.id !== id);
  provenance.sources.push({ id, name: id === "wgnd-country" ? "WGND 1.0 — Country-specific names" : "Record Atlas surname corpus", url: id === "wgnd-country" ? "https://doi.org/10.7910/DVN/YPRQH8" : "https://recordatlas.org/data/", datasets: [...keys].sort(), licenseName: "CC0 1.0 (names and country facts only)", licenseUrl: id === "wgnd-country" ? "https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=doi:10.7910/DVN/YPRQH8" : "https://recordatlas.org/data/", redistributionStatus: "permitted", attribution: id === "wgnd-country" ? "Raffo, Julio; Lax-Martinez, Gema (2018), WGND 1.0, doi:10.7910/DVN/YPRQH8. Country-specific original; no language expansion. Adapted by NAMAE." : "Record Atlas surname corpus (2026). Names and attested countries only. Excludes phonetic guesses, counts and Wiktionary content. Adapted by NAMAE." });
}
writeFileSync(sourcePath, JSON.stringify(provenance, null, 2) + "\n");
console.log(JSON.stringify({ checked: catalog.length, updatedCountries: new Set(files.filter((file) => codes.has(file.country)).map((file) => file.country)).size, referenceNames: files.reduce((sum, file) => sum + file.records, 0) }));
// Retain a compact reproducible copy of the unused summary metadata, not a fake name list.
writeFileSync("data-sources/rankings/foreign/global-reference-index.json.gz", gzipSync(JSON.stringify(index)));
