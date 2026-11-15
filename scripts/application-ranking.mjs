import { nativeNameKey } from '../src/lib/native-name-policy.mjs';
import { isRankingPlaceholder, isUsableRankingAlias, isUsableRankingName } from '../src/lib/ranking-name-quality.mjs';

export function primaryUsageEvidence(row, meta) {
  if (meta.isSample || meta.source.includes('Popular Names by Country')) return;
  if (meta.country === 'JP' && meta.type === 'given_name') {
    if (row.rankingBasis === 'overall' && !row.isEstimated && row.year > 0) return 'published';
    return;
  }
  if (meta.source.includes('Onomaverse') && !meta.isOfficial)
    return row.count > 0 ? 'country_frequency' : undefined;
  if (meta.isOfficial || meta.source === 'Beliebte Vornamen Top 500') {
    if (!row.isEstimated) return 'published';
  }
  if (row.count > 0) return 'country_frequency';
}

export function buildApplicationRanking(primary, observed, supplements = [], rejected = []) {
  const meta = primary?.meta ?? observed.meta;
  const records = [];
  for (const gender of meta.type === 'surname' ? [undefined] : ['male', 'female']) {
    const all = new Map();
    const add = (row, evidence, source, published = false) => {
      if (meta.type === 'given_name' && row.gender !== gender) return;
      const name = row.name;
      if (!isUsableRankingName(meta.country, name, meta.type)) {
        rejected.push({ name, ...(gender ? { gender } : {}), source: source.source,
          reason: isRankingPlaceholder(name, meta.country, meta.type) ? 'placeholder' : 'invalid_display_name' });
        return;
      }
      const key = nativeNameKey(name);
      const aliases = (row.aliases ?? []).filter(alias => alias !== name && isUsableRankingAlias(meta.country, alias, meta.type));
      if (all.has(key)) {
        const existing = all.get(key);
        if (aliases.length) existing.aliases = [...new Set([...(existing.aliases ?? []), ...aliases])];
        return;
      }
      const { observation: _observation, aliases: _aliases, ...record } = row;
      void _observation;
      void _aliases;
      all.set(key, { ...record, country: meta.country, type: meta.type, name, ...(aliases.length ? { aliases } : {}), published,
        usageEvidence: { kind: evidence, source: source.source, ...(source.sourceUrl ? { url: source.sourceUrl } : {}) } });
    };
    const original = (primary?.records ?? []).filter(row => meta.type === 'surname' || row.gender === gender);
    const eligible = original.flatMap(row => {
      const evidence = primaryUsageEvidence(row, primary.meta);
      return evidence ? [{ row, evidence }] : [];
    });
    const latestYear = eligible.reduce((latest, { row }) => Math.max(latest, row.year ?? 0), 0);
    const preferred = eligible.filter(({ row }) => meta.type === 'surname' || meta.country === 'JP' || (row.year ?? 0) === latestYear)
      .sort((a, b) => a.row.rank - b.row.rank);
    const publishedSupplements = supplements.filter(dataset => dataset.kind === 'published');
    const prioritizeSupplement = publishedSupplements.length > 0 && !eligible.some(({ evidence }) => evidence === 'published');
    const addPublishedSupplements = () => {
      for (const dataset of publishedSupplements)
        for (const row of dataset.records) add(row, dataset.kind, dataset.meta);
    };
    if (prioritizeSupplement) addPublishedSupplements();
    const primarySource = meta.country === 'JP'
      ? meta.type === 'surname'
        ? { source: 'Japanese Personal Name Dataset — surname frequencies', sourceUrl: 'https://github.com/shuheilocale/japanese-personal-name-dataset' }
        : { source: 'ベビーカレンダー・明治安田 名前調査', sourceUrl: '/sources/' }
      : primary?.meta;
    for (const { row, evidence } of preferred) add(row, evidence, primarySource, !prioritizeSupplement);
    for (const { row, evidence } of eligible) add(row, evidence, primarySource);
    if (!prioritizeSupplement) addPublishedSupplements();
    const observedSource = observed && { source: observed.meta.source, sourceUrl: 'https://www.wikidata.org/wiki/Wikidata:Data_access' };
    for (const row of observed?.records ?? []) {
      if (row.observation && row.count > 0)
        add(row, 'public_people', observedSource);
    }
    for (const dataset of supplements.filter(dataset => dataset.kind === 'country_association'))
      for (const row of dataset.records) add(row, dataset.kind, dataset.meta);
    for (const dataset of supplements.filter(dataset => dataset.kind === 'name_corpus'))
      for (const row of dataset.records) add(row, dataset.kind, dataset.meta);
    const values = [...all.values()];
    const slots = new Map();
    const waiting = [];
    for (const row of values) {
      if (row.published && Number.isSafeInteger(row.rank) && row.rank > 0 && row.rank <= values.length && !slots.has(row.rank)) slots.set(row.rank, row);
      else waiting.push(row);
    }
    let next = 0;
    for (let rank = 1; rank <= values.length; rank++) {
      const kept = slots.has(rank);
      const row = slots.get(rank) ?? waiting[next++];
      const { published: _published, ...record } = row;
      void _published;
      records.push({ ...record, rank, totalEntries: values.length, isEstimated: !kept || !!row.isEstimated, applicationRank: true });
    }
  }
  // Common Korean surnames also accept their established Hanja spellings.
  if (meta.country === 'KR' && meta.type === 'surname') for (const [name, aliases] of [['김', ['金', 'Kim']], ['이', ['李', 'Lee', 'Yi']], ['박', ['朴', 'Park', 'Bak']]]) {
    const record = records.find(row => row.name === name);
    if (record) record.aliases = [...new Set([...(record.aliases ?? []), ...aliases])];
  }
  return { meta: { country: meta.country, type: meta.type, source: 'NAMAE', dataYear: meta.dataYear,
    rankingScope: 'app', isOfficial: false, isSample: false,
    notes: '国・地域別の統計と使用記録に基づくアプリ内順位です。公表順位のほか、資料を統合した順位を含みます。出典とクレジット: /sources.' }, records };
}
