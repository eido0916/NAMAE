import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";

test("historical US names retain every previously covered spelling and add grounded ranks for both genders", () => {
  const dataset = JSON.parse(readFileSync("src/data/us/given-name/sample.json", "utf8"));
  const report = JSON.parse(readFileSync("reports/us-historical-name-expansion.json", "utf8"));
  const previous = new Set();
  for (const file of readdirSync("data-sources/rankings").filter((file) => /^us-\d{4}\.txt$/.test(file))) {
    for (const line of readFileSync(`data-sources/rankings/${file}`, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      const [name, sex] = line.split(",");
      previous.add(`${sex}|${name.toLowerCase()}`);
    }
  }
  const actual = new Set(dataset.records.map((row) => `${row.gender === "male" ? "M" : "F"}|${row.name.toLowerCase()}`));
  for (const key of previous) assert.ok(actual.has(key), key);
  assert.equal(actual.size - previous.size, 22078);
  assert.equal(report.years, 141);
  assert.match(dataset.meta.coverageLabel, /1880–2020/);
  for (const band of report.bands) {
    const rows = dataset.records.filter((row) => row.gender === band.gender);
    assert.equal(rows.length, band.after);
    assert.ok(band.added > 0);
    rows.forEach((row, i) => {
      assert.equal(row.rank, i + 1);
      assert.equal(row.totalEntries, rows.length);
      assert.equal(row.isEstimated, false);
      assert.ok(Number.isSafeInteger(row.count) && row.count >= 5);
      if (i) assert.ok(rows[i - 1].count >= row.count);
    });
  }
});

test("US cumulative counts include each year once, preserving the local annual originals", () => {
  const expected = { M: 0, F: 0 };
  for (const line of gunzipSync(readFileSync("data-sources/rankings/foreign/us-ssa-all-data.txt.gz")).toString("utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [, sex, count, year] = line.split(",");
    if (Number(year) < 1989) expected[sex] += Number(count);
  }
  for (const file of readdirSync("data-sources/rankings").filter((file) => /^us-\d{4}\.txt$/.test(file))) {
    for (const line of readFileSync(`data-sources/rankings/${file}`, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      const [, sex, count] = line.split(",");
      expected[sex] += Number(count);
    }
  }
  const dataset = JSON.parse(readFileSync("src/data/us/given-name/sample.json", "utf8"));
  for (const [sex, gender] of [["M", "male"], ["F", "female"]]) assert.equal(dataset.records.filter((row) => row.gender === gender).reduce((sum, row) => sum + row.count, 0), expected[sex]);
});
