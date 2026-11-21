import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { exportApplicationRankings } from './export-application-rankings.mjs';
import { verifyReleaseRankings } from './verify-release-rankings.mjs';

const root = resolve(import.meta.dirname, '..');
const preview = process.argv.includes('--preview');
const configured = process.env.NEXT_PUBLIC_SITE_URL;
if (!configured && !preview) throw Error('Set NEXT_PUBLIC_SITE_URL to the public HTTPS origin.');
const url = new URL(configured || 'http://localhost:3001');
if (!preview && (url.protocol !== 'https:' || url.hostname === 'localhost' || url.href !== url.origin + '/'))
  throw Error('NEXT_PUBLIC_SITE_URL must be the public HTTPS origin.');
if (preview && !configured) console.log(`Preview origin: ${url.origin}`);

const releaseRoot = join(root, '.tmp');
mkdirSync(releaseRoot, { recursive: true });
const project = mkdtempSync(join(releaseRoot, 'release-'));
const inputRoot = join(root, 'public/data');
// Ranking data is fetched by the browser. Stage it outside public so Next does
// not make a second copy during static export.
const outputRoot = join(project, 'ranking-data');
mkdirSync(outputRoot, { recursive: true });
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const ledger = readJson(join(root, 'data-sources/SOURCES.json'));
const originPath = value => {
  const { hostname, pathname } = new URL(value);
  return hostname.replace(/^www\./, '') + pathname.replace(/\/$/, '');
};
const registered = ledger.sources.flatMap(source => [source.url, ...(source.datasetUrls ?? [])]
  .map(url => ({ ...source, match: originPath(url) })));
function permits(value) {
  if (!value) return false;
  const key = originPath(value);
  const matches = registered.filter(source => key === source.match || key.startsWith(source.match + '/'));
  return matches.some(source => source.redistributionStatus === 'permitted') &&
    !matches.some(source => source.redistributionStatus !== 'permitted');
}
const original = readJson(join(inputRoot, 'manifest.json'));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const sourceRoot = join(root, 'data-sources/rankings/foreign');
const snapshots = ['attested-asian-names', 'attested-birth-names', 'taiwan-official'].flatMap(directory =>
  readdirSync(join(sourceRoot, directory)).sort().map(file =>
    createHash('sha256').update(readFileSync(join(sourceRoot, directory, file))).digest('hex')));
const version = digest([original.dataVersion, ledger, snapshots, ...['scripts/application-ranking.mjs',
  'scripts/application-ranking-sources.mjs', 'scripts/export-application-rankings.mjs', 'scripts/build-release.mjs',
  'scripts/verify-release-rankings.mjs', 'src/lib/ranking-name-quality.mjs'].map(file => readFileSync(join(root, file), 'utf8'))]);
const appRankings = await exportApplicationRankings(root, outputRoot, original, { inputRoot, permits, version });
const sources = ledger.sources.filter(source => source.redistributionStatus === 'permitted');
const audited = verifyReleaseRankings(outputRoot, appRankings, permits);
writeFileSync(join(project, 'quality-audit.json'), JSON.stringify({ dataVersion: version, countries: audited }, null, 2) + '\n');
console.log(`Verified ${appRankings.reduce((total, entry) => total + entry.records, 0)} release ranking rows.`);
const available = new Set(appRankings.filter(entry => entry.records > 0).map(entry => entry.country + '/' + entry.type));
const countries = original.countries.map(country => {
  const supportsGivenName = available.has(country.code + '/given_name');
  const supportsSurname = available.has(country.code + '/surname');
  return { ...country, enabled: country.enabled && (supportsGivenName || supportsSurname), supportsGivenName, supportsSurname };
});
const manifest = { schemaVersion: 4, dataVersion: version, countries, appRankings,
  datasets: [], references: [], sources };
writeFileSync(join(outputRoot, 'manifest.json'), JSON.stringify(manifest));
// Publish the current reviewed detail shards only. Details remain static.
const details = readJson(join(inputRoot, 'name-details/manifest.json'));
mkdirSync(join(outputRoot, 'name-details'));
for (const [key, path] of Object.entries(details.shards)) {
  if (!/^\/data\/name-details\/[A-Z]{2}-(given_name|surname)-\d{2}\.[a-f0-9]+\.json$/.test(path)) throw Error('Invalid detail shard path');
  const content = readJson(join(root, 'public', path.slice(1)));
  for (const record of Object.values(content)) {
    for (const entity of [...record.people, ...record.characters]) delete entity.image;
  }
  const cleanedPath = path.replace(/\.[a-f0-9]+\.json$/, '.' + digest(content) + '.json');
  writeFileSync(join(outputRoot, cleanedPath.slice('/data/'.length)), JSON.stringify(content));
  details.shards[key] = cleanedPath;
}
writeFileSync(join(outputRoot, 'name-details/manifest.json'), JSON.stringify(details));
cpSync(join(root, 'public/flags'), join(project, 'public/flags'), { recursive: true });
for (const file of ['src', 'package.json', 'tsconfig.json', 'next.config.ts', 'postcss.config.mjs', 'vercel.json'])
  cpSync(join(root, file), join(project, file), { recursive: true, filter: source => !/[\\/]src[\\/](?:data|reference-data)[\\/]/.test(source) });
mkdirSync(join(project, 'src/data'), { recursive: true });
writeFileSync(join(project, 'src/data/countries.json'), JSON.stringify(countries));
writeFileSync(join(project, 'src/data/native-name-index.json'), '{}');
mkdirSync(join(project, 'data-sources'));
writeFileSync(join(project, 'data-sources/SOURCES.json'), JSON.stringify({ ...ledger, sources }));
symlinkSync(join(root, 'node_modules'), join(project, 'node_modules'), 'junction');
const build = spawnSync(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], {
  cwd: project, stdio: 'inherit', env: { ...process.env, NEXT_PUBLIC_SITE_URL: url.origin, NEXT_PUBLIC_NAMAE_RELEASE: '1' },
});
if (build.status !== 0) throw build.error ?? Error('Release build failed');
renameSync(outputRoot, join(project, 'out/data'));
console.log(`Static release: ${join(project, 'out')}`);
