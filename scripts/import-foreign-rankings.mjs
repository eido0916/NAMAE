import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import ExcelJS from "exceljs";

const cacheDir = "data-sources/rankings/foreign";
mkdirSync(cacheDir, { recursive: true });
const limit = 500;

async function download(url, file) {
  if (existsSync(file)) return readFileSync(file);
  const response = await fetch(url, { headers: { "user-agent": "NAMED data importer" } });
  if (!response.ok) throw Error(`${response.status} ${url}`);
  const body = Buffer.from(await response.arrayBuffer());
  writeFileSync(file, body);
  return body;
}

function record(country, gender, name, rank, year, count) {
  return { country, type: "given_name", name, rank, totalEntries: limit, gender, year, dataYear: year, ...(count === undefined ? {} : { count }) };
}

async function importUnitedKingdom() {
  const base = "https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/datasets/babynamesenglandandwalesbabynamesstatistics";
  const files = { male: `${base}boys/2025/2025boysbabynames.xlsx`, female: `${base}girls/2025/2025girlsbabynames.xlsx` };
  const records = [];
  for (const [gender, url] of Object.entries(files)) {
    const body = await download(url, join(cacheDir, `gb-${gender}.xlsx`));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(body);
    const sheet = workbook.worksheets.find((item) => /top|name|rank/i.test(item.name)) ?? workbook.worksheets[0];
    const rows = [];
    sheet.eachRow((row) => rows.push(row.values.map((value) => String(value ?? "").trim())));
    let header = rows.findIndex((row) => row.some((value) => /name/i.test(value)) && row.some((value) => /rank/i.test(value)));
    if (header < 0) header = 0;
    const nameColumn = rows[header].findIndex((value) => /name/i.test(value));
    const rankColumn = rows[header].findIndex((value) => /rank/i.test(value));
    const countColumn = rows[header].findIndex((value) => /count|number/i.test(value));
    for (const row of rows.slice(header + 1)) {
      const name = row[nameColumn];
      const rank = Number(String(row[rankColumn] ?? "").replace(/[, ]/g, ""));
      if (!name || !Number.isFinite(rank) || rank < 1) continue;
      if (rank <= limit) records.push(record("GB", gender, name, rank, 2025, countColumn >= 0 ? Number(row[countColumn]) || undefined : undefined));
    }
  }
  const broad = await download(
    "https://github.com/onomaverse/datasets/releases/download/v2026.06/given-name-frequency.csv",
    join(cacheDir, "onomaverse-given-name-frequency.csv"),
  );
  const seen = new Set(records.map((item) => `${item.gender}|${item.name.toLowerCase()}`));
  const additions = { male: [], female: [] };
  for (const line of broad.toString("utf8").split(/\r?\n/).slice(1)) {
    const fields = line.split(",");
    if (fields.length < 8 || fields[3] !== "GB") continue;
    const name = fields[0].trim();
    if (!name) continue;
    const genders = fields[2].includes("M") ? ["male"] : [];
    if (fields[2].includes("F")) genders.push("female");
    for (const gender of genders) {
      const key = `${gender}|${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      additions[gender].push({ name, count: Number(fields[5]) || 0 });
    }
  }
  for (const gender of ["male", "female"]) {
    additions[gender].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const current = records.filter((item) => item.gender === gender);
    additions[gender].slice(0, limit - current.length).forEach((item, index) =>
      records.push(record("GB", gender, item.name, current.length + index + 1, 2025, item.count)),
    );
  }
  if (records.filter((item) => item.gender === "male").length < limit || records.filter((item) => item.gender === "female").length < limit)
    throw Error("UK list incomplete");
  writeFileSync(join(cacheDir, "gb-2025.json"), JSON.stringify(records));
  return records;
}

async function importFrance() {
  const url = "https://www.insee.fr/fr/statistiques/fichier/8894961/prenoms-2024-nat_csv.zip";
  const zip = await JSZip.loadAsync(await download(url, join(cacheDir, "fr-2024.zip")));
  const csvEntry = Object.values(zip.files).find((entry) => entry.name.toLowerCase().endsWith(".csv"));
  if (!csvEntry) throw Error("INSEE CSV not found in archive");
  const text = await csvEntry.async("string");
  const rows = text.split(/\r?\n/).slice(1).map((line) => line.split(";"));
  const byGender = new Map([["1", []], ["2", []]]);
  for (const [sex, name, year, count] of rows) {
    if (year !== "2024" || !name || !byGender.has(sex)) continue;
    byGender.get(sex).push({ name, count: Number(count) || 0 });
  }
  const records = [];
  for (const [sex, values] of byGender) {
    values.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"));
    values.slice(0, limit).forEach((value, index) => records.push(record("FR", sex === "1" ? "male" : "female", value.name, index + 1, 2024, value.count)));
  }
  writeFileSync(join(cacheDir, "fr-2024.json"), JSON.stringify(records));
  return records;
}

function parseGermanList(html, index) {
  const table = html.match(/<!--Hitliste Beginn-->([\s\S]*?)<!--Hitliste Ende-->/i)?.[1] ?? "";
  const lists = [...table.matchAll(/<ol>([\s\S]*?)<\/ol>/gi)].map((match) =>
    [...match[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((match) =>
      match[1].replace(/<[^>]+>/g, "").replace(/&uuml;/g, "ü").replace(/&amp;/g, "&").trim(),
    ).filter(Boolean),
  );
  return lists[index]?.slice(0, limit) ?? [];
}

async function importGermany() {
  const url = "https://www.beliebte-vornamen.de/jahrgang/j2024/top-500-2024";
  const html = await (await fetch(url, { headers: { "user-agent": "NAMED data importer" } })).text();
  const female = parseGermanList(html, 0);
  const male = parseGermanList(html, 1);
  const records = [
    ...male.map((name, index) => record("DE", "male", name, index + 1, 2024)),
    ...female.map((name, index) => record("DE", "female", name, index + 1, 2024)),
  ];
  if (male.length < limit || female.length < limit) throw Error(`Germany lists incomplete: ${male.length}/${female.length}`);
  writeFileSync(join(cacheDir, "de-2024.json"), JSON.stringify(records));
  return records;
}

async function importKorea() {
  const records = [];
  for (let page = 1; page <= 8 && records.filter((item) => item.gender === "male").length < limit || page <= 8; page += 1) {
    const url = `https://baby-name.kr/annalRanking/2024/${page === 1 ? "" : `${page}/`}`;
    const html = await (await fetch(url, { headers: { "user-agent": "NAMED data importer" } })).text();
    const tables = [...html.matchAll(/<div class="half-table">([\s\S]*?)<\/div>/gi)].map((match) => match[1]);
    if (tables.length < 2) continue;
    for (const [gender, table] of [["male", tables[0]], ["female", tables[1]]]) {
      for (const row of table.matchAll(/<tr[^>]*>[\s\S]*?<td[^>]*>\s*(\d+)[\s\S]*?<\/td>[\s\S]*?<td[^>]*>\s*<a[^>]*>([^<]+)<\/a>[\s\S]*?<td[^>]*>\s*([\d,]+)/gi)) {
        records.push({ country: "KR", type: "given_name", name: row[2].trim(), rank: 0, totalEntries: limit, gender, year: 2024, dataYear: 2024, count: Number(row[3].replace(/,/g, "")), sourceRank: Number(row[1]) });
      }
    }
  }
  const normalized = [];
  for (const gender of ["male", "female"]) {
    const seen = new Set();
    records.filter((item) => item.gender === gender).forEach((item) => {
      if (seen.has(item.name) || seen.size >= limit) return;
      seen.add(item.name);
      normalized.push({ ...item, rank: seen.size });
    });
  }
  if (normalized.filter((item) => item.gender === "male").length < limit || normalized.filter((item) => item.gender === "female").length < limit) throw Error("Korea lists incomplete");
  writeFileSync(join(cacheDir, "kr-2024.json"), JSON.stringify(normalized));
  return normalized;
}

const all = [await importUnitedKingdom(), await importFrance(), await importGermany(), await importKorea()];
console.log(JSON.stringify(Object.fromEntries(all.flat().reduce((map, row) => map.set(row.country, (map.get(row.country) ?? 0) + 1), new Map()))));
