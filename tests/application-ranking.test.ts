import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildApplicationRanking } from '../scripts/application-ranking.mjs';
import { isUsableRankingAlias, isUsableRankingName } from '../src/lib/ranking-name-quality.mjs';
import { loadCoverageTargets } from '../scripts/application-coverage-targets.mjs';
import { loadDiagnosisData } from '../src/lib/data-loader';
import { configureEngine, getNameRecord, diagnose } from '../src/lib/engine';
import { formatEquivalentRank } from '../src/lib/ui-copy';
import type { Dataset } from '../src/lib/types';

function dataset(country: string, names: string[], ranks?: number[]): Dataset {
  return { meta: { country, type: 'surname', source: 'Published', dataYear: 2020, isOfficial: true, isSample: false },
    records: names.map((name, i) => ({ country, type: 'surname', name, rank: ranks?.[i] ?? i + 1, totalEntries: names.length })) };
}
test('application ladders preserve published anchors and fill ordinal gaps with native names', () => {
  const primary = dataset('CN', ['王', '李', '刘'], [1, 2, 4]);
  const observed = dataset('CN', ['王', '赵', '张']);
  observed.records = observed.records.map(row => ({
    ...row, count: 1, observation: { totalPeople: 3, tiedNames: 3, asOf: '2026-10-16', sourceId: 'wikidata-observed-name-counts' },
  }));
  const result = buildApplicationRanking(primary, observed) as Dataset;
  assert.deepEqual(result.records.map(row => [row.name, row.rank]), [['王', 1], ['李', 2], ['赵', 3], ['刘', 4], ['张', 5]]);
  assert.equal(result.records[2].isEstimated, true);
  assert.equal(result.records[1].isEstimated, false);
});
test('Korean Hanja aliases retain familiar positions and matches have exactly the source rank', () => {
  const kr = buildApplicationRanking(dataset('KR', ['김', '이', '박']), undefined) as Dataset;
  const cn = buildApplicationRanking(dataset('CN', ['王', '李', '张']), undefined) as Dataset;
  configureEngine({ appDatasets: [kr, cn] });
  assert.equal(getNameRecord({ sourceCountry: 'KR', name: '金', type: 'surname', rankingScope: 'app' })?.rank, 1);
  const result = diagnose({ sourceCountry: 'CN', name: '李', type: 'surname', rankingScope: 'app', destinationCountries: ['KR'] });
  assert.equal(result.record?.rank, 2);
  assert.equal(result.matches[0].record.name, '이');
  assert.equal(result.matches[0].record.rank, result.record?.rank);
  assert.equal(result.matches[0].equivalentRank, undefined);
  assert.equal(getNameRecord({ sourceCountry: 'KR', name: '이', type: 'surname', rankingScope: 'app' })?.rank, 2);
});
test('unlisted spellings have no app ranking or destination names', () => {
  const data = dataset('US', Array.from({ length: 150 }, (_, i) => `Surname${i}`));
  configureEngine({ appDatasets: [data] });
  const input = { sourceCountry: 'US', name: 'Unlisted', type: 'surname', rankingScope: 'app' } as const;
  assert.equal(getNameRecord(input), undefined);
  assert.deepEqual(diagnose({ ...input, destinationCountries: ['KR'] }).matches, []);
});

test('dictionary-only names and counts without a country evidence source are excluded', () => {
  const primary: Dataset = {
    meta: { country: 'JP', type: 'given_name', source: 'Published and dictionary', dataYear: 2025, isOfficial: false, isSample: false },
    records: [
      { country: 'JP', type: 'given_name', name: 'れん', gender: 'male', rank: 1, totalEntries: 2, year: 2025, rankingBasis: 'overall' },
      { country: 'JP', type: 'given_name', name: 'いまぬえる', aliases: ['イマヌエル'], gender: 'male', rank: 2, totalEntries: 2, isEstimated: true, rankingBasis: 'overall' },
    ],
  };
  const result = buildApplicationRanking(primary, undefined) as Dataset;
  configureEngine({ appDatasets: [result] });
  assert.deepEqual(result.records.map(row => [row.name, row.usageEvidence?.kind]), [['れん', 'published']]);
  assert.equal(getNameRecord({ sourceCountry: 'JP', name: 'イマヌエル', type: 'given_name', gender: 'male', rankingScope: 'app' }), undefined);
  const popular = dataset('IE', ['Example']);
  popular.meta.source = 'Popular Names by Country Dataset';
  popular.records[0].count = 10;
  assert.deepEqual(buildApplicationRanking(popular, undefined).records, []);
});

