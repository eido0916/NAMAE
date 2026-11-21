import { isNativeName } from '../src/lib/native-name-policy.mjs';

// These ordinals were calculated from distinct people by the collector. Keep
// ties and gaps even when a spelling cannot be displayed in the local script.
export function buildObservedDataset(meta, rows) {
  const records = [];
  const seen = new Set();
  const cohorts = new Map();
  for (const row of rows) {
    const evidence = row.evidenceRank;
    if (!evidence || evidence.scope !== 'public_people' || evidence.method !== 'competition') continue;
    if (meta.type === 'given_name' && !['male', 'female'].includes(row.gender)) continue;
    if (!isNativeName(meta.country, row.name)) continue;
    if (![evidence.rank, evidence.totalNames, evidence.observedPeople, evidence.totalPeople, evidence.tiedNames].every(n => Number.isSafeInteger(n) && n > 0) ||
        evidence.rank > evidence.totalNames || evidence.observedPeople > evidence.totalPeople || !/^\d{4}-\d{2}-\d{2}$/.test(evidence.asOf)) throw Error('Invalid observed ranking');
    const gender = meta.type === 'surname' ? undefined : row.gender;
    const cohortKey = gender ?? 'all';
    const signature = JSON.stringify([evidence.totalNames, evidence.totalPeople, evidence.asOf, evidence.sourceId]);
    if (cohorts.has(cohortKey) && cohorts.get(cohortKey) !== signature) throw Error(`Mixed observed cohorts: ${meta.country}/${meta.type}/${cohortKey}`);
    cohorts.set(cohortKey, signature);
    const key = `${cohortKey}/${row.name}`;
    if (seen.has(key)) throw Error(`Duplicate observed spelling: ${key}`);
    seen.add(key);
    records.push({ country: meta.country, type: meta.type, name: row.name, ...(gender ? { gender } : {}),
      rank: evidence.rank, totalEntries: evidence.totalNames, count: evidence.observedPeople,
      observation: { totalPeople: evidence.totalPeople, tiedNames: evidence.tiedNames, asOf: evidence.asOf, sourceId: evidence.sourceId } });
  }
  records.sort((a, b) => (a.gender ?? '').localeCompare(b.gender ?? '') || a.rank - b.rank || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const dates = [...new Set(records.map(record => record.observation.asOf))].sort();
  return {
    meta: { country: meta.country, type: meta.type, source: 'Wikidata — observed people with recorded names',
      sourceUrl: meta.evidenceRanking?.sourceUrl ?? 'https://www.wikidata.org/wiki/Wikidata:Data_access',
      dataYear: dates.length ? Number(dates.at(-1).slice(0, 4)) : meta.dataYear,
      isOfficial: false, isSample: false, rankingScope: 'public_people',
      coverageLabel: '公開人物データ内 / Public people · ' + (dates.join(' / ') || 'No observations'),
      notes: '国籍・出生地・居住地のうち原本クエリが指定する関係を持ち、名/姓が明示された人物をIDで重複除外して集計。同人数は同順位（1,1,3方式）。名は男女別、姓は男女合計。名前の項目IDに紐づく現地語ラベルが確認できる名前を集計対象とします。原本に対応がない読みや綴りは生成しません。一般人口や出生の順位・割合ではありません。Wikidataの記載対象には偏りがあり、国ごとに収録状況が異なります。CC0. Public people only, not population or birth statistics. Source-linked native labels define the cohort. Rank is calculated from distinct observed people after native-label grouping; no generated transliterations.' },
    records,
  };
}
