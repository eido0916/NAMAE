import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { configureEngine, diagnose, clearReferenceDataset } from "../src/lib/engine";
import type { ReferenceDataset } from "../src/lib/types";

test("every enabled country receives before/after counts for both genders and surnames", () => {
  const catalog = JSON.parse(readFileSync("src/data/countries.json", "utf8"));
  const report = JSON.parse(readFileSync("reports/all-country-expansion.json", "utf8"));
  assert.deepEqual(new Set(report.audit.map((r: { country: string }) => r.country)), new Set(catalog.filter((c: { enabled: boolean }) => c.enabled).map((c: { code: string }) => c.code)));
  assert.equal(report.expandedCountries, report.checkedCountries);
  assert.equal(report.allBandsExpandedCountries, report.checkedCountries);
  for (const row of report.audit) {
    for (const band of ["male", "female", "surname"]) {
      assert.ok(row[band].after > row[band].before, `${row.country}/${band}`);
    }
  }
});

test("Wikidata reference names retain explicit entity and country-relation evidence without population ranks", () => {
  const audit = JSON.parse(readFileSync("reports/wikidata-country-names.json", "utf8"));
  for (const country of audit.countries) for (const type of ["given_name", "surname"]) {
    const data = JSON.parse(gunzipSync(readFileSync(`data-sources/rankings/foreign/national-reference-supplements/wikidata-${country.country.toLowerCase()}-${type}.json.gz`)).toString("utf8"));
    assert.equal(data.country, country.country);
    for (const record of data.records) {
      assert.ok(record.entities.length && record.entities.every((id: string) => /^Q\d+$/.test(id)));
      assert.ok(record.relations.length && record.relations.every((relation: string) => ["citizenship", "birthplace-v2", "residence-v1"].includes(relation)));
      assert.equal(record.rank, undefined);
      assert.equal(record.count, undefined);
      if (type === "given_name") assert.ok(["male", "female"].includes(record.gender));
    }
  }
});

test("new country surnames fill missing ordinals and preserve valid one-character Korean surnames", () => {
  const index = JSON.parse(readFileSync("src/reference-data/index.json", "utf8"));
  for (const country of ["DE", "CA", "MV", "BD", "SR"]) {
    const file = index.files.find((f: { country: string; type: string }) => f.country === country && f.type === "surname");
    assert.ok(file, country);
    const reference = JSON.parse(readFileSync(file.path, "utf8")) as ReferenceDataset;
    configureEngine({ references: [reference] });
    try {
      const result = diagnose({ name: "林", type: "surname", destinationCountries: [country] });
      assert.equal(result.matches.length, 1);
      // A genuine same ordinal, where available, still takes precedence.
      const match = result.matches[0].record;
      if (match.rank === undefined) assert.ok(reference.records.some((r) => r.name === match.name));
      else assert.equal(match.rank, result.record?.rank);
    } finally {
      clearReferenceDataset(country, "surname");
    }
  }
  const korean = JSON.parse(readFileSync("src/reference-data/kr/surname.json", "utf8")) as ReferenceDataset;
  assert.ok(korean.records.some((r) => r.name.length === 1 && /^\p{Script=Hangul}$/u.test(r.name)));
});

test("Slovenia includes every published surname partition rather than the previous fifty-name sample", () => {
  const data = JSON.parse(readFileSync("src/data/si/surname/onomaverse.json", "utf8"));
  assert.ok(data.records.length > 30000);
  assert.ok(data.records.some((r: { name: string }) => r.name.startsWith("Ž")));
  assert.ok(data.records.some((r: { name: string }) => r.name.startsWith("A")));
  const result = diagnose({ name: "林", type: "surname", destinationCountries: ["SI"] });
  assert.equal(result.matches[0].record.rank, result.record?.rank);
});
