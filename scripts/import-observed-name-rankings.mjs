import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { writeDataFile } from "./write-data-file.mjs";
import { buildObservedRanks } from "./observed-rank-utils.mjs";

const directory = "data-sources/rankings/foreign/observed-name-rankings";
const requested = process.argv.find((arg) => arg.startsWith("--countries="))?.slice(12).split(",");
const plan = requested ? { countries: requested } : JSON.parse(readFileSync("reports/observed-ranking-expansion-before.json", "utf8"));
const countryEntities = new Map(JSON.parse(gunzipSync(readFileSync("data-sources/rankings/foreign/wikidata-country-names/country-codes.json.gz"))).bindings.map((r) => [r.iso.value, r.country.value.split("/").at(-1)]));
countryEntities.set("CY", "Q229");
const labelPath = "data-sources/rankings/foreign/wikidata-country-names/entity-labels.json.gz";
const labelIndex = JSON.parse(gunzipSync(readFileSync(labelPath)));
const files = [];
const ids = new Set();
for (const country of plan.countries) for (const type of ["given_name", "surname"]) {
  const path = `${directory}/${country}-${type}.json.gz`;
  if (!existsSync(path)) throw new Error(`Missing complete observations: ${country}/${type}`);
  const data = JSON.parse(gunzipSync(readFileSync(path)));
  if (process.argv.includes("--require-direct-geography") && (!data.query.includes("?birthPlace wdt:P17") || !data.query.includes("?person wdt:P19 ?birthPlace") || !data.query.includes("?person wdt:P551 ?residencePlace"))) throw new Error(`Expanded geography observations missing: ${path}`);
  if (data.country !== country || data.type !== type || data.countryEntity !== countryEntities.get(country) || !data.query.includes(`wdt:P27 wd:${countryEntities.get(country)}`) || !data.query.includes("SELECT DISTINCT ?person ?name") || !data.query.includes("wdt:P31 wd:Q5")) throw new Error(`Unexpected observation query: ${path}`);
  files.push({ path, country: data.country, type: data.type });
  for (const row of data.bindings) {
    const id = row.name?.value?.split("/").at(-1);
    const nativeLanguage = country === "CN" ? "zh" : country === "JP" ? "ja" : undefined;
    if (/^Q\d+$/.test(id ?? "") && (!labelIndex.labels[id] || (nativeLanguage && !Object.hasOwn(labelIndex.labels[id], nativeLanguage)))) ids.add(id);
  }
}
const missing = [...ids];
console.log(`Labels to retrieve: ${missing.length}`);
for (let i = 0; i < missing.length; i += 1000) {
  const batch = missing.slice(i, i + 1000);
  const query = `SELECT ?name ?label WHERE { VALUES ?name { ${batch.map((id) => `wd:${id}`).join(" ")} } ?name rdfs:label ?label FILTER(LANG(?label) IN ("en","ko","zh","ja")) }`;
  let result;
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, attempt ? 30000 : 2500));
    try {
      const response = await fetch("https://query.wikidata.org/sparql", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/sparql-results+json", "user-agent": "NAMAE/1.0 (+https://github.com/eido0916/NAMED)" }, body: new URLSearchParams({ query }), signal: AbortSignal.timeout(65000) });
      if (!response.ok) throw new Error(`Name label HTTP ${response.status}`);
      result = await response.json();
      if (!Array.isArray(result.results?.bindings)) throw new Error("Incomplete labels");
      break;
    } catch (error) { console.log(`Label batch ${i}: ${String(error).slice(0, 160)}`); if (attempt === 2) throw error; }
  }
  for (const id of batch) { labelIndex.labels[id] ??= {}; labelIndex.labels[id].zh ??= null; labelIndex.labels[id].ja ??= null; }
  for (const row of result.results.bindings) labelIndex.labels[row.name.value.split("/").at(-1)][row.label["xml:lang"]] = row.label.value;
  const queryHash = createHash("sha256").update(query).digest("hex").slice(0, 16);
  writeDataFile(`${directory}/labels-${queryHash}.json.gz`, gzipSync(JSON.stringify({ retrievedAt: new Date().toISOString(), query, bindings: result.results.bindings })));
  console.log(`Labels retrieved: ${Math.min(i + 1000, missing.length)}/${missing.length}`);
}
if (missing.length) writeDataFile(labelPath, gzipSync(JSON.stringify({ ...labelIndex, updatedAt: new Date().toISOString() })));
const sourceId = "wikidata-observed-name-counts";
const report = [];
for (const file of files) {
  const data = JSON.parse(gunzipSync(readFileSync(file.path)));
  const records = buildObservedRanks(data.bindings, labelIndex.labels, data.country, data.type).map((r) => ({ ...r, evidenceRank: { ...r.evidenceRank, sourceId, asOf: data.retrievedAt.slice(0, 10) } }));
  const supplement = { country: data.country, type: data.type, sourceId, source: "Wikidata observed people — counted reference ranking", sourceUrl: "https://www.wikidata.org/wiki/Wikidata:Data_access", dataYear: Number(data.retrievedAt.slice(0, 4)), notes: "国籍・出生地・居住地と名/姓が明示された公開人物を人物IDで重複除外して実人数を集計。同じ綴りの異なる名エンティティも人物IDで重複除外。同人数は同順位（1,1,3方式）。一人に複数の名がある場合は各名に1人として数える。公開人物の記載状況に偏りがあり、全国の人気順位・人口比率・日本との同順位を示しません。根拠のない辞書項目へ順位を推定付与しません。", records };
  supplement.evidenceRanking = { sourceUrl: "https://query.wikidata.org/#" + encodeURIComponent(data.query), asOf: data.retrievedAt.slice(0, 10) };
  if (!data.query.includes("wdt:P19")) supplement.notes += " この集計は国籍の明示記録のみを対象とします。";
  if (data.country === "CN") supplement.notes += " 中国語ラベルを優先し、姓の説明接尾辞「姓」「氏」は姓本体から分離。同じローマ字になる異なる漢字の姓は合算しません。";
  if (data.country === "DK") supplement.notes += " デンマーク（Q35）と、国籍記録で通常用いられるデンマーク王国（Q756617）の両方を対象とし、人物IDで重複除外します。";
  writeDataFile(`data-sources/rankings/foreign/national-reference-supplements/observed-${data.country.toLowerCase()}-${data.type}.json.gz`, gzipSync(JSON.stringify(supplement)));
  report.push({ country: data.country, type: data.type, namesWithEvidenceRank: records.length, sourcePersonNamePairs: data.bindings.length });
}
const path = "data-sources/SOURCES.json";
const provenance = JSON.parse(readFileSync(path, "utf8"));
const priorDatasets = provenance.sources.find((s) => s.id === sourceId)?.datasets ?? [];
const processedDatasets = new Set(files.map((d) => `${d.country}/${d.type}`));
const retainedDatasets = priorDatasets.filter((key) => !processedDatasets.has(key));
provenance.sources = provenance.sources.filter((s) => s.id !== sourceId);
provenance.sources.push({ id: sourceId, name: "Wikidata — observed people/name counts (not population ranks)", url: "https://www.wikidata.org/wiki/Wikidata:Data_access", datasets: [...new Set([...retainedDatasets, ...processedDatasets])].sort(), licenseName: "CC0 1.0", licenseUrl: "https://www.wikidata.org/wiki/Wikidata:Licensing", redistributionStatus: "permitted", attribution: "Wikidata contributors (2026), CC0 structured facts. Explicit human, given/family name, observed gender and citizenship/birthplace/residence facts. Count DISTINCT person IDs after spelling normalization. Biased public-person corpus, not a census; no equivalent national-rank claim. Ties use competition ranks." });
writeDataFile(path, JSON.stringify(provenance, null, 2) + "\n");
writeDataFile(process.argv.find((arg) => arg.startsWith("--report="))?.slice(9) ?? (requested ? "reports/world-observed-name-rankings.json" : "reports/observed-name-rankings.json"), JSON.stringify({ checkedAt: new Date().toISOString(), countries: plan.countries.length, rows: report, totalEvidenceNames: report.reduce((n, r) => n + r.namesWithEvidenceRank, 0) }, null, 2) + "\n");
console.log(JSON.stringify({ countries: plan.countries.length, evidenceNames: report.reduce((n, r) => n + r.namesWithEvidenceRank, 0) }));
