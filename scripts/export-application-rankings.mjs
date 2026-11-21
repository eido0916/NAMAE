import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { buildApplicationRanking } from './application-ranking.mjs';
import { loadApplicationRankingSources } from './application-ranking-sources.mjs';
import { writeDataFile } from './write-data-file.mjs';
import { referenceLookupBucket, referenceLookupKey } from '../src/lib/reference-lookup.mjs';
import { normalizePinyin } from '../src/lib/chinese-surnames.mjs';
import { loadCoverageTargets } from './application-coverage-targets.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
export function exportAppLookup(outputRoot, entry, records, lookupVersion) {
  const bucketCount = entry.records > 100000 ? 64 : entry.records > 10000 ? 16 : 4;
  const buckets = new Map();
  const offsets = new Map(entry.chunks.map((chunk, index) => [chunk.gender, index]).reverse());
  for (const row of records) {
      const index = offsets.get(row.gender) + Math.floor((row.rank - 1) / 1000);
      const spellings = [row.name, ...(row.aliases ?? [])];
      if (entry.country === 'CN' && entry.type === 'surname') spellings.push(...spellings.map(normalizePinyin));
      for (const spelling of new Set(spellings)) {
        const key = referenceLookupKey(spelling, row.gender);
        const bucket = referenceLookupBucket(key, bucketCount);
        const keys = buckets.get(bucket) ?? new Map();
        const indices = keys.get(key) ?? new Set();
        indices.add(index);
        keys.set(key, indices);
        buckets.set(bucket, keys);
      }
  }
  const directory = `app-lookup/${lookupVersion}/${entry.country.toLowerCase()}/${entry.type}`;
  mkdirSync(join(outputRoot, directory), { recursive: true });
  for (const [bucket, keys] of buckets) {
    const entries = [...keys].flatMap(([key, indices]) => [...indices].map(index => [key, index]));
    writeDataFile(join(outputRoot, directory, bucket + '.json'), JSON.stringify({ country: entry.country, type: entry.type, entries }));
  }
  return { directory: '/data/' + directory, count: bucketCount, buckets: [...buckets.keys()].sort() };
}
export async function exportApplicationRankings(root, outputRoot, manifest, release) {
  const supplements = await loadApplicationRankingSources(root);
  const targetFor = loadCoverageTargets(root);
  const load = entry => {
    if (!entry) return undefined;
    const parts = (entry.path ? [entry] : entry.chunks).map(file => JSON.parse(readFileSync(join(release?.inputRoot ?? outputRoot, file.path.replace('/data/', '')), 'utf8')));
    return { meta: parts[0].meta, records: parts.flatMap(part => part.records) };
  };
  const entries = [];
  const coverage = [];
  const excluded = new Map();
  for (const source of manifest.observedRankings) {
    const primary = manifest.datasets.find(row => row.country === source.country && row.type === source.type);
    const rejected = [];
    const published = load(primary);
    const extra = supplements(source.country, source.type);
    const dataset = buildApplicationRanking(
      published && (!release || release.permits(published.meta.sourceUrl)) ? published : undefined,
      load(source), release ? extra.filter(item => release.permits(item.meta.sourceUrl)) : extra, rejected);
    for (const row of rejected) {
      const key = JSON.stringify([source.country, source.type, row.gender, row.source, row.reason,
        row.reason === 'placeholder' ? row.name : undefined]);
      const group = excluded.get(key) ?? {
        country: source.country, type: source.type, ...(row.gender ? { gender: row.gender } : {}),
        source: row.source, reason: row.reason, ...(row.reason === 'placeholder' ? { name: row.name } : {}), rows: 0,
      };
      group.rows++;
      excluded.set(key, group);
    }
    const chunks = [];
    for (const gender of source.type === 'surname' ? [undefined] : ['male', 'female']) {
      const cohort = dataset.records.filter(row => !gender || row.gender === gender);
      const evidence = {};
      for (const row of cohort) evidence[row.usageEvidence.kind] = (evidence[row.usageEvidence.kind] ?? 0) + 1;
      const target = targetFor(source.country, source.type);
      coverage.push({ country: source.country, type: source.type, ...(gender ? { gender } : {}),
        names: cohort.length, target, shortfall: Math.max(0, target - cohort.length), evidence });
      for (let start = 0; start < Math.max(1, cohort.length); start += 1000) {
        const records = cohort.slice(start, start + 1000);
        const content = JSON.stringify({ meta: dataset.meta, records });
        const sha256 = hash(content);
        const relative = `app/${source.country.toLowerCase()}/${source.type}.${gender ?? 'all'}.${start}.${sha256.slice(0, 12)}.json`;
        const path = join(outputRoot, relative);
        if (!existsSync(path)) {
          mkdirSync(join(outputRoot, 'app', source.country.toLowerCase()), { recursive: true });
          writeDataFile(path, content);
        }
        chunks.push({ path: '/data/' + relative, records: records.length, sha256, bytes: Buffer.byteLength(content),
          ...(gender ? { gender } : {}), minRank: records[0]?.rank ?? 0, maxRank: records.at(-1)?.rank ?? 0 });
      }
    }
    const entry = { country: source.country, type: source.type, records: dataset.records.length, chunks };
    if (release) entry.inputLookup = exportAppLookup(outputRoot, entry, dataset.records, release.version);
    entries.push(entry);
  }
  const reportPath = release ? join(outputRoot, 'coverage.json') : join(root, 'reports/application-ranking-coverage.json');
  writeDataFile(reportPath, JSON.stringify({ populationYear: 2024, coverage, excluded: [...excluded.values()] }, null, 2) + '\n');
  return entries;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.cwd();
  const outputRoot = join(root, 'public/data');
  const manifest = JSON.parse(readFileSync(join(outputRoot, 'manifest.json'), 'utf8'));
  const provenance = JSON.parse(readFileSync(join(root, 'data-sources/SOURCES.json'), 'utf8'));
  for (const { datasets: _datasets, ...source } of provenance.sources) {
    void _datasets;
    if (!manifest.sources.some(entry => entry.id === source.id)) manifest.sources.push(source);
  }
  manifest.appRankings = await exportApplicationRankings(root, outputRoot, manifest);
  const { dataVersion: _oldVersion, ...versioned } = manifest;
  void _oldVersion;
  manifest.dataVersion = hash(JSON.stringify(versioned)).slice(0, 16);
  writeDataFile(join(outputRoot, 'manifest.json'), JSON.stringify(manifest));
  console.log(`Exported ${manifest.appRankings.reduce((n, row) => n + row.records, 0)} application ranking names.`);
}
