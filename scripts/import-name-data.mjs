import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

const cache = "data-sources/rankings";
mkdirSync(cache, { recursive: true });

const hira = (value) =>
  value
    .normalize("NFKC")
    .replace(/[ァ-ヶ]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 96),
    );

const dictionary = [];
for (const [gender, file] of [
  ["male", "man"],
  ["female", "woman"],
]) {
  for (const line of readFileSync(
    `data-sources/japanese-names/first_name_${file}_org.csv`,
    "utf8",
  )
    .trim()
    .split(/\r?\n/)) {
    const [reading, romaji, ...kanji] = line.split(",");
    dictionary.push({
      gender,
      reading,
      aliases: [romaji, ...kanji].filter(Boolean),
    });
  }
}
mkdirSync("src/data/dictionary", { recursive: true });
writeFileSync(
  "src/data/dictionary/names.json",
  JSON.stringify(dictionary),
);

const japanese = [];
const american = [];
const readingYears = [];
const spellingYears = [];

async function cached(url, file) {
  if (existsSync(file)) return readFileSync(file, "utf8");
  const response = await fetch(url);
  if (!response.ok) throw Error(`${response.status} ${url}`);
  const text = await response.text();
  writeFileSync(file, text);
  return text;
}

function importJapaneseRows(rows, year, rankingBasis) {
  for (const row of rows) {
    const gender = row.sex === "m" ? "male" : "female";
    const totalEntries = rows.filter((item) => item.sex === row.sex).length;
    japanese.push({
      country: "JP",
      type: "given_name",
      name: rankingBasis === "reading" ? hira(row.yomi) : row.name,
      rank: Number(row.rank),
      totalEntries,
      year,
      dataYear: year,
      gender,
      count: Number(row.count),
      share: row.per === undefined ? undefined : Number(row.per),
      rankingBasis,
    });
  }
}

for (let start = 1920; start <= 2025; start += 4) {
  await Promise.all(
    Array.from({ length: Math.min(4, 2026 - start) }, (_, index) =>
      start + index,
    ).map(async (year) => {
      try {
        const rows = JSON.parse(
          await cached(
            `https://www.meijiyasuda.co.jp/enjoy/ranking/assets/json/n_${year}.json`,
            `${cache}/jp-spelling-${year}.json`,
          ),
        );
        importJapaneseRows(rows, year, "spelling");
        spellingYears.push(year);
      } catch (error) {
        console.log(`JP spelling ${year}: ${error.message}`);
      }

      if (year >= 2004) {
        try {
          const rows = JSON.parse(
            await cached(
              `https://www.meijiyasuda.co.jp/enjoy/ranking/assets/json/y_${year}.json`,
              `${cache}/jp-${year}.json`,
            ),
          );
          importJapaneseRows(rows, year, "reading");
          readingYears.push(year);
        } catch (error) {
          console.log(`JP reading ${year}: ${error.message}`);
        }
      }

      if (year >= 1989 && year <= 2020) {
        try {
          const rows = (
            await cached(
              `https://raw.githubusercontent.com/hackerb9/ssa-baby-names/main/raw-data/yob${year}.txt`,
              `${cache}/us-${year}.txt`,
            )
          )
            .trim()
            .split(/\r?\n/)
            .map((line) => line.split(","));
          for (const sex of ["M", "F"]) {
            const group = rows.filter((row) => row[1] === sex);
            group.slice(0, 200).forEach(([name, , count], index) =>
              american.push({
                country: "US",
                type: "given_name",
                name,
                rank: index + 1,
                totalEntries: Math.min(200, group.length),
                year,
                dataYear: year,
                gender: sex === "M" ? "male" : "female",
                count: Number(count),
              }),
            );
          }
        } catch (error) {
          console.log(`US ${year}: ${error.message}`);
        }
      }
    }),
  );
}

if (!japanese.length || !american.length) throw Error("No rankings imported");

const sortRecords = (a, b) =>
  (a.year ?? 0) - (b.year ?? 0) ||
  String(a.gender).localeCompare(String(b.gender)) ||
  String(a.rankingBasis).localeCompare(String(b.rankingBasis)) ||
  a.rank - b.rank ||
  a.name.localeCompare(b.name, "ja");
japanese.sort(sortRecords);
american.sort(sortRecords);

const meta = (country, source, sourceUrl, records) => ({
  country,
  type: "given_name",
  source,
  sourceUrl,
  dataYear: records.reduce(
    (latest, record) => Math.max(latest, record.year),
    0,
  ),
  isOfficial: country === "US",
  isSample: false,
  notes:
    country === "JP"
      ? "保険加入者を対象とする名前表記・読み方調査。全国民の人口順位ではありません。"
      : "SSA公開データのミラーを使用。各年・性別上位200件を収録。",
});

writeFileSync(
  "src/data/jp/given-name/sample.json",
  JSON.stringify({
    meta: meta(
      "JP",
      "明治安田 生まれ年別の名前調査（名前表記・読み方）",
      "https://www.meijiyasuda.co.jp/enjoy/ranking/index.html",
      japanese,
    ),
    records: japanese,
  }),
);
writeFileSync(
  "src/data/us/given-name/sample.json",
  JSON.stringify({
    meta: meta(
      "US",
      "米国SSA Baby Names（公開ミラー）",
      "https://www.ssa.gov/oact/babynames/limits.html",
      american,
    ),
    records: american,
  }),
);

const surnameRows = readFileSync(
  "data-sources/japanese-names/last_name_org.csv",
  "utf8",
)
  .trim()
  .split(/\r?\n/)
  .map((line) => line.split(","))
  .sort((a, b) => Number(b[1]) - Number(a[1]));
const surnames = surnameRows.map(([name, count, reading, romaji], index) => ({
  country: "JP",
  type: "surname",
  name,
  aliases: [
    reading,
    romaji,
    ...(name === "渡辺" ? ["渡邊", "渡邉"] : []),
  ],
  count: Number(count),
  rank: index + 1,
  totalEntries: surnameRows.length,
}));
writeFileSync(
  "src/data/jp/surname/sample.json",
  JSON.stringify({
    meta: {
      country: "JP",
      type: "surname",
      source: "Japanese Personal Name Dataset 推定人数順",
      sourceUrl:
        "https://github.com/shuheilocale/japanese-personal-name-dataset",
      dataYear: 0,
      isOfficial: false,
      isSample: false,
      notes:
        "元データの調査年度は不明。収録姓の推定人数を降順で順位付け。",
    },
    records: surnames,
  }),
);

console.log(
  JSON.stringify({
    dictionary: dictionary.length,
    surnames: surnames.length,
    japanese: japanese.length,
    japaneseReading: japanese.filter(
      (record) => record.rankingBasis === "reading",
    ).length,
    japaneseSpelling: japanese.filter(
      (record) => record.rankingBasis === "spelling",
    ).length,
    american: american.length,
    readingYears: readingYears.sort(),
    spellingYears: spellingYears.sort(),
  }),
);
