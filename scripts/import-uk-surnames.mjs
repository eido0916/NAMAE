import { existsSync, readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { hasExpectedScript, readDatasets } from "./data-utils.mjs";
import { writeDataFile } from "./write-data-file.mjs";

const sourceUrl = "https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/adhocs/3674babysurnamesbirthsregisteredineachyearenglandandwales1996to2025";
const raw = "data-sources/rankings/foreign/gb-surnames-1996-2025.xlsx";
if (!existsSync(raw)) {
  const response = await fetch("https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/adhocs/3674babysurnamesbirthsregisteredineachyearenglandandwales1996to2025/surnames1996to2025.xlsx", { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`ONS download: ${response.status}`);
  writeDataFile(raw, Buffer.from(await response.arrayBuffer()));
}
const names = new Map();
const years = [];
const seen = new Set();
const reader = new ExcelJS.stream.xlsx.WorkbookReader(raw, { worksheets: "emit", sharedStrings: "cache", styles: "ignore", hyperlinks: "ignore" });
let dataRows = 0;
for await (const sheet of reader) {
  if (sheet.name !== "Table 1") continue;
  for await (const row of sheet) {
    if (row.number === 6) {
      for (let column = 1; column <= row.cellCount; column += 4) {
        if (row.getCell(column).value !== "Rank" || row.getCell(column + 1).value !== "Surname") throw new Error("ONS headers changed");
        const year = Number(row.getCell(column + 2).value);
        if (!Number.isInteger(year) || year < 1996 || year > 2025) throw new Error("Unknown ONS year");
        years.push({ column, year });
      }
      if (years.length !== 30) throw new Error("Incomplete ONS years");
    } else if (row.number > 6) for (const { column, year } of years) {
      const rank = row.getCell(column).value;
      const value = row.getCell(column + 1).value;
      const count = row.getCell(column + 2).value;
      if (value === null && count === null) continue;
      if (typeof value !== "string" || !Number.isSafeInteger(rank) || !Number.isSafeInteger(count) || count < 3) throw new Error("Unknown/suppressed ONS surname cell");
      const name = value.normalize("NFKC").trim().replace(/[’‘]/g, "'");
      if (!hasExpectedScript("GB", name)) continue;
      const key = name.toLowerCase();
      const yearKey = `${year}|${key}`;
      if (seen.has(yearKey)) throw new Error("Duplicate ONS surname/year");
      seen.add(yearKey);
      const previous = names.get(key);
      if (previous) previous.count += count;
      else names.set(key, { name, count });
      dataRows++;
    }
  }
}
if (!dataRows || years.length !== 30) throw new Error("ONS table missing");
const target = readDatasets("src/data").find(({ dataset }) => dataset.meta.country === "GB" && dataset.meta.type === "surname");
const cohort = [...names.values()].sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
if (cohort.length < 10000 || cohort.length < target.dataset.records.length) throw new Error("Incomplete ONS surname coverage");
const records = cohort.map((r, index) => ({ country: "GB", type: "surname", ...r, rank: index + 1, totalEntries: cohort.length, year: 2025, dataYear: 2025, isEstimated: false }));
writeDataFile(target.path, JSON.stringify({ meta: { country: "GB", type: "surname", source: "Office for National Statistics — baby surnames 1996–2025", sourceUrl, dataYear: 2025, isOfficial: true, isSample: false, coverageLabel: "1996–2025年・イングランド／ウェールズ出生姓の公開人数累計", notes: "出生登録の名字を30年分合算した独自順位。同数は名前順。各年2件以下は非公開のため加算しません。現在の英国全域の人口順位ではありません。" }, records }));
const referencePath = "src/reference-data/gb/surname.json";
if (existsSync(referencePath)) {
  const reference = JSON.parse(readFileSync(referencePath, "utf8"));
  reference.records = reference.records.filter((r) => !names.has(r.name.normalize("NFKC").toLowerCase()));
  writeDataFile(referencePath, JSON.stringify(reference));
  const indexPath = "src/reference-data/index.json";
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  const file = index.files.find((f) => f.country === "GB" && f.type === "surname");
  if (file) file.records = reference.records.length;
  if (!reference.records.length) index.files = index.files.filter((f) => f !== file);
  writeDataFile(indexPath, JSON.stringify(index, null, 2) + "\n");
}
const provenance = JSON.parse(readFileSync("data-sources/SOURCES.json", "utf8"));
const id = "ons-birth-surnames";
provenance.sources = provenance.sources.filter((s) => s.id !== id);
provenance.sources.push({ id, name: "ONS — baby surnames in England and Wales 1996–2025", url: sourceUrl, datasets: ["GB/surname"], licenseName: "Open Government Licence v3.0", licenseUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/", redistributionStatus: "permitted", attribution: "Source: Office for National Statistics, published 13 October 2026. Contains public sector information licensed under the Open Government Licence v3.0. Published annual birth counts aggregated by NAMAE." });
writeDataFile("data-sources/SOURCES.json", JSON.stringify(provenance, null, 2) + "\n");
const reportPath = "reports/europe-expansion.json";
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : [];
const prior = report.find((r) => r.country === "GB" && r.type === "surname");
const result = { country: "GB", type: "surname", before: Math.min(prior?.before ?? Infinity, target.dataset.records.length), after: records.length, sourceUrl, publishedAnnualCells: dataRows };
writeDataFile(reportPath, JSON.stringify([...report.filter((r) => r.country !== "GB" || r.type !== "surname"), result], null, 2) + "\n");
console.log(JSON.stringify(result));
