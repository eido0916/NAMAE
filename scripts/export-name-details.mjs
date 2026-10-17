import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDetails, root } from './name-details/db.mjs';
import { safeUrl } from './name-details/wikidata.mjs';
import { detailKey, detailBucket } from '../src/lib/name-detail-key.mjs';
import { localizeDetailEntity } from './name-details/localize.mjs';
import { countryLanguage } from '../src/lib/country-locale.mjs';

function detailsForRow(db, name) {
    const people = [], characters = [];
    let relations = db.prepare("SELECT e.*,r.confidence,r.evidence_json,r.reviewed_by FROM name_entities r JOIN entities e ON e.id=r.entity_id WHERE r.name_id=? AND r.status='verified' ORDER BY r.priority DESC,e.sitelinks DESC,e.id").all(name.id);
    if(name.type==='given_name' && relations.some(e=>e.kind==='person' && JSON.parse(e.evidence_json).primaryGivenName)) relations=relations.filter(e=>e.kind!=='person' || e.reviewed_by || JSON.parse(e.evidence_json).primaryGivenName);
    for (const e of relations) {
      if (!safeUrl(e.source_url)) continue;
      const list = e.kind === 'character' ? characters : people;
      if (list.length >= 3 || list.some((item) => item.id === e.id)) continue;
      const image = e.image_approved && e.image_license && e.image_credit && safeUrl(e.image_source) && safeUrl(e.image_url)
        ? { url: e.image_url, license: e.image_license, credit: e.image_credit, source: e.image_source } : undefined;
      const proof = JSON.parse(e.evidence_json);
      const registeredNames = JSON.parse(name.type === 'surname' ? e.family_names_json : e.given_names_json).map((n) => n.id === proof.nameItem ? name.name : n.name).filter(Boolean);
      const cache = new Map();
      const localizations = Object.fromEntries(['US','KR','FR','DE','IT','ES','PT','BR','CN','TW','NL','SE','DK','NO','FI','PL','RU','TR'].map(code => [countryLanguage(code), localizeDetailEntity(db, e, code, registeredNames, name.type, cache)]));
      const localized = localizations[countryLanguage(name.country)] ?? localizeDetailEntity(db, e, name.country, registeredNames, name.type, cache);
      list.push({ id: e.id, name: e.name, registeredNames, nationalities: JSON.parse(e.nationalities_json).map((n) => n.name), occupations: JSON.parse(e.occupations_json), description: e.description, work: e.work, source: e.source_url, wikidata: /^Q\d+$/.test(e.id) ? `https://www.wikidata.org/wiki/${e.id}` : undefined, updatedAt: e.updated_at, confidence: e.confidence, image, localized, localizations });
    }
    const reading = name.reading_status === 'verified' && safeUrl(name.reading_source) ? { text: name.reading_ja, source: name.reading_source } : undefined;
    return { reading, people, characters };
}

export function readNameDetails(db, country, type, text) {
  const rows=db.prepare('SELECT * FROM names WHERE country=? AND type=? AND normalized=? ORDER BY id').all(country,type,detailKey(text));
  const result={people:[],characters:[]};
  const readings=new Map();
  for (const row of rows) {
    const detail=detailsForRow(db,row);
    if (detail.reading) readings.set(detail.reading.text,detail.reading);
    result.people=[...new Map([...result.people,...detail.people].map(e=>[e.id,e])).values()].slice(0,3);
    result.characters=[...new Map([...result.characters,...detail.characters].map(e=>[e.id,e])).values()].slice(0,3);
  }
  if (readings.size===1) result.reading=[...readings.values()][0];
  return result;
}

export function exportDetails(db, output) {
  mkdirSync(output, { recursive: true });
  const shards = new Map();
  const nameQuery = db.prepare('SELECT * FROM names ORDER BY id');
  const nameRows = typeof nameQuery.iterate === 'function' ? nameQuery.iterate() : nameQuery.all();
  for (const name of nameRows) {
    const {reading,people,characters}=detailsForRow(db,name);
    if (!people.length && !characters.length && !reading) continue;
    const shardKey = `${name.country}/${name.type}/${detailBucket(name.name)}`;
    const shard = shards.get(shardKey) ?? {};
    const key = detailKey(name.name);
    // Multiple language records must never silently overwrite a different reading.
    if (shard[key]) {
      const old = shard[key];
      if (old.reading?.text !== reading?.text) old.reading = undefined;
      old.people = [...new Map([...old.people, ...people].map((e) => [e.id, e])).values()].slice(0, 3);
      old.characters = [...new Map([...old.characters, ...characters].map((e) => [e.id, e])).values()].slice(0, 3);
    } else shard[key] = { reading, people, characters };
    shards.set(shardKey, shard);
  }
  const manifest = { version: 1, shards: {} };
  for (const [key, payload] of shards) {
    const json = JSON.stringify(payload);
    const hash = createHash('sha256').update(json).digest('hex').slice(0, 16);
    const file = `${key.replaceAll('/', '-')}.${hash}.json`;
    writeFileSync(resolve(output, file), json + '\n');
    manifest.shards[key] = `/data/name-details/${file}`;
  }
  // Publish manifest last. Keep old hashed shards for clients holding the previous manifest.
  writeFileSync(resolve(output, 'manifest.json.tmp'), JSON.stringify(manifest) + '\n');
  renameSync(resolve(output, 'manifest.json.tmp'), resolve(output, 'manifest.json'));
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const db = openDetails(process.env.NAMAE_DETAILS_DB);
  db.exec('BEGIN');
  const manifest = exportDetails(db, resolve(root, 'public/data/name-details'));
  db.exec('COMMIT');
  db.close();
  console.log(`Exported ${Object.keys(manifest.shards).length} name detail shards (verified only).`);
}
