import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { worldRankingCountries } from "./world-ranking-countries.mjs";
import { writeDataFile } from "./write-data-file.mjs";

const baseline = "reports/world-ranking-expansion-before.json";
function run(script, ...args) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Failed: ${script} (${result.status})`);
}
if (!existsSync(baseline)) {
  run("scripts/report-priority-country-expansion.mjs", "--world-batch");
  const report = JSON.parse(readFileSync("reports/world-ranking-expansion.json", "utf8"));
  writeDataFile(baseline, JSON.stringify({ createdAt: new Date().toISOString(), countries: worldRankingCountries, before: report.audit, referenceRankCoverage: report.referenceRankCoverage }, null, 2) + "\n");
}
const selection = `--countries=${worldRankingCountries.join(",")}`;
const saved = JSON.parse(readFileSync(baseline, "utf8"));
if (worldRankingCountries.some((code) => !saved.countries?.includes(code))) {
  // The baseline contains all enabled countries, including later batch additions.
  if (worldRankingCountries.some((code) => !saved.before.some((r) => r.country === code))) throw new Error("New countries require a fresh baseline");
  writeDataFile(baseline, JSON.stringify({ ...saved, countries: [...new Set([...saved.countries, ...worldRankingCountries])] }, null, 2) + "\n");
}
run("scripts/collect-observed-name-rankings.mjs", "--citizenship-only", selection);
run("scripts/import-observed-name-rankings.mjs", selection);
run("scripts/import-global-reference-names.mjs", selection);
run("scripts/prune-reference-initials.mjs");
run("scripts/report-priority-country-expansion.mjs", "--world-batch");
