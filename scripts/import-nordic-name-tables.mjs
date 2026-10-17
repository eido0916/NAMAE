import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { readDatasets, hasExpectedScript } from "./data-utils.mjs";
const definitions = [
  { country: "FO", table: "m1_navn", type: "given_name", gender: "male", api: "https://statbank.hagstova.fo/api/v1/en/H2/IB/IB05/m1_navn.px" },
  { country: "FO", table: "k1_navn", type: "given_name", gender: "female", api: "https://statbank.hagstova.fo/api/v1/en/H2/IB/IB05/k1_navn.px" },
  { country: "FO", table: "e1_navn", type: "surname", api: "https://statbank.hagstova.fo/api/v1/en/H2/IB/IB05/e1_navn.px" },
  { country: "GL", table: "NAXT5", type: "given_name", api: "https://bank.stat.gl/api/v1/en/Greenland/NA/NAXT5.px" },
  { country: "GL", table: "NAXT1", type: "surname", api: "https://bank.stat.gl/api/v1/en/Greenland/NA/NAXT1.px" },
];
const grouped = new Map();
for (const definition of definitions) {
  const cache = `data-sources/rankings/foreign/${definition.country.toLowerCase()}-${definition.table}.json.gz`;
  let data;
  if (existsSync(cache)) data = JSON.parse(gunzipSync(readFileSync(cache)));
  else {
    const metadataResponse = await fetch(definition.api, { signal: AbortSignal.timeout(30000) });
    if (!metadataResponse.ok) throw new Error(`Metadata ${definition.api}: ${metadataResponse.status}`);
    const metadata = await metadataResponse.json();
    const query = metadata.variables.map((variable) => {
      let values = variable.values;
      if (variable.time || ["time", "year"].includes(variable.code)) values = [variable.values.at(-1)];
      if (["measure", "unit"].includes(variable.code)) values = [variable.values[variable.valueTexts.findIndex((text) => /number of persons|count|number/i.test(text))]];
      if (values.some((value) => value === undefined)) throw new Error("Unsupported count dimension");
      return { code: variable.code, selection: { filter: "item", values } };
    });
    const response = await fetch(definition.api, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, response: { format: "json-stat2" } }), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Data ${definition.api}: ${response.status}`);
    data = await response.json();
    writeFileSync(cache, gzipSync(JSON.stringify(data)));
  }
  const axes = data.id.map((id) => ({ id, values: Object.entries(data.dimension[id].category.index).sort((a, b) => a[1] - b[1]).map(([code]) => ({ code, text: data.dimension[id].category.label[code] })) }));
  const nameAxis = axes.findIndex((axis) => /name/i.test(axis.id) && !/year/i.test(axis.id));
  const sexAxis = axes.findIndex((axis) => /sex/i.test(axis.id));
  const timeAxis = axes.findIndex((axis) => /time|year/i.test(axis.id));
  if (nameAxis < 0 || timeAxis < 0) throw new Error("Unsupported name table axes");
  const year = Number(axes[timeAxis].values[0].code);
  const rows = [];
  const cellCount = data.size.reduce((product, size) => product * size, 1);
  for (let cell = 0; cell < cellCount; cell++) {
    const count = data.value[cell];
    if (!Number.isSafeInteger(count) || count <= 0) continue;
    const coordinate = data.size.map((size, axis) => Math.floor(cell / data.size.slice(axis + 1).reduce((product, n) => product * n, 1)) % size);
    const name = axes[nameAxis].values[coordinate[nameAxis]].text.trim();
    if (!hasExpectedScript(definition.country, name) || /Ikke-navngivet|not named|total/i.test(name)) continue;
    const sex = sexAxis >= 0 ? axes[sexAxis].values[coordinate[sexAxis]].text : undefined;
    const gender = definition.gender ?? (definition.type === "given_name" ? sex === "Men" ? "male" : sex === "Women" ? "female" : undefined : undefined);
    if (definition.type === "given_name" && !gender) continue;
    rows.push({ name, count, ...(gender ? { gender } : {}) });
  }
  const key = `${definition.country}/${definition.type}`;
  const current = grouped.get(key) ?? { rows: [], year };
  current.rows.push(...rows);
  grouped.set(key, current);
}
const catalogPath = "src/data/countries.json";
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const sourcePath = "data-sources/SOURCES.json";
const provenance = JSON.parse(readFileSync(sourcePath, "utf8"));
const all = readDatasets("src/data");
for (const [key, data] of grouped) {
  const [country, type] = key.split("/");
  const target = all.find(({ dataset }) => dataset.meta.country === country && dataset.meta.type === type);
  const records = [];
  for (const gender of type === "given_name" ? ["male", "female"] : [undefined]) {
    const names = new Map();
    for (const row of data.rows.filter((row) => row.gender === gender)) {
      const nameKey = row.name.normalize("NFKC").toLowerCase();
      const previous = names.get(nameKey);
      if (previous) previous.count += row.count;
      else names.set(nameKey, { ...row });
    }
    const rows = [...names.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    rows.forEach((row, index) => records.push({ ...row, country, type, rank: index + 1, totalEntries: rows.length, year: data.year, dataYear: data.year, isEstimated: false }));
  }
  if (!records.length || (target && records.length < target.dataset.records.length)) throw new Error(`${key}: incomplete coverage`);
  const source = country === "FO" ? "Statistics Faroe Islands" : "Statistics Greenland";
  const sourceUrl = country === "FO" ? "https://statbank.hagstova.fo/pxweb/en/H2/H2__IB__IB05/" : "https://bank.stat.gl/pxweb/en/Greenland/Greenland__NA/";
  const path = target?.path ?? `src/data/${country.toLowerCase()}/surname/national.json`;
  const { mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ meta: { country, type, source, sourceUrl, dataYear: data.year, isOfficial: true, isSample: false, coverageLabel: `${data.year}年・住民登録人数`, notes: "公開されている最新の住民人数順に独自集計。同数は名前順。非公開セルと人数ゼロは除外。過去年の住民人数を足し合わせません。" }, records }));
  const config = catalog.find((entry) => entry.code === country);
  if (config) config[type === "given_name" ? "supportsGivenName" : "supportsSurname"] = true;
  const id = country.toLowerCase() + "-national-names";
  let sourceEntry = provenance.sources.find((entry) => entry.id === id);
  if (!sourceEntry) {
    sourceEntry = { id, name: source, url: sourceUrl, datasets: [], licenseName: country === "FO" ? "CC BY 4.0" : "Reuse permitted with source attribution", licenseUrl: country === "FO" ? "https://hagstova.fo/en/terms-use" : "https://stat.gl/dialog/topmain.asp?lang=EN&sc=GS&subject=About+Statistics+Greenland", redistributionStatus: "permitted", attribution: `Source: ${source}. Latest population name tables, count-sorted and adapted by NAMAE.` };
    provenance.sources.push(sourceEntry);
  }
  if (!sourceEntry.datasets.includes(key)) sourceEntry.datasets.push(key);
  console.log(JSON.stringify({ country, type, before: target?.dataset.records.length ?? 0, after: records.length }));
}
writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
writeFileSync(sourcePath, JSON.stringify(provenance, null, 2) + "\n");
