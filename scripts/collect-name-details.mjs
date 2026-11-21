import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { openDetails, normalize, root, transaction } from './name-details/db.mjs';
import { Wikidata, ids, values, label, evaluateName, resolveNameItems, primaryGivenName, wikipediaLinks } from './name-details/wikidata.mjs';

const { values: options } = parseArgs({ options: {
  countries: { type: 'string' }, limit: { type: 'string', default: '500' },
  type: { type: 'string', default: 'given_name' }, 'refresh-days': { type: 'string', default: '30' },
  'max-jobs': { type: 'string' }, 'dry-run': { type: 'boolean' }, pilot: { type: 'boolean' },
  name: { type: 'string' }, 'quiet-report': { type: 'boolean' }, 'refresh-job': { type: 'boolean' },
} });
const limit = options.pilot ? 100 : options.limit === 'all' ? Infinity : Number(options.limit);
const days = Number(options['refresh-days']);
const maxJobs = options['max-jobs'] ? Number(options['max-jobs']) : Infinity;
if (!(limit > 0) || !(days >= 0) || !(maxJobs > 0) || !['given_name', 'surname', 'all'].includes(options.type)) throw Error('Invalid collection options');
const countryConfig = JSON.parse(readFileSync(resolve(root, 'src/data/countries.json'), 'utf8'));
const selected = options.pilot ? ['US', 'FR', 'KR', 'DE'] : options.countries?.split(',').map((c) => c.trim().toUpperCase()) ?? countryConfig.filter((c) => c.enabled && c.code !== 'JP').map((c) => c.code);
if (selected.some((code) => !countryConfig.some((c) => c.code === code))) throw Error('Unknown country');
const db = openDetails(process.env.NAMAE_DETAILS_DB);
db.exec('CREATE TEMP TABLE selected_names (id INTEGER PRIMARY KEY)');
const ranking = new DatabaseSync(resolve(root, 'data/namae.sqlite'), { readOnly: true });
const localeDefaults = { US: 'en', GB: 'en', FR: 'fr', KR: 'ko', DE: 'de', JP: 'ja' };
let metadata = {};
const client = new Wikidata(db, { agent: process.env.WIKIDATA_USER_AGENT, interval: Number(process.env.WIKIDATA_INTERVAL_MS ?? 1200), ttlDays: days });
const preview = [];
if (!options['dry-run'] && !process.env.WIKIDATA_USER_AGENT) throw Error('Set WIKIDATA_USER_AGENT with a project URL and contact before collection.');
// Enqueue before networking: an interrupted or failed run remains inspectable.
for (const country of selected) {
  for (const type of options.type === 'all' ? ['given_name', 'surname'] : [options.type]) {
    const rows = options.name
      ? ranking.prepare('SELECT name,MIN(rank) AS rank FROM ranking_entries WHERE country=? AND type=? AND name=? COLLATE NOCASE GROUP BY name LIMIT 1').all(country,type,options.name)
      : ranking.prepare('SELECT name,MIN(rank) AS rank FROM ranking_entries WHERE country=? AND type=? GROUP BY name ORDER BY rank,name LIMIT ?').all(country, type, Number.isFinite(limit) ? limit : -1);
    // Reference-only countries are supported without inventing ranking positions.
    const references = rows.length ? [] : options.name
      ? ranking.prepare('SELECT DISTINCT name FROM reference_entries WHERE country=? AND type=? AND name=? COLLATE NOCASE LIMIT 1').all(country,type,options.name)
      : ranking.prepare('SELECT DISTINCT name FROM reference_entries WHERE country=? AND type=? ORDER BY name LIMIT ?').all(country, type, Number.isFinite(limit) ? limit : -1);
    if (options['dry-run']) { preview.push({ country, type, names: rows.length + references.length, source: rows.length ? 'rankings' : 'references' }); continue; }
    transaction(db, () => {
      for (const { name } of [...rows, ...references]) {
        db.prepare('INSERT OR IGNORE INTO names(country,name,normalized,type,language) VALUES (?,?,?,?,?)').run(country, name, normalize(name), type, localeDefaults[country] ?? 'und');
        const entry = db.prepare('SELECT id FROM names WHERE country=? AND normalized=? AND type=? ORDER BY id LIMIT 1').get(country, normalize(name), type);
        db.prepare('INSERT OR IGNORE INTO selected_names(id) VALUES (?)').run(entry.id);
        db.prepare("INSERT OR IGNORE INTO collection_jobs(name_id,state,updated_at) VALUES (?,'queued',?)").run(entry.id, new Date().toISOString());
      }
    });
  }
}
ranking.close();
if (options['dry-run']) {
  console.log(JSON.stringify({ countries: selected, limit: Number.isFinite(limit) ? limit : 'all', planned: preview, dryRun: true }, null, 2));
  db.close();
  process.exit(0);
}
const cutoff = new Date(options['refresh-job']?Date.now():Date.now() - days * 86400000).toISOString();
const jobs = db.prepare(`SELECT n.*,j.state FROM names n JOIN selected_names scope ON scope.id=n.id JOIN collection_jobs j ON j.name_id=n.id WHERE n.country IN (${selected.map(() => '?').join(',')}) AND (?='all' OR n.type=?) AND (j.state IN ('queued','error','running') OR j.updated_at<=?) ORDER BY j.attempts,j.updated_at,n.country,n.type,n.id LIMIT ?`).all(...selected, options.type, options.type, cutoff, Number.isFinite(maxJobs) ? maxJobs : -1);
console.log(JSON.stringify({ countries: selected, limit: Number.isFinite(limit) ? limit : 'all', queued: jobs.length, dryRun: !!options['dry-run'] }));
let processed = 0;
let attempted = 0;
let hadErrors = false;
function log(job, state, message, evidence = {}) {
  const now = new Date().toISOString();
  db.prepare('UPDATE collection_jobs SET state=?,updated_at=?,error=?,evidence_json=? WHERE name_id=?').run(state, now, state === 'error' ? message : null, JSON.stringify(evidence), job.id);
  db.prepare('INSERT INTO collection_logs(name_id,state,message,created_at) VALUES (?,?,?,?)').run(job.id, state, message, now);
}
function report() {
  if (options['quiet-report']) return;
  mkdirSync(resolve(root, 'reports'), { recursive: true });
  const summary = selected.map((country) => ({ country, jobs: db.prepare('SELECT j.state,COUNT(*) AS count FROM collection_jobs j JOIN names n ON n.id=j.name_id JOIN selected_names scope ON scope.id=n.id WHERE n.country=? GROUP BY j.state').all(country), relations: db.prepare('SELECT r.status,COUNT(*) AS count FROM name_entities r JOIN names n ON n.id=r.name_id JOIN selected_names scope ON scope.id=n.id WHERE n.country=? GROUP BY r.status').all(country) }));
  writeFileSync(resolve(root, options.pilot ? 'reports/name-details-pilot.json' : 'reports/name-details-collection.json'), JSON.stringify({ updatedAt: new Date().toISOString(), processed, summary, reviewRequired: 'Automatic checks verify the structured name relationship, not every biographical fact. Audit pending/verified candidates before expanding.' }, null, 2) + '\n');
}
if (!options['dry-run']) {
  try {
    const rows = await client.query('SELECT ?country ?code ?language ?languageItem WHERE { ?country wdt:P297 ?code. OPTIONAL { ?country wdt:P37 ?languageItem. ?languageItem wdt:P424 ?language } }');
    for (const row of rows) {
      const item = metadata[row.code.value] ??= { id: row.country.value.split('/').at(-1), languages: [], languageIds: [] };
      if (/^[a-z]{2,3}(-[a-z]+)?$/.test(row.language?.value ?? '') && !item.languages.includes(row.language.value)) item.languages.push(row.language.value);
      const languageId=row.languageItem?.value.split('/').at(-1);
      if(/^Q\d+$/.test(languageId ?? '') && !item.languageIds.includes(languageId)) item.languageIds.push(languageId);
    }
    for (let start = 0; start < jobs.length; start += 10) {
      const batch = jobs.slice(start, start + 10);
      // Keep a batch homogeneous in country/type even when its boundary crosses a country.
      const groups = Map.groupBy(batch, (j) => `${j.country}/${j.type}${['error','running'].includes(j.state) ? `/retry-${j.id}` : ''}`);
      for (const group of groups.values()) {
        for (const job of group) { log(job, 'running', 'Resolving structured name'); db.prepare('UPDATE collection_jobs SET attempts=attempts+1 WHERE name_id=?').run(job.id); }
        try {
          const country = metadata[group[0].country];
          const languages = [...new Set([localeDefaults[group[0].country], ...(country?.languages ?? [])].filter(Boolean))];
          // No guessed locale: preserve unverified names for manual review.
          if (!languages.length) {
            for (const job of group) log(job, 'pending', 'No confirmed country language');
            attempted += group.length; report(); console.log(`${attempted}/${jobs.length} processed`);
            continue;
          }
          // Latin ranking spellings may be a sourced transliteration of a native-script name.
          if(group.some(job=>/^[\p{Script=Latin}\p{M}\s'’‐-]+$/u.test(job.name)) && !languages.includes('en')) languages.push('en');
          const found = await client.findNames(group.map((j) => j.name), languages, group[0].type);
          const nameIds = [...new Set(found.map((r) => r.name.value.split('/').at(-1)))];
          for (const job of group) log(job, 'running', `Loading ${nameIds.length} name item definitions`);
          const nameEntities = await client.entities(nameIds,{nameContext:true});
          const exactNames = new Map(group.map((job) => [job.id, resolveNameItems(job.name,nameEntities,languages,country?.languageIds)]));
          // Ambiguous name identities need review before harvesting hundreds of biographies.
          const unambiguousIds = [...new Set([...exactNames.values()].filter((matches) => matches.length === 1).flat())];
          const property = group[0].type === 'surname' ? 'P734' : 'P735';
          for (const job of group) log(job, 'running', `Searching people and characters for ${unambiguousIds.length} unambiguous name items`);
          const candidates = await client.candidates(unambiguousIds, property, country?.id);
          for (const job of group) log(job, 'running', `Loading ${candidates.length} candidate biographies`);
          const entities = await client.entities(candidates.map((r) => r.entity.value.split('/').at(-1)));
          for (const job of group) log(job, 'running', 'Loading nationality, occupation and name labels');
          const related = await client.entities(Object.values(entities).flatMap((e) => ['P27','P106','P735','P734','P1441','P1080'].flatMap((p) => ids(e, p))));
          for (const job of group) {
            const matches = exactNames.get(job.id);
            transaction(db, () => {
              if (job.language === 'und' && matches.length === 1) {
                const matchedLanguages = languages.filter((language) => evaluateName(job.name,nameEntities[matches[0]],[language],1).exact);
                if (matchedLanguages.length) db.prepare("UPDATE OR IGNORE names SET language=? WHERE id=? AND language='und'").run(matchedLanguages.length === 1 ? matchedLanguages[0] : 'mul',job.id);
              }
              // Withdraw stale automatic matches, preserving explicit editorial decisions.
              db.prepare("UPDATE name_entities SET status='pending' WHERE name_id=? AND reviewed_by IS NULL").run(job.id);
              let count = 0;
              for (const candidate of candidates) {
                const nameId = candidate.name.value.split('/').at(-1);
                if (!matches.includes(nameId)) continue;
                const entityId = candidate.entity.value.split('/').at(-1);
                const e = entities[entityId];
                if (!e || !ids(e, property).includes(nameId)) continue;
                const kind = candidate.kind.value;
                const articleLinks = wikipediaLinks(e);
                const occupations = ids(e, 'P106');
                const evaluation = evaluateName(job.name, nameEntities[nameId], languages, matches.length);
                // A verified relation additionally needs biographical context and an encyclopedia article.
                const status = evaluation.status === 'verified' && articleLinks.length > 0 && (kind === 'character' || occupations.length > 0) ? 'verified' : 'pending';
                const nations = ids(e, 'P27');
                const local = !!country && nations.includes(country.id);
                const primary = job.type==='given_name' && primaryGivenName(job.name,e,languages);
                const wiki = e.sitelinks?.jawiki ? ['ja', e.sitelinks.jawiki] : e.sitelinks?.enwiki ? ['en', e.sitelinks.enwiki] : null;
                const source = wiki ? wiki[1].url ?? `https://${wiki[0]}.wikipedia.org/wiki/${encodeURIComponent(wiki[1].title.replaceAll(' ', '_'))}` : `https://www.wikidata.org/wiki/${entityId}`;
                const image = values(e, 'P18')[0];
                db.prepare(`INSERT INTO entities(id,kind,name,given_names_json,family_names_json,nationalities_json,occupations_json,description,work,image_url,source_url,sitelinks,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,given_names_json=excluded.given_names_json,family_names_json=excluded.family_names_json,nationalities_json=excluded.nationalities_json,occupations_json=excluded.occupations_json,description=excluded.description,work=excluded.work,image_url=excluded.image_url,source_url=excluded.source_url,sitelinks=excluded.sitelinks,updated_at=excluded.updated_at,image_approved=CASE WHEN entities.image_url IS excluded.image_url THEN entities.image_approved ELSE 0 END`).run(entityId, kind, label(e), JSON.stringify(ids(e,'P735').map((id) => ({ id, name: label(related[id]) }))), JSON.stringify(ids(e,'P734').map((id) => ({ id, name: label(related[id]) }))), JSON.stringify(nations.map((id) => ({ id, name: label(related[id]) }))), JSON.stringify(occupations.map((id) => label(related[id]))), e.descriptions?.ja?.value ?? e.descriptions?.en?.value ?? null, [...ids(e,'P1441'), ...ids(e,'P1080')].map((id) => label(related[id])).join(' / ') || null, image ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}?width=240` : null, source, articleLinks.length, new Date().toISOString());
                const evidence = { property, nameItem: nameId, entity: entityId, exact: true, matchType: evaluation.matchType, languages, languageIds:country?.languageIds, nativeLabels:values(nameEntities[nameId],'P1705'), searchedNameItems:nameIds, ambiguousNameItems: matches, localNationality: local, primaryGivenName:primary, wikipediaLanguages: articleLinks.length, method: 'structured-name-v3-native-context', source: `https://www.wikidata.org/wiki/${entityId}#${property}` };
                db.prepare('INSERT INTO name_entities(name_id,entity_id,country,confidence,status,priority,evidence_json) VALUES (?,?,?,?,?,?,?) ON CONFLICT(name_id,entity_id) DO UPDATE SET confidence=excluded.confidence,status=CASE WHEN name_entities.reviewed_by IS NULL THEN excluded.status ELSE name_entities.status END,priority=excluded.priority,evidence_json=excluded.evidence_json WHERE name_entities.reviewed_by IS NULL').run(job.id, entityId, job.country, evaluation.confidence, status, (local ? 100000 : 0) + (primary?10000:0) + Math.min(articleLinks.length,999), JSON.stringify(evidence));
                count++;
              }
              // The Japanese label of the *name item*, never a person's full name.
              const reading = matches.length === 1 ? nameEntities[matches[0]]?.labels?.ja?.value : undefined;
              if (reading && /^[ァ-ヺー・ ]+$/u.test(reading)) {
                db.prepare("UPDATE names SET reading_ja=?,reading_source=?,reading_status='pending' WHERE id=? AND reading_source IS NULL").run(reading, `https://www.wikidata.org/wiki/${matches[0]}`, job.id);
              }
              const warnings = (client.warnings ?? []).filter((warning) => warning.nameItems.some((id) => matches.includes(id)));
              log(job, matches.length > 1 ? 'pending' : count ? 'complete' : warnings.length ? 'error' : 'missing', matches.length > 1 ? 'Ambiguous name items: review identity before collecting biographies' : count ? `${count} structured candidates` : warnings.length ? 'Character collection failed' : 'No exact structured candidate', { identityVersion:3, nameItems: matches, identityConfidence: matches.length === 1 ? 0.98 : matches.length ? 0.65 : 0, candidates: count, warnings });
              if (warnings.length) db.prepare('INSERT INTO collection_logs(name_id,state,message,created_at) VALUES (?,?,?,?)').run(job.id,'warning',JSON.stringify(warnings),new Date().toISOString());
            });
            processed++;
          }
        } catch (error) { hadErrors = true; for (const job of group) log(job, 'error', String(error)); }
        attempted += group.length;
        report();
        console.log(`${attempted}/${jobs.length} processed`);
      }
    }
  } catch (error) { for (const job of jobs) log(job, 'error', String(error)); process.exitCode = 1; }
}
report();
if (hadErrors) process.exitCode = 1;
db.close();
