import test from "node:test";
import assert from "node:assert/strict";
import {
  diagnose,
  calculateRankPercentile,
  findClosestEquivalentName,
  getNameRecord,
  getSurnameRecord,
  getReadingOptions,
  validateInput,
  getCohort,
} from "../src/lib/engine";

test("deep Japanese rankings cover the reported ordinary names", () => {
  const cases = [
    ["じゅん", 365],
    ["れん", 31],
    ["じゅんや", 638],
    ["れんや", 259],
  ] as const;
  for (const [name, rank] of cases) {
    const result = diagnose({ name, type: "given_name", gender: "male" });
    assert.equal(result.record?.rank, rank);
    assert.equal(result.record?.totalEntries, 1981);
    assert.equal(result.record?.year, 2025);
    assert.equal(result.record?.rankingBasis, "overall");
    assert.equal(result.record?.isEstimated, false);
    assert.equal(result.recognition, "ranked");
  }
});

test("given-name diagnosis no longer requires a birth year", () => {
  assert.equal(
    validateInput({ name: "じゅん", type: "given_name", gender: "male" }),
    undefined,
  );
  assert.equal(
    getCohort(
      { name: "じゅん", type: "given_name", gender: "male" },
      "JP",
    ).length,
    5578,
  );
});

test("foreign names use the same published rank number", () => {
  const result = diagnose({
    name: "じゅん",
    type: "given_name",
    gender: "male",
  });
  assert.equal(result.record?.rank, 365);
  for (const match of result.matches) assert.equal(match.record.rank, 365);
});

test("foreign rankings remain available beyond the former 500-name cutoff", () => {
  const result = diagnose({ name: "じゅんや", type: "given_name", gender: "male" });
  assert.equal(result.record?.rank, 638);
  for (const match of result.matches) assert.equal(match.record.rank, 638);
});

test("normalization mode remains available explicitly", () => {
  assert.equal(calculateRankPercentile(100, 5000), 0.02);
  const source = {
    country: "JP",
    type: "given_name" as const,
    name: "test",
    gender: "male" as const,
    rank: 10,
    totalEntries: 50,
  };
  const result = findClosestEquivalentName(
    { name: "test", type: "given_name", gender: "male" },
    "US",
    source,
    "normalizedRank",
  );
  assert.equal(result.rank, 1000);
});

test("dictionary-only names receive a clearly marked estimated rank", () => {
  const result = diagnose({
    name: "ああす",
    type: "given_name",
    gender: "male",
  });
  assert.ok(result.record);
  assert.equal(result.record?.rankingBasis, "overall");
  assert.equal(result.record?.isEstimated, true);
  assert.equal(result.recognition, "ranked");
});

test("kanji and romanized input resolve through the reading dictionary", () => {
  assert.ok(getReadingOptions("純也").includes("じゅんや"));
  assert.ok(getReadingOptions("JUN").includes("じゅん"));
  assert.equal(
    getNameRecord({
      name: "純也",
      reading: "じゅんや",
      type: "given_name",
      gender: "male",
    })?.rank,
    638,
  );
  assert.equal(
    getNameRecord({ name: "JUN", type: "given_name", gender: "male" })?.rank,
    365,
  );
});

test("Hayashi is recognized as a surname", () => {
  const surname = getSurnameRecord("はやし");
  assert.equal(surname?.name, "林");
  assert.equal(surname?.rank, 18);
  assert.equal(getSurnameRecord("林")?.rank, 18);
  assert.equal(getCohort({ name: "佐藤", type: "surname" }, "JP").length, 1999);
});

test("foreign surnames use the same rank number", () => {
  const result = diagnose({ name: "はやし", type: "surname" });
  assert.equal(result.record?.rank, 18);
  for (const match of result.matches) assert.equal(match.record.rank, 18);
});

test("ambiguous kanji readings require explicit selection", () => {
  const options = getReadingOptions("大翔");
  assert.ok(options.length > 1);
  assert.match(
    validateInput({ name: "大翔", type: "given_name", gender: "male" }) ?? "",
    /読み方/,
  );
  const result = diagnose({
    name: "大翔",
    reading: "はると",
    type: "given_name",
    gender: "male",
  });
  assert.equal(result.record?.rankingBasis, "overall");
});

test("unknown input is deterministic and surname strips extra fields", () => {
  const input = {
    name: "未収録名",
    type: "given_name" as const,
    gender: "male" as const,
  };
  assert.deepEqual(diagnose(input), diagnose(input));
  assert.equal(diagnose(input).record, undefined);
  assert.deepEqual(
    diagnose({ name: "佐藤", type: "surname", year: 2009, gender: "male" })
      .input,
    { name: "佐藤", type: "surname" },
  );
});

test("invalid inputs are rejected", () => {
  assert.ok(validateInput({ name: " ", type: "surname" }));
  assert.ok(validateInput({ name: "123", type: "surname" }));
  assert.ok(validateInput({ name: "あ".repeat(31), type: "surname" }));
  assert.ok(validateInput({ name: "じゅん", type: "given_name" }));
  assert.throws(() => calculateRankPercentile(0, 10));
});
