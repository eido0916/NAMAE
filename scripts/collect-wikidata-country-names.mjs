import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { writeDataFile } from "./write-data-file.mjs";

const directory = "data-sources/rankings/foreign/wikidata-country-names";
mkdirSync(directory, { recursive: true });
const endpoint = "https://query.wikidata.org/sparql";
const userAgent = "NAMAE/1.0 (+https://github.com/eido0916/NAMED)";
const priority = process.argv.includes("--priority") ? JSON.parse(readFileSync("reports/priority-country-expansion-before.json", "utf8")).priorities : undefined;
const selected = process.argv.find((arg) => arg.startsWith("--countries="))?.split("=")[1].split(",") ?? priority;
const includeBirthplaces = process.argv.includes("--birthplace");
const includeResidences = process.argv.includes("--residence");
const catalog = JSON.parse(readFileSync("src/data/countries.json", "utf8")).filter((c) => c.enabled && (!selected || selected.includes(c.code)));
if (priority) catalog.sort((a, b) => priority.indexOf(a.code) - priority.indexOf(b.code));
const beforePath = "reports/all-country-expansion-before.json";
if (!existsSync(beforePath)) writeDataFile(beforePath, readFileSync("reports/global-expansion.json"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastRequest = 0;
async function query(sparql) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(Math.max(0, 2500 - (Date.now() - lastRequest)));
    lastRequest = Date.now();
    try {
      const response = await fetch(`${endpoint}?format=json&query=${encodeURIComponent(sparql)}`, { headers: { "user-agent": userAgent, accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(65000) });
      if (!response.ok) throw new Error(`WDQS HTTP ${response.status}`);
      // WDQS can append an error after a partial HTTP-200 response. Never
      // accept those truncated results as a complete country dataset.
      const json = JSON.parse(await response.text());
      if (!Array.isArray(json.results?.bindings)) throw new Error("Invalid WDQS results");
      return json.results.bindings;
    } catch (error) {
      if (attempt === 2) throw error;
      console.log(`Retrying query after backoff: ${String(error).slice(0, 100)}`);
      await sleep(30000);
    }
  }
}
async function cached(key, sparql) {
  const path = `${directory}/${key}.json.gz`;
  if (existsSync(path)) {
    const previous = JSON.parse(gunzipSync(readFileSync(path)));
    if (previous.query === sparql) return previous;
  }
  const bindings = await query(sparql);
  const result = { retrievedAt: new Date().toISOString(), endpoint, query: sparql, bindings };
  writeDataFile(path, gzipSync(JSON.stringify(result)));
  return result;
}
const countryData = await cached("country-codes", "SELECT ?country ?iso WHERE { ?country wdt:P297 ?iso }");
const entities = new Map(countryData.bindings.map((b) => [b.iso.value, b.country.value.split("/").at(-1)]));
// The island of Cyprus also carries CY. Citizenship is attached to the state.
entities.set("CY", "Q229");
const failures = [];
for (const country of catalog) {
  const entity = entities.get(country.code);
  if (!/^Q\d+$/.test(entity ?? "")) {
    failures.push({ country: country.code, error: "Missing current ISO country entity" });
    continue;
  }
  const totals = {};
  for (const type of ["given_name", "surname"]) {
    const property = type === "given_name" ? "P735" : "P734";
    const gender = type === "given_name" ? "?person wdt:P21 ?sex. FILTER(?sex IN (wd:Q6581097, wd:Q6581072))" : "";
    const sparql = `SELECT DISTINCT ?name ${type === "given_name" ? "?sex" : ""} WHERE { ?person wdt:P27 wd:${entity}. ?person wdt:${property} ?name; wdt:P31 wd:Q5. ${gender} }`;
    try {
      const result = await cached(`${country.code}-${type}-citizenship`, sparql);
      totals[type] = result.bindings.length;
    } catch (error) {
      failures.push({ country: country.code, type, relation: "citizenship", error: String(error).slice(0, 240) });
      console.log(`${country.code}/${type}: failed`);
    }
  }
  // A territory can have residents with the citizenship of its sovereign
  // state. Directly documented birth-country facts provide separate evidence.
  if (includeBirthplaces || Object.values(totals).every((count) => count < 50)) for (const type of ["given_name", "surname"]) {
    const property = type === "given_name" ? "P735" : "P734";
    const gender = type === "given_name" ? "?person wdt:P21 ?sex. FILTER(?sex IN (wd:Q6581097, wd:Q6581072))" : "";
    try {
      const result = await cached(`${country.code}-${type}-birthplace-v2`, `SELECT DISTINCT ?name ${type === "given_name" ? "?sex" : ""} WHERE { ?person wdt:P19/(wdt:P17|wdt:P131*) wd:${entity}. ?person wdt:${property} ?name; wdt:P31 wd:Q5. ${gender} }`);
      totals[`${type}Birthplace`] = result.bindings.length;
    } catch (error) {
      failures.push({ country: country.code, type, relation: "birthplace", error: String(error).slice(0, 240) });
    }
  }
  // This is a separate, explicitly documented country association. It is a
  // dictionary of attested residents' names, not a nationality prediction.
  if (includeResidences) for (const type of ["given_name", "surname"]) {
    const property = type === "given_name" ? "P735" : "P734";
    const gender = type === "given_name" ? "?person wdt:P21 ?sex. FILTER(?sex IN (wd:Q6581097, wd:Q6581072))" : "";
    try {
      const result = await cached(`${country.code}-${type}-residence-v1`, `SELECT DISTINCT ?name ${type === "given_name" ? "?sex" : ""} WHERE { ?person wdt:P551/(wdt:P17|wdt:P131*) wd:${entity}. ?person wdt:${property} ?name; wdt:P31 wd:Q5. ${gender} }`);
      totals[`${type}Residence`] = result.bindings.length;
    } catch (error) {
      failures.push({ country: country.code, type, relation: "residence", error: String(error).slice(0, 240) });
    }
  }
  writeDataFile(`${directory}/progress.json`, JSON.stringify({ checkedAt: new Date().toISOString(), lastCountry: country.code, failures }, null, 2));
  console.log(JSON.stringify({ country: country.code, ...totals }));
}
writeDataFile(`${directory}/failures.json`, JSON.stringify(failures, null, 2));
console.log("Country-name association collection finished. Cached queries retain country and gender evidence.");
