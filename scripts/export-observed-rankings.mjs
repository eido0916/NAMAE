import { gunzipSync } from 'node:zlib';
import { existsSync } from 'node:fs';
import { buildObservedRanks } from './observed-rank-utils.mjs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildObservedDataset } from './observed-ranking-dataset.mjs';
import { writeDataFile } from './write-data-file.mjs';
import { publicManifestVersion } from './public-manifest-version.mjs';

export function exportObservedRankings(root, outputRoot, { entries, writeCoverage = true } = {}) {
  const db = entries ? undefined : new DatabaseSync(join(root, 'data/namae.sqlite'), { readOnly: true });
  const labelRoot = join(root, 'data-sources/rankings/foreign/');
  const labels = JSON.parse(gunzipSync(readFileSync(join(labelRoot, 'wikidata-country-names/entity-labels.json.gz')))).labels;
  const nativePath = join(labelRoot, 'observed-name-rankings/native-labels.json.gz');
  if (existsSync(nativePath)) {
    const extra = JSON.parse(gunzipSync(readFileSync(nativePath))).labels;
    for (const [id, values] of Object.entries(extra)) labels[id] = { ...labels[id], ...values };
  }
  const manifest = [];
  const coverage = [];
  for (const row of entries ?? db.prepare('SELECT * FROM reference_datasets ORDER BY country,type').all()) {
    const original = JSON.parse(gunzipSync(readFileSync(join(labelRoot, 'observed-name-rankings', row.country + '-' + row.type + '.json.gz'))));
    if (original.country !== row.country || original.type !== row.type || !original.query.includes('SELECT DISTINCT ?person ?name') || !original.query.includes('wdt:P31 wd:Q5')) throw Error('Invalid people snapshot');
    const meta = { ...(row.meta_json ? JSON.parse(row.meta_json) : { country: row.country, type: row.type }),
      evidenceRanking: { sourceUrl: 'https://query.wikidata.org/#' + encodeURIComponent(original.query), asOf: original.retrievedAt.slice(0, 10) } };
    const ranked = buildObservedRanks(original.bindings, labels, row.country, row.type, { nativeLabels: true }).map(record => ({
      ...record, evidenceRank: { ...record.evidenceRank, asOf: original.retrievedAt.slice(0, 10), sourceId: 'wikidata-observed-name-counts' },
    }));
    const dataset = buildObservedDataset(meta, ranked);
    const chunks = [];
    for (const gender of row.type === 'surname' ? [undefined] : ['male', 'female']) {
      const records = dataset.records.filter(record => !gender || record.gender === gender);
      // Export an empty file too, so an unavailable cohort never reuses a
      // previously loaded country's or population dataset's names.
      for (let start = 0; start < Math.max(1, records.length); start += 1000) {
        const part = records.slice(start, start + 1000);
        const content = JSON.stringify({ meta: dataset.meta, records: part });
        const sha256 = createHash('sha256').update(content).digest('hex');
        const filename = `${row.type}.${gender ?? 'all'}.${start}.${sha256.slice(0, 12)}.json`;
        const directory = join(outputRoot, 'observed', row.country.toLowerCase());
        mkdirSync(directory, { recursive: true });
        writeDataFile(join(directory, filename), content);
        chunks.push({ path: `/data/observed/${row.country.toLowerCase()}/${filename}`, records: part.length, sha256,
          bytes: Buffer.byteLength(content), ...(gender ? { gender } : {}),
          minRank: part[0]?.rank ?? 0, maxRank: part.at(-1)?.rank ?? 0 });
      }
    }
    manifest.push({ country: row.country, type: row.type, records: dataset.records.length, chunks });
    coverage.push({ country: row.country, type: row.type, names: dataset.records.length,
      male: dataset.records.filter(record => record.gender === 'male').length,
      female: dataset.records.filter(record => record.gender === 'female').length,
      sourceUrl: dataset.meta.sourceUrl });
  }
  db?.close();
  if (!writeCoverage) return manifest;
  const totalNames = coverage.reduce((sum, row) => sum + row.names, 0);
  const report = { scope: 'public_people', policy: 'Distinct people in Wikidata, not population or birth statistics. Native source spellings only. Competition ranks are calculated from distinct people after grouping source-linked native labels. Counts, ties and observation dates remain explicit.',
    countries: new Set(coverage.map(row => row.country)).size,
    countriesWithNames: new Set(coverage.filter(row => row.names).map(row => row.country)).size, totalNames, coverage };
  writeDataFile(join(root, 'reports/public-people-coverage.json'), JSON.stringify(report, null, 2) + '\n');
  writeDataFile(join(root, 'reports/public-people-coverage.md'), '# 公開人物データ内の順位\n\n一般人口・出生統計とは別集計です。国籍・出生地・居住地など、出典クエリが明示する関係のある公開人物をIDで重複除外して集計。出典の現地語ラベルが確認できる名前を集計対象にします。同人数は同順位です。\n\n' +
    `${report.countriesWithNames} / ${report.countries}か国・地域、${totalNames.toLocaleString('ja-JP')}件（名は男女別）。\n\n|国|男性名|女性名|名字|\n|---|---:|---:|---:|\n` +
    [...new Set(coverage.map(row => row.country))].map(country => {
      const given = coverage.find(row => row.country === country && row.type === 'given_name');
      const surname = coverage.find(row => row.country === country && row.type === 'surname');
      return `|${country}|${given?.male ?? 0}|${given?.female ?? 0}|${surname?.names ?? 0}|`;
    }).join('\n') + '\n\n出典：Wikidata（CC0）。国・性別・姓名種別ごとの原本クエリはJSON版のsourceUrlを参照。\n');
  console.log(`Public people: ${totalNames} native rank records across ${report.countriesWithNames}/${report.countries} countries.`);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '..');
  const output = join(root, 'public/data');
  const manifestPath = join(output, 'manifest.json');
  const base = JSON.parse(readFileSync(manifestPath, 'utf8'));
  delete base.dataVersion;
  delete base.observedRankings;
  const observedRankings = exportObservedRankings(root, output);
  const next = { ...base, observedRankings };
  const dataVersion = publicManifestVersion(next);
  writeDataFile(manifestPath, JSON.stringify({ ...next, dataVersion }));
}
