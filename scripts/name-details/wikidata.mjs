import { createHash } from 'node:crypto';
import { normalize } from './db.mjs';

export const values = (entity, property) => (entity.claims?.[property] ?? [])
  .filter((c) => c.rank !== 'deprecated' && c.mainsnak?.snaktype === 'value')
  .map((c) => c.mainsnak.datavalue?.value).filter(Boolean);
export const ids = (entity, property) => values(entity, property).map((v) => v.id).filter(Boolean);
export const label = (e) => e?.labels?.ja?.value ?? e?.labels?.mul?.value ?? e?.labels?.en?.value ?? Object.values(e?.labels ?? {})[0]?.value ?? e?.id;
export const wikipediaLinks = (e) => Object.entries(e.sitelinks ?? {}).filter(([site]) => /^(?:[a-z]{2,3}|simple|[a-z]{2,3}_[a-z_]+)wiki$/.test(site));
export const literals = (e, languages) => languages.flatMap((l) => [e?.labels?.[l]?.value ?? e?.labels?.mul?.value, ...(e?.aliases?.[l] ?? e?.aliases?.mul ?? []).map((a) => a.value)]).filter(Boolean);
export function primaryGivenName(name, entity, languages) {
  const target=normalize(name);
  return [...languages,'mul'].some(language=>{
    const text=entity?.labels?.[language]?.value;
    if(!text) return false;
    const full=normalize(text);
    const nativeSuffix=/^[\p{Script=Hangul}\p{Script=Han}]+$/u.test(full) && /^[\p{Script=Hangul}\p{Script=Han}]+$/u.test(target) && full.endsWith(target);
    return full===target || full.startsWith(target+' ') || full.startsWith(target+'-') || nativeSuffix;
  });
}
export function compactResponse(data) {
  if (!data.entities) return data;
  const properties = new Set(['P31','P735','P734','P27','P106','P18','P1441','P1080','P1705','P407','P282']);
  for (const entity of Object.values(data.entities)) {
    entity._nameContextVersion=1;
    entity.claims = Object.fromEntries(Object.entries(entity.claims ?? {}).filter(([p]) => properties.has(p)).map(([p,claims]) => [p,claims.map(({id,rank,mainsnak}) => ({id,rank,mainsnak}))]));
  }
  return data;
}
export function evaluateName(name, entity, languages, numberOfMatches) {
  const native=values(entity ?? {},'P1705').filter(value=>value.text);
  const nativeExact=native.some(value=>normalize(value.text)===normalize(name));
  // Allow a sourced Latin transliteration only in the native language context.
  // A Greek name's English display label does not establish an English identity.
  const transliteration=!nativeExact && /^[\p{Script=Latin}\p{M}\s'’‐-]+$/u.test(name) && native.some(value=>languages.includes(value.language)) && normalize(entity?.labels?.en?.value ?? '')===normalize(name);
  if(native.length && !nativeExact && !transliteration) return {exact:false,matchType:'none',status:'pending',confidence:0};
  const exact = literals(entity, languages).some((text) => normalize(text) === normalize(name));
  const primaryLabel = languages.some((language) => {
    const value = entity?.labels?.[language]?.value ?? entity?.labels?.mul?.value;
    return value && normalize(value) === normalize(name);
  });
  return { exact, matchType: primaryLabel ? 'label' : exact ? 'alias' : 'none', status: primaryLabel && numberOfMatches === 1 ? 'verified' : 'pending', confidence: !exact ? 0 : primaryLabel && numberOfMatches === 1 ? 0.98 : numberOfMatches === 1 ? 0.85 : 0.65 };
}
// Prefer positive native-language evidence over translated display labels.
// Equal-strength identities remain ambiguous; no arbitrary QID is selected.
export function resolveNameItems(name, entities, languages, languageIds=[]) {
  const scored=Object.entries(entities).flatMap(([id,entity])=>{
    const match=evaluateName(name,entity,languages,1);
    if(!match.exact) return [];
    const native=values(entity,'P1705').filter(v=>v.text && normalize(v.text)===normalize(name));
    const nativeLanguage=native.some(v=>languages.includes(v.language));
    const declaredLanguage=ids(entity,'P407').some(id=>languageIds.includes(id));
    const score=match.matchType!=='label'?0:nativeLanguage || (native.length && declaredLanguage)?3:native.length?2:1;
    return [{id,score}];
  });
  const best=Math.max(-1,...scored.map(row=>row.score));
  return scored.filter(row=>row.score===best).map(row=>row.id);
}
export function safeUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
export class Wikidata {
  constructor(db, { agent, interval = 1200, ttlDays = 30, retries = 3, fetcher = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
    if (!Number.isFinite(interval) || !Number.isFinite(ttlDays) || ttlDays < 0 || !Number.isInteger(retries) || retries < 0) throw Error('Invalid Wikidata client limits');
    this.db = db; this.agent = agent; this.interval = Math.max(1000, interval); this.ttl = ttlDays * 86400000;
    this.retries = retries; this.fetcher = fetcher; this.sleep = sleep; this.last = 0;
  }
  async request(url, { timeoutMs = 45000, retries = this.retries } = {}) {
    const key = createHash('sha256').update(url).digest('hex');
    const cached = this.db.prepare('SELECT * FROM response_cache WHERE key=?').get(key);
    if (cached && Date.now() - Date.parse(cached.fetched_at) < this.ttl) return JSON.parse(cached.body);
    for (let attempt = 0; ; attempt++) {
      await this.sleep(Math.max(0, this.last + this.interval - Date.now()));
      this.last = Date.now();
      let wait = 2000 * 2 ** attempt;
      try {
        const response = await this.fetcher(url, { headers: { 'User-Agent': this.agent, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) wait = Math.max(wait, /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now());
        if (!response.ok) throw new Error(`Wikidata HTTP ${response.status}`);
        const data = compactResponse(await response.json());
        if (data.error) throw new Error(`Wikidata ${data.error.code}: ${data.error.info}`);
        this.db.prepare('INSERT OR REPLACE INTO response_cache VALUES (?,?,?)').run(key, JSON.stringify(data), new Date().toISOString());
        return data;
      } catch (error) {
        if (attempt >= retries) throw error;
        await this.sleep(wait);
      }
    }
  }
  async query(query, options = { timeoutMs: 20000 }) {
    let data;
    try { data = await this.request(`https://query.wikidata.org/sparql?${new URLSearchParams({ query, format: 'json' })}`, options); }
    catch (error) {
      const stage = query.includes('?code') ? 'country metadata' : query.includes('?term') ? 'name identity' : query.includes('"character"') ? 'characters' : 'people';
      throw new Error(`Wikidata ${stage}: ${String(error)}`, { cause: error });
    }
    return data.results.bindings;
  }
  async entities(items, {nameContext=false}={}) {
    const result = {};
    const unique = [...new Set(items)].filter((id) => /^Q\d+$/.test(id));
    const missing = [];
    for (const id of unique) {
      const cached = this.db.prepare('SELECT * FROM response_cache WHERE key=?').get(`entity:${id}`);
      const body=cached?JSON.parse(cached.body):null;
      if (cached && Date.now() - Date.parse(cached.fetched_at) < this.ttl && (!nameContext || body?._nameContextVersion===1)) result[id] = body;
      else missing.push(id);
    }
    for (let i = 0; i < missing.length; i += 50) {
      const data = await this.request(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: 'wbgetentities', ids: missing.slice(i, i + 50).join('|'), props: nameContext?'claims|labels|aliases|descriptions|sitelinks':'labels|aliases|claims|descriptions|sitelinks', format: 'json', maxlag: '5' })}`);
      Object.assign(result, data.entities);
      for (const [id, body] of Object.entries(data.entities)) this.db.prepare('INSERT OR REPLACE INTO response_cache VALUES (?,?,?)').run(`entity:${id}`, JSON.stringify(body), new Date().toISOString());
    }
    return result;
  }
  async findNames(names, languages, type) {
    // Native labels and aliases only. No substring or transliteration matching.
    const spellings = [...new Set(names.flatMap((n) => [n, n.toLocaleLowerCase('und'), n.toLocaleLowerCase('und').replace(/(^|[\s'-])\p{L}/gu, (s) => s.toLocaleUpperCase('und'))]))];
    const terms = spellings.flatMap((n) => [...new Set([...languages,'mul'])].map((l) => `${JSON.stringify(n)}@${l}`)).join(' ');
    return this.query(`SELECT DISTINCT ?name ?term WHERE { VALUES ?term { ${terms} } { ?name rdfs:label ?term } UNION { ?name skos:altLabel ?term } FILTER EXISTS { ?name wdt:P31/wdt:P279* wd:${type === 'surname' ? 'Q101352' : 'Q202444'} } }`);
  }
  async candidates(nameIds, property, countryId) {
    this.warnings = [];
    if (!nameIds.length) return [];
    const result = [];
    const hasCountry = /^Q\d+$/.test(countryId ?? '');
    const queryFor = (items, kind, local = false) => `SELECT DISTINCT ?entity ?name ?kind WHERE { ${items.map((id) => `{ SELECT ?entity ?name ?kind WHERE { BIND(wd:${id} AS ?name) BIND("${kind}" AS ?kind) ?entity wdt:${property} wd:${id}. ${kind === 'person' ? `?entity wdt:P31 wd:Q5. ${local ? `?entity wdt:P27 wd:${countryId}.` : ''}` : '?entity wdt:P31 ?class. FILTER(?class != wd:Q5) FILTER NOT EXISTS { ?entity wdt:P31 wd:Q5 } ?class wdt:P279* wd:Q95074.'} ?entity wikibase:sitelinks ?links. } ORDER BY DESC(?links) ?entity LIMIT ${kind === 'person' ? 12 : 6} }`).join(' UNION ')} }`;
    // Filter citizenship in the indexed triple pattern. Sorting an EXISTS flag over
    // every Michael/John in Wikidata can time out before LIMIT is applied.
    for (let start = 0; start < nameIds.length; start += 5) {
      const batch = nameIds.slice(start,start + 5);
      const local = hasCountry ? await this.query(queryFor(batch, 'person', true)) : [];
      result.push(...local);
      const fallback = batch.filter((id) => local.filter((row) => row.name.value.endsWith('/'+id)).length < 3);
      if (fallback.length) result.push(...await this.query(queryFor(fallback, 'person')));
      // Character discovery is independent of the supply of matching people.
      try { result.push(...await this.query(queryFor(batch, 'character'), { timeoutMs: 8000, retries: 1 })); }
      catch (error) { this.warnings.push({ stage: 'characters', nameItems: batch, error: String(error) }); }
    }
    return [...new Map(result.map((row) => [`${row.entity.value}/${row.name.value}/${row.kind.value}`,row])).values()];
  }
}
