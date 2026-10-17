import { isNativeName } from "../src/lib/native-name-policy.mjs";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = join(root, "data-sources", "rankings", "foreign");
const outputRoot = join(root, "src", "data");
const year = 2026;

// Countries with useful coverage for both given names and surnames. Existing
// country datasets keep their more authoritative national sources.
const countries = {
  AE: ["アラブ首長国連邦", "United Arab Emirates", "🇦🇪"],
  AO: ["アンゴラ", "Angola", "🇦🇴"],
  BD: ["バングラデシュ", "Bangladesh", "🇧🇩"],
  BG: ["ブルガリア", "Bulgaria", "🇧🇬"],
  BH: ["バーレーン", "Bahrain", "🇧🇭"],
  BO: ["ボリビア", "Bolivia", "🇧🇴"],
  CM: ["カメルーン", "Cameroon", "🇨🇲"],
  CN: ["中国", "China", "🇨🇳"],
  CR: ["コスタリカ", "Costa Rica", "🇨🇷"],
  CZ: ["チェコ", "Czechia", "🇨🇿"],
  DK: ["デンマーク", "Denmark", "🇩🇰"],
  DZ: ["アルジェリア", "Algeria", "🇩🇿"],
  EG: ["エジプト", "Egypt", "🇪🇬"],
  FI: ["フィンランド", "Finland", "🇫🇮"],
  GH: ["ガーナ", "Ghana", "🇬🇭"],
  GR: ["ギリシャ", "Greece", "🇬🇷"],
  GT: ["グアテマラ", "Guatemala", "🇬🇹"],
  HK: ["香港", "Hong Kong", "🇭🇰"],
  IL: ["イスラエル", "Israel", "🇮🇱"],
  IQ: ["イラク", "Iraq", "🇮🇶"],
  IR: ["イラン", "Iran", "🇮🇷"],
  JO: ["ヨルダン", "Jordan", "🇯🇴"],
  KW: ["クウェート", "Kuwait", "🇰🇼"],
  KZ: ["カザフスタン", "Kazakhstan", "🇰🇿"],
  LB: ["レバノン", "Lebanon", "🇱🇧"],
  LU: ["ルクセンブルク", "Luxembourg", "🇱🇺"],
  LY: ["リビア", "Libya", "🇱🇾"],
  MA: ["モロッコ", "Morocco", "🇲🇦"],
  MO: ["マカオ", "Macao", "🇲🇴"],
  MU: ["モーリシャス", "Mauritius", "🇲🇺"],
  MY: ["マレーシア", "Malaysia", "🇲🇾"],
  NO: ["ノルウェー", "Norway", "🇳🇴"],
  OM: ["オマーン", "Oman", "🇴🇲"],
  PA: ["パナマ", "Panama", "🇵🇦"],
  PH: ["フィリピン", "Philippines", "🇵🇭"],
  PS: ["パレスチナ", "Palestine", "🇵🇸"],
  QA: ["カタール", "Qatar", "🇶🇦"],
  RU: ["ロシア", "Russia", "🇷🇺"],
  SA: ["サウジアラビア", "Saudi Arabia", "🇸🇦"],
  SD: ["スーダン", "Sudan", "🇸🇩"],
  SE: ["スウェーデン", "Sweden", "🇸🇪"],
  SG: ["シンガポール", "Singapore", "🇸🇬"],
  SY: ["シリア", "Syria", "🇸🇾"],
  TN: ["チュニジア", "Tunisia", "🇹🇳"],
  TW: ["台湾", "Taiwan", "🇹🇼"],
  UY: ["ウルグアイ", "Uruguay", "🇺🇾"],
  YE: ["イエメン", "Yemen", "🇾🇪"],
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

// The frequency files include more countries than the curated list above.
// Discover those country codes so the result picker can expose every country
// for which both datasets have usable Latin display names. Keep countries
// backed by national sources on their existing importer path.
const protectedCodes = new Set(["DE", "FR", "GB", "JP", "KR", "US"]);
const regionJa = new Intl.DisplayNames(["ja"], { type: "region" });
const regionEn = new Intl.DisplayNames(["en"], { type: "region" });
const flagFor = (code) =>
  [...code].map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join("");
const discoveredCodes = new Set();
for (const [file, countryColumn] of [
  [join(sourceRoot, "onomaverse-given-name-frequency.csv"), 3],
  [join(sourceRoot, "onomaverse-surname-frequency.csv"), 2],
]) {
  for (const line of readFileSync(file, "utf8").split(/\r?\n/).slice(1)) {
    const code = line.split(",")[countryColumn];
    if (/^[A-Z]{2}$/.test(code)) discoveredCodes.add(code);
  }
}
for (const code of [...discoveredCodes].sort()) {
  if (protectedCodes.has(code) || countries[code]) continue;
  const nameJa = regionJa.of(code);
  const nameEn = regionEn.of(code);
  if (!nameJa || !nameEn) continue;
  countries[code] = [nameJa, nameEn, flagFor(code)];
}

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
    const nameId = normalize(fields[1] ?? "");
    if (!name || !nameId) continue;
    const count = Number(fields[countColumn]) || 0;
    if (type === "surname") {
      grouped.get(country).push({ name, nameId, count });
      continue;
    }
    const genderValue = fields[genderColumn] ?? "";
    if (genderValue.includes("M"))
      grouped.get(country).push({ name, nameId, count, gender: "male" });
    if (genderValue.includes("F"))
      grouped.get(country).push({ name, nameId, count, gender: "female" });
  }
  return grouped;
}

