import { isNativeName } from "../src/lib/native-name-policy.mjs";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = join(root, "data-sources", "rankings", "foreign");
const dataRoot = join(root, "src", "data");
const dataYear = 2023;
const sourceName = "Popular Names by Country Dataset";
const sourceUrl =
  "https://github.com/sigpwned/popular-names-by-country-dataset";
const latinName = /^[\p{Script=Latin}\p{M} .'-]+$/u;
const excludedCodes = new Set(["JP", "KR", "US"]);

function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      fields.push(field);
      field = "";
    } else field += char;
  }
  fields.push(field);
  return fields;
}

function readCsv(file) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines.shift()).map((value) =>
    value.replace(/^\uFEFF/, ""),
  );
  return lines.map((line) => {
    const fields = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, fields[index] ?? ""]));
  });
}

function clean(value) {
  return value.normalize("NFC").trim();
}

function displayName(row) {
  const localized = clean(row["Localized Name"] ?? "");
  const romanized = clean(row["Romanized Name"] ?? "");
  const name = [localized, romanized].find((value) => value && isNativeName(row.Country, value))
    ?? [romanized, localized].find((value) => value && latinName.test(value));
  if (!name) return undefined;
  const aliases = [localized, romanized]
    .filter((value) => value && value !== name)
    .filter((value, index, values) => values.indexOf(value) === index);
  return { name, aliases };
}

function groupedGivenNames(rows) {
  const groups = new Map();
  for (const row of rows) {
    const name = displayName(row);
    if (!name || !["M", "F"].includes(row.Gender)) continue;
    const key = `${row.Country}|${row["Name Group"]}`;
    const current = groups.get(key);
    if (!current || Number(row.Index) < current.sourceRank)
      groups.set(key, {
        country: row.Country,
        gender: row.Gender === "M" ? "male" : "female",
        sourceRank: Number(row.Index) || Number.MAX_SAFE_INTEGER,
        ...name,
      });
  }
  return [...groups.values()];
}

function groupedSurnames(rows) {
  const groups = new Map();
  for (const row of rows) {
    const name = displayName(row);
    if (!name) continue;
    const key = `${row.Country}|${row["Name Group"]}`;
    const current = groups.get(key);
    if (!current || Number(row.Rank) < current.sourceRank)
      groups.set(key, {
        country: row.Country,
        sourceRank: Number(row.Rank) || Number.MAX_SAFE_INTEGER,
        ...name,
      });
  }
  return [...groups.values()];
}

function recordsFor(datasetPath) {
  if (!existsSync(datasetPath)) return undefined;
  return JSON.parse(readFileSync(datasetPath, "utf8"));
}

function findDatasetPath(country, type) {
  const directory = join(dataRoot, country.toLowerCase(), type === "given_name" ? "given-name" : "surname");
  if (!existsSync(directory)) return join(directory, "popular.json");
  const file = readdirSync(directory).find((name) => name.endsWith(".json"));
  return file ? join(directory, file) : join(directory, "popular.json");
}

function normalize(value) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function dedupeGivenRecords(records) {
  const groups = new Map();
  for (const record of records) {
    const groupKey = `${record.gender}|${record.year ?? ""}|${record.rankingBasis ?? ""}`;
    if (!groups.has(groupKey)) groups.set(groupKey, new Map());
    const names = groups.get(groupKey);
    const key = normalize(record.name);
    const existing = names.get(key);
    if (!existing || record.rank < existing.rank) {
      names.set(key, { ...record, aliases: [...(record.aliases ?? [])] });
    } else {
      existing.aliases = [...new Set([...(existing.aliases ?? []), ...(record.aliases ?? [])])];
    }
  }
  return [...groups.values()].flatMap((names) => {
    const values = [...names.values()].sort(
      (a, b) => a.rank - b.rank || a.name.localeCompare(b.name),
    );
    values.forEach((record, index) => {
      record.rank = index + 1;
      record.totalEntries = values.length;
      if (!record.aliases?.length) delete record.aliases;
    });
    return values;
  });
}

function dedupeSurnameRecords(records) {
  const names = new Map();
  for (const record of records) {
    const key = normalize(record.name);
    const existing = names.get(key);
    if (!existing || record.rank < existing.rank) {
      names.set(key, { ...record, aliases: [...(record.aliases ?? [])] });
    } else {
      existing.aliases = [...new Set([...(existing.aliases ?? []), ...(record.aliases ?? [])])];
    }
  }
  const values = [...names.values()].sort(
    (a, b) => a.rank - b.rank || a.name.localeCompare(b.name),
  );
  values.forEach((record, index) => {
    record.rank = index + 1;
    record.totalEntries = values.length;
    if (!record.aliases?.length) delete record.aliases;
  });
  return values;
}

function mergeGiven(dataset, candidates) {
  const originalCount = dataset?.records?.length ?? 0;
  const records = dedupeGivenRecords(dataset?.records ? [...dataset.records] : []);
  const addedByGender = new Map([
    ["male", []],
    ["female", []],
  ]);
  const candidateKeys = new Set();
  for (const candidate of candidates) {
    const candidateKey = `${candidate.gender}|${normalize(candidate.name)}`;
    const duplicate = records.some(
      (record) =>
        record.gender === candidate.gender &&
        [record.name, ...(record.aliases ?? [])].some(
          (value) => normalize(value) === normalize(candidate.name),
        ),
    );
    if (!duplicate && !candidateKeys.has(candidateKey)) {
      candidateKeys.add(candidateKey);
      addedByGender.get(candidate.gender).push(candidate);
    }
  }
  for (const gender of ["male", "female"]) {
    const existing = records.filter((record) => record.gender === gender);
    const additions = addedByGender.get(gender);
    if (!additions.length) continue;
    const maxRank = existing.reduce(
      (max, record) => Math.max(max, record.rank),
      0,
    );
    const totalEntries = existing.length + additions.length;
    for (const record of existing) record.totalEntries = totalEntries;
    additions
      .sort((a, b) => a.sourceRank - b.sourceRank || a.name.localeCompare(b.name))
      .forEach((candidate, index) =>
        records.push({
          country: candidate.country,
          type: "given_name",
          name: candidate.name,
          rank: maxRank + index + 1,
          totalEntries,
          year: dataYear,
          dataYear,
          gender,
          ...(candidate.aliases.length ? { aliases: candidate.aliases } : {}),
        }),
      );
  }
  const normalized = dedupeGivenRecords(records);
  return {
    records: normalized,
    added: normalized.length - originalCount,
    changed: normalized.length !== originalCount || normalized.length !== records.length,
  };
}

