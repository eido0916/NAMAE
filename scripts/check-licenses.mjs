import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

const root = resolve(import.meta.dirname, "..");
const ledger = JSON.parse(
  readFileSync(resolve(root, "data-sources", "SOURCES.json"), "utf8"),
);
const releaseDirectory = process.argv[2];
if (releaseDirectory) {
  const manifest = JSON.parse(
    readFileSync(resolve(releaseDirectory, "data", "manifest.json"), "utf8"),
  );
  if (
    manifest.schemaVersion !== 4 ||
    !Array.isArray(manifest.appRankings) || !manifest.appRankings.length ||
    !Array.isArray(manifest.datasets) || manifest.datasets.length ||
    !Array.isArray(manifest.references) || manifest.references.length ||
    !Array.isArray(manifest.sources) || !manifest.sources.length
  ) {
    throw new Error("Expected a public release manifest with ranked datasets and no legacy datasets or references.");
  }
  const permitted = new Map(ledger.sources
    .filter((source) => source.redistributionStatus === "permitted")
    .map((source) => [source.id, source]));
  const seen = new Set();
  for (const source of manifest.sources) {
    if (!source?.id || seen.has(source.id) || !isDeepStrictEqual(source, permitted.get(source.id))) {
      throw new Error(`Invalid or unapproved public release source: ${source?.id ?? "(missing ID)"}`);
    }
    seen.add(source.id);
  }
  console.log(`Verified ${seen.size} public release source entries against the source ledger.`);
} else {
  const pending = ledger.sources.filter((source) => source.redistributionStatus !== "permitted");
  if (pending.length) {
    console.error("公開前に再配布条件の確認が必要な出典:");
    for (const source of pending)
      console.error(`- ${source.name}: ${source.licenseUrl}`);
    process.exitCode = 1;
  } else {
    console.log(`Verified redistribution status for ${ledger.sources.length} sources.`);
  }
}
