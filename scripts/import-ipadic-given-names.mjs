import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourcePath = `${root}/data-sources/japanese-names/mecab-ipadic-Noun.name.csv`;
const givenPath = `${root}/src/data/jp/given-name/sample.json`;
const dictionaryPath = `${root}/src/data/dictionary/names.json`;

if (!existsSync(sourcePath)) throw new Error(`Missing ${sourcePath}`);

const toHiragana = (value) =>
  value.normalize("NFKC").replace(/[ァ-ヶ]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 96),
  );
const normalize = (value) => toHiragana(value).trim().toLowerCase();
const japanese = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々ヶヵ・]+$/u;
const hiragana = /^[ぁ-ゖー]+$/u;

const candidates = new Map();
const text = new TextDecoder("euc-jp").decode(readFileSync(sourcePath));
for (const line of text.split(/\r?\n/)) {
  const fields = line.split(",");
  if (fields.length < 13 || fields[7] !== "名") continue;
  const surface = fields[0]?.trim();
  const reading = normalize(fields[11] ?? "");
  if (!surface || !reading || !japanese.test(surface) || !hiragana.test(reading))
    continue;
  if (!candidates.has(reading)) candidates.set(reading, new Set());
  candidates.get(reading).add(surface);
}

const given = JSON.parse(readFileSync(givenPath, "utf8"));
const dictionary = JSON.parse(readFileSync(dictionaryPath, "utf8"));
const dictionaryByKey = new Map(
  dictionary.map((entry) => [`${entry.gender}|${normalize(entry.reading)}`, entry]),
);
const givenByKey = new Map(
  given.records
    .filter((record) => record.rankingBasis === "overall")
    .map((record) => [`${record.gender}|${normalize(record.name)}`, record]),
);

const added = [];
const addAlias = (target, value) => {
  if (!target.aliases) target.aliases = [];
  if (value !== target.name && !target.aliases.includes(value))
    target.aliases.push(value);
};

for (const [reading, surfaces] of candidates) {
  const aliases = [...surfaces].sort((a, b) => a.localeCompare(b, "ja"));
  const knownGenders = ["male", "female"].filter((gender) =>
    givenByKey.has(`${gender}|${reading}`),
  );
  // IPADIC's name dictionary does not label gender. Preserve the existing
  // gender evidence; genuinely new readings are available to both selections
  // and are marked as estimated below.
  const genders = knownGenders.length ? knownGenders : ["male", "female"];
  for (const gender of genders) {
    const key = `${gender}|${reading}`;
    const entry = dictionaryByKey.get(key);
    if (entry) {
      for (const alias of aliases) addAlias(entry, alias);
    } else {
      const next = { gender, reading, aliases: [...aliases] };
      dictionary.push(next);
      dictionaryByKey.set(key, next);
    }

    const record = givenByKey.get(key);
    if (record) {
      for (const alias of aliases) addAlias(record, alias);
    } else {
      const next = {
        country: "JP",
        type: "given_name",
        name: reading,
        aliases: [...aliases],
        rank: 0,
        totalEntries: 0,
        gender,
        dataYear: 2026,
        rankingBasis: "overall",
        isEstimated: true,
      };
      givenByKey.set(key, next);
      added.push(next);
    }
  }
}

const existing = given.records.filter((record) => record.rankingBasis !== "overall");
const overall = given.records.filter((record) => record.rankingBasis === "overall");
const allOverall = [];
for (const gender of ["male", "female"]) {
  const group = [
    ...overall.filter((record) => record.gender === gender),
    ...added.filter((record) => record.gender === gender),
  ];
  let nextRank =
    Math.max(0, ...group.filter((record) => !added.includes(record)).map((record) => record.rank)) +
    1;
  for (const record of added.filter((record) => record.gender === gender))
    record.rank = nextRank++;
  for (const record of group) record.totalEntries = group.length;
  allOverall.push(...group);
}

given.records = [...existing, ...allOverall];
if (!given.meta.source.includes("MeCab IPADIC 人名辞書"))
  given.meta.source += "・MeCab IPADIC 人名辞書";
given.meta.sourceUrl =
  "https://github.com/deepin-community/mecab-ipadic/blob/master/Noun.name.csv";
given.meta.notes =
  "公開された読み順位を優先し、未掲載の読みは名前辞書から総合順位を推定。ENAMDICT/JMnedictとMeCab IPADICの人名辞書から漢字表記を追加し、IPADIC由来の未掲載読みは男女別の推定順位として収録しています。";

writeFileSync(givenPath, JSON.stringify(given));
writeFileSync(dictionaryPath, JSON.stringify(dictionary));
console.log(
  JSON.stringify(
    {
      sourceRows: candidates.size,
      addedRecords: added.length,
      totalRecords: allOverall.length,
      dictionaryEntries: dictionary.length,
    },
    null,
    2,
  ),
);
