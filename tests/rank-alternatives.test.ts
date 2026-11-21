import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildJapaneseRankAlternatives } from '../scripts/japanese-rank-alternatives.mjs';
import { loadInputData, loadDiagnosisData } from '../src/lib/data-loader';
import { diagnose, getNameRecord } from '../src/lib/engine';

test('annual alternatives preserve published ranks and select the most recent survey for each ordinal', () => {
  const source = JSON.parse(readFileSync('data-sources/rankings/jp-baby-calendar.json', 'utf8'));
  const dataset = buildJapaneseRankAlternatives(source);
  const name = dataset.records.find(r => r.gender === 'male' && r.rank === 76);
  assert.equal(name?.name, 'だん');
  assert.equal(name?.year, 2024);
  assert.equal(name?.isEstimated, false);
  for (const record of dataset.records) {
    const originals = source.records.filter((r: { sex: string; rank: number }) => r.sex === (record.gender === 'male' ? 'm' : 'f') && r.rank === record.rank);
    assert.equal(record.year, Math.max(...originals.map((r: { year: number }) => r.year)));
    assert.ok(originals.some((r: { reading: string; year: number; totalEntries: number }) => r.reading === record.name && r.year === record.year && r.totalEntries === record.totalEntries));
  }
});

test('Argentina Leo 76 matches Japan 76 from 2024 without changing latest Japanese input rankings', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => new Response(readFileSync(new URL(`../public${String(input)}`, import.meta.url), 'utf8'));
  try {
    await loadInputData('given_name', 'AR');
    const input = { sourceCountry: 'AR', name: 'Leo', type: 'given_name' as const, gender: 'male' as const, destinationCountries: ['JP'] };
    const source = getNameRecord(input);
    assert.equal(source?.rank, 76);
    await loadDiagnosisData('given_name', ['JP'], source?.rank, 'male', 'Leo', 'AR');
    const japan = diagnose(input).matches[0];
    assert.equal(japan.country.code, 'JP');
    assert.equal(japan.record.name, 'だん');
    assert.equal(japan.record.rank, 76);
    assert.equal(japan.record.year, 2024);
    assert.equal(japan.meta.dataYear, 2024);
    await loadInputData('given_name', 'JP');
    const latest = getNameRecord({ name: 'けいと', type: 'given_name', gender: 'male' });
    assert.equal(latest?.rank, 75);
    assert.equal(latest?.year, 2025);
  } finally { globalThis.fetch = originalFetch; }
});
