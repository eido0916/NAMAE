import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isNativeName, nativeNameKey } from '../src/lib/native-name-policy.mjs';
import { isUsableRankingAlias, isUsableRankingName } from '../src/lib/ranking-name-quality.mjs';
const manifest = JSON.parse(readFileSync('public/data/manifest.json', 'utf8'));
assert.ok(manifest.appRankings?.length, 'Application rankings must be exported');
let total = 0;
const sources = new Set();
for (const entry of manifest.appRankings) {
  const lastRanks = new Map();
  const cohortSizes = new Map();
  const names = new Set();
  for (const chunk of entry.chunks) {
    const content = readFileSync('public' + chunk.path);
    assert.equal(createHash('sha256').update(content).digest('hex'), chunk.sha256, chunk.path);
    const dataset = JSON.parse(content);
    assert.equal(dataset.meta.rankingScope, 'app');
    assert.equal(dataset.meta.country, entry.country);
    assert.equal(dataset.meta.type, entry.type);
    assert.equal(dataset.records.length, chunk.records);
    for (const row of dataset.records) {
      const gender = row.gender ?? 'all';
      assert.equal(row.gender, chunk.gender);
      assert.equal(row.rank, (lastRanks.get(gender) ?? 0) + 1);
      assert.ok(row.totalEntries >= row.rank);
      if (!cohortSizes.has(gender)) cohortSizes.set(gender, row.totalEntries);
      assert.equal(row.totalEntries, cohortSizes.get(gender));
      assert.ok(isNativeName(entry.country, row.name), `${entry.country}: ${row.name}`);
      assert.ok(isUsableRankingName(entry.country, row.name, entry.type), `Invalid name: ${entry.country}/${row.name}`);
      assert.ok((row.aliases ?? []).every(alias => isUsableRankingAlias(entry.country, alias, entry.type)), `Invalid alias: ${entry.country}/${row.name}`);
      const evidence = row.usageEvidence;
      assert.ok(evidence?.source && ['published', 'country_frequency', 'public_people', 'country_association', 'name_corpus'].includes(evidence.kind),
        `Missing country usage evidence: ${entry.country}/${entry.type}/${row.name}`);
      if (evidence.kind === 'country_frequency' || evidence.kind === 'public_people') assert.ok(row.count > 0);
      if (entry.country === 'JP' && entry.type === 'given_name') assert.ok(!/^[いイ][まマ][ぬヌ][えエ][るル]$/u.test(row.name));
      sources.add(evidence.source);
      const key = gender + '|' + nativeNameKey(row.name);
      assert.ok(!names.has(key), `Duplicate ${key}`);
      names.add(key);
      lastRanks.set(gender, row.rank);
      if (entry.country === 'CN' && entry.type === 'surname' && row.name === '李') assert.equal(row.rank, 2);
      if (entry.country === 'KR' && entry.type === 'surname' && row.name === '김') assert.equal(row.rank, 1);
      total++;
    }
  }
  for (const [gender, count] of lastRanks) assert.equal(cohortSizes.get(gender), count);
  assert.equal(names.size, entry.records);
}
for (const source of ['South Australia — birth registrations 1944–2013', 'National Records of Scotland — births 1974–2025',
  'Central Statistics Office — Irish Babies’ Names 1964–2025', 'Central Statistics Office — babies’ surnames 2023–2025',
  'KOSIS — 2015 census surname totals', '明治安田 — 名前調査（漢字・かな表記）', 'Wikidata — citizenship and name records'])
  assert.ok(sources.has(source), source);
console.log(`Verified ${total} native application ranking records with consecutive ordinals.`);
