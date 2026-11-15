import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildObservedRanks } from '../scripts/observed-rank-utils.mjs';
import { buildObservedDataset } from '../scripts/observed-ranking-dataset.mjs';
import { observedNativeLabel } from '../scripts/observed-native-labels.mjs';
import { configureEngine, diagnose, getNameRecord } from '../src/lib/engine';
import type { Dataset } from '../src/lib/types';

const row = (person: number, entity: number) => ({ person: { value: `http://www.wikidata.org/entity/Q${person}` }, name: { value: `http://www.wikidata.org/entity/Q${entity}` }, sex: { value: 'http://www.wikidata.org/entity/Q6581097' } });
test('native observations count distinct people, preserve spelling groups and use competition ties', () => {
  const rows = [row(1, 10), row(1, 10), row(1, 11), row(2, 10), row(3, 12), row(4, 12), row(5, 13)];
  const records = buildObservedRanks(rows, { Q10: { en: 'Alexander', ru: 'Александр' }, Q11: { ru: 'Александр' }, Q12: { ru: 'Борис' }, Q13: { ru: 'Иван' } }, 'RU', 'given_name', { nativeLabels: true });
  assert.equal(records.length, 3);
  assert.deepEqual(records.map(r => r.evidenceRank.rank), [1, 1, 3]);
  assert.equal(records.find(r => r.name === 'Александр')?.evidenceRank.observedPeople, 2);
  assert.ok(records.every(r => r.evidenceRank.totalPeople === 5));
  const dataset = buildObservedDataset({ country: 'RU', type: 'given_name', dataYear: 2026 }, records.map(r => ({ ...r, evidenceRank: { ...r.evidenceRank, asOf: '2026-10-16', sourceId: 'wikidata-observed-name-counts' } })));
  assert.equal(dataset.meta.rankingScope, 'public_people');
  assert.equal(dataset.meta.isOfficial, false);
  assert.equal(dataset.records[0].observation.tiedNames, 2);
});

test('native labels are source linked without reverse transliteration or Han merging', () => {
  assert.equal(observedNativeLabel('RU', 'given_name', { en: 'Alexander' }), undefined);
  assert.equal(observedNativeLabel('RU', 'given_name', { en: 'Alexander', ru: 'Александр' }), 'Александр');
  assert.equal(observedNativeLabel('TW', 'surname', { zh: '刘姓', 'zh-hant': '劉姓' }), '劉');
  assert.equal(observedNativeLabel('TW', 'surname', { zh: '杞' }), '杞');
  const records = buildObservedRanks([row(1, 10), row(2, 11)], { Q10: { zh: '李姓', en: 'Li' }, Q11: { zh: '黎姓', en: 'Li' } }, 'CN', 'surname', { nativeLabels: true });
  assert.deepEqual(new Set(records.map(r => r.name)), new Set(['李', '黎']));
});

test('published and public-person ranks stay isolated when switching datasets', () => {
  const chinese = JSON.parse(readFileSync('src/data/cn/surname/onomaverse.json', 'utf8')) as Dataset;
  const make = (country: string, name: string): Dataset => ({ meta: { country, type: 'surname', source: 'Wikidata', sourceUrl: 'https://www.wikidata.org/', dataYear: 2026, isOfficial: false, isSample: false, rankingScope: 'public_people' }, records: [{ country, type: 'surname', name, rank: 1, totalEntries: 1, count: 5, observation: { totalPeople: 5, tiedNames: 1, asOf: '2026-10-16', sourceId: 'wikidata-observed-name-counts' } }] });
  configureEngine({ datasets: [chinese], observedDatasets: [make('CN', '李'), make('US', 'Smith')] });
  const input = { sourceCountry: 'CN', type: 'surname' as const, name: '李', destinationCountries: ['US'] };
  assert.equal(getNameRecord(input)?.rank, 2);
  const result = diagnose({ ...input, rankingScope: 'public_people' });
  assert.equal(result.record?.rank, 1);
  assert.equal(result.meta.rankingScope, 'public_people');
  assert.equal(result.input.rankingScope, 'public_people');
  assert.equal(result.matches[0].record.name, 'Smith');
  assert.equal(result.matches[0].meta.rankingScope, 'public_people');
  assert.equal(getNameRecord(input)?.rank, 2);
  const missing = diagnose({ ...input, name: '赵', rankingScope: 'public_people' });
  assert.equal(missing.record, undefined);
  assert.equal(missing.matches.length, 0);
});