function loadLatinTransliterations(valuesByCountry) {
  const ids = new Set();
  for (const values of valuesByCountry.values())
    for (const value of values)
      if (!latinName.test(value.name)) ids.add(value.nameId);
  if (!ids.size) return new Map();
  const aliases = new Map();
  const file = join(sourceRoot, "onomaverse-name-transliterations.csv");
  for (const line of readFileSync(file, "utf8").split(/\r?\n/).slice(1)) {
    if (!line) continue;
    const fields = line.split(",");
    const nameId = fields[0];
    if (!ids.has(nameId)) continue;
    const localized = normalize(fields[4] ?? "");
    if (!localized || !latinName.test(localized)) continue;
    if (!aliases.has(nameId)) aliases.set(nameId, new Set());
    aliases.get(nameId).add(localized);
  }
  return aliases;
}

function withDisplayNames(valuesByCountry) {
  const aliases = loadLatinTransliterations(valuesByCountry);
  const result = new Map();
  for (const [country, values] of valuesByCountry) {
    result.set(
      country,
      values.flatMap((value) => {
        const transliterations = [...(aliases.get(value.nameId) ?? [])];
        const displayName = isNativeName(country, value.name) || latinName.test(value.name)
          ? value.name
          : transliterations.shift();
        if (!displayName) return [];
        const allAliases = transliterations.filter(
          (alias) => alias.toLocaleLowerCase() !== displayName.toLocaleLowerCase(),
        );
        if (!latinName.test(value.name)) allAliases.unshift(value.name);
        return [{ ...value, name: displayName, aliases: [...new Set(allAliases)] }];
      }),
    );
  }
  return result;
}

function rankedRecords(country, type, values) {
  const genders = type === "given_name" ? ["male", "female"] : [undefined];
  const records = [];
  for (const gender of genders) {
    const cohort = values
      .filter((value) => value.gender === gender)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const unique = [];
    const byName = new Map();
    for (const value of cohort) {
      const key = value.name.toLocaleLowerCase();
      const existing = byName.get(key);
      if (existing) {
        existing.aliases = [...new Set([...(existing.aliases ?? []), ...(value.aliases ?? [])])];
        continue;
      }
      byName.set(key, value);
      unique.push(value);
    }
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
        ...(value.aliases?.length ? { aliases: value.aliases } : {}),
      }),
    );
  }
  return records;
}

const given = withDisplayNames(parseCsv(join(sourceRoot, "onomaverse-given-name-frequency.csv"), "given_name"));
const surnames = withDisplayNames(parseCsv(join(sourceRoot, "onomaverse-surname-frequency.csv"), "surname"));
const counts = {};
const generatedCodes = new Set();
for (const country of Object.keys(countries)) {
  const ranked = new Map(
    [
      ["given_name", rankedRecords(country, "given_name", given.get(country))],
      ["surname", rankedRecords(country, "surname", surnames.get(country))],
    ],
  );
  if ([...ranked.values()].some((records) => !records.length)) {
    if (discoveredCodes.has(country)) continue;
    throw new Error(`${country} has an empty name dataset`);
  }
  counts[country] = {};
  for (const [type, records] of ranked) {
    if (country === "CN") continue; // Preserve the verified Chinese national tables.
    const directory = join(outputRoot, country.toLowerCase(), type.replace("_", "-"));
    // Generic frequencies must never replace a published national table.
    if (existsSync(directory) && readdirSync(directory).filter(file => file.endsWith('.json')).some(file => {
      const meta = JSON.parse(readFileSync(join(directory, file), 'utf8')).meta;
      return meta.isOfficial || !meta.source.includes('Onomaverse');
    })) continue;
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
          notes: "国別の推定人数を降順に並べた頻度順位。現地の原表記を優先し、ラテン文字転写は検索別名として扱います。全国人口統計ではなく、この資料内での頻度順位です。CC BY 4.0。",
        },
        records,
      }),
    );
    counts[country][type] = records.length;
  }
  generatedCodes.add(country);
}

const catalogPath = join(outputRoot, "countries.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const catalogCodes = new Set(catalog.map((country) => country.code));
for (const [code, [nameJa, nameEn, flag]] of Object.entries(countries)) {
  if (!generatedCodes.has(code)) continue;
  if (catalogCodes.has(code)) continue;
  catalog.push({
    code,
    nameJa,
    nameEn,
    flag,
    enabled: true,
    supportsGivenName: true,
    supportsSurname: true,
  });
}
writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
console.log(JSON.stringify(counts, null, 2));
