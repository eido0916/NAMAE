import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import JSZip from "jszip";

const root = resolve(import.meta.dirname, "..");
const cacheDirectory = join(root, "data-sources", "rankings", "foreign");
const archivePath = join(cacheDirectory, "us-census-surnames-2010.zip");
const url = "https://www2.census.gov/topics/genealogy/2010surnames/names.zip";
mkdirSync(cacheDirectory, { recursive: true });

if (!existsSync(archivePath)) {
  const response = await fetch(url, { headers: { "user-agent": "NAMAE data importer" } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));
}

const zip = await JSZip.loadAsync(readFileSync(archivePath));
const csvFile = Object.values(zip.files).find((file) => file.name.toLowerCase().endsWith(".csv"));
if (!csvFile) throw new Error("Census surname CSV was not found");
const text = await csvFile.async("string");
const lines = text.split(/\r?\n/).filter(Boolean);
const records = lines.slice(1).map((line, index) => {
  const [name, rank, count, proportion] = line.split(",");
  return {
    country: "US",
    type: "surname",
    name: name[0] + name.slice(1).toLocaleLowerCase("en-US"),
    rank: Number(rank) || index + 1,
    totalEntries: lines.length - 1,
    count: Number(count),
    share: Number(proportion) / 100000,
    year: 2010,
    dataYear: 2010,
  };
});

const outputDirectory = join(root, "src", "data", "us", "surname");
mkdirSync(outputDirectory, { recursive: true });
const outputPath = join(outputDirectory, "sample.json");
const temporaryPath = `${outputPath}.tmp`;
writeFileSync(
  temporaryPath,
  JSON.stringify({
    meta: {
      country: "US",
      type: "surname",
      source: "U.S. Census Bureau 2010 Census Surname Data",
      sourceUrl: "https://www.census.gov/topics/population/genealogy/data/2010_surnames.html",
      dataYear: 2010,
      isOfficial: true,
      isSample: false,
      notes: "2010年国勢調査で100回以上報告された姓を全件収録（順位付き）。",
    },
    records,
  }),
);
rmSync(outputPath, { force: true });
renameSync(temporaryPath, outputPath);
console.log(`Imported ${records.length} U.S. Census surnames.`);
