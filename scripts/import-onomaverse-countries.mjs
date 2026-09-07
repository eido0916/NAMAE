import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = join(root, "data-sources", "rankings", "foreign");
const outputRoot = join(root, "src", "data");
const year = 2026;

// Countries with useful coverage for both given names and surnames. Existing
// country datasets keep their more authoritative national sources.
const countries = {
  IT: ["イタリア", "Italy", "🇮🇹"],
  ES: ["スペイン", "Spain", "🇪🇸"],
  PT: ["ポルトガル", "Portugal", "🇵🇹"],
  NL: ["オランダ", "Netherlands", "🇳🇱"],
  BE: ["ベルギー", "Belgium", "🇧🇪"],
  CH: ["スイス", "Switzerland", "🇨🇭"],
  AT: ["オーストリア", "Austria", "🇦🇹"],
  IE: ["アイルランド", "Ireland", "🇮🇪"],
  CA: ["カナダ", "Canada", "🇨🇦"],
  BR: ["ブラジル", "Brazil", "🇧🇷"],
  MX: ["メキシコ", "Mexico", "🇲🇽"],
  AR: ["アルゼンチン", "Argentina", "🇦🇷"],
  CO: ["コロンビア", "Colombia", "🇨🇴"],
  CL: ["チリ", "Chile", "🇨🇱"],
  PE: ["ペルー", "Peru", "🇵🇪"],
  ZA: ["南アフリカ", "South Africa", "🇿🇦"],
  NG: ["ナイジェリア", "Nigeria", "🇳🇬"],
  IN: ["インド", "India", "🇮🇳"],
  TR: ["トルコ", "Türkiye", "🇹🇷"],
  PL: ["ポーランド", "Poland", "🇵🇱"],
};

const latinName = /^[\p{Script=Latin}\p{M} .'-]+$/u;
const normalize = (value) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .normalize("NFC")
    .trim();

function parseCsv(file, type) {
  const countryColumn = type === "given_name" ? 3 : 2;
  const countColumn = type === "given_name" ? 5 : 4;
  const genderColumn = type === "given_name" ? 2 : -1;
  const grouped = new Map(Object.keys(countries).map((code) => [code, []]));
  for (const line of readFileSync(file, "utf8").split(/\r?\n/).slice(1)) {
    const fields = line.split(",");
    const country = fields[countryColumn];
    if (!grouped.has(country)) continue;
    const name = normalize(fields[0] ?? "");
    if (!name || !latinName.test(name)) continue;
    const count = Number(fields[countColumn]) || 0;
    if (type === "surname") {
      grouped.get(country).push({ name, count });
      continue;
    }
    const genderValue = fields[genderColumn] ?? "";
    if (genderValue.includes("M"))
      grouped.get(country).push({ name, count, gender: "male" });
    if (genderValue.includes("F"))
      grouped.get(country).push({ name, count, gender: "female" });
  }
  return grouped;
}

function rankedRecords(country, type, values) {
  const genders = type === "given_name" ? ["male", "female"] : [undefined];
  const records = [];
  for (const gender of genders) {
    const seen = new Set();
    const cohort = values
      .filter((value) => value.gender === gender)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const unique = cohort.filter((value) => {
      const key = value.name.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    unique.forEach((value, index) =>
      records.push({
        country,
        type,
        name: value.name,
        rank: index + 1,
        totalEntries: unique.length,
        count: value.count,
        share: undefined,
        year,
        dataYear: year,
        ...(gender ? { gender } : {}),
      }),
    );
  }
  return records;
}

const given = parseCsv(join(sourceRoot, "onomaverse-given-name-frequency.csv"), "given_name");
const surnames = parseCsv(join(sourceRoot, "onomaverse-surname-frequency.csv"), "surname");
const counts = {};
for (const country of Object.keys(countries)) {
  counts[country] = {};
  for (const [type, grouped] of [["given_name", given], ["surname", surnames]]) {
    const records = rankedRecords(country, type, grouped.get(country));
    if (!records.length) throw new Error(`${country}/${type} is empty`);
    const directory = join(outputRoot, country.toLowerCase(), type.replace("_", "-"));
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, "onomaverse.json"),
      JSON.stringify({
        meta: {
          country,
          type,
          source: "Onomaverse Global Name Frequency",
          sourceUrl: `https://onomaverse.com/datasets/${type === "given_name" ? "given-name-frequency" : "surname-frequency"}`,
          dataYear: year,
          isOfficial: false,
          isSample: false,
          notes: "国別の推定人数を降順に並べた頻度順位。CC BY 4.0。",
        },
        records,
      }),
    );
    counts[country][type] = records.length;
  }
}
console.log(JSON.stringify(counts, null, 2));
