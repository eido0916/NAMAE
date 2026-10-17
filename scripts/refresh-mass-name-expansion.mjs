import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { writeDataFile } from "./write-data-file.mjs";

const countries = JSON.parse(readFileSync("src/data/countries.json", "utf8")).filter((c) => c.enabled).map((c) => c.code);
const geography = "CN,TW,JP,DE,IT,ES,PT,NL,BR,MX,IN,IR,VN,TH,RU,TR,ZA,MY,ID,PH".split(",");
function run(script, ...args) {
  const result = spawnSync(process.execPath, ["--max-old-space-size=3072", script, ...args], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${script} failed (${result.status})`);
}
const path = "reports/mass-name-expansion-before.json";
if (!existsSync(path)) {
  run("scripts/report-priority-country-expansion.mjs", "--mass-batch");
  const report = JSON.parse(readFileSync("reports/mass-name-expansion.json", "utf8"));
  writeDataFile(path, JSON.stringify({ createdAt: new Date().toISOString(), countries, before: report.audit, referenceRankCoverage: report.referenceRankCoverage }, null, 2) + "\n");
}
if (!process.argv.includes("--sources-ready")) {
  run("scripts/import-priority-wgnd2.mjs", "--all");
  run("scripts/collect-observed-name-rankings.mjs", "--direct-geography", `--countries=${geography.join(",")}`);
}
run("scripts/import-observed-name-rankings.mjs", `--countries=${geography.join(",")}`, "--require-direct-geography", "--report=reports/mass-observed-name-rankings.json");
// Bound peak memory even when one country contains millions of dictionary entries.
for (let i = 0; i < countries.length; i += 16) {
  const batch = countries.slice(i, i + 16);
  console.log(`Importing countries ${i + 1}–${i + batch.length}/${countries.length}`);
  run("scripts/import-global-reference-names.mjs", `--countries=${batch.join(",")}`);
}
run("scripts/prune-reference-initials.mjs");
run("scripts/report-priority-country-expansion.mjs", "--mass-batch");
