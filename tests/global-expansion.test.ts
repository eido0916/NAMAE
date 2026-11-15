import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { configureEngine, clearReferenceDataset, diagnose, setDatasetUnavailable, getCohort, getNameRecord } from "../src/lib/engine";
import type { ReferenceDataset } from "../src/lib/types";

test("Japanese dictionary additions are recognized without an invented popularity rank", () => {
  const reference = JSON.parse(readFileSync("src/reference-data/jp/given_name.json", "utf8")) as ReferenceDataset;
  const entry = reference.records.find((r) => r.gender === "male" && !getNameRecord({ name: r.name, type: "given_name", gender: "male" }))!;
  assert.ok(entry);
  configureEngine({ references: [reference] });
  try {
    const result = diagnose({ name: entry.name, type: "given_name", gender: "male", destinationCountries: ["US"] });
    assert.equal(result.record, undefined);
    assert.equal(result.recognition, "dictionary");
  } finally {
    clearReferenceDataset("JP", "given_name");
  }
});

test("source-ranked names take precedence over dictionary suggestions and unavailable files stay unavailable", () => {
  const reference = JSON.parse(readFileSync("src/reference-data/bw/given_name.json", "utf8")) as ReferenceDataset;
  configureEngine({ references: [reference] });
  try {
    const result = diagnose({ name: "じゅん", type: "given_name", gender: "male", destinationCountries: ["BW"] });
    const match = result.matches[0];
    const source = result.record!;
    const cohort = getCohort(result.input, "BW");
    const distance = (rank: number, total: number) => Math.abs(rank / total - source.rank / source.totalEntries);
    const nearest = cohort.reduce((best, record) => Math.min(best, distance(record.rank, record.totalEntries)), Infinity);
    assert.equal(match.equivalentRank, source.rank);
    assert.equal(distance(match.record.rank!, match.record.totalEntries!), nearest);
    assert.ok(cohort.some(record => record.name === match.record.name && record.rank === match.record.rank));
    assert.deepEqual(diagnose(result.input), result);
    setDatasetUnavailable("BW", "given_name", "ranked file unavailable");
    assert.deepEqual(diagnose(result.input).matches, []);
  } finally {
    setDatasetUnavailable("BW", "given_name");
    clearReferenceDataset("BW", "given_name");
  }
});

test("expanded national cohorts include Italy, Korea and Chile beyond rank ten thousand", () => {
  for (const country of ["IT", "KR", "CL"]) {
    const result = diagnose({ name: "じゅん", type: "given_name", gender: "male", destinationCountries: [country] });
    assert.equal(result.matches[0].record.rank, 365);
    const path = country === "KR" ? "src/data/kr/given-name/sample.json" : `src/data/${country.toLowerCase()}/given-name/onomaverse.json`;
    const dataset = JSON.parse(readFileSync(path, "utf8"));
    for (const gender of ["male", "female"]) {
      assert.ok(dataset.records.filter((r: { gender: string }) => r.gender === gender).length >= 10000);
    }
  }
});

test("all enabled countries receive an audit and reference candidates have country provenance", () => {
  const catalog = JSON.parse(readFileSync("src/data/countries.json", "utf8"));
  const audit = JSON.parse(readFileSync("reports/global-expansion.json", "utf8"));
  assert.deepEqual(new Set(audit.audit.map((r: { country: string }) => r.country)), new Set(catalog.filter((r: { enabled: boolean }) => r.enabled).map((r: { code: string }) => r.code)));
  for (const row of audit.audit) for (const band of ["male", "female", "surname"]) {
    assert.ok(row[band].ranked >= row[band].before);
    if (row[band].referenceOnly) assert.ok(row[band].referenceSource);
    if (row[band].totalNames < 10000) assert.ok(row[band].remainingReason);
  }
});
