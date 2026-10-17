import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Dataset } from '../src/lib/types';
import { configureEngine, diagnose, getNameRecord } from '../src/lib/engine';
import { readDatasets } from '../scripts/data-utils.mjs';
const all=readDatasets('src/data').map((x: {dataset: Dataset})=>x.dataset) as Dataset[];
const dictionary=JSON.parse(readFileSync('src/data/dictionary/names.json','utf8'));
configureEngine({datasets:all,dictionary});
test('expanded countries have 10,000 distinct names per gender and contiguous count-sorted ranks',()=>{
 for(const country of ['BR','ES','FI','FR','GB','PL','US']){
  const d=all.find(d=>d.meta.country===country&&d.meta.type==='given_name')!;
  assert.ok(d.meta.coverageLabel);
  for(const gender of ['male','female']){
   const rows=d.records.filter(r=>r.gender===gender);
   assert.ok(rows.length>=10000,country+' '+gender);
   assert.equal(new Set(rows.map(r=>r.name.toLowerCase())).size,rows.length);
   rows.forEach((r,i)=>{assert.equal(r.rank,i+1);assert.equal(r.totalEntries,rows.length);assert.ok((r.count??0)>0);if(i)assert.ok(rows[i-1].count!>=r.count!);});
  }
 }
});
test('rare Japanese names match the exact requested rank in expanded countries for both genders',()=>{
 for(const gender of ['male','female'] as const){
  const source=all.find(d=>d.meta.country==='JP'&&d.meta.type==='given_name')!.records.find(r=>r.gender===gender&&r.rank===10000)!;
  assert.ok(source);
  const result=diagnose({name:source.name,gender,type:'given_name',destinationCountries:['BR','ES','FI','FR','GB','PL','US']});
  assert.equal(result.matches.length,7);
  for(const m of result.matches)assert.equal(m.record.rank,10000,m.country.code);
 }
});
test('surname comparisons reach rank 10,000 in the expanded official datasets',()=>{
 const source=all.find(d=>d.meta.country==='JP'&&d.meta.type==='surname')!.records.find(r=>r.rank===10000)!;
 const result=diagnose({name:source.name,type:'surname',destinationCountries:['BR','ES','FI','FR','PL','US']});
 assert.equal(result.matches.length,6);
 for(const m of result.matches){
  assert.ok(m.record.rank!==undefined);
  const available=all.find(d=>d.meta.country===m.country.code&&d.meta.type==='surname')!.records;
  const distance=available.reduce((best,r)=>Math.min(best,Math.abs(r.rank-10000)),Infinity);
  assert.equal(Math.abs(m.record.rank-10000),distance,m.country.code);
 }
});
test('published Japanese readings are included even when the original dictionary omitted their gender',()=>{
 const input={name:'あおい',type:'given_name' as const,gender:'male' as const};
 assert.equal(getNameRecord(input)?.rank,17);
 assert.equal(getNameRecord(input)?.isEstimated,false);
 const female=getNameRecord({...input,gender:'female'});
 assert.equal(female?.rank,14);
});
test('kana-only Japanese dictionary entries are searchable',()=>{
 assert.ok(getNameRecord({name:'あーみん',type:'given_name',gender:'female'}));
});
test('Canada uses published cumulative counts and covers rare female names',()=>{
 const dataset=all.find(d=>d.meta.country==='CA'&&d.meta.type==='given_name')!;
 assert.match(dataset.meta.coverageLabel??'',/1991/);
 for(const gender of ['male','female']){
  const rows=dataset.records.filter(r=>r.gender===gender);
  assert.ok(rows.length>(gender==='male'?8000:11000));
  rows.forEach((r,i)=>{assert.equal(r.rank,i+1);assert.ok((r.count??0)>0);if(i)assert.ok(rows[i-1].count!>=r.count!);});
 }
 const source=all.find(d=>d.meta.country==='JP'&&d.meta.type==='given_name')!.records.find(r=>r.gender==='female'&&r.rank===10000)!;
 const result=diagnose({name:source.name,type:'given_name',gender:'female',destinationCountries:['CA']});
 assert.equal(result.matches[0].record.rank,10000);
});
