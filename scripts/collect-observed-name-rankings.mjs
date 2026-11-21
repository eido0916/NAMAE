import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { writeDataFile } from "./write-data-file.mjs";

const directory = "data-sources/rankings/foreign/observed-name-rankings";
mkdirSync(directory, { recursive: true });
const planPath = "reports/observed-ranking-expansion-before.json";
if (!existsSync(planPath)) {
  const audit = JSON.parse(readFileSync("reports/priority-country-expansion.json", "utf8")).audit;
  const compare = (band) => (a, b) => a[band] - b[band] || a.country.localeCompare(b.country);
  const selected = new Set([...audit].sort(compare("givenName")).slice(0, 30).concat([...audit].sort(compare("surname")).slice(0, 30)).map((r) => r.country));
  const countries = audit.filter((r) => selected.has(r.country)).sort(compare("total")).map((r) => r.country);
  writeDataFile(planPath, JSON.stringify({ createdAt: new Date().toISOString(), countries, before: audit }, null, 2) + "\n");
}
const requested = process.argv.find((arg) => arg.startsWith("--countries="))?.slice(12).split(",");
const plan = requested ? { countries: requested } : JSON.parse(readFileSync(planPath, "utf8"));
const enabled = new Set(JSON.parse(readFileSync("src/data/countries.json", "utf8")).filter((c) => c.enabled).map((c) => c.code));
if (plan.countries.some((code) => !enabled.has(code))) throw new Error("Unknown or disabled country in collection plan");
const countries = new Map(JSON.parse(gunzipSync(readFileSync("data-sources/rankings/foreign/wikidata-country-names/country-codes.json.gz"))).bindings.map((r) => [r.iso.value, r.country.value.split("/").at(-1)]));
countries.set("CY", "Q229");
const endpoint = "https://query.wikidata.org/sparql";
const failures = [];
let lastRequest = 0;
for (const country of plan.countries) {
  const entity = countries.get(country);
  if (!/^Q\d+$/.test(entity ?? "")) throw new Error(`Missing ISO entity: ${country}`);
  for (const type of ["given_name", "surname"]) {
    const property = type === "given_name" ? "P735" : "P734";
    const gender = type === "given_name" ? "?person wdt:P21 ?sex. FILTER(?sex IN (wd:Q6581097, wd:Q6581072))" : "";
    // Territories' citizens commonly carry the sovereign state's nationality.
    const citizenshipOnly = process.argv.includes("--citizenship-only") && !["PR", "FO"].includes(country);
    const relations = citizenshipOnly ? `?person wdt:P27 wd:${entity}.` : `{ ?person wdt:P27 wd:${entity} } UNION { ?person wdt:P19/(wdt:P17|wdt:P131*) wd:${entity} } UNION { ?person wdt:P551/(wdt:P17|wdt:P131*) wd:${entity} }`;
    // Danish citizenship is usually attached to the sovereign Kingdom of Denmark.
    const citizenshipRelation = country === "DK" ? `{ { ?person wdt:P27 wd:Q35 } UNION { ?person wdt:P27 wd:Q756617 } } ?person` : `?person wdt:P27 wd:${entity};`;
    let query = citizenshipOnly
      ? `SELECT DISTINCT ?person ?name ${type === "given_name" ? "?sex" : ""} WHERE { hint:Query hint:optimizer "None". ${citizenshipRelation} wdt:${property} ?name; wdt:P31 wd:Q5. ${gender} }`
      : `SELECT DISTINCT ?person ?name ${type === "given_name" ? "?sex" : ""} WHERE { ${relations} ?person wdt:P31 wd:Q5; wdt:${property} ?name. ${gender} }`;
    if (process.argv.includes("--direct-geography")) {
      const geography = country === "NL" ? [entity, "Q55"] : country === "DK" ? [entity, "Q756617"] : country === "GB" ? [entity, "Q21", "Q22", "Q25", "Q26"] : [entity];
      const values = geography.map((id) => `wd:${id}`).join(" ");
      const kingdomCitizenship = country === "DK" ? " UNION { ?person wdt:P27 wd:Q756617 }" : "";
      query = `SELECT DISTINCT ?person ?name ${type === "given_name" ? "?sex" : ""} WHERE { hint:Query hint:optimizer "None". { { ?person wdt:P27 wd:${entity} }${kingdomCitizenship} UNION { VALUES ?birthCountry { ${values} } ?birthPlace wdt:P17 ?birthCountry. ?person wdt:P19 ?birthPlace } UNION { VALUES ?residenceCountry { ${values} } ?residencePlace wdt:P17 ?residenceCountry. ?person wdt:P551 ?residencePlace } } ?person wdt:${property} ?name; wdt:P31 wd:Q5. ${gender} }`;
    }
    const path = `${directory}/${country}-${type}.json.gz`;
    if (existsSync(path) && JSON.parse(gunzipSync(readFileSync(path))).query === query) { console.log(`${country}/${type}: cached`); continue; }
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, 2500 - (Date.now() - lastRequest))));
      lastRequest = Date.now();
      try {
        const response = await fetch(`${endpoint}?format=json&query=${encodeURIComponent(query)}`, { headers: { "user-agent": "NAMAE/1.0 (+https://github.com/eido0916/NAMED)", accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(65000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = JSON.parse(await response.text());
        if (!Array.isArray(json.results?.bindings)) throw new Error("Incomplete WDQS response");
        writeDataFile(path, gzipSync(JSON.stringify({ country, type, countryEntity: entity, retrievedAt: new Date().toISOString(), endpoint, query, bindings: json.results.bindings })));
        console.log(`${country}/${type}: ${json.results.bindings.length} observed person/name pairs`);
        break;
      } catch (error) {
        if (attempt === 2) { failures.push({ country, type, error: String(error).slice(0, 200) }); console.log(`${country}/${type}: failed`); }
        else { console.log(`${country}/${type}: retry ${attempt + 1}: ${String(error).slice(0, 180)}`); await new Promise((resolve) => setTimeout(resolve, 30000)); }
      }
    }
    writeDataFile(`${directory}/progress.json`, JSON.stringify({ checkedAt: new Date().toISOString(), country, type, failures }, null, 2));
  }
}
writeDataFile(`${directory}/failures.json`, JSON.stringify(failures, null, 2) + "\n");
if (failures.length) process.exitCode = 1;
