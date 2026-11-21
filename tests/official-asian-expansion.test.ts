import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configureEngine, diagnose, getNameRecord } from '../src/lib/engine';
import { normalizeInputName } from '../src/lib/reference-lookup.mjs';
import type { Dataset } from '../src/lib/types';

const load = (country: string, type: string): Dataset => JSON.parse(readFileSync(`src/data/${country}/${type}/onomaverse.json`, 'utf8'));
test('China retains separate annual rankings and can find names only present in 2020', () => {
  configureEngine({ datasets: [load('cn', 'given-name'), load('tw', 'given-name')] });
  const input = { sourceCountry: 'CN', type: 'given_name' as const, gender: 'male' as const, name: '沐宸', destinationCountries: ['TW'] };
  const result = diagnose(input);
  assert.equal(result.record?.rank, 1);
  assert.equal(result.record?.year, 2021);
  assert.equal(result.record?.count, 22958);
  assert.equal(result.matches[0].record.name, '家豪');
  const historical = getNameRecord({ ...input, name: '宇航' });
  assert.equal(historical?.rank, 7);
  assert.equal(historical?.year, 2020);
  const oldResult = diagnose({ ...input, name: '宇航' });
  assert.equal(oldResult.meta.dataYear, 2020);
  assert.match(oldResult.meta.sourceUrl!, /xinhuanet/);
  assert.equal(getNameRecord({ ...input, name: '奕辰' })?.rank, 5);
  assert.equal(getNameRecord({ ...input, name: '奕辰', year: 2020 })?.rank, 1);
});

test('Taiwan publishes 2708 Unicode surnames with original ranks and 200 gendered given names', () => {
  const surnames = load('tw', 'surname');
  assert.equal(surnames.records.length, 2708);
  assert.equal(load('tw', 'given-name').records.length, 200);
  configureEngine({ datasets: [surnames] });
  const chen = getNameRecord({ sourceCountry: 'TW', type: 'surname', name: '陳' });
  assert.equal(chen?.rank, 1);
  assert.equal(chen?.count, 2618994);
  assert.equal(chen?.totalEntries, 2731);
  // The government table treats compatibility ideographs as distinct surnames.
  const variant = surnames.records.find(r => r.name === '杞')!;
  assert.ok(variant);
  assert.notEqual(normalizeInputName(variant.name), normalizeInputName(variant.name.normalize('NFKC')));
  assert.equal(getNameRecord({ sourceCountry: 'TW', type: 'surname', name: variant.name })?.rank, variant.rank);
});
