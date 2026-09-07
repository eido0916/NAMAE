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
test("same rank: 2009 Haruto maps to US Jacob #1", () => {
  const r = diagnose({
    name: "はると",
    type: "given_name",
    gender: "male",
    year: 2009,
  });
  assert.equal(r.record?.rank, 1);
  assert.equal(r.matches[0].record.rank, 1);
  assert.equal(r.matches[0].record.name, "Jacob");
  assert.equal(r.meta.dataYear, 2009);
  for (const m of r.matches) assert.equal(m.record.rank, 1);
});
test("normalization mode remains available", () => {
  assert.equal(calculateRankPercentile(100, 5000), 0.02);
  const source = {
    country: "JP",
    type: "given_name" as const,
    name: "test",
    gender: "male" as const,
    rank: 10,
    totalEntries: 50,
  };
  const r = findClosestEquivalentName(
    { name: "test", type: "given_name", gender: "male", year: 2009 },
    "US",
    source,
    "normalizedRank",
  );
  assert.equal(r.rank, 40);
});
test("real cohort changes with year; missing year reported honestly", () => {
  const a = getNameRecord({
    name: "ゆうき",
    type: "given_name",
    gender: "male",
    year: 2009,
  });
  assert.equal(a?.rank, 3);
  const b = diagnose({
    name: "はると",
    type: "given_name",
    gender: "male",
    year: 1990,
  });
  assert.equal(b.meta.dataYear, 2004);
  assert.equal(b.matches[0].record.year, 1990);
});
test("dictionary recognizes many spellings without inventing ranks", () => {
  assert.ok(getReadingOptions("太郎").includes("たろう"));
  assert.ok(getReadingOptions("HARUTO").includes("はると"));
  assert.ok(getReadingOptions("こうき").length);
  assert.equal(
    getNameRecord({
      name: "コウキ",
      type: "given_name",
      gender: "male",
      year: 2009,
    })?.rank,
    4,
  );
  assert.equal(getSurnameRecord("斎藤")?.name, "斎藤");
  assert.equal(getSurnameRecord("渡邊")?.name, "渡辺");
  assert.equal(getCohort({ name: "佐藤", type: "surname" }, "JP").length, 1999);
});
test("uses the exact written-name ranking for kanji input", () => {
  const result = diagnose({
    name: "悠介",
    type: "given_name",
    gender: "male",
    year: 2007,
  });
  assert.equal(result.recognition, "ranked");
  assert.equal(result.record?.rank, 83);
  assert.equal(result.record?.year, 2007);
  assert.equal(result.record?.rankingBasis, "spelling");
});
test("keeps reading and written-name rankings separate", () => {
  const written = getNameRecord({
    name: "大翔",
    reading: "はると",
    type: "given_name",
    gender: "male",
    year: 2009,
  });
  const reading = getNameRecord({
    name: "はると",
    type: "given_name",
    gender: "male",
    year: 2009,
  });
  assert.equal(written?.rankingBasis, "spelling");
  assert.equal(reading?.rankingBasis, "reading");
  assert.ok(
    getCohort(
      { name: "大翔", type: "given_name", gender: "male", year: 2009 },
      "JP",
    ).every((record) => record.rankingBasis === "spelling"),
  );
});
test("Hayashi exists as surname, not 2007 male given-name rank", () => {
  assert.equal(
    getNameRecord({ name: "はやし", type: "given_name", gender: "male", year: 2007 }),
    undefined,
  );
  const surname = getSurnameRecord("はやし");
  assert.equal(surname?.name, "林");
  assert.equal(surname?.rank, 18);
  assert.equal(getSurnameRecord("林")?.rank, 18);
});
test("uses nearest year where the given name has a published rank", () => {
  const result = diagnose({
    name: "ともや",
    type: "given_name",
    gender: "male",
    year: 2007,
  });
  assert.equal(result.recognition, "historical");
  assert.equal(result.record?.year, 2005);
  assert.equal(result.record?.rank, 42);
  assert.equal(result.meta.dataYear, 2005);
});
test("distinguishes dictionary entries from unrecognized inputs", () => {
  const known = diagnose({
    name: "たろう",
    type: "given_name",
    gender: "male",
    year: 2007,
  });
  assert.equal(known.recognition, "dictionary");
  assert.equal(known.record, undefined);
  const unknown = diagnose({
    name: "未収録名",
    type: "given_name",
    gender: "male",
    year: 2007,
  });
  assert.equal(unknown.recognition, "unrecognized");
});
test("ambiguous readings require explicit selection", () => {
  const options = getReadingOptions("大翔");
  assert.ok(options.length > 1);
  assert.match(
    validateInput({
      name: "大翔",
      type: "given_name",
      gender: "male",
      year: 2009,
    }) ?? "",
    /読み方/,
  );
  const r = diagnose({
    name: "大翔",
    reading: "はると",
    type: "given_name",
    gender: "male",
    year: 2009,
  });
  assert.equal(r.record?.rank, 1);
});
test("unknown is deterministic and surname strips birth fields", () => {
  const input = {
    name: "未収録名",
    type: "given_name" as const,
    gender: "male" as const,
    year: 2009,
  };
  assert.deepEqual(diagnose(input), diagnose(input));
  assert.equal(diagnose(input).record, undefined);
  assert.deepEqual(
    diagnose({ name: "佐藤", type: "surname", year: 2009, gender: "male" })
      .input,
    { name: "佐藤", type: "surname" },
  );
});
test("invalid inputs rejected", () => {
  assert.ok(validateInput({ name: " ", type: "surname" }));
  assert.ok(validateInput({ name: "123", type: "surname" }));
  assert.ok(validateInput({ name: "あ".repeat(31), type: "surname" }));
  assert.throws(() => calculateRankPercentile(0, 10));
});
