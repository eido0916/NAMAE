import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const cacheDir = "data-sources/rankings/foreign";
mkdirSync(cacheDir, { recursive: true });

async function download(url, file) {
  if (existsSync(file)) return readFileSync(file, "utf8");
  const response = await fetch(url, { headers: { "user-agent": "NAMED data importer" } });
  if (!response.ok) throw Error(`${response.status} ${url}`);
  const text = await response.text();
  writeFileSync(file, text);
  return text;
}

function makeRecords(country, values, year) {
  values.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const totalEntries = values.length;
  return values.map((value, index) => ({
    country,
    type: "surname",
    name: value.name,
    aliases: value.aliases ?? [],
    rank: index + 1,
    totalEntries,
    count: value.count,
    year,
    dataYear: year,
  }));
}

const csv = await download(
  "https://github.com/onomaverse/datasets/releases/download/v2026.06/surname-frequency.csv",
  join(cacheDir, "onomaverse-surname-frequency.csv"),
);
const countryNames = { US: "United States", GB: "United Kingdom", FR: "France", DE: "Germany", KR: "South Korea" };
const values = Object.fromEntries(Object.keys(countryNames).map((code) => [code, []]));
for (const line of csv.split(/\r?\n/).slice(1)) {
  const fields = line.split(",");
  if (fields.length < 6 || !values[fields[2]]) continue;
  const name = fields[0].trim();
  if (name) values[fields[2]].push({ name, count: Number(fields[4]) || 0 });
}

const koreanHtml = await (await fetch("https://koreanlastnames.com/most-common-korean-last-names/", { headers: { "user-agent": "NAMED data importer" } })).text();
for (const row of koreanHtml.matchAll(/<tr[^>]*>\s*<td[^>]*data-v="(\d+)"[^>]*>\d+<\/td>\s*<td[^>]*data-v="([^"]+)"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/td>\s*<td[^>]*class="kln-hg"[^>]*>([^<]+)<\/td>/gi)) {
  const count = Number(row[1]);
  const name = row[3].trim();
  const hangul = row[4].trim();
  if (name) values.KR.push({ name, aliases: [hangul], count });
}
for (const [country, year] of [["US", 2020], ["GB", 2025], ["FR", 2024], ["DE", 2024], ["KR", 2015]]) {
  const records = makeRecords(country, values[country], year);
  if (!records.length) throw Error(`${country} surname ranking is empty`);
  writeFileSync(join(cacheDir, `${country.toLowerCase()}-surname-${year}.json`), JSON.stringify(records));
  console.log(`${country}: ${records.length}`);
}
