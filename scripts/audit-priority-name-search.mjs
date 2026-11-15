import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeInputName, referenceLookupBucket, referenceLookupKey } from '../src/lib/reference-lookup.mjs';

const [output] = process.argv.slice(2);
if (!output) throw Error('Usage: node scripts/audit-priority-name-search.mjs <release out directory>');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const ranking = 'data-sources/rankings';
const foreign = join(ranking, 'foreign');
const taiwan = read(join(foreign, 'taiwan-official/given-names-2023.json'));
const taiwanCohorts = read(join(foreign, 'taiwan-official/given-names-by-cohort-2023.json'));
const mainland = read(join(foreign, 'chinese-surnames/given-national-2021.json'));
const groups = [
  ['JP', '2025 survey, written names', read(join(ranking, 'jp-spelling-2025.json')).filter(r => r.sex === 'f').map(r => r.name)],
  ['JP', '2025 survey, readings', read(join(ranking, 'jp-2025.json')).filter(r => r.sex === 'f').map(r => r.yomi)],
  ['CN', '2021 newborn registration', mainland.female.map(([name]) => name)],
  ['KR', '2024 birth registration compilation, first 100', read(join(foreign, 'kr-2024.json')).filter(r => r.gender === 'female' && r.rank <= 100).map(r => r.name)],
  ['TW', '2023 household registration, Table 51', taiwan.female.map(([name]) => name)],
  ['TW', '2023 household registration, Table 56 by birth cohort', taiwanCohorts.female.flatMap(cohort => cohort.names.map(([name]) => name))],
];
const manifest = read(join(output, 'data/manifest.json'));
const files = new Map();
const data = path => {
  if (!files.has(path)) files.set(path, read(join(output, path.slice(1))));
  return files.get(path);
};
const results = groups.map(([country, source, names]) => {
  const { chunks, inputLookup } = manifest.appRankings.find(r => r.country === country && r.type === 'given_name');
  const missing = [];
  const ambiguous = [];
  let found = 0;
  for (const name of new Set(names)) {
    const key = referenceLookupKey(name, 'female');
    const bucket = referenceLookupBucket(key, inputLookup.count);
    const refs = inputLookup.buckets.includes(bucket) ?
      data(`${inputLookup.directory}/${bucket}.json`).entries.filter(([value]) => value === key) : [];
    const matches = refs.flatMap(([, index]) => data(chunks[index].path).records)
      .filter(row => row.gender === 'female' && [row.name, ...(row.aliases ?? [])]
        .some(spelling => normalizeInputName(spelling) === normalizeInputName(name)));
    const exact = matches.filter(row => normalizeInputName(row.name) === normalizeInputName(name));
    const candidates = exact.length ? exact : matches;
    if (candidates.length === 1) found++;
    else if (candidates.length > 1) ambiguous.push(name);
    else missing.push(name);
  }
  return { country, source, checked: new Set(names).size, found, ambiguous, missing };
});
console.log(JSON.stringify({ dataVersion: manifest.dataVersion, gender: 'female', results }, null, 2));
