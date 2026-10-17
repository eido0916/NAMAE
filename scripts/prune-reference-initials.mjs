import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { writeDataFile } from "./write-data-file.mjs";

// Preserve the original observed corpus ranks, as for records excluded because
// a primary dataset already contains them. Initials are not diagnosis candidates.
const path = "src/reference-data/index.json";
const index = JSON.parse(readFileSync(path, "utf8"));
let removed = 0;
for (const file of index.files) {
  const data = JSON.parse(readFileSync(file.path, "utf8"));
  const records = data.records.filter((r) => !/^[\p{Script=Latin}\p{M} .'-]+$/u.test(r.name) || (r.name.match(/\p{Script=Latin}/gu)?.length ?? 0) >= 2);
  if (records.length === data.records.length) continue;
  removed += data.records.length - records.length;
  writeDataFile(file.path, JSON.stringify({ ...data, records }));
  file.records = records.length;
  file.male = records.filter((r) => r.gender === "male").length;
  file.female = records.filter((r) => r.gender === "female").length;
}
writeDataFile(path, JSON.stringify(index, null, 2) + "\n");
writeDataFile("data-sources/rankings/foreign/global-reference-index.json.gz", gzipSync(JSON.stringify(index)));
console.log(JSON.stringify({ removedInitials: removed }));
