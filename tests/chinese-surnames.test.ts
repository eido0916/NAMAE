import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { configureEngine, diagnose, getNameRecord, getChineseSurnameCandidates } from "../src/lib/engine";
import { formatName } from "../src/lib/chinese-surnames.mjs";
import type { Dataset } from "../src/lib/types";

const chinese = JSON.parse(readFileSync("src/data/cn/surname/onomaverse.json", "utf8")) as Dataset;
const us = JSON.parse(readFileSync("src/data/us/surname/sample.json", "utf8")) as Dataset;

test("Chinese source ranks use the 2020 national Han table, without supplemental ordinals", () => {
  configureEngine({ datasets: [chinese, us] });
  assert.equal(chinese.meta.dataYear, 2020);
  assert.equal(chinese.meta.isOfficial, true);
  assert.equal(chinese.records.length, 100);
  assert.deepEqual(chinese.records.slice(0, 5).map((record) => record.name), ["王", "李", "张", "刘", "陈"]);
  assert.deepEqual(chinese.records.map((record) => record.rank), Array.from({ length: 100 }, (_, index) => index + 1));
  assert.ok(chinese.records.every((record) => /^\p{Script=Han}+$/u.test(record.name) && record.year === 2020 && record.totalEntries === 100 && record.count === undefined));
  const result = diagnose({ sourceCountry: "CN", type: "surname", name: "李", destinationCountries: ["US"] });
  assert.equal(result.record?.rank, 2);
  assert.equal(result.score, 2);
  assert.equal(result.matches[0].record.rank, 2);
  assert.equal(formatName(result.record!), "李（Lǐ）");
  assert.equal(getNameRecord({ sourceCountry: "CN", type: "surname", name: "Bruce" }), undefined);
});

test("Han, traditional Han and tone-marked aliases resolve to one canonical surname", () => {
  configureEngine({ datasets: [chinese, us] });
  for (const [input, name, rank] of [["Lǐ", "李", 2], ["lí", "黎", 82], ["張", "张", 3], ["ZHĀNG", "张", 3], ["Lü", "吕", 47], ["Lv", "吕", 47], ["Lyu", "吕", 47]] as const) {
    const result = diagnose({ sourceCountry: "CN", type: "surname", name: input, destinationCountries: ["US"] });
    assert.equal(result.input.name, name);
    assert.equal(result.record?.rank, rank);
  }
  assert.equal(getNameRecord({ sourceCountry: "CN", type: "surname", name: "Lǔ" }), undefined, "different tones and ü must not be guessed");
});

test("ambiguous romanizations retain different Han surnames instead of choosing the first", () => {
  configureEngine({ datasets: [chinese, us] });
  for (const [input, names] of [["Li", ["李", "黎"]], ["Wang", ["王", "汪"]], ["Yu", ["余", "于"]], ["Lu", ["卢", "陆"]]] as const) {
    assert.deepEqual(getChineseSurnameCandidates(input).map((record) => record.name), names);
    assert.equal(getNameRecord({ sourceCountry: "CN", type: "surname", name: input }), undefined);
    assert.throws(() => diagnose({ sourceCountry: "CN", type: "surname", name: input, destinationCountries: ["US"] }), /漢字表記/);
  }
});