test('country ranking export drops table labels and missing-name values, including aliases', () => {
  const primary = dataset('US', ['Smith', 'All other names', 'Unknown', 'Garcia']);
  primary.records[0].aliases = ['Not stated', 'Smyth'];
  const rejected: { name: string; reason: string }[] = [];
  const result = buildApplicationRanking(primary, undefined, [], rejected) as Dataset;
  assert.deepEqual(result.records.map(row => [row.name, row.rank, row.totalEntries]), [['Smith', 1, 2], ['Garcia', 2, 2]]);
  assert.deepEqual(result.records[0].aliases, ['Smyth']);
  assert.deepEqual([...new Set(rejected.map(row => row.name))], ['All other names', 'Unknown']);
  assert.ok(rejected.every(row => row.reason === 'placeholder'));
  const korean = dataset('KR', ['김', '미상', '박']);
  assert.deepEqual(buildApplicationRanking(korean, undefined).records.map(row => row.name), ['김', '박']);
});

test('US first-name placeholders are excluded across sources while documented surnames remain', () => {
  const primary: Dataset = {
    meta: { ...dataset('US', []).meta, type: 'given_name', source: 'U.S. Social Security Administration' },
    records: ['Baby', 'James', 'Ref', 'Infant', 'Female'].map((name, index) => ({
      country: 'US', type: 'given_name', gender: 'male', name, rank: index + 1, totalEntries: 5,
    })),
  };
  primary.records[1].aliases = ['BABY', 'Jim'];
  assert.deepEqual(buildApplicationRanking(primary, undefined).records.map(row => row.name), ['James']);
  const census = { ...primary, meta: { ...primary.meta, source: 'U.S. Census Bureau' } };
  assert.deepEqual(buildApplicationRanking(census, undefined).records.map(row => [row.name, row.aliases]), [['James', ['Jim']]]);
  assert.deepEqual(buildApplicationRanking(dataset('US', ['Blank', 'Null', 'Baby']), undefined).records.map(row => row.name), ['Blank', 'Null', 'Baby']);
});

test('quality checks reject corrupted labels and preserve attested short names and punctuation', () => {
  for (const [country, name] of [['AF', 'إتش.'], ['BD', 'এম.'], ['GR', 'Α.'], ['RU', 'Дж.'], ['US', 'Josep M.']])
    assert.equal(isUsableRankingName(country, name, 'given_name'), false);
  assert.equal(isUsableRankingName('ES', 'master of ...', 'given_name'), false);
  assert.equal(isUsableRankingName('US', 'Fnu', 'given_name'), false);
  assert.equal(isUsableRankingAlias('US', 'Noname', 'given_name'), false);
  assert.equal(isUsableRankingName('BR', 'masculino', 'surname'), false);
  assert.equal(isUsableRankingName('BR', 'null', 'surname'), false);
  assert.equal(isUsableRankingName('PL', 'DR. VARGA', 'surname'), false);
  assert.equal(isUsableRankingName('VN', 'male', 'given_name'), false);
  assert.equal(isUsableRankingName('US', 'Null', 'surname'), true);
  assert.equal(isUsableRankingName('US', 'Test', 'surname'), true);
  assert.equal(isUsableRankingName('GB', 'St. John', 'given_name'), true);
  assert.equal(isUsableRankingName('BD', 'মোহাম্মদ', 'given_name'), true);
  assert.equal(isUsableRankingName('CN', '小明', 'given_name'), true);
  assert.equal(isUsableRankingName('AU', 'Un-Named', 'given_name'), false);
  assert.equal(isUsableRankingName('CA', 'OLIVIERXXXXXXXXXXXXX', 'given_name'), false);
  assert.equal(isUsableRankingName('CL', "D'", 'given_name'), false);
  assert.equal(isUsableRankingAlias('GB', 'D’', 'given_name'), false);
  assert.equal(isUsableRankingName('GB', 'Amelia-', 'given_name'), false);
  assert.equal(isUsableRankingName('TH', 'รรรรร', 'given_name'), false);
  assert.equal(isUsableRankingName('CL', 'Marico el que LO Lea', 'given_name'), false);
  assert.equal(isUsableRankingName('BE', 'O', 'surname'), true);
  assert.equal(isUsableRankingName('BE', "'t Kindt", 'surname'), true);
  assert.equal(isUsableRankingName('FR', 'de La Tour du Pin', 'surname'), true);
  assert.equal(isUsableRankingName('JP', '凛', 'given_name'), true);
  assert.equal(isUsableRankingAlias('KR', 'Kim', 'surname'), true);
  assert.equal(isUsableRankingAlias('KR', '金', 'surname'), true);
  assert.equal(isUsableRankingAlias('JP', '01', 'given_name'), false);
});

