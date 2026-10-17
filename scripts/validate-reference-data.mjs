import { readFileSync } from "node:fs";
import { iterateReferenceDatasets, hasExpectedScript } from "./data-utils.mjs";
const codes = new Set(JSON.parse(readFileSync("src/data/countries.json", "utf8")).map((country) => country.code));
const sources = new Set(JSON.parse(readFileSync("data-sources/SOURCES.json", "utf8")).sources.map((source) => source.id));
let count = 0;
for (const { dataset } of iterateReferenceDatasets()) {
  if (!codes.has(dataset.meta.country) || !dataset.meta.sourceUrl) throw new Error("Invalid reference metadata");
  const keys = new Set();
  for (const record of dataset.records) {
    if (!record.name?.trim() || record.country !== dataset.meta.country || record.type !== dataset.meta.type || record.rank !== undefined || record.totalEntries !== undefined) throw new Error("Invalid or fabricated reference rank");
    const romanizedAsianName = ["JP", "KR"].includes(record.country) && /^[\p{Script=Latin}\p{M} .'-]+$/u.test(record.name);
    if (!hasExpectedScript(record.country, record.name) && !romanizedAsianName) throw new Error("Unexpected reference name script");
    if (/^[\p{Script=Latin}\p{M} .'-]+$/u.test(record.name) && (record.name.match(/\p{Script=Latin}/gu)?.length ?? 0) < 2) throw new Error("Initials are not full-name candidates");
    if (record.type === "given_name" && !["male", "female"].includes(record.gender)) throw new Error("Unknown reference gender");
    if (!record.sourceIds?.length || record.sourceIds.some((id) => !sources.has(id))) throw new Error("Unattributed reference name");
    if (record.evidenceRank) {
      const e = record.evidenceRank;
      if (![e.rank, e.totalNames, e.observedPeople, e.totalPeople, e.tiedNames].every((n) => Number.isSafeInteger(n) && n > 0) || e.rank > e.totalNames || e.tiedNames > e.totalNames || e.observedPeople > e.totalPeople || e.method !== "competition" || e.scope !== "public_people" || !sources.has(e.sourceId) || !record.sourceIds.includes(e.sourceId) || !/^\d{4}-\d{2}-\d{2}$/.test(e.asOf) || !dataset.meta.evidenceRanking?.sourceUrl?.startsWith("https://query.wikidata.org/#")) throw new Error("Invalid reference ranking evidence");
    }
    const key = `${record.gender ?? ""}|${record.name.normalize("NFKC").toLowerCase()}`;
    if (keys.has(key)) throw new Error("Duplicate reference name");
    keys.add(key);
    count++;
  }
}
console.log(`Verified ${count} rank-free reference names.`);
