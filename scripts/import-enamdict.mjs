import { gunzipSync } from "node:zlib";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourcePath = `${root}/data-sources/japanese-names/enamdict.gz`;
const givenPath = `${root}/src/data/jp/given-name/sample.json`;
const surnamePath = `${root}/src/data/jp/surname/sample.json`;
const dictionaryPath = `${root}/src/data/dictionary/names.json`;

if (!existsSync(sourcePath)) throw new Error(`Missing ${sourcePath}`);
const text = new TextDecoder("euc-jp").decode(gunzipSync(readFileSync(sourcePath)));
const toHiragana = (value) =>
  value.normalize("NFKC").replace(/[ァ-ヶ]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 96),
  );
const normalize = (value) => toHiragana(value).trim().toLowerCase();
const japanese = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々ヶヵ・]+$/u;
const hiragana = /^[ぁ-ゖー]+$/u;

const parsed = [];
for (const line of text.split(/\r?\n/)) {
  const match = line.match(/^(.+?)\s+\[([^\]]+)\]\s+\/(.*)\/$/);
  if (!match) continue;
  const head = match[1].trim();
  const reading = toHiragana(match[2].trim());
  if (!head || !reading || !japanese.test(head) || !hiragana.test(reading)) continue;
  const tags = new Set();
  for (const tag of match[3].matchAll(/\(([^)]+)\)/g))
    for (const value of tag[1].split(",")) tags.add(value.trim());
  if (tags.has("s") || tags.has("f") || tags.has("m") || tags.has("g"))
    parsed.push({ head, reading, tags });
}

const given = JSON.parse(readFileSync(givenPath, "utf8"));
const surnames = JSON.parse(readFileSync(surnamePath, "utf8"));
const dictionary = JSON.parse(readFileSync(dictionaryPath, "utf8"));
const dictionaryByKey = new Map(
  dictionary.map((entry) => [`${entry.gender}|${normalize(entry.reading)}`, entry]),
);
const givenByKey = new Map(
  given.records
    .filter((record) => record.rankingBasis === "overall")
    .map((record) => [`${record.gender}|${normalize(record.name)}`, record]),
);
const surnameByName = new Map(
  surnames.records.map((record) => [normalize(record.name), record]),
);
const extraGiven = new Map();
const extraSurnames = new Map();

function addDictionary(gender, reading, head) {
  const key = `${gender}|${normalize(reading)}`;
  const entry = dictionaryByKey.get(key) ?? { gender, reading, aliases: [] };
  if (!dictionaryByKey.has(key)) {
    dictionary.push(entry);
    dictionaryByKey.set(key, entry);
  }
  if (head !== reading && !entry.aliases.includes(head)) entry.aliases.push(head);
}

for (const item of parsed) {
  const isSurname = item.tags.has("s");
  const genders = item.tags.has("f")
    ? ["female"]
    : item.tags.has("m")
      ? ["male"]
      : ["male", "female"];
  if (isSurname) {
    const key = normalize(item.head);
    const existing = surnameByName.get(key);
    if (existing) {
      existing.aliases = [...new Set([...(existing.aliases ?? []), item.reading])];
    } else {
      extraSurnames.set(key, {
        country: "JP",
        type: "surname",
        name: item.head,
        aliases: [item.reading],
        rank: 0,
        totalEntries: 0,
        dataYear: 2026,
        isEstimated: true,
      });
      surnameByName.set(key, extraSurnames.get(key));
    }
  }
  if (item.tags.has("f") || item.tags.has("m") || item.tags.has("g")) {
    for (const gender of genders) {
      addDictionary(gender, item.reading, item.head);
      const key = `${gender}|${normalize(item.reading)}`;
      const existing = givenByKey.get(key);
      if (existing) {
        existing.aliases = [...new Set([...(existing.aliases ?? []), item.head])];
      } else if (!extraGiven.has(key)) {
        extraGiven.set(key, {
          country: "JP",
          type: "given_name",
          name: item.reading,
          aliases: [item.head],
          rank: 0,
          totalEntries: 0,
          gender,
          dataYear: 2026,
          rankingBasis: "overall",
          isEstimated: true,
        });
        givenByKey.set(key, extraGiven.get(key));
      } else {
        extraGiven.get(key).aliases = [
          ...new Set([...(extraGiven.get(key).aliases ?? []), item.head]),
        ];
      }
    }
  }
}

const existingGiven = given.records
  .filter((record) => record.rankingBasis === "overall")
  .slice();
const addedGiven = [...extraGiven.values()].sort(
  (a, b) => a.name.localeCompare(b.name, "ja") || a.gender.localeCompare(b.gender),
);
const allGiven = [];
for (const gender of ["male", "female"]) {
  const group = [
    ...existingGiven.filter((record) => record.gender === gender),
    ...addedGiven.filter((record) => record.gender === gender),
  ];
  let nextRank = Math.max(
    0,
    ...existingGiven
      .filter((record) => record.gender === gender)
      .map((record) => record.rank),
  ) + 1;
  for (const record of addedGiven.filter((record) => record.gender === gender))
    record.rank = nextRank++;
  for (const record of group) record.totalEntries = group.length;
  allGiven.push(...group);
}
const givenTotal = allGiven.length;
given.records = [
  ...given.records.filter((record) => record.rankingBasis !== "overall"),
  ...allGiven,
];
given.meta.source = `${given.meta.source}・ENAMDICT/JMnedict`;
given.meta.sourceUrl = "https://www.edrdg.org/enamdict/enamdict_doc.html";
given.meta.notes =
  "公開された読み順位を優先し、未掲載の読みは名前辞書から総合順位を推定。ENAMDICT/JMnedictの分類名を追加し、検索用の漢字表記も収録しています。";

const existingSurnames = [];
const existingSurnameByName = new Map();
for (const record of surnames.records.sort((a, b) => a.rank - b.rank)) {
  const key = normalize(record.name);
  const duplicate = existingSurnameByName.get(key);
  if (duplicate) {
    duplicate.aliases = [
      ...new Set([...(duplicate.aliases ?? []), ...(record.aliases ?? [])]),
    ];
    continue;
  }
  existingSurnameByName.set(key, record);
  existingSurnames.push(record);
}
const addedSurnames = [...extraSurnames.values()].sort(
  (a, b) => a.name.localeCompare(b.name, "ja") || a.aliases[0].localeCompare(b.aliases[0], "ja"),
);
const allSurnames = [...existingSurnames, ...addedSurnames];
const surnameTotal = allSurnames.length;
allSurnames.forEach((record, index) => {
  record.rank = index + 1;
  record.totalEntries = surnameTotal;
});
surnames.records = allSurnames;
surnames.meta.source = `${surnames.meta.source}・ENAMDICT/JMnedict`;
surnames.meta.sourceUrl = "https://www.edrdg.org/enamdict/enamdict_doc.html";
surnames.meta.notes =
  "推定人数順の公開姓に加え、ENAMDICT/JMnedictの姓分類を検索・順位対応用に収録。追加分の人口順位は推定です。";

writeFileSync(givenPath, JSON.stringify(given));
writeFileSync(surnamePath, JSON.stringify(surnames));
writeFileSync(dictionaryPath, JSON.stringify(dictionary));
console.log(JSON.stringify({
  parsed: parsed.length,
  dictionary: dictionary.length,
  given: { existing: existingGiven.length, added: addedGiven.length, total: givenTotal },
  surname: { existing: existingSurnames.length, added: addedSurnames.length, total: surnameTotal },
}, null, 2));