test('every supported country has a population-based target with a separate target for Korean surnames', () => {
  const target = loadCoverageTargets(process.cwd());
  const manifest = JSON.parse(readFileSync('public/data/manifest.json', 'utf8'));
  for (const entry of manifest.appRankings) assert.ok(target(entry.country, entry.type) > 0);
  assert.equal(target('US', 'given_name'), 20000);
  assert.equal(target('KR', 'surname'), 350);
  assert.equal(target('CH', 'given_name'), 10000);
  assert.equal(target('CH', 'surname'), 3000);
  assert.equal(target('GL', 'given_name'), 300);
});
test('short destination rankings use the source percentile and retain the actual local rank', () => {
  configureEngine({ appDatasets: [
    buildApplicationRanking(dataset('CN', ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴']), undefined) as Dataset,
    buildApplicationRanking(dataset('KR', ['김', '이', '박']), undefined) as Dataset,
    buildApplicationRanking(dataset('GL', []), undefined) as Dataset,
  ] });
  const result = diagnose({ sourceCountry: 'CN', name: '刘', type: 'surname', rankingScope: 'app', destinationCountries: ['KR', 'GL'] });
  assert.equal(result.matches[0].record.name, '김');
  assert.equal(result.matches[0].record.rank, 1);
  assert.equal(result.matches[0].equivalentRank, 4);
  assert.equal(formatEquivalentRank(result.matches[0].equivalentRank!, 'ja'), '#4相当');
  assert.equal(result.unavailableCountries?.[0].country.code, 'GL');
});

test('the loader fetches the percentile chunk when it differs from the last destination chunk', async () => {
  const manifest = JSON.parse(readFileSync('public/data/manifest.json', 'utf8'));
  const rankings: { country: string; type: string; chunks: { gender: string; path: string; minRank: number; maxRank: number }[] }[] = manifest.appRankings;
  const china = rankings.find(row => row.country === 'CN' && row.type === 'given_name')!
    .chunks.filter(chunk => chunk.gender === 'male');
  const sourceChunk = rankings.find(row => row.country === 'US' && row.type === 'given_name')!
    .chunks.find(chunk => chunk.gender === 'male' && chunk.minRank > china.at(-1)!.maxRank)!;
  assert.ok(sourceChunk, 'The source rank must exceed the destination list length');
  const source = (JSON.parse(readFileSync('public' + sourceChunk.path, 'utf8')) as Dataset).records[0];
  const expectedRank = Math.round(source.rank / source.totalEntries * china.at(-1)!.maxRank);
  assert.ok(expectedRank < china.at(-1)!.minRank);

  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = async path => {
    requested.push(String(path));
    return new Response(readFileSync('public' + String(path), 'utf8'));
  };
  try {
    const input = { name: source.name, type: 'given_name', gender: 'male', sourceCountry: 'US', rankingScope: 'app' } as const;
    await loadDiagnosisData(input.type, ['CN'], source.rank, input.gender, input.name, input.sourceCountry, input.rankingScope, source.totalEntries);
    const match = diagnose({ ...input, destinationCountries: ['CN'] }).matches[0];
    const percentileChunk = china.find(chunk => chunk.minRank <= expectedRank && chunk.maxRank >= expectedRank)!;
    assert.ok(requested.includes(percentileChunk.path));
    assert.equal(match.record.rank, expectedRank);
    assert.equal(match.equivalentRank, source.rank);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
