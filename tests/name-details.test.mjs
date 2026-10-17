import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openDetails, normalize, transaction } from '../scripts/name-details/db.mjs';
import { evaluateName, Wikidata, ids, wikipediaLinks } from '../scripts/name-details/wikidata.mjs';
import { exportDetails } from '../scripts/export-name-details.mjs';
import { detailKey, detailBucket } from '../src/lib/name-detail-key.mjs';

test('editorial reimports preserve the recorded publication timestamp', () => {
  const base = resolve(tmpdir());
  const directory = mkdtempSync(resolve(base, 'namae-editorial-timestamp-'));
  const database = resolve(directory, 'details.sqlite');
  const input = resolve(directory, 'editorial.json');
  const updatedAt = '2026-10-15T00:00:00.000Z';
  const data = { entities: [{ id: 'manual:fixture', kind: 'character', name: 'Fixture', source: 'https://example.org/fixture', updatedAt }] };
  try {
    writeFileSync(input, JSON.stringify(data));
    for (let attempt = 0; attempt < 2; attempt++) {
      execFileSync(process.execPath, [resolve('scripts/import-name-details.mjs'), input], { env: { ...process.env, NAMAE_DETAILS_DB: database } });
      const db = openDetails(database);
      try { assert.equal(db.prepare('SELECT updated_at FROM entities').get().updated_at, updatedAt); }
      finally { db.close(); }
    }
  } finally {
    assert.ok(resolve(directory).startsWith(base + sep) && directory.includes('namae-editorial-timestamp-'));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('matching preserves spelling, scripts, accents and compound-name boundaries', () => {
  assert.equal(normalize(' Ｅｍｍａ  '), detailKey('Emma'));
  assert.notEqual(normalize('Jose'), normalize('José'));
  assert.notEqual(normalize('서준'), normalize('Seo-jun'));
  assert.notEqual(normalize('Ann'), normalize('Anna'));
  assert.notEqual(normalize('Jean'), normalize('Jean Pierre'));
  assert.equal(detailBucket('Ｅｍｍａ'), detailBucket('emma'));
  const e = { labels: { en: { value: 'Emma' }, de: { value: 'Emmy' } }, aliases: { en: [{ value: 'Em' }] } };
  assert.equal(evaluateName('Emma',e,['en'],1).status,'verified');
  assert.equal(evaluateName('Emma',e,['en'],2).status,'pending');
  assert.equal(evaluateName('Emma',e,['de'],1).status,'pending');
  assert.equal(evaluateName('Em',e,['en'],1).exact,true);
  assert.equal(evaluateName('Em',e,['en'],1).status,'pending');
  assert.equal(evaluateName('Emm',e,['en'],1).exact,false);
  const shared = {labels:{mul:{value:'Douglas'}}};
  assert.equal(evaluateName('Douglas',shared,['en'],1).status,'verified');
  assert.equal(evaluateName('Douglas',{labels:{mul:{value:'Douglas'},fr:{value:'Douglass'}}},['fr'],1).exact,false);
  assert.deepEqual(wikipediaLinks({sitelinks:{enwiki:{},simplewiki:{},zh_min_nanwiki:{},commonswiki:{},outreachwiki:{},sourceswiki:{},wikidatawiki:{}}}).map(([site]) => site),['enwiki','simplewiki','zh_min_nanwiki']);
  assert.deepEqual(ids({ claims: { P735: [ { rank: 'deprecated', mainsnak: { snaktype: 'value', datavalue: {value:{id:'Q1'}} } } ] } }, 'P735'), []);
});

test('export separates name types/countries, deduplicates people, filters unverified data and unsafe images', () => {
  const base = resolve(tmpdir());
  const directory = mkdtempSync(resolve(base,'namae-details-'));
  const db = openDetails(':memory:');
  try {
    for (const [id,country,type] of [[1,'US','given_name'],[2,'DE','given_name'],[3,'US','surname']]) {
      db.prepare('INSERT INTO names(id,country,name,normalized,type) VALUES (?,?,?,?,?)').run(id,country,'Emma','emma',type);
    }
    for (let i = 1; i <= 6; i++) {
      db.prepare('INSERT INTO entities(id,kind,name,source_url,updated_at,image_url,image_approved) VALUES (?,?,?,?,?,?,?)').run(`Q${i}`,i === 6 ? 'character':'person',`Fixture ${i}`,'https://www.wikidata.org/wiki/Q'+i,'2026-10-15','https://example.com/image.jpg',1);
      db.prepare('INSERT INTO name_entities(name_id,entity_id,country,confidence,status,priority,evidence_json) VALUES (?,?,?,?,?,?,?)').run(1,`Q${i}`,'US',1,i === 4 ? 'pending':'verified',i === 5 ? 100000:0,'{}');
    }
    db.prepare('INSERT INTO name_entities(name_id,entity_id,country,confidence,status,priority,evidence_json) VALUES (?,?,?,?,?,?,?)').run(2,'Q1','DE',1,'verified',0,'{}');
    db.prepare("UPDATE names SET reading_ja='エマ',reading_source='https://www.wikidata.org/wiki/Q541194',reading_status='pending' WHERE id=1").run();
    const manifest = exportDetails(db,directory);
    const key = `US/given_name/${detailBucket('Emma')}`;
    const shard = JSON.parse(readFileSync(resolve(directory,manifest.shards[key].split('/').at(-1)),'utf8'));
    const result = shard.emma;
    assert.equal(result.people.length,3);
    assert.equal(result.people[0].id,'Q5');
    assert.equal(result.people.some((p) => p.id === 'Q4'),false);
    assert.equal(result.people.some((p) => p.image),false);
    assert.equal(result.characters.length,1);
    assert.equal(result.reading,undefined);
    assert.equal(manifest.shards[`US/surname/${detailBucket('Emma')}`],undefined);
    assert.ok(manifest.shards[`DE/given_name/${detailBucket('Emma')}`]);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM entities WHERE id=?').get('Q1').count,1);
    const first = manifest.shards[key];
    db.prepare("UPDATE entities SET image_license='CC BY 4.0',image_credit='Photographer',image_source='https://commons.wikimedia.org/wiki/File:Example' WHERE id='Q5'").run();
    const changed = exportDetails(db,directory);
    assert.notEqual(changed.shards[key],first);
    const updated = JSON.parse(readFileSync(resolve(directory,changed.shards[key].split('/').at(-1)),'utf8'));
    assert.equal(updated.emma.people[0].image.license,'CC BY 4.0');
    assert.ok(readFileSync(resolve(directory,first.split('/').at(-1))));
    assert.throws(() => transaction(db, () => { db.exec("DELETE FROM name_entities"); throw Error('interrupted'); }));
    assert.ok(db.prepare('SELECT COUNT(*) count FROM name_entities').get().count > 0);
  } finally {
    db.close();
    assert.ok(resolve(directory).startsWith(base+sep) && directory.includes('namae-details-'));
    rmSync(directory,{recursive:true,force:true});
  }
});

test('Wikidata client honors retries, Retry-After, maxlag, serial pacing and response reuse', async () => {
  const db = openDetails(':memory:');
  const waits = [], urls = [];
  let calls = 0;
  const client = new Wikidata(db,{agent:'NAMAE test', interval:1000, sleep:async (ms) => { waits.push(ms); }, fetcher:async (url) => {
    urls.push(url); calls++;
    if (calls === 1) return new Response('',{status:429,headers:{'Retry-After':'4'}});
    if (calls === 2) return Response.json({error:{code:'maxlag',info:'lag'}});
    return Response.json({entities:{Q5:{id:'Q5'}}});
  }});
  try {
    assert.ok((await client.entities(['Q5'])).Q5);
    assert.ok((await client.entities(['Q5'])).Q5);
    assert.equal(calls,3);
    assert.ok(waits.includes(4000));
    assert.ok(urls.every((url) => url.includes('maxlag=5')));
    const queries = [];
    client.query = async (value) => { queries.push(value); return []; };
    await client.candidates(['Q123'],'P734','Q30');
    assert.ok(queries.every((q) => q.includes('wdt:P734 wd:Q123')));
    assert.ok(queries.some((q) => q.includes('wdt:P27 wd:Q30')));
    assert.ok(queries.every((q) => q.includes('ORDER BY DESC(?links)')));
    assert.ok(queries.some((q) => q.includes('wd:Q95074')));
    const row = {entity:{value:'http://www.wikidata.org/entity/Q7'},name:{value:'http://www.wikidata.org/entity/Q123'},kind:{value:'person'}};
    client.query = async (value) => { if (value.includes('BIND("character"')) throw Error('character service timeout'); return [row]; };
    const partial = await client.candidates(['Q123'],'P735','Q30');
    assert.equal(partial.length,1);
    assert.equal(partial[0].entity.value,row.entity.value);
    assert.equal(client.warnings[0].stage,'characters');
  } finally { db.close(); }
});

test('snapshot roundtrip preserves relationship IDs and never merges into an existing database', () => {
  const base = resolve(tmpdir());
  const directory = mkdtempSync(resolve(base,'namae-details-backup-'));
  const source = resolve(directory,'source.sqlite'), target = resolve(directory,'target.sqlite');
  const snapshot = resolve(directory,'snapshot.json');
  const script = resolve('scripts/backup-name-details.mjs');
  let db = openDetails(source);
  try {
    db.prepare('INSERT INTO names(id,country,name,normalized,type) VALUES (?,?,?,?,?)').run(7,'US','Emma','emma','given_name');
    db.prepare('INSERT INTO entities(id,kind,name,source_url,updated_at) VALUES (?,?,?,?,?)').run('Q1','person','Fixture','https://www.wikidata.org/wiki/Q1','2026-10-15');
    db.prepare('INSERT INTO name_entities(name_id,entity_id,country,confidence,status,evidence_json) VALUES (?,?,?,?,?,?)').run(7,'Q1','US',1,'verified','{}');
    db.close(); db = undefined;
    execFileSync(process.execPath,[script,'save',snapshot],{env:{...process.env,NAMAE_DETAILS_DB:source}});
    execFileSync(process.execPath,[script,'restore',snapshot],{env:{...process.env,NAMAE_DETAILS_DB:target}});
    db = openDetails(target);
    assert.equal(db.prepare('SELECT name_id FROM name_entities').get().name_id,7);
    db.prepare('UPDATE names SET name=? WHERE id=?').run('Edited Emma',7);
    db.close(); db = undefined;
    execFileSync(process.execPath,[script,'restore',snapshot],{env:{...process.env,NAMAE_DETAILS_DB:target}});
    db = openDetails(target);
    assert.equal(db.prepare('SELECT name FROM names WHERE id=?').get(7).name,'Edited Emma');
  } finally {
    db?.close();
    assert.ok(resolve(directory).startsWith(base+sep) && directory.includes('namae-details-backup-'));
    rmSync(directory,{recursive:true,force:true});
  }
});

test('publication validation withdraws alias-only and unsupported evidence while honoring editorial review', () => {
  const base = resolve(tmpdir());
  const directory = mkdtempSync(resolve(base,'namae-details-validation-'));
  const path = resolve(directory,'details.sqlite');
  let db = openDetails(path);
  try {
    db.prepare('INSERT INTO entities(id,kind,name,source_url,updated_at) VALUES (?,?,?,?,?)').run('Q1','person','Fixture','https://www.wikidata.org/wiki/Q1','2026-10-15');
    for (const [id,name,reviewer,item,matchType] of [[1,'Emma',null,'Q100',undefined],[2,'Em',null,'Q100',undefined],[3,'Em','editor','Q100',undefined],[4,'Legacy',null,'Q404',undefined],[5,'Restored',null,'Q405','label']]) {
      const country = id === 3 ? 'GB' : 'US';
      db.prepare('INSERT INTO names(id,country,name,normalized,type) VALUES (?,?,?,?,?)').run(id,country,name,normalize(name),'given_name');
      db.prepare('INSERT INTO name_entities(name_id,entity_id,country,confidence,status,evidence_json,reviewed_by) VALUES (?,?,?,?,?,?,?)').run(id,'Q1',country,1,'verified',JSON.stringify({nameItem:item,property:'P735',languages:['en'],ambiguousNameItems:[item],matchType}),reviewer);
    }
    db.prepare('INSERT INTO response_cache VALUES (?,?,?)').run('entity:Q100',JSON.stringify({labels:{en:{value:'Emma'}},aliases:{en:[{value:'Em'}]}}),'2026-10-15');
    db.close(); db = undefined;
    execFileSync(process.execPath,[resolve('scripts/validate-name-details.mjs')],{env:{...process.env,NAMAE_DETAILS_DB:path}});
    db = openDetails(path);
    assert.deepEqual(db.prepare('SELECT status FROM name_entities ORDER BY name_id').all().map((r) => r.status),['verified','pending','verified','pending','verified']);
  } finally {
    db?.close();
    assert.ok(resolve(directory).startsWith(base+sep) && directory.includes('namae-details-validation-'));
    rmSync(directory,{recursive:true,force:true});
  }
});
