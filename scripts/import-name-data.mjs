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
const commonReadings = new Set();
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
  for (const line of readFileSync(
    `data-sources/japanese-names/first_name_${file}_opti.csv`,
    "utf8",
  )
    .trim()
    .split(/\r?\n/)) {
    commonReadings.add(`${gender}|${line.split(",")[0]}`);
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
            group.slice(0, 5000).forEach(([name, , count], index) =>
              american.push({
                country: "US",
                type: "given_name",
                name,
                rank: index + 1,
                totalEntries: Math.min(5000, group.length),
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

function addJapaneseOverallRankings() {
  const published = JSON.parse(
    readFileSync("data-sources/rankings/jp-baby-calendar.json", "utf8"),
  );
  const latestPublished = new Map();
  for (const row of published.records) {
    const gender = row.sex === "m" ? "male" : "female";
    const key = `${gender}|${row.reading}`;
    const current = latestPublished.get(key);
    if (!current || row.year > current.year) latestPublished.set(key, row);
  }

  const spellingReadings = new Map();
  for (const entry of dictionary) {
    for (const alias of entry.aliases.slice(1)) {
      const key = `${entry.gender}|${alias}`;
      if (!spellingReadings.has(key)) spellingReadings.set(key, new Set());
      spellingReadings.get(key).add(entry.reading);
    }
  }

  const evidence = new Map();
  const addEvidence = (key, value) =>
    evidence.set(key, (evidence.get(key) ?? 0) + value);
  for (const record of japanese) {
    const key = `${record.gender}|${record.name}`;
    const recency = Math.exp(-(2025 - record.year) / 24);
    const position =
      (record.totalEntries - record.rank + 1) / record.totalEntries;
    if (record.rankingBasis === "reading") {
      addEvidence(key, 10 * recency * position);
      continue;
    }
    const candidates = spellingReadings.get(key);
    if (candidates?.size === 1) {
      addEvidence(
        `${record.gender}|${[...candidates][0]}`,
        1.5 * recency * position,
      );
    }
  }

  for (const gender of ["male", "female"]) {
    const candidates = dictionary
      .filter((entry) => entry.gender === gender)
      .map((entry) => {
        const key = `${gender}|${entry.reading}`;
        const survey = latestPublished.get(key);
        const surveyScore = survey
          ? 1000 * (1 - survey.rank / survey.totalEntries)
          : 0;
        return {
          entry,
          survey,
          score:
            surveyScore +
            (evidence.get(key) ?? 0) +
            (commonReadings.has(key) ? 0.6 : 0) +
            Math.log1p(entry.aliases.length - 1) * 0.015,
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.entry.aliases.length - a.entry.aliases.length ||
          a.entry.reading.localeCompare(b.entry.reading, "ja"),
      );

    candidates.forEach(({ entry, survey }, index) => {
      japanese.push({
        country: "JP",
        type: "given_name",
        name: entry.reading,
        rank: survey?.rank ?? index + 1,
        totalEntries: survey?.totalEntries ?? candidates.length,
        year: survey?.year,
        dataYear: survey?.year ?? 2025,
        gender,
        rankingBasis: "overall",
        isEstimated: !survey,
      });
    });
  }
}

addJapaneseOverallRankings();

if (!japanese.length || !american.length) throw Error("No rankings imported");

const japaneseForApp = japanese.filter(
  (record) => record.rankingBasis === "overall",
);
const americanForApp = american.filter((record) => record.year === 2020);

const sortRecords = (a, b) =>
  (a.year ?? 0) - (b.year ?? 0) ||
  String(a.gender).localeCompare(String(b.gender)) ||
  String(a.rankingBasis).localeCompare(String(b.rankingBasis)) ||
  a.rank - b.rank ||
  a.name.localeCompare(b.name, "ja");
japaneseForApp.sort(sortRecords);
americanForApp.sort(sortRecords);

const foreignDatasets = [
  {
    country: "GB",
    year: 2025,
    source: "Office for National Statistics・Onomaverse Global Given-Name Frequency",
    sourceUrl: "https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/datasets/babynamesenglandandwalesbabynamesstatisticsboys",
    file: "data-sources/rankings/foreign/gb-2025.json",
  },
  {
    country: "FR",
    year: 2024,
    source: "INSEE Fichier des prénoms national",
    sourceUrl: "https://www.insee.fr/fr/statistiques/8894961",
    file: "data-sources/rankings/foreign/fr-2024.json",
  },
  {
    country: "DE",
    year: 2024,
    source: "Beliebte Vornamen Top 500",
    sourceUrl: "https://www.beliebte-vornamen.de/jahrgang/j2024/top-500-2024",
    file: "data-sources/rankings/foreign/de-2024.json",
  },
  {
    country: "KR",
    year: 2024,
    source: "아기이름 연도별 이름 순위・출생신고 기준",
    sourceUrl: "https://baby-name.kr/annalRanking/2024/",
    file: "data-sources/rankings/foreign/kr-2024.json",
  },
];
for (const dataset of foreignDatasets) {
  const records = JSON.parse(readFileSync(dataset.file, "utf8"));
  const normalized = records.map((record) => ({
    ...record,
    totalEntries: record.totalEntries || records.filter((item) => item.gender === record.gender).length,
    year: dataset.year,
    dataYear: dataset.year,
  }));
  writeFileSync(
    `src/data/${dataset.country.toLowerCase()}/given-name/sample.json`,
    JSON.stringify({
      meta: {
        country: dataset.country,
        type: "given_name",
        source: dataset.source,
        sourceUrl: dataset.sourceUrl,
        dataYear: dataset.year,
        isOfficial: dataset.country === "GB" || dataset.country === "FR",
        isSample: false,
        notes: "公開データから取得できる範囲を男女別に収録。同数順位は掲載順を連番化しています。",
      },
      records: normalized,
    }),
  );
}

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
      ? "公開された赤ちゃんの読み順位を優先し、未掲載の読みは公開ランキング掲載歴と名前辞書から総合順位を推定。全国民の人口順位ではありません。"
      : "SSA公開データのミラーを使用。2020年の男女別上位5,000件を収録。",
});

writeFileSync(
  "src/data/jp/given-name/sample.json",
  JSON.stringify({
    meta: meta(
      "JP",
      "ベビーカレンダー 名前ランキング・明治安田 名前調査・Japanese Personal Name Dataset",
      "https://baby-calendar.jp/nazuke/",
      japaneseForApp,
    ),
    records: japaneseForApp,
  }),
);
writeFileSync(
  "src/data/us/given-name/sample.json",
  JSON.stringify({
    meta: meta(
      "US",
      "米国SSA Baby Names（公開ミラー）",
      "https://www.ssa.gov/oact/babynames/limits.html",
      americanForApp,
    ),
    records: americanForApp,
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
    japanese: japaneseForApp.length,
    japaneseReading: japanese.filter(
      (record) => record.rankingBasis === "reading",
    ).length,
    japaneseSpelling: japanese.filter(
      (record) => record.rankingBasis === "spelling",
    ).length,
    japaneseOverall: japanese.filter(
      (record) => record.rankingBasis === "overall",
    ).length,
    american: american.length,
    readingYears: readingYears.sort(),
    spellingYears: spellingYears.sort(),
  }),
);
