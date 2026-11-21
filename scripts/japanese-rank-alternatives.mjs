import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Fill missing output ordinals from retained, published annual surveys. Never
// renumber a name or overwrite its latest input-lookup rank to create a match.
export function buildJapaneseRankAlternatives(source) {
  const latest = new Map();
  for (const row of source.records) {
    if (!['m', 'f'].includes(row.sex) || !Number.isSafeInteger(row.rank) || row.rank < 1 ||
      !Number.isSafeInteger(row.year) || !Number.isSafeInteger(row.totalEntries) || row.totalEntries < row.rank ||
      !/^[ぁ-ゖー]+$/u.test(row.reading)) continue;
    const key = `${row.sex}/${row.rank}`;
    const previous = latest.get(key);
    if (!previous || row.year > previous.year ||
      (row.year === previous.year && row.reading.localeCompare(previous.reading, 'ja') < 0)) latest.set(key, row);
  }
  return {
    meta: { country: 'JP', type: 'given_name', source: source.source, sourceUrl: source.sourceUrl,
      dataYear: Math.max(...[...latest.values()].map(r => r.year)), isOfficial: false, isSample: false,
      notes: '現行データに同順位がない場合だけ、公開された過去年度の同順位を使用。順位の変更・補間は行わず、元の調査年を表示します。' },
    records: [...latest.values()].map(row => ({ country: 'JP', type: 'given_name', name: row.reading,
      gender: row.sex === 'm' ? 'male' : 'female', rank: row.rank, totalEntries: row.totalEntries,
      year: row.year, dataYear: row.year, rankingBasis: 'reading', isEstimated: false })),
  };
}

export function exportJapaneseRankAlternatives(root, output) {
  const source = JSON.parse(readFileSync(join(root, 'data-sources/rankings/jp-baby-calendar.json'), 'utf8'));
  const dataset = buildJapaneseRankAlternatives(source);
  const content = JSON.stringify(dataset);
  const sha256 = createHash('sha256').update(content).digest('hex');
  const filename = `jp-published-reading-ranks.${sha256.slice(0, 12)}.json`;
  writeFileSync(join(output, filename), content);
  return [{ country: 'JP', type: 'given_name', path: `/data/${filename}`, records: dataset.records.length,
    sha256, bytes: Buffer.byteLength(content) }];
}
