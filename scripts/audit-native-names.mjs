import { readFileSync } from 'node:fs';
import { collectDatasetFiles } from './data-utils.mjs';
import { isNativeName, resolveNativeName } from '../src/lib/native-name-policy.mjs';
import { writeDataFile } from './write-data-file.mjs';
const index = JSON.parse(readFileSync('src/data/native-name-index.json', 'utf8'));
const catalog = JSON.parse(readFileSync('src/data/countries.json', 'utf8')).filter(c => c.enabled);
const rows = catalog.map(c => ({country:c.code,name:c.nameJa,given_name:{total:0,native:0,unresolved:0,examples:[]},surname:{total:0,native:0,unresolved:0,examples:[]}}));
for (const file of collectDatasetFiles('src/data')) {
  const {meta,records} = JSON.parse(readFileSync(file, 'utf8'));
  const row = rows.find(r => r.country === meta.country)?.[meta.type];
  if (!row) continue;
  for (const record of records) {
    row.total++;
    const name = resolveNativeName(record, index);
    if (name && isNativeName(meta.country, name)) { row.native++; if (row.examples.length < 3 && !row.examples.includes(name)) row.examples.push(name); }
    else row.unresolved++;
  }
}
writeDataFile('reports/native-name-audit.json', JSON.stringify({policy:'All enabled countries. Source-linked native spellings only. Unresolved spellings excluded from output, never guessed or reranked.',countries:rows}, null, 2));
writeDataFile('reports/native-name-audit.md', '# 国別の現地表記監査\n\n順位データと補完辞書の原本を変更せず、出典で対応を確認できる現地表記を表示します。原表記不明の名前は変換候補から除外し、欠番を詰めません。多言語国では複数の文字体系を許容します。\n\n|国|名：現地表記あり／全件|姓：現地表記あり／全件|例|\n|---|---:|---:|---|\n' + rows.map(r => `|${r.name} (${r.country})|${r.given_name.native}/${r.given_name.total}|${r.surname.native}/${r.surname.total}|${[...r.given_name.examples,...r.surname.examples].join(' / ')}|`).join('\n') + '\n');
console.log(`Audited ${rows.length} countries. Native output coverage is recorded without inventing spellings or ranks.`);
