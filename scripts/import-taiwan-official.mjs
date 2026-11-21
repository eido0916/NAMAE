import { readFileSync } from 'node:fs';
import { writeDataFile } from './write-data-file.mjs';

const folder = 'data-sources/rankings/foreign/taiwan-official/';
const url = 'https://data.gov.tw/dataset/126774';
const groups = new Map();
for (const line of readFileSync(folder + 'surnames-2023.csv', 'utf8').trim().split(/\r?\n/).slice(1)) {
  const [year, rank, name, age, count] = line.split(',');
  if (year !== '112' || !Number.isSafeInteger(Number(count))) throw Error('Unexpected Taiwan CSV row');
  if (!groups.has(name)) groups.set(name, { rank: Number(rank), name, count: 0, ages: new Set() });
  const value = groups.get(name);
  if (value.rank !== Number(rank) || value.ages.has(age)) throw Error('Conflicting surname age groups');
  value.ages.add(age);
  value.count += Number(count);
}
if (groups.size !== 2731 || [...groups.values()].some(row => row.ages.size !== 3)) throw Error('Incomplete Taiwan surname source');
const surnames = [...groups.values()].filter(row => /^[\p{Script=Han}·]+$/u.test(row.name));
const given = JSON.parse(readFileSync(folder + 'given-names-2023.json', 'utf8'));
const common = { country: 'TW', dataYear: 2023, isOfficial: true, isSample: false };
const aliases = new Map();
for (const [filename, type, nativeColumn, latinColumn] of [
  ['popular-forenames-by-country.csv', 'given_name', 10, 11],
  ['popular-surnames-by-country.csv', 'surname', 4, 5],
]) for (const line of readFileSync('data-sources/rankings/foreign/' + filename, 'utf8').split(/\r?\n/)) {
  // Name columns in these retained rows contain neither commas nor quotes.
  if (!line.startsWith('TW,') || line.includes('"')) continue;
  const fields = line.split(',');
  const key = `${type}/${fields[nativeColumn]}`;
  if (!aliases.has(key)) aliases.set(key, new Set());
  if (fields[latinColumn]) aliases.get(key).add(fields[latinColumn]);
}
const datasets = [
  {
    meta: { ...common, type: 'surname', source: '內政部戶政司 — 姓氏排名與人數按三階段年齡分', sourceUrl: url,
      coverageLabel: '2023-06-30 · 全國戶籍人口 / registered population',
      notes: '原表の全国順位を保持し、3年齢階級の人数を合算。異体字は原表どおり別の姓として扱う。全2,731姓のうちUnicode漢字で表現される2,708姓を収録。外字23姓を除外しても順位を詰め直しません。' },
    records: surnames.map(({ name, rank, count }) => ({ country: 'TW', type: 'surname', name, rank, count,
      totalEntries: groups.size, year: 2023, dataYear: 2023, isEstimated: false })),
  },
  {
    meta: { ...common, type: 'given_name', source: '內政部《全國姓名統計分析》表五十一', sourceUrl: given.sourceUrl,
      coverageLabel: '2023-06-30 · 全國戶籍人口 · 男女別 Top 100 / registered population',
      notes: '全人口の男女別「名字」（姓を除く名前）の上位100名。新生児順位・姓名全体の順位ではありません。順位と人数は表五十一の掲載値を保持。同数時も掲載順位を保持します。' },
    records: ['male', 'female'].flatMap(gender => given[gender].map(([name, count], index) => ({ country: 'TW',
      type: 'given_name', gender, name, count, rank: index + 1, totalEntries: 100, year: 2023, dataYear: 2023, isEstimated: false }))),
  },
];
for (const dataset of datasets) {
  for (const record of dataset.records) {
    const values = aliases.get(`${record.type}/${record.name}`);
    if (values?.size) record.aliases = [...values];
  }
  writeDataFile(`src/data/tw/${dataset.meta.type.replace('_', '-')}/onomaverse.json`, JSON.stringify(dataset));
  console.log(`TW/${dataset.meta.type}: ${dataset.records.length} official native names`);
}
const path = 'data-sources/SOURCES.json';
const provenance = JSON.parse(readFileSync(path, 'utf8'));
for (const source of provenance.sources.filter(source => ['onomaverse', 'popular-names-by-country'].includes(source.id)))
  source.datasets = source.datasets.filter(key => !['TW/surname', 'TW/given_name'].includes(key));
provenance.sources = provenance.sources.filter(source => source.id !== 'tw-household-registration-2023');
provenance.sources.push({ id: 'tw-household-registration-2023', name: '內政部戶政司 — 112年全國姓名統計分析',
  url, datasetUrls: [given.sourceUrl], datasets: ['TW/surname', 'TW/given_name'], licenseName: '政府資料開放授權條款-第1版 / published statistical facts',
  licenseUrl: 'https://data.gov.tw/license', redistributionStatus: 'permitted',
  attribution: '來源：內政部戶政司，2023年6月30日。姓氏CSV按年齡階級合計；名字為全國姓名統計分析表五十一及五十六之事實數據。正文及表格圖片不隨應用程式發佈。' });
writeDataFile(path, JSON.stringify(provenance, null, 2) + '\n');
