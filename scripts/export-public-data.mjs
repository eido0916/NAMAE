import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const databasePath = join(root, "data", "namae.sqlite");
const publicRoot = join(root, "public");
const outputRoot = join(publicRoot, "data");
const temporaryRoot = join(publicRoot, ".data-next");
const backupRoot = join(publicRoot, ".data-previous");
for (const path of [outputRoot, temporaryRoot, backupRoot])
  if (!path.startsWith(publicRoot))
    throw new Error("Refusing to replace data outside public directory");
rmSync(temporaryRoot, { recursive: true, force: true });
mkdirSync(temporaryRoot, { recursive: true });

const hash = (content) =>
  createHash("sha256").update(content).digest("hex");

const db = new DatabaseSync(databasePath, { readOnly: true });
const countries = db
  .prepare("SELECT * FROM countries ORDER BY rowid")
  .all()
  .map((row) => ({
    code: row.code,
    nameJa: row.name_ja,
    nameEn: row.name_en,
    flag: row.flag,
    enabled: Boolean(row.enabled),
    supportsGivenName: Boolean(row.supports_given_name),
    supportsSurname: Boolean(row.supports_surname),
  }));
const dictionary = db
  .prepare(
    "SELECT gender, reading, aliases_json FROM dictionary_entries ORDER BY id",
  )
  .all()
  .map((row) => ({
    gender: row.gender,
    reading: row.reading,
    aliases: JSON.parse(row.aliases_json),
  }));
const dictionaryContent = JSON.stringify(dictionary);
const dictionaryHash = hash(dictionaryContent);
const dictionaryName = `dictionary.${dictionaryHash.slice(0, 12)}.json`;
writeFileSync(join(temporaryRoot, dictionaryName), dictionaryContent);

const metadata = db
  .prepare("SELECT * FROM datasets ORDER BY country, type")
  .all();
const selectRecords = db.prepare(
  "SELECT * FROM ranking_entries WHERE country = ? AND type = ? ORDER BY id",
);
const manifestDatasets = [];
const chunkSize = 1000;
function writeDatasetFile(meta, dataset, suffix = "") {
  const content = JSON.stringify(dataset);
  const contentHash = hash(content);
  const fileName = `${meta.type.replace("_", "-")}${suffix}.${contentHash.slice(0, 12)}.json`;
  const relativePath = `datasets/${meta.country.toLowerCase()}/${fileName}`;
  const outputPath = join(temporaryRoot, relativePath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);
  return {
    path: `/data/${relativePath}`,
    records: dataset.records.length,
    sha256: contentHash,
    bytes: Buffer.byteLength(content),
  };
}
for (const meta of metadata) {
  const records = selectRecords.all(meta.country, meta.type).map((row) => {
    const record = { name: row.name, rank: row.rank, totalEntries: row.total_entries };
    if (row.aliases_json !== null) record.aliases = JSON.parse(row.aliases_json);
    if (row.year !== null) record.year = row.year;
    if (row.gender !== null) record.gender = row.gender;
    if (row.count !== null) record.count = row.count;
    if (row.share !== null) record.share = row.share;
    if (row.data_year !== null && row.data_year !== meta.data_year) record.dataYear = row.data_year;
    if (row.ranking_basis !== null) record.rankingBasis = row.ranking_basis;
    if (row.is_estimated) record.isEstimated = true;
    return record;
  });
  const datasetMeta = {
    country: meta.country,
    type: meta.type,
    source: meta.source,
    ...(meta.source_url ? { sourceUrl: meta.source_url } : {}),
    dataYear: meta.data_year,
    isOfficial: Boolean(meta.is_official),
    isSample: Boolean(meta.is_sample),
    ...(meta.notes ? { notes: meta.notes } : {}),
    ...(meta.coverage_label ? { coverageLabel: meta.coverage_label } : {}),
  };
  if (meta.country === "JP" || records.length <= chunkSize) {
    manifestDatasets.push({ country: meta.country, type: meta.type, ...writeDatasetFile(meta, { meta: datasetMeta, records }) });
    continue;
  }
  const groups = new Map();
  for (const record of records) {
    const gender = meta.type === "given_name" ? record.gender : undefined;
    const startRank = Math.floor((record.rank - 1) / chunkSize) * chunkSize + 1;
    const key = `${gender ?? "all"}|${startRank}`;
    if (!groups.has(key)) groups.set(key, { gender, startRank, records: [] });
    groups.get(key).records.push(record);
  }
  const chunks = [...groups.values()]
    .sort((a, b) => String(a.gender).localeCompare(String(b.gender)) || a.startRank - b.startRank)
    .map((group) => ({
      ...(group.gender ? { gender: group.gender } : {}),
      minRank: Math.min(...group.records.map((record) => record.rank)),
      maxRank: Math.max(...group.records.map((record) => record.rank)),
      ...writeDatasetFile(meta, { meta: datasetMeta, records: group.records }, `.${group.gender ?? "all"}.${group.startRank}-${group.startRank + chunkSize - 1}`),
    }));
  manifestDatasets.push({ country: meta.country, type: meta.type, records: records.length, chunks });
}
const sources = db
  .prepare("SELECT * FROM sources ORDER BY id")
  .all()
  .map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
    licenseName: row.license_name,
    licenseUrl: row.license_url,
    redistributionStatus: row.redistribution_status,
    attribution: row.attribution,
  }));
db.close();

const dataVersion = hash(
  JSON.stringify({
    dictionaryHash,
    datasets: manifestDatasets.map(({ country, type, sha256, chunks }) => ({
      country,
      type,
      sha256,
      chunks: chunks?.map(({ sha256: chunkHash }) => chunkHash),
    })),
    sources,
  }),
).slice(0, 16);
writeFileSync(
  join(temporaryRoot, "manifest.json"),
  JSON.stringify({
    schemaVersion: 3,
    dataVersion,
    countries,
    sources,
    dictionary: {
      path: `/data/${dictionaryName}`,
      records: dictionary.length,
      sha256: dictionaryHash,
      bytes: Buffer.byteLength(dictionaryContent),
    },
    datasets: manifestDatasets,
  }),
);

rmSync(backupRoot, { recursive: true, force: true });
if (existsSync(outputRoot)) renameSync(outputRoot, backupRoot);
try {
  renameSync(temporaryRoot, outputRoot);
  rmSync(backupRoot, { recursive: true, force: true });
} catch (error) {
  if (existsSync(backupRoot) && !existsSync(outputRoot))
    renameSync(backupRoot, outputRoot);
  throw error;
}
console.log(
  `Exported ${manifestDatasets.length} datasets as version ${dataVersion}.`,
);
