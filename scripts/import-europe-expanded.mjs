import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { readDatasets, hasExpectedScript } from "./data-utils.mjs";

const cache = "data-sources/rankings/foreign/";
const targets = readDatasets("src/data");
const provenance = JSON.parse(readFileSync("data-sources/SOURCES.json", "utf8"));
const previousAudit = existsSync("reports/europe-expansion.json") ? JSON.parse(readFileSync("reports/europe-expansion.json", "utf8")) : [];
const audit = [];
function write(path, value) {
  writeFileSync(path + ".tmp", value);
  renameSync(path + ".tmp", path);
}
async function download(file, url) {
  if (!existsSync(cache + file)) {
    const response = await fetch(url, { signal: AbortSignal.timeout(240000) });
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    write(cache + file, Buffer.from(await response.arrayBuffer()));
  }
  return readFileSync(cache + file);
}
const clean = (name) => name.normalize("NFKC").trim().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
function save(country, type, rows, meta, source) {
  const target = targets.find(({ dataset }) => dataset.meta.country === country && dataset.meta.type === type);
  if (!target) throw new Error(`Missing target ${country}/${type}`);
  const records = [];
  for (const gender of type === "given_name" ? ["male", "female"] : [undefined]) {
    const groups = new Map();
    for (const row of rows.filter((row) => row.gender === gender)) {
      const name = clean(row.name);
      if (!hasExpectedScript(country, name) || !Number.isSafeInteger(row.count) || row.count <= 0) continue;
      const key = name.toLowerCase();
      const previous = groups.get(key);
      if (previous) previous.count += row.count;
      else groups.set(key, { name, count: row.count });
    }
    const cohort = [...groups.values()].sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    if (!cohort.length) throw new Error(`Empty cohort ${country}/${type}/${gender}`);
    cohort.forEach((row, index) => records.push({ country, type, ...row, ...(gender ? { gender } : {}), rank: index + 1, totalEntries: cohort.length, year: meta.dataYear, dataYear: meta.dataYear, isEstimated: false }));
  }
  if (records.length < target.dataset.records.length) throw new Error(`Coverage decreased: ${country}/${type}`);
  write(target.path, JSON.stringify({ meta: { country, type, isOfficial: true, isSample: false, ...meta }, records }));
  if (!provenance.sources.some((entry) => entry.id === source.id)) provenance.sources.push(source);
  const entry = provenance.sources.find((entry) => entry.id === source.id);
  Object.assign(entry, { ...source, datasets: entry.datasets });
  const key = `${country}/${type}`;
  if (!entry.datasets.includes(key)) entry.datasets.push(key);
  const prior = previousAudit.find((row) => row.country === country && row.type === type);
  const result = { country, type, before: Math.min(prior?.before ?? Infinity, target.dataset.records.length), after: records.length, male: records.filter((r) => r.gender === "male").length, female: records.filter((r) => r.gender === "female").length, sourceUrl: meta.sourceUrl };
  audit.push(result);
  write("data-sources/SOURCES.json", JSON.stringify(provenance, null, 2) + "\n");
  console.log(JSON.stringify(result));
}

const beSource = { id: "statbel-population-names", name: "Statbel — population names by municipality", url: "https://statbel.fgov.be/nl/open-data?category=23", datasets: [], licenseName: "Statbel open data — free commercial and non-commercial reuse", licenseUrl: "https://statbel.fgov.be/nl/open-data", redistributionStatus: "permitted", attribution: "Source: Statbel (2026). Municipality cells aggregated by NAMAE; suppressed cells excluded." };
const beRows = { given_name: [], surname: [] };
for (const [band, directory, table] of [["male", "Voornamen%20bevolking%20per%20gemeente", "TA_POP_MALE"], ["female", "Voornamen%20bevolking%20per%20gemeente", "TA_POP_FEMALE"], ["surnames", "Familienamen", "TA_POP_LST"]]) {
  const zip = await JSZip.loadAsync(await download(`be-${band}.zip`, `https://statbel.fgov.be/sites/default/files/files/opendata/${directory}/${table}_2026.zip`));
  const file = Object.values(zip.files).find((file) => file.name.endsWith(".txt"));
  if (!file) throw new Error("Statbel text missing");
  // Statbel ZIP text uses Windows-1252, not UTF-8 (François / André).
  const text = new TextDecoder("windows-1252").decode(await file.async("uint8array"));
  if (!text.startsWith("CD_REFNIS|") || !text.includes("MS_FREQUENCY")) throw new Error("Statbel schema changed");
  const type = band === "surnames" ? "surname" : "given_name";
  const seen = new Map();
  for (const line of text.split(/\r?\n/).slice(1).filter(Boolean)) {
    const [municipality, , , name, rawCount] = line.split("|");
    if (!/^\d{5}$/.test(municipality)) throw new Error("Unexpected aggregate geography");
    const key = `${municipality}|${name}`;
    const row = { name, count: Number(rawCount), ...(type === "given_name" ? { gender: band } : {}) };
    // The published surname file repeats Bai and Matei in Antwerp with
    // different counts. Keep the larger cell, rather than double-count it.
    if (seen.has(key)) seen.get(key).count = Math.max(seen.get(key).count, row.count);
    else seen.set(key, row);
  }
  for (const row of seen.values()) beRows[type].push(row);
}
for (const type of ["given_name", "surname"]) save("BE", type, beRows[type], { source: beSource.name, sourceUrl: beSource.url, dataYear: 2026, coverageLabel: "2026年・自治体別公開人数の合算順位", notes: "同一年の自治体別公開セルのみを合算した独自順位。同一自治体・同一表記の重複セルは最大値を採用。同数は名前順。少人数の非公開セルを含まないため、完全な全国人口順位ではありません。" }, beSource);

