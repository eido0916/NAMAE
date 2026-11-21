import { isNativeName } from '../src/lib/native-name-policy.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { observedLabelLanguages, observedNativeLabel } from './observed-native-labels.mjs';
import { writeDataFile } from './write-data-file.mjs';

const folder = 'data-sources/rankings/foreign/observed-name-rankings/';
const path = folder + 'native-labels.json.gz';
const existing = JSON.parse(gunzipSync(readFileSync('data-sources/rankings/foreign/wikidata-country-names/entity-labels.json.gz'))).labels;
const cache = existsSync(path) ? JSON.parse(gunzipSync(readFileSync(path))) : { labels: {} };
const countries = JSON.parse(readFileSync('src/data/countries.json', 'utf8')).filter(country => country.enabled);
const wanted = new Map();
const languages = new Set();
for (const country of countries) {
  if (isNativeName(country.code, 'LatinAlias')) continue;
  const native = observedLabelLanguages(country.code).filter(language => language !== 'en');
  for (const language of native) languages.add(language);
  for (const type of ['given_name', 'surname']) {
    const source = JSON.parse(gunzipSync(readFileSync(folder + country.code + '-' + type + '.json.gz')));
    for (const row of source.bindings) {
      const id = row.name?.value?.split('/').at(-1);
      if (!/^Q\d+$/.test(id ?? '')) continue;
      if (observedNativeLabel(country.code, type, { ...(existing[id] ?? {}), ...(cache.labels[id] ?? {}) })) continue;
      for (const language of native) if (!Object.hasOwn(cache.labels[id] ?? existing[id] ?? {}, language)) {
        if (!wanted.has(id)) wanted.set(id, new Set());
        wanted.get(id).add(language);
      }
    }
  }
}
const ids = [...wanted.keys()].sort();
console.log(`Native labels: ${ids.length} entities, ${languages.size} languages to check.`);
for (let start = 0; start < ids.length; start += 500) {
  const batch = ids.slice(start, start + 500);
  const query = `SELECT ?name ?label WHERE { VALUES ?name { ${batch.map(id => 'wd:' + id).join(' ')} } ?name rdfs:label ?label FILTER(LANG(?label) IN (${[...languages].map(language => '"' + language + '"').join(',')})) }`;
  let bindings;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch('https://query.wikidata.org/sparql', { method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/sparql-results+json', 'user-agent': 'NAMAE/1.0 (+https://github.com/eido0916/NAMAE)' },
        body: new URLSearchParams({ query }), signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw Error(`Wikidata HTTP ${response.status}`);
      const result = await response.json();
      if (!Array.isArray(result.results?.bindings)) throw Error('Incomplete native label response');
      bindings = result.results.bindings;
      break;
    } catch (error) {
      console.log(`Native batch ${start}, attempt ${attempt + 1}: ${String(error).slice(0, 140)}`);
      if (attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  for (const id of batch) {
    cache.labels[id] = { ...(existing[id] ?? {}), ...(cache.labels[id] ?? {}) };
    for (const language of languages) cache.labels[id][language] ??= null;
  }
  for (const row of bindings) cache.labels[row.name.value.split('/').at(-1)][row.label['xml:lang']] = row.label.value;
  cache.retrievedAt = new Date().toISOString();
  writeDataFile(path, gzipSync(JSON.stringify(cache)));
  const hash = createHash('sha256').update(query).digest('hex').slice(0, 16);
  writeDataFile(folder + 'native-labels-' + hash + '.json.gz', gzipSync(JSON.stringify({ retrievedAt: cache.retrievedAt, query, bindings })));
  console.log(`Native labels checked: ${Math.min(start + 500, ids.length)}/${ids.length}`);
  await new Promise(resolve => setTimeout(resolve, 1000));
}
