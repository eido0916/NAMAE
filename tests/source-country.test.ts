import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { configureEngine, diagnose, getNameRecord, getDefaultDestinations, validateInput, clearReferenceDataset, hasJapaneseReferenceName, getInputExamples, getCountryConfig, sourceCountryCodes } from "../src/lib/engine";
import { loadInputData, loadDiagnosisData } from "../src/lib/data-loader";
import type { Dataset } from "../src/lib/types";

test("source country controls lookup, destinations and surname metadata", async () => {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    const path = String(input);
    requested.push(path);
    const body = await readFile(new URL(`../public${path}`, import.meta.url), "utf8");
    return new Response(body, { status: 200 });
  };
  try {
    for (const [country, name] of [["US", "Liam"], ["GB", "Oliver"], ["FR", "Gabriel"], ["KR", "서준"], ["DE", "Noah"]]) {
      await loadInputData("given_name", country);
      const input = { sourceCountry: country, name, type: "given_name" as const, gender: "male" as const, destinationCountries: ["JP"] };
      const record = getNameRecord(input);
      assert.ok(record, `${country}: ${name} must be recognized`);
      await loadDiagnosisData(input.type, ["JP"], record.rank, input.gender, name, country);
      const result = diagnose(input);
      assert.equal(result.meta.country, country);
      assert.equal(result.record?.country, country);
      assert.equal(result.recognition, "ranked");
      assert.equal(result.matches[0].country.code, "JP");
      assert.ok(!getDefaultDestinations(country).includes(country));
      assert.ok(getDefaultDestinations(country).includes("JP"));
    }
    await loadInputData("surname", "US");
    await loadDiagnosisData("surname", ["JP"], 1, undefined, "Smith", "US");
    const surname = diagnose({ name: "Smith", type: "surname", sourceCountry: "US", destinationCountries: ["JP", "US"] });
    assert.equal(surname.input.sourceCountry, "US");
    assert.equal(surname.record?.rank, 1);
    assert.deepEqual(surname.matches.map((match) => match.country.code), ["JP"]);

    // An output request replaces the engine's country data with one chunk.
    // Loading it as input again must restore the complete dataset from cache.
    const manifest = JSON.parse(await readFile(new URL("../public/data/manifest.json", import.meta.url), "utf8"));
    const us = manifest.datasets.find((entry: { country: string; type: string }) => entry.country === "US" && entry.type === "surname");
    const lastPart = JSON.parse(await readFile(new URL(`../public${us.chunks.at(-1).path}`, import.meta.url), "utf8")) as Dataset;
    const deepName = lastPart.records.at(-1)!;
    configureEngine({ datasets: [{ meta: lastPart.meta, records: [] }] });
    const requestCount = requested.length;
    await loadInputData("surname", "US");
    assert.equal(getNameRecord({ name: deepName.name, type: "surname", sourceCountry: "US" })?.rank, deepName.rank);
    assert.equal(requested.length, requestCount, "complete input data should be cached");
    await loadInputData("given_name", "JP");
    const jpReference = manifest.references.find((entry: { country: string; type: string }) => entry.country === "JP" && entry.type === "given_name");
    const jpPart = JSON.parse(await readFile(new URL(`../public${jpReference.chunks[0].path}`, import.meta.url), "utf8"));
    const referenceInput = { name: jpPart.records[0].name, gender: jpPart.records[0].gender, type: "given_name" as const };
    assert.ok(hasJapaneseReferenceName(referenceInput));
    clearReferenceDataset("JP", "given_name");
    await loadInputData("given_name", "JP");
    assert.ok(hasJapaneseReferenceName(referenceInput), "Japanese input must restore its dictionary after use as an output country");
    assert.ok(validateInput({ name: "Smith", type: "surname", sourceCountry: "invalid" }));
    assert.equal(validateInput({ name: "Noah", type: "given_name", gender: "male", sourceCountry: "DE", reading: "invalid" }), undefined);
    for (const country of ["IT", "NL", "CN", "IN", "XK"]) {
      await loadInputData("given_name", country);
      const names = getInputExamples(country, "given_name", "male");
      assert.ok(names.length, `${country} should offer examples from its own data`);
      const input = { sourceCountry: country, name: names[0], gender: "male" as const, type: "given_name" as const, destinationCountries: ["JP"] };
      const record = getNameRecord(input);
      await loadDiagnosisData(input.type, ["JP"], record?.rank, input.gender, input.name, country);
      const result = diagnose(input);
      assert.equal(result.meta.country, country);
      assert.ok(result.matches.some((match) => match.country.code === "JP"));
      if (country === "XK") {
        assert.equal(result.recognition, "dictionary");
        assert.equal(result.record, undefined, "public-people evidence ranks must not become source popularity ranks");
      } else assert.ok(result.record, `${country} must use its ranking`);
    }
    for (const country of getCountryConfig()) {
      assert.ok(sourceCountryCodes.includes(country.code));
      await readFile(new URL(`../public/flags/${country.code}.svg`, import.meta.url));
      for (const type of ["given_name", "surname"]) {
        assert.ok([...manifest.datasets, ...manifest.references].some((entry: { country: string; type: string }) => entry.country === country.code && entry.type === type), `${country.code}/${type} must have a source`);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
