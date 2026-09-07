import { DatabaseSync } from "node:sqlite";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const databasePath = join(root, "data", "namae.sqlite");
const outputRoot = join(root, "public", "data");
if (!outputRoot.startsWith(join(root, "public")))
  throw new Error("Refusing to replace data outside public directory");
rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(join(outputRoot, "datasets"), { recursive: true });

const db = new DatabaseSync(databasePath, { readOnly: true });
const countries = db.prepare("SELECT * FROM countries ORDER BY rowid").all().map((row) => ({
  code: row.code,
  nameJa: row.name_ja,
  nameEn: row.name_en,
  flag: row.flag,
  enabled: Boolean(row.enabled),
  supportsGivenName: Boolean(row.supports_given_name),
  supportsSurname: Boolean(row.supports_surname),
}));
const dictionary = db.prepare("SELECT gender, reading, aliases_json FROM dictionary_entries ORDER BY id").all().map((row) => ({
  gender: row.gender,
  reading: row.reading,
  aliases: JSON.parse(row.aliases_json),
}));
writeFileSync(join(outputRoot, "dictionary.json"), JSON.stringify(dictionary));

const metadata = db.prepare("SELECT * FROM datasets ORDER BY country, type").all();
const selectRecords = db.prepare(
  "SELECT * FROM ranking_entries WHERE country = ? AND type = ? ORDER BY id",
);
const manifestDatasets = [];
for (const meta of metadata) {
  const records = selectRecords.all(meta.country, meta.type).map((row) => {
    const record = {
      country: row.country,
      type: row.type,
      name: row.name,
      rank: row.rank,
      totalEntries: row.total_entries,
    };
    if (row.aliases_json !== null) record.aliases = JSON.parse(row.aliases_json);
    if (row.year !== null) record.year = row.year;
    if (row.gender !== null) record.gender = row.gender;
    if (row.count !== null) record.count = row.count;
    if (row.share !== null) record.share = row.share;
    if (row.data_year !== null) record.dataYear = row.data_year;
    if (row.ranking_basis !== null) record.rankingBasis = row.ranking_basis;
    if (row.is_estimated !== null) record.isEstimated = Boolean(row.is_estimated);
    return record;
  });
  const dataset = {
    meta: {
      country: meta.country,
      type: meta.type,
      source: meta.source,
      ...(meta.source_url ? { sourceUrl: meta.source_url } : {}),
      dataYear: meta.data_year,
      isOfficial: Boolean(meta.is_official),
      isSample: Boolean(meta.is_sample),
      ...(meta.notes ? { notes: meta.notes } : {}),
    },
    records,
  };
  const countryDir = join(outputRoot, "datasets", meta.country.toLowerCase());
  mkdirSync(countryDir, { recursive: true });
  const fileName = `${meta.type.replace("_", "-")}.json`;
  writeFileSync(join(countryDir, fileName), JSON.stringify(dataset));
  manifestDatasets.push({
    country: meta.country,
    type: meta.type,
    path: `/data/datasets/${meta.country.toLowerCase()}/${fileName}`,
    records: records.length,
  });
}
db.close();
writeFileSync(
  join(outputRoot, "manifest.json"),
  JSON.stringify({
    version: 1,
    countries,
    dictionary: "/data/dictionary.json",
    datasets: manifestDatasets,
  }),
);
console.log(`Exported ${manifestDatasets.length} browser datasets to ${outputRoot}.`);
