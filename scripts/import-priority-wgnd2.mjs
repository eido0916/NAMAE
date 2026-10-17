import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, readFileSync, renameSync } from "node:fs";
import { createGzip, createGunzip, gzipSync } from "node:zlib";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import { writeDataFile } from "./write-data-file.mjs";

// The country-specific original is distinct from the language-expanded file.
// wgt is a source weight, never a bearer count or popularity rank.
const doi = "doi:10.7910/DVN/MSEGSJ";
const metadataUrl = `https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=${doi}`;
const sourceUrl = "https://doi.org/10.7910/DVN/MSEGSJ";
const fileId = 4750348;
const directory = "data-sources/rankings/foreign";
const path = `${directory}/wgnd2-country.tsv.gz`;
const metadataPath = `${directory}/wgnd2-country-metadata.json`;
const sourceId = "wgnd2-country-original";
const requested = process.argv.find((arg) => arg.startsWith("--countries="))?.slice(12).split(",");
const priorities = process.argv.includes("--all") ? JSON.parse(readFileSync("src/data/countries.json", "utf8")).filter((c) => c.enabled).map((c) => c.code) : requested ?? JSON.parse(readFileSync("reports/priority-country-expansion-before.json", "utf8")).priorities;
const selected = new Set(priorities);
const groups = new Map(priorities.map((code) => [code, new Map()]));
if (!existsSync(path)) {
  const response = await fetch(metadataUrl, { signal: AbortSignal.timeout(65000) });
  if (!response.ok) throw new Error(`WGND metadata HTTP ${response.status}`);
  const metadata = await response.json();
  const version = metadata.data.latestVersion;
  const file = version.files.find((f) => f.dataFile.id === fileId);
  if (version.license?.rightsIdentifier !== "CC0-1.0" || file?.restricted || file?.dataFile.filename !== "wgnd_2_0_name-gender-code.tab") throw new Error("Unexpected WGND2 license or original file");
  const downloadUrl = `https://dataverse.harvard.edu/api/access/datafile/${fileId}`;
  const data = await fetch(downloadUrl, { signal: AbortSignal.timeout(600000) });
  if (!data.ok || !data.headers.get("content-type")?.includes("tab-separated-values")) throw new Error(`WGND2 original HTTP ${data.status}`);
  const hash = createHash("sha256");
  const hashing = new Transform({ transform(chunk, _, callback) { hash.update(chunk); callback(null, chunk); } });
  await pipeline(Readable.fromWeb(data.body), hashing, createGzip(), createWriteStream(path + ".tmp"));
  renameSync(path + ".tmp", path);
  writeDataFile(metadataPath, JSON.stringify({ retrievedAt: new Date().toISOString(), downloadUrl, metadataUrl, sha256: hash.digest("hex"), license: version.license, file: file.dataFile, metadata }, null, 2) + "\n");
}
const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
if (metadata.license?.rightsIdentifier !== "CC0-1.0" || metadata.file?.id !== fileId || metadata.file.filename !== "wgnd_2_0_name-gender-code.tab") throw new Error("Unexpected cached WGND2 file");
const hash = createHash("sha256");
const input = createReadStream(path).pipe(createGunzip());
input.on("data", (chunk) => hash.update(chunk));
const lines = createInterface({ input, crlfDelay: Infinity });
let header = false;
let rows = 0;
let rejected = 0;
for await (const line of lines) {
  if (!header) {
    if (line !== "name\tcode\tgender\twgt") throw new Error("WGND2 original header mismatch");
    header = true;
    continue;
  }
  if (!line) continue;
  rows++;
  const fields = line.split("\t");
  if (fields.length !== 4) throw new Error(`WGND2 malformed row ${rows}`);
  const decode = (field) => field.startsWith('"') ? JSON.parse(field) : field;
  const country = decode(fields[1]);
  if (!selected.has(country)) continue;
  const sex = decode(fields[2]);
  let rawName;
  // Some source names contain control-character escapes such as \x0e.
  // Reject those entries rather than turning the escape into a fake spelling.
  try { rawName = decode(fields[0]); } catch { rejected++; continue; }
  const gender = sex === "M" ? "male" : sex === "F" ? "female" : undefined;
  const name = rawName.normalize("NFKC").trim().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
  if (!gender || name.length < 2 || name.length > 80 || !/^[\p{Script=Latin}\p{M} .'-]+$/u.test(name) || !/\p{Script=Latin}{2}/u.test(name)) { rejected++; continue; }
  const key = `${gender}|${name.toLowerCase()}`;
  groups.get(country).set(key, { name, gender });
}
if (hash.digest("hex") !== metadata.sha256) throw new Error("WGND2 cached original checksum mismatch");
const report = [];
for (const country of priorities) {
  const records = [...groups.get(country).values()];
  const supplement = { country, type: "given_name", sourceId, source: "WIPO WGND 2.0 — country-specific original", sourceUrl, dataYear: 2021, notes: "WGND 2.0の国コード付き原本だけを使用。言語拡張版・国コードなし版は不使用。男女区分は原本のM/Fのみを採用し、不明な分類は除外。wgt（出典の重み）は人数や人気順位として使用しません。各国の一般人口を網羅する統計ではなく、複数原本に基づく国別の名前辞書です。", records };
  writeDataFile(`${directory}/national-reference-supplements/wgnd2-${country.toLowerCase()}-given_name.json.gz`, gzipSync(JSON.stringify(supplement)));
  report.push({ country, male: records.filter((r) => r.gender === "male").length, female: records.filter((r) => r.gender === "female").length });
}
const provenancePath = "data-sources/SOURCES.json";
const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
const priorDatasets = provenance.sources.find((s) => s.id === sourceId)?.datasets ?? [];
const retainedDatasets = priorDatasets.filter((key) => !selected.has(key.split("/")[0]));
provenance.sources = provenance.sources.filter((s) => s.id !== sourceId);
provenance.sources.push({ id: sourceId, name: "World Gender-Name Dictionary 2.0 — country-specific original", url: sourceUrl, datasets: [...new Set([...retainedDatasets, ...priorities.filter((c) => groups.get(c).size).map((c) => `${c}/given_name`)])].sort(), licenseName: "CC0 1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", redistributionStatus: "permitted", attribution: "Raffo, Julio (2021), WGND 2.0, Harvard Dataverse, doi:10.7910/DVN/MSEGSJ. Original name-gender-code only; no language-expanded associations, no weight-to-rank conversion. Country/gender classifications are reproduced from WGND, not independently inferred by NAMAE." });
writeDataFile(provenancePath, JSON.stringify(provenance, null, 2) + "\n");
writeDataFile(process.argv.includes("--all") ? "reports/global-wgnd2-import.json" : "reports/priority-wgnd2-import.json", JSON.stringify({ checkedAt: new Date().toISOString(), originalRows: rows, rejected, countries: report }, null, 2) + "\n");
console.log(JSON.stringify({ originalRows: rows, rejected, countries: report }));
