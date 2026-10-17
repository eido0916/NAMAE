import { readFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { isNativeName, nativeNameKey } from '../src/lib/native-name-policy.mjs';
import { collectDatasetFiles } from './data-utils.mjs';
import { writeDataFile } from './write-data-file.mjs';
const root = 'data-sources/rankings/foreign/';

const index = new Map();
const wanted = new Set();
const wantedByAlias = new Map();
for (const path of collectDatasetFiles('src/data')) {
  const dataset = JSON.parse(readFileSync(path, 'utf8'));
  for (const record of dataset.records) if (!isNativeName(record.country, record.name) || (/Onomaverse|Popular Names by Country/.test(dataset.meta.source) && /^[\x00-\x7f]+$/.test(record.name)))
    for (const alias of [record.name, ...(record.aliases ?? [])]) {
      wanted.add(record.country + '/' + record.type + '/' + nativeNameKey(alias));
      const key = record.type + '/' + nativeNameKey(alias);
      if (!wantedByAlias.has(key)) wantedByAlias.set(key, new Set());
      wantedByAlias.get(key).add(record.country);
    }
}
function csv(line) {
  const result = []; let value = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (line[i] === ',' && !quoted) { result.push(value); value = ''; }
    else value += line[i];
  }
  result.push(value); return result;
}
function add(country, type, alias, native) {
  if (!alias || !native || !isNativeName(country, native) || native === alias) return;
  const key = `${country}/${type}/${nativeNameKey(alias)}`;
  if (!wanted.has(key)) return;
  if (!index.has(key)) index.set(key, new Set());
  index.get(key).add(native.normalize('NFC').trim());
}
for (const [file, type] of [['popular-forenames-by-country.csv', 'given_name'], ['popular-surnames-by-country.csv', 'surname']]) {
  const [header, ...lines] = readFileSync(root + file, 'utf8').split(/\r?\n/).filter(Boolean).map(csv);
  for (const values of lines) {
    const row = Object.fromEntries(header.map((key, i) => [key, values[i]]));
    add(row.Country, type, row['Romanized Name'], row['Localized Name']);
  }
}
// These are aliases for a named source entry, not phonetic guesses. Keep all
// possible spellings so ambiguous romanizations remain unresolved.
for await (const line of createInterface({input:createReadStream(root + 'onomaverse-name-transliterations.csv', {encoding:'utf8'}), crlfDelay:Infinity})) {
  const [, original, type, , localized] = csv(line);
  if (!['forename', 'surname'].includes(type) || !original || !localized) continue;
  if (!/\p{Script=Latin}/u.test(localized) || /^[\x00-\x7f]+$/.test(original) || original === localized) continue;
  const latinOriginal = /^[\p{Script=Latin}\p{M} .'-]+$/u.test(original);
  const fold = value => nativeNameKey(value).normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i');
  if (latinOriginal && fold(original) !== fold(localized)) continue;
  for (const country of wantedByAlias.get((type === 'forename' ? 'given_name' : 'surname') + '/' + nativeNameKey(localized)) ?? []) add(country, type === 'forename' ? 'given_name' : 'surname', localized, original);
}
const entries = Object.fromEntries([...index].sort(([a], [b]) => a.localeCompare(b)).map(([key, names]) => [key, [...names].sort()]));
writeDataFile('src/data/native-name-index.json', JSON.stringify(entries));
mkdirSync('reports', {recursive:true});
writeDataFile('reports/native-name-index.json', JSON.stringify({sources:['https://github.com/sigpwned/popular-names-by-country-dataset', 'https://onomaverse.com/datasets/name-transliterations'], entries:Object.keys(entries).length, ambiguous:Object.values(entries).filter(names => names.length > 1).length, policy:'Only source-linked spellings; ambiguous mappings are not resolved; no generated transliteration.'}, null, 2));
console.log(`Native name aliases: ${Object.keys(entries).length}; ambiguous aliases remain explicit.`);
