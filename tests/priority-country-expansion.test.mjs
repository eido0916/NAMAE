import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const report = JSON.parse(readFileSync("reports/priority-country-expansion.json", "utf8"));
const baseline = JSON.parse(readFileSync("reports/priority-country-expansion-before.json", "utf8"));

test("shortage priorities cover both names and surnames and the full catalog stays sorted", () => {
  const lowest = (band) => [...baseline.counts].sort((a, b) => a[band] - b[band] || a.country.localeCompare(b.country)).slice(0, 30);
  assert.deepEqual(new Set(report.priorities), new Set([...lowest("givenName"), ...lowest("surname")].map((r) => r.country)));
  const enabled = JSON.parse(readFileSync("src/data/countries.json", "utf8")).filter((c) => c.enabled);
  for (const [rows, band] of [[report.byGivenName, "givenName"], [report.bySurname, "surname"]]) {
    assert.deepEqual(new Set(rows.map((r) => r.country)), new Set(enabled.map((c) => c.code)));
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i][band] >= rows[i - 1][band], `${band} sorting`);
  }
});

test("underrepresented collections grow without losing existing countries or mixing gender bands", () => {
  const selected = new Set(report.priorities);
  for (const row of report.audit) {
    for (const band of ["male", "female", "surname"]) assert.ok(row.added[band] >= 0, `${row.country}/${band} lost entries`);
    if (!selected.has(row.country)) assert.equal(row.added.total, 0, `${row.country} changed outside the selected collection`);
    assert.equal(row.givenName, row.male + row.female);
    assert.equal(row.total, row.givenName + row.surname);
  }
  const djibouti = report.audit.find((r) => r.country === "DJ");
  assert.ok(djibouti.added.male > 0 && djibouti.added.female > 0);
  assert.ok(report.audit.find((r) => r.country === "GI").added.surname > 0);
});

test("WGND2 country-specific originals never turn source weights into population ranks", () => {
  const metadata = JSON.parse(readFileSync("data-sources/rankings/foreign/wgnd2-country-metadata.json", "utf8"));
  assert.equal(metadata.file.id, 4750348);
  assert.equal(metadata.file.filename, "wgnd_2_0_name-gender-code.tab");
  assert.equal(metadata.license.rightsIdentifier, "CC0-1.0");
  for (const country of report.priorities) {
    const data = JSON.parse(gunzipSync(readFileSync(`data-sources/rankings/foreign/national-reference-supplements/wgnd2-${country.toLowerCase()}-given_name.json.gz`)).toString("utf8"));
    assert.equal(data.country, country);
    for (const record of data.records) {
      assert.ok(["male", "female"].includes(record.gender));
      for (const field of ["rank", "count", "share", "wgt"]) assert.equal(record[field], undefined);
    }
  }
});
