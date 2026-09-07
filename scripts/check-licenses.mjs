import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ledger = JSON.parse(
  readFileSync(resolve(root, "data-sources", "SOURCES.json"), "utf8"),
);
const pending = ledger.sources.filter(
  (source) => source.redistributionStatus !== "permitted",
);
if (pending.length) {
  console.error("公開前に再配布条件の確認が必要な出典:");
  for (const source of pending)
    console.error(`- ${source.name}: ${source.licenseUrl}`);
  process.exitCode = 1;
} else {
  console.log(`Verified redistribution status for ${ledger.sources.length} sources.`);
}
