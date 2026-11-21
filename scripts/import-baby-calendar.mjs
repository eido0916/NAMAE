import { existsSync, readFileSync, writeFileSync } from "node:fs";

const output = "data-sources/rankings/jp-baby-calendar.json";
const base = "https://baby-calendar.jp/nazuke/result";
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function readingsFrom(file) {
  return readFileSync(file, "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(",")[0]);
}

function existingReadings(sex) {
  const values = [];
  for (let year = 2004; year <= 2025; year += 1) {
    const file = `data-sources/rankings/jp-${year}.json`;
    if (!existsSync(file)) continue;
    for (const row of JSON.parse(readFileSync(file, "utf8"))) {
      if (row.sex === sex) values.push(toHiragana(row.yomi));
    }
  }
  return values;
}

function toHiragana(value) {
  return value
    .normalize("NFKC")
    .replace(/[ァ-ヶ]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 96),
    );
}

function parseRows(html, reading, sex) {
  const rows = [];
  const pattern =
    /<tr>\s*<td>(\d{4})<\/td>\s*<td><span[^>]*>(\d+)<\/span>位\s*／\s*(\d+)位中/gu;
  for (const match of html.matchAll(pattern)) {
    rows.push({
      reading,
      sex,
      year: Number(match[1]),
      rank: Number(match[2]),
      totalEntries: Number(match[3]),
    });
  }
  return rows;
}

async function fetchRanking(reading, sex) {
  const gender = sex === "m" ? 1 : 2;
  const url = `${base}?mode=kana&gender=${gender}&kana=${encodeURIComponent(reading)}`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent":
            "NAMAE data importer (+https://github.com/eido0916/NAMED)",
        },
      });
      if (!response.ok) throw Error(`${response.status} ${response.statusText}`);
      return parseRows(await response.text(), reading, sex);
    } catch (error) {
      if (attempt === 3) throw error;
      await sleep(400 * attempt);
    }
  }
}

const groups = [
  {
    sex: "m",
    names: [
      ...readingsFrom(
        "data-sources/japanese-names/first_name_man_opti.csv",
      ),
      ...existingReadings("m"),
      "じゅん",
      "じゅんや",
      "れん",
      "れんや",
    ],
  },
  {
    sex: "f",
    names: [
      ...readingsFrom(
        "data-sources/japanese-names/first_name_woman_opti.csv",
      ),
      ...existingReadings("f"),
    ],
  },
];

const records = [];
for (const group of groups) {
  const names = [...new Set(group.names)].sort((a, b) =>
    a.localeCompare(b, "ja"),
  );
  for (let start = 0; start < names.length; start += 6) {
    const batch = names.slice(start, start + 6);
    const results = await Promise.all(
      batch.map((name) => fetchRanking(name, group.sex)),
    );
    records.push(...results.flat());
    process.stdout.write(
      `\r${group.sex}: ${Math.min(start + batch.length, names.length)}/${names.length}`,
    );
    await sleep(180);
  }
  process.stdout.write("\n");
}

records.sort(
  (a, b) =>
    a.sex.localeCompare(b.sex) ||
    a.reading.localeCompare(b.reading, "ja") ||
    b.year - a.year,
);
writeFileSync(
  output,
  `${JSON.stringify(
    {
      source: "ベビーカレンダー 名前ランキング検索",
      sourceUrl: "https://baby-calendar.jp/nazuke/",
      retrievedAt: new Date().toISOString().slice(0, 10),
      records,
    },
    null,
    2,
  )}\n`,
);
console.log(`Saved ${records.length} ranking rows to ${output}.`);
