import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = join(root, "src", "data");
const output = join(root, "data", "namae.sqlite");
const temporary = `${output}.tmp`;

function collectJson(dir, files = []) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) collectJson(path, files);
    else if (item.name.endsWith(".json")) files.push(path);
  }
  return files;
}

const datasetFiles = readdirSync(sourceRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "dictionary")
  .flatMap((entry) => collectJson(join(sourceRoot, entry.name)))
  .sort();
const datasets = datasetFiles.map((path) =>
  JSON.parse(readFileSync(path, "utf8")),
);
const dictionary = JSON.parse(
  readFileSync(join(sourceRoot, "dictionary", "names.json"), "utf8"),
);
const countries = JSON.parse(
  readFileSync(join(sourceRoot, "countries.json"), "utf8"),
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
  CREATE INDEX ranking_lookup ON ranking_entries(country, type, gender, year, ranking_basis, rank);
  CREATE INDEX ranking_name ON ranking_entries(country, type, name);
  CREATE INDEX dictionary_reading ON dictionary_entries(gender, reading);
`);

const insertCountry = db.prepare(
  "INSERT INTO countries VALUES (?, ?, ?, ?, ?, ?, ?)",
);
const insertDataset = db.prepare(
  "INSERT INTO datasets VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
);
const insertRanking = db.prepare(
  "INSERT INTO ranking_entries (country,type,name,aliases_json,rank,total_entries,year,gender,count,share,data_year,ranking_basis,is_estimated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
);
const insertDictionary = db.prepare(
  "INSERT INTO dictionary_entries (gender,reading,aliases_json) VALUES (?,?,?)",
);

db.exec("BEGIN");
try {
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
  for (const dataset of datasets) {
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
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  db.close();
  rmSync(temporary, { force: true });
  throw error;
}
db.exec("VACUUM");
db.close();
rmSync(output, { force: true });
renameSync(temporary, output);
console.log(
  `Built ${output} with ${datasets.length} datasets, ${datasets.reduce((sum, dataset) => sum + dataset.records.length, 0)} rankings, and ${dictionary.length} dictionary entries.`,
);
