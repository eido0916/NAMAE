import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { diagnose } from "../src/lib/engine";
import type { Dataset, ReferenceDataset } from "../src/lib/types";

test("European surname imports match the Japanese ordinal and exclude confidential counts from ranking", () => {
  const japan = JSON.parse(readFileSync("src/data/jp/surname/sample.json", "utf8")) as Dataset;
  const deepName = japan.records.find((r) => r.rank === 10000);
  assert.ok(deepName);
  for (const country of ["BE", "NO", "CH", "GB"]) {
    const result = diagnose({ name: "林", type: "surname", destinationCountries: [country] });
    assert.ok(result.record);
    assert.equal(result.matches[0].record.rank, result.record.rank, country);
    const dataset = JSON.parse(readFileSync(`src/data/${country.toLowerCase()}/surname/${country === "GB" ? "sample" : "onomaverse"}.json`, "utf8")) as Dataset;
    assert.ok(dataset.records.length > 20000, country);
    const deepResult = diagnose({ name: deepName.name, type: "surname", destinationCountries: [country] });
    assert.equal(deepResult.matches[0].record.rank, 10000, country);
  }
  const reference = JSON.parse(readFileSync("src/reference-data/no/surname.json", "utf8")) as ReferenceDataset;
  assert.ok(reference.records.length > 100000);
  assert.ok(reference.records.every((r) => r.rank === undefined && r.totalEntries === undefined));
  assert.ok(reference.records.some((r) => r.sourceIds?.includes("ssb-national-names")));
});

test("European cohorts use count-sorted ordinals and preserve accented names", () => {
  const audit = JSON.parse(readFileSync("reports/europe-expansion.json", "utf8")) as { country: string; type: string }[];
  for (const row of audit) {
    const directory = row.type === "surname" ? "surname" : "given-name";
    const dataset = JSON.parse(readFileSync(`src/data/${row.country.toLowerCase()}/${directory}/${row.country === "GB" ? "sample" : "onomaverse"}.json`, "utf8")) as Dataset;
    for (const gender of row.type === "surname" ? [undefined] : ["male", "female"]) {
      const records = dataset.records.filter((r) => r.gender === gender);
      assert.ok(records.length > 800);
      records.forEach((r, index) => {
        assert.equal(r.rank, index + 1);
        assert.equal(r.totalEntries, records.length);
        assert.ok(Number.isSafeInteger(r.count) && r.count! > 0);
        if (index) assert.ok(records[index - 1].count! >= r.count!);
      });
    }
    if (row.country === "BE" && row.type === "given_name") {
      assert.ok(dataset.records.some((r) => r.name === "François"));
      assert.ok(dataset.records.every((r) => !r.name.includes("�")));
    }
    if (["BE", "CH"].includes(row.country)) assert.match(dataset.meta.notes ?? "", /完全な全国人口順位ではありません/);
  }
});
