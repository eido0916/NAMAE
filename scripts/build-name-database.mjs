import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { collectDatasetFiles, iterateReferenceDatasets } from "./data-utils.mjs";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = join(root, "src", "data");
const output = join(root, "data", "namae.sqlite");
const temporary = `${output}.tmp`;

const datasetPaths = collectDatasetFiles(sourceRoot);
let rankingCount = 0;
const dictionary = JSON.parse(
  readFileSync(join(sourceRoot, "dictionary", "names.json"), "utf8"),
);
const countries = JSON.parse(
  readFileSync(join(sourceRoot, "countries.json"), "utf8"),
);
const provenance = JSON.parse(
  readFileSync(join(root, "data-sources", "SOURCES.json"), "utf8"),
);

mkdirSync(dirname(output), { recursive: true });
rmSync(temporary, { force: true });
const db = new DatabaseSync(temporary);
db.exec(`
  PRAGMA journal_mode = OFF;
  PRAGMA synchronous = OFF;
  CREATE TABLE countries (
    code TEXT PRIMARY KEY,
    name_ja TEXT NOT NULL,
    name_en TEXT NOT NULL,
    flag TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    supports_given_name INTEGER NOT NULL,
    supports_surname INTEGER NOT NULL
  );
  CREATE TABLE datasets (
    country TEXT NOT NULL,
    type TEXT NOT NULL,
    source TEXT NOT NULL,
    source_url TEXT,
    data_year INTEGER,
    is_official INTEGER NOT NULL,
    is_sample INTEGER NOT NULL,
    notes TEXT,
    coverage_label TEXT,
    PRIMARY KEY (country, type)
  );
  CREATE TABLE ranking_entries (
    id INTEGER PRIMARY KEY,
    country TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    aliases_json TEXT,
    rank INTEGER NOT NULL,
    total_entries INTEGER NOT NULL,
    year INTEGER,
    gender TEXT,
    count INTEGER,
    share REAL,
    data_year INTEGER,
    ranking_basis TEXT,
    is_estimated INTEGER
  );
  CREATE TABLE dictionary_entries (
    id INTEGER PRIMARY KEY,
    gender TEXT NOT NULL,
    reading TEXT NOT NULL,
    aliases_json TEXT NOT NULL
  );
  CREATE TABLE reference_datasets (
    country TEXT NOT NULL,
    type TEXT NOT NULL,
    meta_json TEXT NOT NULL,
    PRIMARY KEY (country, type)
  );
  CREATE TABLE reference_entries (
    id INTEGER PRIMARY KEY,
    country TEXT NOT NULL,
    type TEXT NOT NULL,
    gender TEXT,
    name TEXT NOT NULL,
    source_ids_json TEXT NOT NULL,
    evidence_rank_json TEXT
  );
  CREATE TABLE sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    license_name TEXT NOT NULL,
    license_url TEXT NOT NULL,
    redistribution_status TEXT NOT NULL,
    attribution TEXT NOT NULL
  );
  CREATE TABLE source_datasets (
    source_id TEXT NOT NULL,
    dataset_key TEXT NOT NULL,
    PRIMARY KEY (source_id, dataset_key),
    FOREIGN KEY (source_id) REFERENCES sources(id)
  );
`);

const insertCountry = db.prepare(
  "INSERT INTO countries VALUES (?, ?, ?, ?, ?, ?, ?)",
);
const insertReferenceMeta = db.prepare("INSERT INTO reference_datasets VALUES (?,?,?)");
const insertReference = db.prepare("INSERT INTO reference_entries (country,type,gender,name,source_ids_json,evidence_rank_json) VALUES (?,?,?,?,?,?)");
const insertDataset = db.prepare(
  "INSERT INTO datasets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
);
const insertRanking = db.prepare(
  "INSERT INTO ranking_entries (country,type,name,aliases_json,rank,total_entries,year,gender,count,share,data_year,ranking_basis,is_estimated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
);
const insertDictionary = db.prepare(
  "INSERT INTO dictionary_entries (gender,reading,aliases_json) VALUES (?,?,?)",
);
const insertSource = db.prepare("INSERT INTO sources VALUES (?,?,?,?,?,?,?)");
const insertSourceDataset = db.prepare(
  "INSERT INTO source_datasets VALUES (?,?)",
);

db.exec("BEGIN");
try {
  for (const { dataset } of iterateReferenceDatasets(join(root, "src/reference-data"))) {
    insertReferenceMeta.run(dataset.meta.country, dataset.meta.type, JSON.stringify(dataset.meta));
    for (const record of dataset.records) {
      if (record.rank !== undefined) throw new Error("Reference dictionaries must not invent ranks");
      insertReference.run(record.country, record.type, record.gender ?? null, record.name, JSON.stringify(record.sourceIds), record.evidenceRank ? JSON.stringify(record.evidenceRank) : null);
    }
  }
  for (const country of countries)
    insertCountry.run(
      country.code,
      country.nameJa,
      country.nameEn,
      country.flag,
      Number(country.enabled),
      Number(country.supportsGivenName),
      Number(country.supportsSurname),
    );
  for (const datasetPath of datasetPaths) {
    const dataset = JSON.parse(readFileSync(datasetPath, "utf8"));
    rankingCount += dataset.records.length;
    const meta = dataset.meta;
    insertDataset.run(
      meta.country,
      meta.type,
      meta.source,
      meta.sourceUrl ?? null,
      meta.dataYear ?? null,
      Number(meta.isOfficial),
      Number(meta.isSample),
      meta.notes ?? null,
      meta.coverageLabel ?? null,
    );
    for (const record of dataset.records) {
      if (record.rank < 1 || record.rank > record.totalEntries)
        throw new Error(`Invalid rank: ${record.name}`);
      insertRanking.run(
        record.country,
        record.type,
        record.name,
        record.aliases ? JSON.stringify(record.aliases) : null,
        record.rank,
        record.totalEntries,
        record.year ?? null,
        record.gender ?? null,
        record.count ?? null,
        record.share ?? null,
        record.dataYear ?? null,
        record.rankingBasis ?? null,
        record.isEstimated === undefined ? null : Number(record.isEstimated),
      );
    }
  }
  for (const entry of dictionary)
    insertDictionary.run(
      entry.gender,
      entry.reading,
      JSON.stringify(entry.aliases),
    );
  for (const source of provenance.sources) {
    insertSource.run(
      source.id,
      source.name,
      source.url,
      source.licenseName,
      source.licenseUrl,
      source.redistributionStatus,
      source.attribution,
    );
    for (const datasetKey of source.datasets)
      insertSourceDataset.run(source.id, datasetKey);
  }
  // Bulk-load first. Maintaining multi-column indexes during millions of
  // individual inserts makes expanded national datasets unnecessarily slow.
  db.exec(`
    CREATE INDEX reference_lookup ON reference_entries(country, type, gender);
    CREATE INDEX ranking_lookup ON ranking_entries(country, type, gender, year, ranking_basis, rank);
    CREATE INDEX ranking_name ON ranking_entries(country, type, name);
    CREATE INDEX dictionary_reading ON dictionary_entries(gender, reading);
    COMMIT;
  `);
} catch (error) {
  db.exec("ROLLBACK");
  db.close();
  rmSync(temporary, { force: true });
  throw error;
}
// The database is built from scratch, so there are no deleted pages to
// reclaim. VACUUM would require another full database of temporary disk space.
db.close();
rmSync(output, { force: true });
renameSync(temporary, output);
console.log(
  `Built ${output} with ${datasetPaths.length} datasets, ${rankingCount} rankings, and ${dictionary.length} dictionary entries.`,
);
