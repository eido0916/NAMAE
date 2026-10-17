import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { buildObservedRanks } from "../scripts/observed-rank-utils.mjs";
import { configureEngine, diagnose, clearReferenceDataset } from "../src/lib/engine";
import type { ReferenceDataset } from "../src/lib/types";

const row = (person: number, name: number, sex = "Q6581097") => ({ person: { value: `http://www.wikidata.org/entity/Q${person}` }, name: { value: `http://www.wikidata.org/entity/Q${name}` }, sex: { value: `http://www.wikidata.org/entity/${sex}` } });

test("observed ranks deduplicate people across country relations and name aliases, preserve ties and gender", () => {
  const result = buildObservedRanks([row(1, 10), row(1, 10), row(1, 11), row(2, 10), row(3, 12), row(4, 12), row(5, 13), row(6, 10, "Q6581072"), row(7, 14, "Qunknown")], { Q10: { en: "Ali" }, Q11: { en: "ALI" }, Q12: { en: "Bora" }, Q13: { en: "Cem" }, Q14: { en: "Unknown" } }, "MV", "given_name");
  const males = result.filter((r) => r.gender === "male");
  assert.deepEqual(males.map((r) => r.evidenceRank.rank), [1, 1, 3]);
  assert.deepEqual(males.map((r) => r.evidenceRank.observedPeople), [2, 2, 1]);
  assert.equal(males[0].evidenceRank.totalPeople, 5);
  assert.equal(males[0].evidenceRank.tiedNames, 2);
  const female = result.find((r) => r.gender === "female");
  assert.ok(female);
  assert.equal(female.evidenceRank.observedPeople, 1);
  assert.ok(result.every((r) => !Object.hasOwn(r, "rank")));
});

test("observed surname ranks accept real one-character Hangul and do not import a foreign script into France", () => {
  const input = [row(1, 10)];
  const labels = { Q10: { en: "Kim", ko: "김" } };
  assert.equal(buildObservedRanks(input, labels, "KR", "surname")[0].name, "김");
  assert.equal(buildObservedRanks(input, { Q10: { en: "علي" } }, "FR", "surname").length, 0);
});

test("counted references take priority over rank-free references while a genuine same ordinal wins", () => {
  const ref = { meta: { country: "MV", type: "surname", source: "Observed test", sourceUrl: "https://www.wikidata.org", dataYear: 2026, isOfficial: false, isSample: false }, records: [{ country: "MV", type: "surname", name: "Counted", sourceIds: ["wikidata-observed-name-counts"], evidenceRank: { rank: 1, totalNames: 1, observedPeople: 2, totalPeople: 2, tiedNames: 1, method: "competition", scope: "public_people", sourceId: "wikidata-observed-name-counts", asOf: "2026-10-16" } }, { country: "MV", type: "surname", name: "NoCounts", sourceIds: ["test"] }] } as ReferenceDataset;
  const japan = JSON.parse(readFileSync("src/data/jp/surname/sample.json", "utf8"));
  configureEngine({ references: [ref] });
  try {
    const deep = diagnose({ name: japan.records.find((r: { rank: number }) => r.rank === 10000).name, type: "surname", destinationCountries: ["MV"] });
    assert.equal(deep.matches[0].record.name, "Counted");
    assert.equal(deep.matches[0].record.rank, undefined);
    const exact = diagnose({ name: "佐藤", type: "surname", destinationCountries: ["MV"] });
    assert.equal(exact.matches[0].record.rank, 1);
    assert.notEqual(exact.matches[0].record.name, "Counted");
  } finally { clearReferenceDataset("MV", "surname"); }
});

test("Chinese reference ranks retain single-character family names and distinguish Han spellings", () => {
  const result = buildObservedRanks([row(1, 10), row(2, 10), row(3, 11)], { Q10: { zh: "李", en: "Li" }, Q11: { zh: "黎", en: "Li" } }, "CN", "surname");
  assert.deepEqual(result.map((r) => [r.name, r.evidenceRank.rank, r.evidenceRank.observedPeople]), [["李", 1, 2], ["黎", 2, 1]]);
  assert.equal(result[0].evidenceRank.totalPeople, 3);
  assert.equal(buildObservedRanks([row(1, 10)], { Q10: { zh: "·", en: "Li" } }, "CN", "surname").length, 0);
  assert.equal(buildObservedRanks([row(1, 10)], { Q10: { zh: "李", en: "Li" } }, "FR", "surname")[0].name, "Li");
  assert.equal(buildObservedRanks([row(1, 10)], { Q10: { ja: "純", en: "Jun" } }, "JP", "given_name")[0].name, "純");
  const surnameLabels = buildObservedRanks([row(1, 10), row(2, 11)], { Q10: { zh: "芦姓" }, Q11: { zh: "芦" } }, "CN", "surname");
  assert.equal(surnameLabels[0].name, "芦");
  assert.equal(surnameLabels[0].evidenceRank.observedPeople, 2);
  assert.equal(buildObservedRanks([row(1, 10)], { Q10: { zh: "氏" } }, "CN", "surname")[0].name, "氏");
});

test("published reference counts can be reproduced from the retained person/name observations", () => {
  for (const country of ["MV", "KH", "CN", "DE"]) for (const type of ["given_name", "surname"]) {
    const data = JSON.parse(gunzipSync(readFileSync(`data-sources/rankings/foreign/observed-name-rankings/${country}-${type}.json.gz`)).toString("utf8"));
    const supplement = JSON.parse(gunzipSync(readFileSync(`data-sources/rankings/foreign/national-reference-supplements/observed-${country.toLowerCase()}-${type}.json.gz`)).toString("utf8"));
    const labels: Record<string, { en: string }> = {};
    for (const record of supplement.records) for (const entity of record.entities) labels[entity] = { en: record.name };
    const reproduced = buildObservedRanks(data.bindings, labels, country, type);
    const byName = new Map(reproduced.map((r) => [`${r.gender ?? ""}|${r.name}`, r]));
    for (const record of supplement.records) {
      const actual = byName.get(`${record.gender ?? ""}|${record.name}`);
      assert.ok(actual);
      for (const field of ["rank", "observedPeople", "totalPeople", "totalNames", "tiedNames"] as const) assert.equal(actual.evidenceRank[field], record.evidenceRank[field]);
      assert.equal(record.rank, undefined);
    }
  }
});

test("Danish observations include citizenship of the sovereign kingdom", () => {
  for (const type of ["given_name", "surname"]) {
    const data = JSON.parse(gunzipSync(readFileSync(`data-sources/rankings/foreign/observed-name-rankings/DK-${type}.json.gz`)).toString("utf8"));
    assert.ok(data.query.includes("wd:Q35") && data.query.includes("wd:Q756617"));
    assert.ok(data.bindings.length > 1000, "constituent-country-only observations miss most Danish people");
  }
});

test("world ranking expansion retains source provenance for the previous country batch", () => {
  const sources = JSON.parse(readFileSync("data-sources/SOURCES.json", "utf8"));
  const source = sources.sources.find((s: { id: string }) => s.id === "wikidata-observed-name-counts");
  const prior = JSON.parse(readFileSync("reports/observed-ranking-expansion-before.json", "utf8"));
  for (const country of [...prior.countries, "CN", "DE", "DK", "PR", "FO"]) {
    for (const type of ["given_name", "surname"]) assert.ok(source.datasets.includes(`${country}/${type}`), `${country}/${type} source provenance was lost`);
  }
});
