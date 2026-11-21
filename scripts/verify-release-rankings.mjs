import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nativeNameKey } from '../src/lib/native-name-policy.mjs';
import { isUsableRankingAlias, isUsableRankingName } from '../src/lib/ranking-name-quality.mjs';
import { normalizePinyin } from '../src/lib/chinese-surnames.mjs';
import { referenceLookupBucket, referenceLookupKey } from '../src/lib/reference-lookup.mjs';

const evidenceKinds = new Set(['published', 'country_frequency', 'public_people', 'country_association', 'name_corpus']);

export function verifyReleaseRankings(outputRoot, appRankings, permits) {
  const countries = new Map();
  const read = path => readFileSync(join(outputRoot, path.slice('/data/'.length)));
  for (const entry of appRankings) {
    const { country, type, chunks, inputLookup: lookup } = entry;
    const scope = `${country}/${type}`;
    const cohortCounts = new Map();
    for (const chunk of chunks) cohortCounts.set(chunk.gender, (cohortCounts.get(chunk.gender) ?? 0) + chunk.records);
    const names = new Set();
    const expectedLookup = new Set();
    const ranks = new Map();
    const sources = new Set();
    let aliases = 0;
    for (const [index, chunk] of chunks.entries()) {
      const file = read(chunk.path);
      if (file.length !== chunk.bytes || createHash('sha256').update(file).digest('hex') !== chunk.sha256)
        throw Error(`Invalid release chunk: ${chunk.path}`);
      const { meta, records } = JSON.parse(file);
      if (meta.country !== country || meta.type !== type || records.length !== chunk.records ||
        (records[0]?.rank ?? 0) !== chunk.minRank || (records.at(-1)?.rank ?? 0) !== chunk.maxRank)
        throw Error(`Invalid release chunk metadata: ${chunk.path}`);
      for (const row of records) {
        const { name, gender, usageEvidence: evidence } = row;
        const rank = (ranks.get(gender) ?? 0) + 1;
        const key = `${gender ?? ''}|${nativeNameKey(name)}`;
        if (row.country !== country || row.type !== type || gender !== chunk.gender || row.rank !== rank ||
          row.totalEntries !== cohortCounts.get(gender) || names.has(key) ||
          !isUsableRankingName(country, name, type) || !evidenceKinds.has(evidence?.kind) ||
          !evidence.source || !permits(evidence.url) ||
          (['country_frequency', 'public_people'].includes(evidence.kind) && !(row.count > 0)))
          throw Error(`Unverified release row: ${scope}/${name}`);
        ranks.set(gender, rank);
        names.add(key);
        sources.add(evidence.source);
        const alternate = row.aliases ?? [];
        if (!alternate.every(alias => isUsableRankingAlias(country, alias, type)))
          throw Error(`Unverified release alias: ${scope}/${name}`);
        aliases += alternate.length;
        const spellings = [name, ...alternate];
        if (country === 'CN' && type === 'surname') spellings.push(...spellings.map(normalizePinyin));
        for (const spelling of spellings) expectedLookup.add(referenceLookupKey(spelling, gender) + '\0' + index);
      }
    }
    if (names.size !== entry.records || !lookup) throw Error(`Incorrect release coverage: ${scope}`);
    const lookupEntries = expectedLookup.size;
    for (const bucket of lookup.buckets) {
      const file = JSON.parse(read(`${lookup.directory}/${bucket}.json`));
      if (file.country !== country || file.type !== type) throw Error(`Invalid search metadata: ${scope}/${bucket}`);
      for (const [key, index] of file.entries) {
        if (referenceLookupBucket(key, lookup.count) !== bucket || !expectedLookup.delete(key + '\0' + index))
          throw Error(`Unexpected search entry: ${scope}/${key}`);
      }
    }
    if (expectedLookup.size) throw Error(`Missing search entries: ${scope}: ${expectedLookup.size}`);
    const report = countries.get(country) ?? { country, rankings: [] };
    report.rankings.push({ type, records: names.size, aliases, lookupEntries, sources: [...sources].sort() });
    countries.set(country, report);
  }
  return [...countries.values()];
}
