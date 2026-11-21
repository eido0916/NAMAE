import { readFileSync } from 'node:fs';
import { isNativeName } from '../src/lib/native-name-policy.mjs';
const manifest = JSON.parse(readFileSync('public/data/manifest.json', 'utf8'));
if (!manifest.observedRankings?.length) throw Error('Public-person datasets missing');
let records = 0;
for (const entry of manifest.observedRankings) {
  const cohorts = new Map();
  for (const chunk of entry.chunks) {
    const data = JSON.parse(readFileSync('public' + chunk.path, 'utf8'));
    if (data.meta.country !== entry.country || data.meta.type !== entry.type || data.meta.rankingScope !== 'public_people' || data.meta.isOfficial)
      throw Error('Public-person metadata mismatch: ' + chunk.path);
    for (const record of data.records) {
      if (!isNativeName(entry.country, record.name) || !record.observation || record.count < 1 || record.rank < 1 || record.isEstimated)
        throw Error('Invalid observed record: ' + chunk.path);
      if (record.gender !== chunk.gender) throw Error('Gender mismatch');
      const key = record.gender ?? 'all';
      if (!cohorts.has(key)) cohorts.set(key, []);
      cohorts.get(key).push(record);
      records++;
    }
  }
  for (const cohort of cohorts.values()) {
    const names = new Set(cohort.map(record => record.name));
    if (names.size !== cohort.length) throw Error('Duplicate observed name');
    const sorted = [...cohort].sort((a, b) => b.count - a.count);
    const ties = new Map();
    for (const record of sorted) ties.set(record.count, (ties.get(record.count) ?? 0) + 1);
    let rank = 0;
    let count = -1;
    sorted.forEach((record, i) => {
      if (record.count !== count) rank = i + 1;
      count = record.count;
      if (record.rank !== rank || record.totalEntries !== sorted.length || record.observation.tiedNames !== ties.get(count) ||
          record.observation.totalPeople !== sorted[0].observation.totalPeople || record.count > record.observation.totalPeople ||
          record.observation.asOf !== sorted[0].observation.asOf) throw Error('Observed cohort counts or competition ranks mismatch: ' + entry.country);
    });
  }
}
console.log(`Verified ${records} native public-person ranks in ${manifest.observedRankings.length} country/type datasets.`);
