import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { hasExpectedScript, readDatasets } from "./data-utils.mjs";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(root, "src", "data");
const entities = {
  amp: "&",
  auml: "ä",
  Auml: "Ä",
  ouml: "ö",
  Ouml: "Ö",
  uuml: "ü",
  Uuml: "Ü",
  szlig: "ß",
  eacute: "é",
  Eacute: "É",
};
const decodeHtml = (value) =>
  value
    .replace(/&([A-Za-z]+);/g, (match, entity) => entities[entity] ?? match)
    .normalize("NFC");

let removed = 0;
let normalized = 0;
for (const { path, dataset } of readDatasets(sourceRoot)) {
  if (dataset.meta.country === "JP" || dataset.meta.country === "KR") continue;
  const seen = new Set();
  const clean = [];
  for (const record of dataset.records) {
    const name = decodeHtml(record.name);
    if (name !== record.name) normalized += 1;
    const key = `${record.gender ?? ""}|${record.year ?? ""}|${record.rankingBasis ?? ""}|${name.toLocaleLowerCase()}`;
    if (!hasExpectedScript(dataset.meta.country, name) || seen.has(key)) {
      removed += 1;
      continue;
    }
    seen.add(key);
    clean.push({ ...record, name });
  }
  const groups = new Map();
  for (const record of clean) {
    const key = `${record.gender ?? ""}|${record.year ?? ""}|${record.rankingBasis ?? ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.rank - b.rank);
    group.forEach((record, index) => {
      record.rank = index + 1;
      record.totalEntries = group.length;
    });
  }
  dataset.records = clean;
  writeFileSync(path, JSON.stringify(dataset));
}
console.log(`Normalized ${normalized} names and removed ${removed} invalid or duplicate records.`);
