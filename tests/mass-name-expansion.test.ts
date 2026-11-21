import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clearReferenceDataset, configureEngine, diagnose, getNameRecord, hasReferenceName } from "../src/lib/engine";
import { loadInputData, loadInputReferenceName } from "../src/lib/data-loader";
import type { ReferenceDataset, ReferenceNameRecord } from "../src/lib/types";

test("the new collection adds both male and female names and surnames relative to its own baseline", () => {
  const report = JSON.parse(readFileSync("reports/mass-name-expansion.json", "utf8"));
  const catalog = JSON.parse(readFileSync("src/data/countries.json", "utf8"));
  assert.equal(report.countries, catalog.filter((c: { enabled: boolean }) => c.enabled).length);
  for (const band of ["male", "female", "surname"]) assert.ok(report.added[band] > 0, `${band} did not grow`);
  assert.ok(report.addedReferenceRanks.total > 0);
  const before = JSON.parse(readFileSync("reports/mass-name-expansion-before.json", "utf8"));
  assert.equal(before.before.length, report.audit.length);
});

test("new country dictionary entries never acquire a rank or bearer count from WIPO source weights", () => {
  const data = JSON.parse(readFileSync("src/reference-data/cn/given_name.json", "utf8"));
  const additions = data.records.filter((r: { sourceIds: string[]; evidenceRank?: unknown }) => r.sourceIds.includes("wgnd2-country-original") && !r.evidenceRank);
  assert.ok(additions.length > 0);
  for (const entry of additions) {
    assert.equal(entry.rank, undefined);
    assert.equal(entry.totalEntries, undefined);
    assert.equal(entry.count, undefined);
    assert.ok(["male", "female"].includes(entry.gender));
    assert.ok(!/^(\p{Script=Latin})\1{2,}$/iu.test(entry.name));
  }
});

test("every expanded reference collection is fully represented in the delivered chunk manifest", () => {
  const index = JSON.parse(readFileSync("src/reference-data/index.json", "utf8"));
  const manifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8"));
  const published = new Map(manifest.references.map((r: { country: string; type: string }) => [`${r.country}/${r.type}`, r]));
  for (const file of index.files) {
    const entry = published.get(`${file.country}/${file.type}`) as { records: number; chunks: { records: number }[]; lookup?: Record<string, { records: number }> };
    assert.ok(entry, `${file.country}/${file.type} was lost in export`);
    assert.equal(entry.records, file.records);
    assert.equal(entry.chunks.reduce((sum, c) => sum + c.records, 0), file.records);
    if (entry.lookup) assert.equal(Object.values(entry.lookup).reduce((sum, shard) => sum + shard.records, 0), file.records, `${file.country}/${file.type} search index is incomplete`);
  }
});

test("new dictionary inputs are recognized through a lookup shard without downloading the entire country dictionary", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const path = String(input);
    requests.push(path);
    return new Response(readFileSync(new URL(`../public${path}`, import.meta.url), "utf8"), { status: 200 });
  };
  clearReferenceDataset("CN", "given_name");
  try {
    await loadInputData("given_name", "CN");
    const data = JSON.parse(readFileSync("src/reference-data/cn/given_name.json", "utf8"));
    const candidate = data.records.find((r: ReferenceNameRecord) => r.gender === "male" && r.sourceIds?.includes("wgnd2-country-original") && !r.evidenceRank && !getNameRecord({ name: r.name, type: "given_name", gender: "male", sourceCountry: "CN" }));
    assert.ok(candidate);
    const name = candidate.name.toUpperCase().replace(/\s+/g, "  ");
    const input = { name, type: "given_name" as const, gender: "male" as const, sourceCountry: "CN", destinationCountries: ["US"] };
    assert.equal(hasReferenceName(input), false);
    const start = requests.length;
    await loadInputReferenceName("given_name", name, "male", "CN");
    assert.equal(hasReferenceName(input), true);
    assert.equal(diagnose(input).recognition, "dictionary");
    assert.equal(diagnose(input).record, undefined);
    const loaded = requests.slice(start);
    assert.equal(loaded.filter((path) => path.startsWith("/data/lookup/cn/")).length, 1);
    assert.ok(loaded.filter((path) => path.startsWith("/data/references/cn/")).length <= 2);
    const missing = { ...input, name: "Xqznotacollectedname" };
    await loadInputReferenceName("given_name", missing.name, "male", "CN");
    assert.equal(hasReferenceName(missing), false);
  } finally {
    clearReferenceDataset("CN", "given_name");
    globalThis.fetch = originalFetch;
  }
});

test("a Japanese written name remains recognized when its reading is supplied separately", () => {
  const fixture: ReferenceDataset = { meta: { country: "JP", type: "given_name", source: "test", sourceUrl: "https://example.com", dataYear: 2026, isOfficial: false, isSample: false }, records: [{ country: "JP", type: "given_name", name: "澪那", gender: "female", sourceIds: ["test"] }] };
  configureEngine({ references: [fixture] });
  try {
    assert.equal(hasReferenceName({ name: "澪那", reading: "みおな", type: "given_name", gender: "female" }), true);
    assert.equal(hasReferenceName({ name: "未収録名", reading: "みおな", type: "given_name", gender: "female" }), false);
  } finally { clearReferenceDataset("JP", "given_name"); }
});