const noSource = { id: "ssb-national-names", name: "Statistics Norway — name tables and protected surnames", url: "https://www.ssb.no/befolkning/navn/statistikk/navn", datasets: [], licenseName: "CC BY 4.0", licenseUrl: "https://www.ssb.no/diverse/lisens", redistributionStatus: "permitted", attribution: "Source: Statistics Norway (2025 population). Count-sorted by NAMAE; confidential counts excluded from ranking." };
async function norwayTable(id) {
  const file = `no-${id}-2025.json.gz`;
  if (existsSync(cache + file)) return JSON.parse(gunzipSync(readFileSync(cache + file)));
  const url = `https://data.ssb.no/api/v0/en/table/${id}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`SSB metadata ${response.status}`);
  const metadata = await response.json();
  const query = metadata.variables.map((v) => ({ code: v.code, selection: { filter: "item", values: v.code === "Tid" ? ["2025"] : v.values } }));
  const result = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, response: { format: "json-stat2" } }), signal: AbortSignal.timeout(30000) });
  if (!result.ok) throw new Error(`SSB data ${result.status}`);
  const data = await result.json();
  write(cache + file, gzipSync(JSON.stringify(data)));
  return data;
}
const noRows = { given_name: [], surname: [] };
for (const [id, axis, type] of [["10501", "Fornavn", "given_name"], ["12891", "Etternavn", "surname"]]) {
  const data = await norwayTable(id);
  if (data.id[0] !== axis || data.size.slice(1).some((n) => n !== 1)) throw new Error("SSB axes changed");
  const category = data.dimension[axis].category;
  for (const [code, index] of Object.entries(category.index)) {
    const count = data.value[index];
    if (!Number.isSafeInteger(count) || count <= 0) continue;
    // SSB's name codes explicitly encode 1=female and 2=male.
    noRows[type].push({ name: category.label[code], count, ...(type === "given_name" ? { gender: code.startsWith("1") ? "female" : code.startsWith("2") ? "male" : undefined } : {}) });
  }
}
const protectedUrl = "https://www.ssb.no/befolkning/navn/statistikk/navn/artikler/etternavn/_/attachment/inline/a32d1870-f1e5-4ad3-b7bc-76f8e98efd5b:140ffbe23ba387b5233b665416fbf19882ee3daa/beskyttede_etternavn_20251231.xlsx";
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(await download("no-protected.xlsx", protectedUrl));
const sheet = workbook.worksheets[0];
if (sheet.getCell("A3").value !== "NAVN" || sheet.getCell("B3").value !== "ANTALL") throw new Error("SSB surname schema changed");
const suppressed = [];
const known = new Set(noRows.surname.map((row) => row.name.toLowerCase()));
for (let i = 4; i <= sheet.rowCount; i++) {
  const name = clean(String(sheet.getCell(i, 1).value ?? ""));
  const value = sheet.getCell(i, 2).value;
  if (!hasExpectedScript("NO", name)) continue;
  if (value === ":") suppressed.push(name);
  else if (Number.isSafeInteger(value) && value > 0) {
    if (!known.has(name.toLowerCase())) noRows.surname.push({ name, count: value });
    known.add(name.toLowerCase());
  } else if (value !== null) throw new Error("Unexpected SSB protected count");
}
for (const type of ["given_name", "surname"]) save("NO", type, noRows[type], { source: noSource.name, sourceUrl: noSource.url, dataYear: 2025, coverageLabel: "2025年末・住民登録の公開人数順位", notes: "最新年の住民人数を使用し過去年を加算しません。同数は名前順。名字は保護姓の全表も結合。人数非公開の名字は順位を付けず別の辞書に収録。" }, noSource);
mkdirSync(cache + "national-reference-supplements", { recursive: true });
write(cache + "national-reference-supplements/no-surname.json.gz", gzipSync(JSON.stringify({ country: "NO", type: "surname", sourceId: noSource.id, sourceUrl: noSource.url, source: noSource.name, dataYear: 2025, names: suppressed })));

const chUrl = "https://dam-api.bfs.admin.ch/hub/api/dam/assets/36752523/master";
const chText = (await download("ch-surnames.csv", chUrl)).toString("utf8").replace(/^\uFEFF/, "");
const csvFields = (line) => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map((m) => m[1].replaceAll('""', '"'));
if (csvFields(chText.split(/\r?\n/)[0]).join("|") !== "TIME_PERIOD|LASTNAME|GDENR|GDENAME|RANG_GDE|VALUE|PCT_GDE|OBS_STATUS") throw new Error("BFS surname schema changed");
const chRows = [];
const chSeen = new Set();
for (const line of chText.split(/\r?\n/).slice(1).filter(Boolean)) {
  const [year, name, municipality, , , value, , status] = csvFields(line);
  if (year !== "2025") throw new Error("Mixed BFS snapshot years");
  if (status !== "A") continue;
  const key = `${municipality}|${name}`;
  if (chSeen.has(key)) throw new Error("Duplicate BFS municipality/name");
  chSeen.add(key);
  chRows.push({ name, count: Number(value) });
}
const chSource = { id: "bfs-municipal-surnames", name: "Swiss Federal Statistical Office — surnames by commune", url: "https://opendata.swiss/de/dataset/nachnamen-der-standigen-wohnbevolkerung-nach-gemeinde3", datasets: [], licenseName: "Open use with attribution (BFS)", licenseUrl: "https://opendata.swiss/terms-of-use#terms_by", redistributionStatus: "permitted", attribution: "Source: BFS STATPOP (2025), surnames by commune. Published cells aggregated by NAMAE, suppressed commune counts excluded." };
save("CH", "surname", chRows, { source: chSource.name, sourceUrl: chSource.url, dataYear: 2025, coverageLabel: "2025年・自治体別公開人数の合算順位", notes: "自治体内8人以上の公開セルのみを合算。同数は名前順。少人数セルが省略されるため、完全な全国人口順位ではありません。" }, chSource);

const atUrl = "https://data.statistik.gv.at/data/OGDEXT_VORNAMEN_1.csv";
const atText = (await download("at-given.csv", atUrl)).toString("utf8").replace(/^\uFEFF/, "");
const lines = atText.split(/\r?\n/).filter(Boolean);
const headers = lines.shift().split(";");
console.log("Austria columns", headers);
const nameIndex = headers.findIndex((h) => /VORNAME/i.test(h));
const sexIndex = headers.indexOf("C-GESCHLECHT-0");
const yearIndex = headers.indexOf("C-JAHR-0");
const countIndex = headers.indexOf("F-ANZAHL_LGEB");
if ([nameIndex, sexIndex, yearIndex, countIndex].some((i) => i < 0)) throw new Error("Austria name schema changed");
const atRows = [];
const years = new Set();
for (const line of lines) {
  const fields = line.split(";").map((v) => v.replace(/^"|"$/g, "").replaceAll('""', '"'));
  const gender = fields[sexIndex] === "1" ? "male" : fields[sexIndex] === "2" ? "female" : undefined;
  const year = Number(fields[yearIndex].replace(/^JAHR-/, ""));
  if (!gender || !Number.isInteger(year) || year < 1984 || year > 2026) throw new Error("Unknown Austria gender/year");
  years.add(year);
  atRows.push({ name: fields[nameIndex], count: Number(fields[countIndex]), gender });
}
const atSource = { id: "statistik-austria-given", name: "Statistik Austria — first names of newborns since 1984", url: "https://data.statistik.gv.at/web/meta.jsp?dataset=OGDEXT_VORNAMEN_1", datasets: [], licenseName: "CC BY 4.0", licenseUrl: "https://data.statistik.gv.at/web/meta.jsp?dataset=OGDEXT_VORNAMEN_1", redistributionStatus: "permitted", attribution: "Source: Statistik Austria. Published newborn counts since 1984 aggregated by NAMAE." };
const first = Math.min(...years), last = Math.max(...years);
save("AT", "given_name", atRows, { source: atSource.name, sourceUrl: atSource.url, dataYear: last, coverageLabel: `${first}–${last}年・出生名の公開人数累計`, notes: "各年・各地区の出生人数を男女別に合算した独自順位。同数は名前順。1984–2009年はオーストリア国籍児のみ、2010年以降は全出生児。現在の人口順位・単年順位ではありません。" }, atSource);
write("data-sources/SOURCES.json", JSON.stringify(provenance, null, 2) + "\n");
write("reports/europe-expansion.json", JSON.stringify([...previousAudit.filter((old) => !audit.some((row) => row.country === old.country && row.type === old.type)), ...audit], null, 2) + "\n");