function mergeSurnames(dataset, candidates) {
  const originalCount = dataset?.records?.length ?? 0;
  const records = dedupeSurnameRecords(dataset?.records ? [...dataset.records] : []);
  const existingNames = new Set(
    records.flatMap((record) => [record.name, ...(record.aliases ?? [])]).map(normalize),
  );
  const additions = candidates.filter((candidate) => {
    const key = normalize(candidate.name);
    if (existingNames.has(key)) return false;
    existingNames.add(key);
    return true;
  });
  const totalEntries = records.length + additions.length;
  for (const record of records) record.totalEntries = totalEntries;
  const maxRank = records.reduce(
    (max, record) => Math.max(max, record.rank),
    0,
  );
  additions
    .sort((a, b) => a.sourceRank - b.sourceRank || a.name.localeCompare(b.name))
    .forEach((candidate, index) =>
      records.push({
        country: candidate.country,
        type: "surname",
        name: candidate.name,
        rank: maxRank + index + 1,
        totalEntries,
        year: dataYear,
        dataYear,
        ...(candidate.aliases.length ? { aliases: candidate.aliases } : {}),
      }),
    );
  const normalized = dedupeSurnameRecords(records);
  return {
    records: normalized,
    added: additions.length,
    changed: additions.length > 0 || normalized.length !== originalCount,
  };
}

function createDataset(country, type, records) {
  return {
    meta: {
      country,
      type,
      source: sourceName,
      sourceUrl,
      dataYear,
      isOfficial: false,
      isSample: false,
      notes: "CC0 1.0。各国の代表的な名前を補完する公開データ。",
    },
    records,
  };
}

const givenRows = groupedGivenNames(
  readCsv(join(sourceRoot, "popular-forenames-by-country.csv")),
);
const surnameRows = groupedSurnames(
  readCsv(join(sourceRoot, "popular-surnames-by-country.csv")),
);
const byCountry = new Map();
for (const item of [...givenRows, ...surnameRows]) {
  if (!byCountry.has(item.country)) byCountry.set(item.country, { given_name: [], surname: [] });
  byCountry.get(item.country)[item.gender ? "given_name" : "surname"].push(item);
}

const changes = [];
const catalog = JSON.parse(readFileSync(join(dataRoot, "countries.json"), "utf8"));
const catalogByCode = new Map(catalog.map((country) => [country.code, country]));
const regionJa = new Intl.DisplayNames(["ja"], { type: "region" });
const regionEn = new Intl.DisplayNames(["en"], { type: "region" });
const flagFor = (code) =>
  [...code].map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join("");

for (const [country, candidates] of byCountry) {
  if (excludedCodes.has(country)) continue;
  const merged = {};
  for (const type of ["given_name", "surname"]) {
    if (country === "CN") continue; // National ranks are imported independently.
    if (!candidates[type].length) continue;
    const datasetPath = findDatasetPath(country, type);
    const current = recordsFor(datasetPath);
    if (current && (current.meta.isOfficial || !/Onomaverse|Popular Names by Country/.test(current.meta.source))) continue;
    const result = type === "given_name"
      ? mergeGiven(current, candidates[type])
      : mergeSurnames(current, candidates[type]);
    if (!result.changed) continue;
    const dataset = current ?? createDataset(country, type, []);
    dataset.records = result.records;
    if (current) {
      dataset.meta.notes = `${dataset.meta.notes ?? ""} CC0補完データを追加。`.trim();
    }
    mkdirSync(join(datasetPath, ".."), { recursive: true });
    writeFileSync(datasetPath, JSON.stringify(dataset));
    merged[type] = result.added;
  }
  const hasGivenName = Boolean(recordsFor(findDatasetPath(country, "given_name"))?.records?.length);
  const hasSurname = Boolean(recordsFor(findDatasetPath(country, "surname"))?.records?.length);
  if (!hasGivenName && !hasSurname) continue;
  if (Object.keys(merged).length) changes.push({ country, ...merged });
  const current = catalogByCode.get(country);
  const supportsGivenName = Boolean(current?.supportsGivenName || hasGivenName);
  const supportsSurname = Boolean(current?.supportsSurname || hasSurname);
  if (current) {
    current.supportsGivenName = supportsGivenName;
    current.supportsSurname = supportsSurname;
    continue;
  }
  const nameJa = regionJa.of(country);
  const nameEn = regionEn.of(country);
  if (!nameJa || !nameEn) continue;
  const created = {
    code: country,
    nameJa,
    nameEn,
    flag: flagFor(country),
    enabled: true,
    supportsGivenName,
    supportsSurname,
  };
  catalog.push(created);
  catalogByCode.set(country, created);
}

writeFileSync(join(dataRoot, "countries.json"), JSON.stringify(catalog, null, 2) + "\n");
console.log(JSON.stringify({ countries: changes.length, changes }, null, 2));
