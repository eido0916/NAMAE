import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalizeNativeName, isNativeName } from '../src/lib/native-names';
import { resolveNativeName } from '../src/lib/native-name-policy.mjs';
import { configureEngine, diagnose, getCohort, getInputExamples, getNameRecord, getInputNameCandidates } from '../src/lib/engine';
import type { Dataset, NameRecord } from '../src/lib/types';
const record = (country:string, name:string, aliases?:string[]):NameRecord => ({country,type:'given_name',name,aliases,gender:'male',rank:7,totalEntries:10,count:100,year:2026});
test('country script policies retain local scripts, accents and multilingual names', () => {
  for (const [country,name] of [['CN','若汐'],['RU','Александр'],['GR','Γεώργιος'],['SA','محمد'],['IL','דוד'],['TH','สมชาย'],['AM','Արմեն'],['NP','किरण'],['KR','민준'],['DE','Müller'],['VN','Nguyễn'],['IN','தமிழ்'],['MY','Tan'],['RS','Nikola']]) assert.equal(isNativeName(country,name),true,`${country}: ${name}`);
  for (const country of ['CN','RU','GR','SA','IL','TH','AM','NP']) assert.equal(isNativeName(country,'John'),false,country);
});
test('native aliases are source linked, preserve original rank and do not guess homophones', () => {
  const original = record('RU','Alexander',['Александр']);
  const canonical = canonicalizeNativeName(original);
  assert.equal(canonical.name,'Александр'); assert.equal(canonical.rank,7); assert.ok(canonical.aliases?.includes('Alexander'));
  assert.equal(resolveNativeName(record('CN','Yi',['一','伊']),{}),undefined);
  assert.equal(resolveNativeName(record('CN','Unverified'),{}),undefined);
  assert.equal(canonicalizeNativeName(record('RU','Aidar')).name,'Айдар');
  assert.equal(resolveNativeName(record('TH','Somchai'),{}),undefined,'unavailable native spellings must not be invented');
});
test('all-country output uses native names and does not turn appended dictionary entries into ranks', () => {
  const russian:Dataset = {meta:{country:'RU',type:'given_name',source:'Onomaverse Global Name Frequency',dataYear:2026,isOfficial:false,isSample:false},records:[record('RU','Alexander',['Александр']),record('RU','Unknown'),{...record('RU','Boris',['Борис']),count:undefined,rank:9}]};
  const us:Dataset = {meta:{country:'US',type:'given_name',source:'SSA',dataYear:2026,isOfficial:true,isSample:false},records:[record('US','James')]};
  configureEngine({datasets:[russian,us]});
  assert.deepEqual(getCohort({name:'',type:'given_name',gender:'male'},'RU').map(r=>r.name),['Александр']);
  assert.equal(getNameRecord({sourceCountry:'RU',type:'given_name',gender:'male',name:'Alexander'})?.name,'Александр');
  assert.equal(getNameRecord({sourceCountry:'RU',type:'given_name',gender:'male',name:'Boris'}),undefined);
  const result=diagnose({sourceCountry:'US',type:'given_name',gender:'male',name:'James',destinationCountries:['RU']});
  assert.equal(result.matches[0].record.name,'Александр'); assert.equal(result.matches[0].record.rank,7);
  const dictionary=diagnose({sourceCountry:'RU',type:'given_name',gender:'male',name:'Boris',destinationCountries:['US']});
  assert.equal(dictionary.record,undefined); assert.equal(dictionary.input.name,'Борис'); assert.equal(dictionary.recognition,'dictionary');
});
test('Chinese given-name examples use source-provided Han rather than English names', () => {
  const chinese=JSON.parse(readFileSync('src/data/cn/given-name/onomaverse.json','utf8')) as Dataset;
  configureEngine({datasets:[chinese]});
  const examples=getInputExamples('CN','given_name','male');
  assert.ok(examples.length > 0); assert.ok(examples.every(name => /\p{Script=Han}/u.test(name)),examples.join(','));
  const cohorts=getCohort({name:'',type:'given_name',gender:'male'},'CN');
  assert.ok(cohorts.every(r=>isNativeName('CN',r.name)));
  assert.equal(cohorts[0].name,'奕辰');
  assert.equal(cohorts[0].rank,1);
  assert.equal(cohorts[0].count,14620);
  assert.equal(chinese.meta.isOfficial,true);
  assert.match(chinese.meta.coverageLabel!,/newborns/);
  assert.deepEqual(getInputNameCandidates({sourceCountry:'CN',type:'given_name',gender:'male',name:'Yichen'}).map(r=>r.name),['奕辰','亦辰','亦宸']);
  assert.throws(()=>diagnose({sourceCountry:'CN',type:'given_name',gender:'male',name:'Yichen',destinationCountries:['US']}),/現地表記/);
});
