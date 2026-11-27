import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { exportObservedRankings } from './export-observed-rankings.mjs';
import { exportApplicationRankings } from './export-application-rankings.mjs';
import { manifestSourcesFromLedger, publicManifestVersion } from './public-manifest-version.mjs';
import { writeDataFile } from './write-data-file.mjs';

const root = resolve(import.meta.dirname, '..');
const country = process.argv[2];
if (!/^[A-Z]{2}$/.test(country ?? '') || process.argv.length !== 3)
  throw Error('Usage: npm run data:refresh:app-country -- NZ');

const outputRoot = join(root, 'public/data');
const manifestPath = join(outputRoot, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.schemaVersion !== 4 || manifest.dataVersion !== publicManifestVersion(manifest))
  throw Error('The committed public manifest is inconsistent; run npm run data:build first');
const selected = manifest.observedRankings.filter(entry => entry.country === country);
if (!selected.length || manifest.appRankings.filter(entry => entry.country === country).length !== selected.length)
  throw Error(`No complete application ranking inputs for ${country}; run npm run data:build`);

// Recreate only this country's ignored observed shards from the committed raw snapshots.
const regenerated = exportObservedRankings(root, outputRoot, { entries: selected, writeCoverage: false });
if (JSON.stringify(selected) !== JSON.stringify(regenerated))
  throw Error(`Observed rankings changed for ${country}; run npm run data:build`);

const { entries, report } = await exportApplicationRankings(root, outputRoot, manifest, undefined,
  { country, skipReport: true, returnReport: true });
const replacements = new Map(entries.map(entry => [entry.country + '/' + entry.type, entry]));
manifest.appRankings = manifest.appRankings.map(entry => replacements.get(entry.country + '/' + entry.type) ?? entry);

// Match the source records and ordering produced by the full database exporter.
const ledger = JSON.parse(readFileSync(join(root, 'data-sources/SOURCES.json'), 'utf8'));
manifest.sources = manifestSourcesFromLedger(ledger);
manifest.dataVersion = publicManifestVersion(manifest);

const reportPath = join(root, 'reports/application-ranking-coverage.json');
const previous = JSON.parse(readFileSync(reportPath, 'utf8'));
const order = new Map(manifest.observedRankings.map((entry, index) => [entry.country + '/' + entry.type, index]));
const merge = (oldRows, newRows) => [...oldRows.filter(row => row.country !== country), ...newRows]
  .sort((a, b) => order.get(a.country + '/' + a.type) - order.get(b.country + '/' + b.type));
const coverage = { ...previous, coverage: merge(previous.coverage, report.coverage),
  excluded: merge(previous.excluded, report.excluded) };
writeDataFile(reportPath, JSON.stringify(coverage, null, 2) + '\n');
writeDataFile(manifestPath, JSON.stringify(manifest));
console.log(`${country}: ${entries.reduce((total, entry) => total + entry.records, 0)} application ranking records; data ${manifest.dataVersion}`);
