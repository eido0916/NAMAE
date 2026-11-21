import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { writeDataFile } from "./write-data-file.mjs";

const directory = "data-sources/rankings/foreign/wikidata-country-names";
const labelDirectory = `${directory}/labels`;
const supplements = "data-sources/rankings/foreign/national-reference-supplements";
mkdirSync(labelDirectory, { recursive: true });
mkdirSync(supplements, { recursive: true });
const catalog = JSON.parse(readFileSync("src/data/countries.json", "utf8")).filter((c) => c.enabled);
const codes = new Set(catalog.map((c) => c.code));
const countryMap = new Map(JSON.parse(gunzipSync(readFileSync(`${directory}/country-codes.json.gz`))).bindings.map((b) => [b.iso.value, b.country.value.split("/").at(-1)]));
countryMap.set("CY", "Q229");
const associations = [];
const ids = new Set();
let rejectedNonEntities = 0;
for (const file of readdirSync(directory)) {
  const match = file.match(/^([A-Z]{2})-(given_name|surname)-(citizenship|birthplace-v2|residence-v1)\.json\.gz$/);
  if (!match || !codes.has(match[1])) continue;
  const data = JSON.parse(gunzipSync(readFileSync(`${directory}/${file}`)));
  if (!data.query.includes("wdt:P31 wd:Q5")) throw new Error(`Non-human/unreviewed association query: ${file}`);
  if (match[3] === "residence-v1" && !data.query.includes("wdt:P551/")) throw new Error(`Residence evidence missing: ${file}`);
  const countryEntity = data.query.match(/wdt:P27 wd:(Q\d+)/)?.[1] ?? data.query.match(/\) wd:(Q\d+)/)?.[1];
  if (!countryEntity || countryEntity !== countryMap.get(match[1])) throw new Error(`Country evidence missing or mismatched: ${file}`);
  for (const row of data.bindings) {
    const id = row.name?.value?.split("/").at(-1);
    // RDF represents an explicitly unknown name as a blank node. It is not a
    // usable name, and must not be mistaken for an entity label or a failure.
    if (!/^Q\d+$/.test(id ?? "")) {
      rejectedNonEntities++;
      continue;
    }
    const gender = row.sex?.value?.endsWith("/Q6581097") ? "male" : row.sex?.value?.endsWith("/Q6581072") ? "female" : undefined;
    if (match[2] === "given_name" && !gender) throw new Error(`Missing observed gender: ${file}`);
    associations.push({ country: match[1], type: match[2], relation: match[3], entity: id, countryEntity, ...(gender ? { gender } : {}) });
    ids.add(id);
  }
}
const sortedIds = [...ids].sort();
const labelIndexPath = `${directory}/entity-labels.json.gz`;
const labels = new Map(existsSync(labelIndexPath) ? Object.entries(JSON.parse(gunzipSync(readFileSync(labelIndexPath))).labels) : []);
// Also recover complete batches written since the last consolidated checkpoint.
for (const file of readdirSync(labelDirectory).filter((file) => file.endsWith(".json.gz"))) {
  const cached = JSON.parse(gunzipSync(readFileSync(`${labelDirectory}/${file}`)));
  for (const [, id] of cached.query.matchAll(/wd:(Q\d+)/g)) if (!labels.has(id)) labels.set(id, {});
  for (const row of cached.bindings) {
    const id = row.name.value.split("/").at(-1);
    const names = labels.get(id) ?? {};
    names[row.label["xml:lang"]] = row.label.value;
    labels.set(id, names);
  }
}
const missingIds = sortedIds.filter((id) => !labels.has(id));
let lastRequest = 0;
for (let offset = 0; offset < missingIds.length; offset += 5000) {
  const batch = missingIds.slice(offset, offset + 5000);
  const hash = createHash("sha256").update(batch.join("|")).digest("hex").slice(0, 16);
  const path = `${labelDirectory}/${hash}.json.gz`;
  let bindings;
  if (existsSync(path)) bindings = JSON.parse(gunzipSync(readFileSync(path))).bindings;
  else {
    const query = `SELECT ?id ?lang (STR(?label) AS ?text) WHERE { VALUES ?name { ${batch.map((id) => `wd:${id}`).join(" ")} } ?name rdfs:label ?label FILTER(LANG(?label) IN ("en", "ja", "ko")) BIND(STRAFTER(STR(?name),"/entity/") AS ?id) BIND(LANG(?label) AS ?lang) }`;
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, 2500 - (Date.now() - lastRequest))));
      lastRequest = Date.now();
      try {
        const response = await fetch("https://query.wikidata.org/sparql", { method: "POST", headers: { "user-agent": "NAMAE/1.0 (+https://github.com/eido0916/NAMED)", "content-type": "application/x-www-form-urlencoded", accept: "text/tab-separated-values" }, body: new URLSearchParams({ query }), signal: AbortSignal.timeout(65000) });
        if (!response.ok) throw new Error(`Wikidata labels ${response.status}`);
        const text = await response.text();
        const lines = text.split(/\r?\n/);
        if (lines.shift() !== "?id\t?lang\t?text" || !text.endsWith("\n")) throw new Error("Incomplete label response");
        bindings = lines.filter(Boolean).map((line) => {
          const fields = line.split("\t");
          if (fields.length !== 3) throw new Error("Invalid label row");
          const [id, language, name] = fields.map((field) => JSON.parse(field.replace(/\\U([\da-fA-F]{8})/g, (_, value) => JSON.stringify(String.fromCodePoint(parseInt(value, 16))).slice(1, -1))));
          if (!/^Q\d+$/.test(id) || !["en", "ja", "ko"].includes(language) || typeof name !== "string") throw new Error("Invalid label binding");
          return { name: { value: `http://www.wikidata.org/entity/${id}` }, label: { "xml:lang": language, value: name } };
        });
        writeDataFile(path, gzipSync(JSON.stringify({ retrievedAt: new Date().toISOString(), query, bindings })));
        break;
      } catch (error) {
        if (attempt === 2) throw error;
        console.log(`Label request retry: ${String(error).slice(0, 100)}`);
        await new Promise((resolve) => setTimeout(resolve, 30000));
      }
    }
  }
  for (const id of batch) labels.set(id, {});
  for (const row of bindings) {
    const id = row.name.value.split("/").at(-1);
    const names = labels.get(id) ?? {};
    names[row.label["xml:lang"]] = row.label.value;
    labels.set(id, names);
  }
  if (offset % 10000 === 0 || offset + batch.length >= missingIds.length) writeDataFile(labelIndexPath, gzipSync(JSON.stringify({ updatedAt: new Date().toISOString(), labels: Object.fromEntries(labels) })));
  console.log(`Name labels ${Math.min(offset + batch.length, missingIds.length)}/${missingIds.length} new; ${sortedIds.length} total`);
}
const latin = /^[\p{Script=Latin}\p{M} .'-]+$/u;
const groups = new Map();
for (const row of associations) {
  const names = labels.get(row.entity) ?? {};
  const raw = row.country === "JP" ? names.ja ?? names.en : row.country === "KR" ? names.ko ?? names.en : names.en;
  if (!raw) continue;
  const name = raw.normalize("NFKC").trim().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
  const native = row.country === "JP" && /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]+$/u.test(name) || row.country === "KR" && /^[\p{Script=Hangul}]+$/u.test(name);
  if ((!latin.test(name) && !native) || name.length < (native ? 1 : 2) || name.length > 80) continue;
  const key = `${row.country}/${row.type}`;
  const group = groups.get(key) ?? new Map();
  const nameKey = `${row.gender ?? ""}|${name.toLowerCase()}`;
  const record = group.get(nameKey) ?? { name, ...(row.gender ? { gender: row.gender } : {}), entities: [], relations: [] };
  if (!record.entities.includes(row.entity)) record.entities.push(row.entity);
  if (!record.relations.includes(row.relation)) record.relations.push(row.relation);
  group.set(nameKey, record);
  groups.set(key, group);
}
const sourceId = "wikidata-attested-country-names";
const report = [];
for (const country of catalog) {
  const row = { country: country.code, male: 0, female: 0, surname: 0, missing: [] };
  for (const type of ["given_name", "surname"]) {
    const records = [...(groups.get(`${country.code}/${type}`)?.values() ?? [])];
    if (!records.length) row.missing.push(type);
    const hasResidences = records.some((record) => record.relations.includes("residence-v1"));
    const data = { country: country.code, type, sourceId, source: hasResidences ? "Wikidata — names attested by citizenship, birthplace or residence" : "Wikidata — names attested by citizenship or birthplace", sourceUrl: "https://www.wikidata.org/wiki/Wikidata:Data_access", dataYear: 2026, notes: "公開人物のP735（名）・P734（姓）を、P27（国籍）またはP19とP17/P131（出生地）の明示記録から国別に収録。" + (hasResidences ? "P551とP17/P131による明示的な居住記録も含み、外国籍の居住者・歴史上の使用例も含みます。" : "") + "名前の使用例を示す辞書で、人口統計・人気順位ではありません。公人の記録に偏りがあり、一般人口を網羅するデータではありません。性別は当該国に関連する使用例のP21に基づき、音や綴りから推定しません。", records };
    writeDataFile(`${supplements}/wikidata-${country.code.toLowerCase()}-${type}.json.gz`, gzipSync(JSON.stringify(data)));
    if (type === "surname") row.surname = records.length;
    else for (const gender of ["male", "female"]) row[gender] = records.filter((r) => r.gender === gender).length;
  }
  report.push(row);
}
const provenancePath = "data-sources/SOURCES.json";
const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
provenance.sources = provenance.sources.filter((s) => s.id !== sourceId);
provenance.sources.push({ id: sourceId, name: "Wikidata — explicitly attested country names", url: "https://www.wikidata.org/wiki/Wikidata:Data_access", datasets: [...groups.keys()].sort(), licenseName: "CC0 1.0 (structured name and country facts only)", licenseUrl: "https://www.wikidata.org/wiki/Wikidata:Licensing", redistributionStatus: "permitted", attribution: "Wikidata contributors (2026), CC0 structured facts. Only explicit given/family-name entities, citizenship, documented birthplace or residence, and observed sex/gender facts. Includes expatriate/historical residents, not just citizens. No name-based nationality prediction, no inferred popularity ranks." });
writeDataFile(provenancePath, JSON.stringify(provenance, null, 2) + "\n");
writeDataFile("reports/wikidata-country-names.json", JSON.stringify({ checkedCountries: catalog.length, nameEntities: sortedIds.length, rejectedNonEntities, countries: report }, null, 2) + "\n");
console.log(JSON.stringify({ checkedCountries: catalog.length, countriesWithNames: report.filter((r) => r.male || r.female || r.surname).length, referenceCandidates: report.reduce((n, r) => n + r.male + r.female + r.surname, 0) }));
