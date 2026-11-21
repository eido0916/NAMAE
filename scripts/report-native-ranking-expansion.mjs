import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { collectDatasetFiles } from './data-utils.mjs';
import { writeDataFile } from './write-data-file.mjs';
import { isNativeName, nativeNameKey, resolveNativeName } from '../src/lib/native-name-policy.mjs';

const baseline = JSON.parse(readFileSync('reports/native-ranking-expansion-before.json', 'utf8'));
const index = JSON.parse(readFileSync('src/data/native-name-index.json', 'utf8'));
const selected = new Map(baseline.rows.map(row => [`${row.country}/${row.type}`, row.counts]));
const rows = [];
for (const path of collectDatasetFiles('src/data')) {
  const key = `${basename(dirname(dirname(path))).toUpperCase()}/${basename(dirname(path)).replace('-', '_')}`;
  if (!selected.has(key)) continue;
  const dataset = JSON.parse(readFileSync(path, 'utf8'));
  const names = { male: new Set(), female: new Set(), surname: new Set() };
  for (const record of dataset.records) {
    if (!(record.count > 0)) continue;
    const name = resolveNativeName(record, index);
    if (name && isNativeName(record.country, name))
      names[record.type === 'surname' ? 'surname' : record.gender]?.add(nativeNameKey(name));
  }
  const after = Object.fromEntries(Object.entries(names).map(([group, values]) => [group, values.size]));
  const before = selected.get(key);
  const delta = Object.fromEntries(Object.keys(after).map(group => [group, after[group] - before[group]]));
  rows.push({ country: dataset.meta.country, type: dataset.meta.type, before, after, delta, source: dataset.meta.sourceUrl });
}
rows.sort((a, b) => `${a.country}/${a.type}`.localeCompare(`${b.country}/${b.type}`));
const sum = (values) => Object.values(values).reduce((total, value) => total + value, 0);
const improved = rows.filter(row => sum(row.delta) > 0);
const report = {
  policy: 'Distinct native spellings with positive source frequency counts. Given names count separately for each gender. No dictionary positions or public-person observations are promoted to population ranks. National sources retain priority.',
  countriesExpanded: new Set(improved.map(row => row.country)).size,
  categoriesExpanded: improved.length,
  addedGivenNames: rows.filter(row => row.type === 'given_name').reduce((total, row) => total + sum(row.delta), 0),
  addedSurnames: rows.filter(row => row.type === 'surname').reduce((total, row) => total + sum(row.delta), 0),
  rows,
};
writeDataFile('reports/native-ranking-expansion.json', JSON.stringify(report, null, 2) + '\n');
writeDataFile('reports/native-ranking-expansion.md', '# 現地表記の順位データ拡充\n\n原データに記録された現地表記を取り込み、検索用のローマ字表記を保持します。人数のある順位データだけを比較し、辞書項目には順位を付けません。名は男女別の収録単位、姓は姓別の件数です。中国などの国の公表データは優先して保持します。\n\n' +
  `拡充：${report.countriesExpanded}か国、${report.categoriesExpanded}区分。名：+${report.addedGivenNames.toLocaleString('ja-JP')}件、姓：+${report.addedSurnames.toLocaleString('ja-JP')}件。\n\n` +
  '|国|区分|変更前|変更後|増加|\n|---|---|---:|---:|---:|\n' + improved.map(row => `|${row.country}|${row.type === 'surname' ? '姓' : '名（男女別）'}|${sum(row.before)}|${sum(row.after)}|+${sum(row.delta)}|`).join('\n') + '\n\n出典：Onomaverse Global Name Frequency / Surname Frequency（CC BY 4.0）および台湾內政部戶政司の2023年公式統計。出典別URLと件数は同名JSONを参照。資料ごとの対象・年度・順位を保持します。\n');
console.log(JSON.stringify({ countriesExpanded: report.countriesExpanded, addedGivenNames: report.addedGivenNames, addedSurnames: report.addedSurnames }));
