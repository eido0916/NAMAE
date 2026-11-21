import test from 'node:test';
import assert from 'node:assert/strict';
import { configureEngine, diagnose } from '../src/lib/engine';
import { readFileSync } from 'node:fs';
import type { Dataset } from '../src/lib/types';

test('missing ranking data stays unavailable instead of becoming a dictionary suggestion', () => {
  const dataset = (country: string, name: string): Dataset => ({
    meta: { country, type: 'given_name', source: 'Test survey', dataYear: 2025, isOfficial: true, isSample: false },
    records: [{ country, type: 'given_name', name, gender: 'male', rank: 1, totalEntries: 3, year: 2025 }, {country,type:'given_name',name:'OtherName',gender:'male',rank:3,totalEntries:3,year:2025}],
  });
  const us = dataset('US', 'James');
  const gb = dataset('GB', 'Noah');
  gb.records = gb.records.filter(record => record.rank === 1);
  const xk = { ...dataset('XK', 'Unused'), records: [] };
  configureEngine({ datasets: [us, gb, xk], references: [{
    meta: xk.meta,
    records: [{ country: 'XK', type: 'given_name', name: 'Arben', gender: 'male' }],
  }] });
  const result = diagnose({ sourceCountry: 'US', name: 'James', type: 'given_name', gender: 'male', destinationCountries: ['GB', 'XK'] });
  assert.deepEqual(result.matches.map(match => [match.country.code, match.record.name, match.record.rank]), [['GB', 'Noah', 1]]);
  assert.deepEqual(result.unavailableCountries?.map(country => country.country.code), ['XK']);
  const absentOrdinal = diagnose({sourceCountry:'US',name:'OtherName',type:'given_name',gender:'male',destinationCountries:['GB']});
  assert.equal(absentOrdinal.record?.rank, 3);
  assert.equal(absentOrdinal.matches[0].record.name, "Noah");
  assert.equal(absentOrdinal.matches[0].record.rank, 1, "retain the real destination rank instead of claiming rank 3");
  const unknown = diagnose({ sourceCountry: 'XK', name: 'Arben', type: 'given_name', gender: 'male', destinationCountries: ['GB'] });
  assert.equal(unknown.recognition, 'dictionary');
  assert.equal(unknown.record, undefined);
  assert.deepEqual(unknown.matches, []);
  assert.deepEqual(unknown.unavailableCountries?.map(country => country.country.code), ['GB']);
});

test('China keeps genuine Han names and published ranks outside the source ordinal range', () => {
  const chinese = ['given-name', 'surname'].map(type => JSON.parse(readFileSync('src/data/cn/' + type + '/onomaverse.json', 'utf8')) as Dataset);
  const source: Dataset = {meta:{country:'US',type:'given_name',source:'Test survey',dataYear:2025,isOfficial:true,isSample:false},records:[{country:'US',type:'given_name',name:'James',gender:'male',rank:365,totalEntries:1000}]};
  configureEngine({datasets:[source,...chinese]});
  const result = diagnose({sourceCountry:'US',name:'James',type:'given_name',gender:'male',destinationCountries:['CN']});
  assert.equal(result.record?.rank,365);
  assert.equal(result.matches[0].country.code,'CN');
  assert.equal(result.matches[0].record.rank,4);
  assert.equal(result.matches[0].equivalentRank,365);
  assert.match(result.matches[0].record.name,/\p{Script=Han}/u);
  assert.equal(result.matches[0].meta.dataYear,2021);
  assert.match(result.matches[0].meta.coverageLabel!,/newborns/);
  assert.ok(chinese[0].records.some(record => record.name === result.matches[0].record.name && record.rank === 4));
  const surname = diagnose({sourceCountry:'CN',name:'李',type:'surname',destinationCountries:['US']});
  assert.equal(surname.record?.name,'李');
  assert.equal(surname.record?.rank,2);
});
