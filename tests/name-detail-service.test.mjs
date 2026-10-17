import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,readFileSync,rmSync,renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createDetailService } from '../scripts/name-details/service.mjs';
import { openDetails,normalize } from '../scripts/name-details/db.mjs';
import { resolveNameItems,evaluateName,primaryGivenName } from '../scripts/name-details/wikidata.mjs';

const claim=value=>({mainsnak:{snaktype:'value',datavalue:{value}}});
test('native spelling and declared language disambiguate translated labels without selecting tied identities',()=>{
  const entities={
    Q1:{labels:{en:{value:'Olivia'}},claims:{P1705:[claim({text:'Olivia',language:'en'})]}},
    Q2:{labels:{en:{value:'Olivia'}},claims:{P1705:[claim({text:'Ολίβια',language:'el'})]}},
  };
  assert.deepEqual(resolveNameItems('Olivia',entities,['en']),['Q1']);
  assert.equal(evaluateName('Olivia',entities.Q2,['en'],1).exact,false);
  const marie={
    Q3:{labels:{fr:{value:'Marie'}},claims:{P1705:[claim({text:'Marie',language:'mul'})],P407:[claim({id:'Q150'})]}},
    Q4:{labels:{fr:{value:'Marie'}},claims:{P1705:[claim({text:'Marie',language:'mul'})]}},
    Q5:{labels:{fr:{value:'Marie'}},claims:{P1705:[claim({text:'真理恵',language:'ja'})]}},
  };
  assert.deepEqual(resolveNameItems('MARIE',marie,['fr'],['Q150']),['Q3']);
  assert.deepEqual(resolveNameItems('Marie',marie,['fr']),['Q3','Q4']);
  assert.equal(evaluateName('Marie',marie.Q3,['fr'],2).status,'pending');
  assert.equal(primaryGivenName('Olivia',{labels:{mul:{value:'Olivia Colman'}}},['en']),true);
  assert.equal(primaryGivenName('Olivia',{labels:{en:{value:'Judith Olivia Dench'}}},['en']),false);
  assert.equal(primaryGivenName('Emma',{labels:{en:{value:'Emmanuel Example'}}},['en']),false);
  assert.equal(primaryGivenName('서윤',{labels:{ko:{value:'박서윤'}}},['ko']),true);
  const arabic={labels:{en:{value:'Ahmed'}},claims:{P1705:[claim({text:'أحمد',language:'ar'})]}};
  assert.equal(evaluateName('Ahmed',arabic,['ar','en'],1).status,'verified');
  assert.equal(evaluateName('Ahmed',arabic,['en'],1).status,'pending');
});

function setup() {
  const directory=mkdtempSync(resolve(tmpdir(),'namae-service-'));
  const database=resolve(directory,'details.sqlite'),rankingPath=resolve(directory,'ranking.sqlite');
  const ranking=new DatabaseSync(rankingPath);
  ranking.exec('CREATE TABLE ranking_entries(country TEXT,type TEXT,name TEXT); CREATE TABLE reference_entries(country TEXT,type TEXT,name TEXT)');
  return {directory,database,rankingPath,ranking};
}
function saveJob(database,request,state='missing') {
  const db=openDetails(database);
  db.prepare('INSERT OR IGNORE INTO names(country,type,name,normalized) VALUES (?,?,?,?)').run(request.country,request.type,request.name,normalize(request.name));
  const id=db.prepare('SELECT id FROM names WHERE country=? AND type=? AND normalized=?').get(request.country,request.type,normalize(request.name)).id;
  db.prepare('INSERT OR REPLACE INTO collection_jobs(name_id,state,updated_at,evidence_json) VALUES (?,?,?,?)').run(id,state,new Date().toISOString(),JSON.stringify({identityVersion:3}));
  db.close();
}
const tick=()=>new Promise(resolveTick=>setImmediate(resolveTick));

test('all 143 foreign countries and both name roles accept uncollected deep names and reuse persistent negative results',async()=>{
  const fixture=setup();
  const countries=JSON.parse(readFileSync('src/data/countries.json','utf8')).filter(c=>c.enabled && c.code!=='JP');
  for (const country of countries) for(const type of ['given_name','surname']) fixture.ranking.prepare('INSERT INTO reference_entries VALUES (?,?,?)').run(country.code,type,`Deep-${country.code}-${type}`);
  fixture.ranking.close();
  let calls=0;
  const options={...fixture,runner:async request=>{calls++;saveJob(fixture.database,request);},pause:async()=>{}};
  let service=createDetailService(options);
  try {
    for (const country of countries) for(const type of ['given_name','surname']) {
      const request={country:country.code,type,name:`Deep-${country.code}-${type}`};
      assert.equal(service.lookup(request).status,202);
      await tick();
      assert.equal(service.lookup(request).body.lookup.state,'missing');
    }
    assert.equal(calls,countries.length*2);
    assert.equal(service.lookup({country:'US',type:'given_name',name:'invented-unregistered'}).status,400);
    assert.equal(service.lookup({country:'JP',type:'given_name',name:'瑛真'}).status,400);
    service.close();
    service=createDetailService({...options,runner:async()=>{throw Error('Cached requests must not collect again');}});
    assert.equal(service.lookup({country:countries[0].code,type:'given_name',name:`Deep-${countries[0].code}-given_name`}).body.lookup.state,'missing');
  } finally {await tick();service.close();rmSync(fixture.directory,{recursive:true,force:true});}
});

test('concurrent requests deduplicate, run serially, cap queue size and back off on collection failure',async()=>{
  const fixture=setup();
  for(const name of ['First','Second','Third']) fixture.ranking.prepare('INSERT INTO ranking_entries VALUES (?,?,?)').run('US','given_name',name);
  fixture.ranking.close();
  let release;
  const gate=new Promise(resolveGate=>{release=resolveGate;});
  const seen=[];
  const service=createDetailService({...fixture,maxQueue:2,pause:async()=>{},runner:async request=>{
    seen.push(request.name);
    if(request.name==='First') {await gate;saveJob(fixture.database,request);}
    else throw Error('temporary upstream failure');
  }});
  const req=name=>({country:'US',type:'given_name',name});
  try {
    assert.equal(service.lookup(req('First')).status,202);
    // The data pipeline must be able to replace its ranking DB while the server lives.
    renameSync(fixture.rankingPath,fixture.rankingPath+'.replacement-check');
    renameSync(fixture.rankingPath+'.replacement-check',fixture.rankingPath);
    assert.equal(service.lookup(req('FIRST')).status,202);
    assert.equal(service.lookup(req('Second')).status,202);
    assert.equal(service.lookup(req('Third')).status,503);
    await tick();
    assert.deepEqual(seen,['First']);
    release();await tick();
    assert.deepEqual(seen,['First','Second']);
    assert.equal(service.lookup(req('First')).body.lookup.state,'missing');
    assert.equal(service.lookup(req('Second')).body.lookup.state,'error');
    assert.deepEqual(seen,['First','Second']);
  } finally {release();await tick();service.close();rmSync(fixture.directory,{recursive:true,force:true});}
});
