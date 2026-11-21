import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isNativeName } from '../src/lib/native-name-policy.mjs';

test('native ranking coverage grows without reducing previously supported native cohorts', () => {
  const report = JSON.parse(readFileSync('reports/native-ranking-expansion.json', 'utf8'));
  assert.ok(report.countriesExpanded >= 28);
  assert.ok(report.addedGivenNames >= 3782);
  assert.ok(report.addedSurnames >= 4181);
  for (const row of report.rows) for (const group of Object.keys(row.before))
    assert.ok(row.after[group] >= row.before[group], `${row.country}/${row.type}/${group}`);
});

test('expanded native names keep a positive count in the retained frequency source', () => {
  for (const [country, type, name, rank, count] of [
    ['EG', 'given_name', 'محمد', 3, 1671069],
    ['RU', 'surname', 'Захаров', 84, 5207],
    ['RU', 'surname', 'Борисов', 85, 5195],
  ]) {
    const data = JSON.parse(readFileSync(`src/data/${country.toLowerCase()}/${type.replace('_', '-')}/onomaverse.json`, 'utf8'));
    const record = data.records.find(record => record.name === name && (type === 'surname' || record.gender === 'male'));
    assert.equal(record?.rank, rank);
    assert.equal(record?.count, count);
    assert.equal(isNativeName(country, record.name), true);
    const source = readFileSync(`data-sources/rankings/foreign/onomaverse-${type === 'surname' ? 'surname' : 'given-name'}-frequency.csv`, 'utf8');
    assert.ok(source.split(/\r?\n/).some(line => {
      const fields = line.split(',');
      return fields[0].normalize('NFKC') === name && fields[type === 'surname' ? 2 : 3] === country && Number(fields[type === 'surname' ? 4 : 5]) === count;
    }));
  }
});

test('national Chinese ranking scopes retain priority during generic frequency expansion', () => {
  const surname = JSON.parse(readFileSync('src/data/cn/surname/onomaverse.json', 'utf8'));
  assert.equal(surname.meta.isOfficial, true);
  assert.equal(surname.records.find(record => record.name === '李').rank, 2);
  const given = JSON.parse(readFileSync('src/data/cn/given-name/onomaverse.json', 'utf8'));
  assert.equal(given.meta.isOfficial, true);
  assert.match(given.meta.coverageLabel, /newborns/);
});
