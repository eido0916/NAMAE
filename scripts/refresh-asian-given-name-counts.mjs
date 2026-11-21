import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { isUsableRankingName } from '../src/lib/ranking-name-quality.mjs';
import { writeDataFile } from './write-data-file.mjs';

const root = resolve(import.meta.dirname, '..');
const directory = join(root, 'data-sources/rankings/foreign/attested-asian-names');
const limit = 25_000;
const genders = ['female', 'male'];

const chineseLabels = /^(?:未知|未知名|不详|无名|無名|佚名|姓名|未命名|未填|小孩|宝宝|寶寶|公司|女士|先生|董事|股东|股東|法人|合计|合計|个人|個人)$/u;
const indianScripts = ['Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Oriya', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Arabic']
  .map(script => new RegExp(`^(?=\\p{L})[\\p{Script_Extensions=${script}}&&[\\p{L}\\p{M}]]{2,24}$`, 'v'));
const indianLabels = new Set('अज्ञात अनाम अज्ञेय नाम नाही नहीं अज्ञातनाम दिवंगत स्वर्गीय बेनाम मृतक मिस्टर श्री श्रीमती कुमारी कुमारि जी देवी बाई बेगम खातून खातुन बीबी बेबी कौर खान ख़ान शेख शेख़ सैयद सिंग सिंह पाटील पटेल जाधव पवार शिंदे પાટીલ પટેલ શેખ ખાન সিংহ খান শেখ দেবী বেগম ਕੌਰ ਸਿੰਘ'.normalize('NFC').split(' '));

const sources = [
  {
    country: 'CN', file: 'CnGender-10803450.txt', id: 10803450,
    sha256: '0e058405db5785327eb26e0f6e8da00f8c79f2f4b5266a155aabbbe5c13d7c41',
    parse: chinaCounts,
  },
  {
    country: 'IN', file: 'in-rolls-native-x10-6292042.csv.gz', id: 6292042,
    sha256: '899305b41330f944cc6e90a69e51147dd20bd680a23e9616f8a162841f45e6bd',
    parse: indiaCounts,
  },
];

function chinaCounts(input) {
  const [header, ...lines] = input.toString('utf8').trimEnd().split(/\r?\n/);
  if (header !== 'CnName\tMale\tFemale\tRatio') throw Error('Unexpected Chinese Gender table');
  const counts = new Map();
  for (const line of lines) {
    const [raw, male, female] = line.split('\t');
    const name = raw.normalize('NFC');
    if (!/^\p{Script=Han}{1,2}$/u.test(name) || chineseLabels.test(name) || !isUsableRankingName('CN', name, 'given_name')) continue;
    if (![male, female].every(count => /^\d+(?:\.0)?$/.test(count))) throw Error(`Unexpected Chinese Gender row: ${name}`);
    const existing = counts.get(name) ?? [0, 0];
    // Compatibility ideographs can normalize to the same spelling. Use the larger observed count.
    counts.set(name, [female, male].map((value, index) => Math.max(existing[index], Number(value) >= 30 ? Number(value) : 0)));
  }
  return counts;
}

function indiaCounts(input) {
  const [header, ...lines] = gunzipSync(input).toString('utf8').trimEnd().split(/\r?\n/);
  if (header !== 'state,first_name,birth_year,n_female,n_male,n_third_gender,prop_female')
    throw Error('Unexpected Naampy native-script table');
  const counts = new Map();
  for (const line of lines) {
    const row = /^([^,]+),([^,]+),(\d{4}),(\d+),(\d+),(\d+),[\d.eE+-]+$/.exec(line);
    if (!row) throw Error('Unexpected Naampy row');
    const [, , raw, , female, male] = row;
    const name = raw.normalize('NFC');
    if (!indianScripts.some(script => script.test(name)) || indianLabels.has(name) || !isUsableRankingName('IN', name, 'given_name')) continue;
    const totals = counts.get(name) ?? [0, 0, 0, 0];
    totals[0] += Number(female);
    totals[1] += Number(male);
    totals[2] += Number(female) >= 5 ? 1 : 0;
    totals[3] += Number(male) >= 5 ? 1 : 0;
    counts.set(name, totals);
  }
  for (const [name, totals] of counts) {
    counts.set(name, genders.map((_, index) => totals[index] >= 50 && totals[index + 2] >= 3 &&
      totals[index] >= 9 * totals[1 - index] ? totals[index] : 0));
  }
  return counts;
}

const cache = process.argv[2];
const snapshots = [];
for (const { country, file, id, sha256, parse } of sources) {
  const url = `https://dataverse.harvard.edu/api/access/datafile/${id}`;
  let input;
  if (cache) {
    input = readFileSync(join(cache, file));
  } else {
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw Error(`${url}: HTTP ${response.status}`);
    input = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('sha256').update(input).digest('hex') !== sha256) throw Error(`Unexpected source checksum: ${file}`);
  const counts = [...parse(input)];
  const lists = genders.map((gender, index) => [gender, counts.flatMap(([name, values]) => values[index] ? [[name, values[index]]] : [])
    .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0)).slice(0, limit)]);
  if (lists.some(([, rows]) => rows.length < 20_000)) throw Error(`Incomplete vetted name sample: ${country}`);
  snapshots.push({ country, fileId: id, sha256, ...Object.fromEntries(lists) });
}
for (const snapshot of snapshots) {
  const { country, male, female } = snapshot;
  writeDataFile(join(directory, `${country}-given-name-counts-${snapshot.fileId}.json.gz`), gzipSync(JSON.stringify(snapshot)));
  console.log(`${country}: ${female.length} female and ${male.length} male first-name spellings with aggregate counts.`);
}
