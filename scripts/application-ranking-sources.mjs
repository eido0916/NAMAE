import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { observedNativeLabel } from './observed-native-labels.mjs';
import { isUsableRankingName } from '../src/lib/ranking-name-quality.mjs';
import { normalizeInputName } from '../src/lib/reference-lookup.mjs';

const scotlandSource = 'https://www.nrscotland.gov.uk/publications/babies-first-names-2025/';
const irelandSource = 'https://www.cso.ie/en/statistics/birthsdeathsandmarriages/irishbabiesnames/';
const australiaSource = 'https://data.sa.gov.au/data/dataset/popular-baby-names';
const readGzip = path => JSON.parse(gunzipSync(readFileSync(path)));
const koreaSource = 'https://kosis.kr/statisticsList/mass/mass_list_e.jsp?org_id=101&tbl_id=DT_1IN15SC';
const koreaExpandedSource = 'https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1IN15SD';
const usCensusSource = 'https://www.census.gov/topics/population/genealogy/data/2020_names.html';
const thaiCorpusSource = 'https://github.com/korkeatw/thai-names-corpus';
const thaiHonorifics = new Set(['นาย', 'นาง', 'นางสาว', 'เด็กชาย', 'เด็กหญิง']);
const berlinSource = 'https://github.com/berlin/haeufige-vornamen-berlin';
const swedenSource = 'https://www.statistikdatabasen.scb.se/goto/sv/ssd/BE0001Nyfodda';
const israelSource = 'https://aviezerl.github.io/babynamesIL/';
const newZealandSource = 'https://figure.nz/table/CzeNlATo4kS9zaUM';

async function asianSources(root, foreign) {
  const sources = new Map();
  const directory = join(foreign, 'attested-asian-names');
  const thai = await JSZip.loadAsync(readFileSync(join(directory, 'thai-names-corpus-0d407b4.zip')));
  for (const [type, gender, file, minimum] of [
    ['given_name', 'female', 'female_names_th.txt', 5000],
    ['given_name', 'male', 'male_names_th.txt', 7000],
    ['surname', undefined, 'family_names_th.txt', 9700],
  ]) {
    const [input] = thai.file(new RegExp('/' + file + '$'));
    const names = (await input.async('string')).trim().split(/\r?\n/).map(name => name.trim())
      .filter(name => !thaiHonorifics.has(name) && /^\p{Script=Thai}[\p{Script=Thai}\p{M} ]*$/u.test(name));
    if (names.length < minimum) throw Error(`Incomplete Thai name corpus: ${file}`);
    const key = 'TH/' + type;
    const existing = sources.get(key) ?? [];
    existing.push({ kind: 'name_corpus',
      meta: { source: 'Thai Names Corpus (CC BY-SA 4.0)', sourceUrl: thaiCorpusSource },
      records: names.map(name => ({ name, ...(gender ? { gender } : {}) })) });
    sources.set(key, existing);
  }
  const court = JSON.parse(readFileSync(join(directory, 'kr-court-birth-names-2024.json'), 'utf8'));
  if (court.year !== 2024 || !court.tables?.length ||
    new Set(court.tables.map(table => table.region)).size !== court.tables.length)
    throw Error('Incomplete South Korean birth registration snapshot');
  const courtNames = new Map();
  for (const { gender, names } of court.tables) {
    if (gender !== 'female' || names.length < 18) throw Error('Unexpected South Korean birth registration table');
    for (const [name, count] of names) {
      if (!isUsableRankingName('KR', name, 'given_name') || !Number.isSafeInteger(count) || count < 1)
        throw Error('Unexpected South Korean birth registration row');
      courtNames.set(name, Math.max(courtNames.get(name) ?? 0, count));
    }
  }
  sources.set('KR/given_name', [{
    kind: 'published',
    meta: { source: '대한민국 대법원 — 2024년 지역별 출생신고 이름', sourceUrl: court.sourceUrl },
    records: [...courtNames].sort((a, b) => b[1] - a[1]).map(([name]) => ({ name, gender: 'female' })),
  }]);
  const korea = await JSZip.loadAsync(readFileSync(join(directory, 'kosis-DT_1IN15SC-2015.zip')));
  const csv = await korea.file('101_DT_1IN15SC_F_2015.csv').async('nodebuffer');
  const koreanNames = new Map();
  for (const line of new TextDecoder('euc-kr', { fatal: true }).decode(csv).split(/\r?\n/)) {
    // Four-digit codes are surname totals. Longer codes split the same surname by ancestral seat.
    const row = /^'\d{4},"(\p{Script=Hangul}+)(?:\((\p{Script=Han}+)\))?",'00,"전국",2015,(\d+)\.0+,/u.exec(line);
    if (!row || row[1] === '계') continue;
    const [, name, hanja, count] = row;
    const record = koreanNames.get(name) ?? { name, count: 0, aliases: [] };
    record.count += Number(count);
    if (hanja) record.aliases.push(hanja);
    koreanNames.set(name, record);
  }
  if (koreanNames.size < 100) throw Error('Incomplete KOSIS national surname totals');
  sources.set('KR/surname', [{ kind: 'published', meta: { source: 'KOSIS — 2015 census surname totals', sourceUrl: koreaSource },
    records: [...koreanNames.values()].sort((a, b) => b.count - a.count) }]);
  const expanded = await JSZip.loadAsync(readFileSync(join(directory, 'kosis-DT_1IN15SD-2015.zip')));
  const expandedCsv = await expanded.file('101_DT_1IN15SD_F_2015.csv').async('nodebuffer');
  const additionalKorean = new Map();
  for (const line of new TextDecoder('euc-kr', { fatal: true }).decode(expandedCsv).split(/\r?\n/)) {
    const row = /^'\d{4},"(\p{Script=Hangul}+)(?:\((\p{Script=Han}+)\))?",2015,(\d+)\.0+$/u.exec(line);
    if (!row || ['전국', '계', '기타'].includes(row[1]) || Number(row[3]) < 5) continue;
    const [, name, hanja, count] = row;
    const record = additionalKorean.get(name) ?? { name, count: 0, aliases: [] };
    record.count += Number(count);
    if (hanja) record.aliases.push(hanja);
    additionalKorean.set(name, record);
  }
  if (additionalKorean.size <= koreanNames.size) throw Error('Incomplete expanded KOSIS surname table');
  sources.set('KR/surname', [{ kind: 'published',
    meta: { source: 'KOSIS — 2015 census surname totals', sourceUrl: koreaExpandedSource },
    records: [...additionalKorean.values()].sort((a, b) => b.count - a.count) }]);

  const rankings = join(root, 'data-sources/rankings');
  const japanese = readdirSync(rankings).filter(file => /^jp-spelling-\d{4}\.json$/.test(file));
  const spellings = japanese.flatMap(file => JSON.parse(readFileSync(join(rankings, file), 'utf8')))
    .filter(row => ['m', 'f'].includes(row.sex))
    .map(row => ({ name: row.name, gender: row.sex === 'm' ? 'male' : 'female', count: Number(row.count) }));
  const funabashi = JSON.parse(readFileSync(join(directory, 'jp-funabashi-birth-names.json'), 'utf8'));
  if (funabashi.source !== '船橋市' || funabashi.snapshots?.length !== 3)
    throw Error('Incomplete Funabashi birth name statistics');
  const localBirthNames = funabashi.snapshots.map(({ fiscalYear, url, rows, writtenNameTable }) => {
    const names = new Map();
    const addName = (gender, name, readings) => {
      if (!['male', 'female'].includes(gender) || !isUsableRankingName('JP', name, 'given_name') ||
        !readings.length || readings.some(reading => !/^[ァ-ヶー]+$/u.test(reading)))
        throw Error(`Unexpected Funabashi name for fiscal year ${fiscalYear}`);
      const key = gender + '/' + name;
      const record = names.get(key) ?? { gender, name, aliases: new Set() };
      for (const reading of readings) record.aliases.add(normalizeInputName(reading));
      names.set(key, record);
    };
    if (rows.length < 80) throw Error(`Incomplete Funabashi name table for fiscal year ${fiscalYear}`);
    for (const [gender, name, reading, count] of rows) {
      if (!Number.isSafeInteger(count) || count < 2) throw Error('Invalid Funabashi name count');
      addName(gender, name, [reading]);
    }
    for (const [name, ...readings] of writtenNameTable) addName('female', name, readings);
    return {
      kind: 'published',
      meta: { source: `船橋市 — 出生児の名前統計（${fiscalYear}年度）`, sourceUrl: url },
      records: [...names.values()].map(({ aliases, ...record }) => ({ ...record, aliases: [...aliases] })),
    };
  });
  sources.set('JP/given_name', [...localBirthNames, { kind: 'published',
    meta: { source: '明治安田 — 名前調査（漢字・かな表記）', sourceUrl: 'https://www.meijiyasuda.co.jp/enjoy/ranking/' },
    records: birthRecords(spellings) }]);
  const japaneseSurnames = readFileSync(join(root, 'data-sources/japanese-names/last_name_org.csv'), 'utf8')
    .trim().split(/\r?\n/).map(line => {
      const [name, count, reading, romanized] = line.split(',');
      return { name, count: Number(count), aliases: [reading, romanized].filter(Boolean) };
    }).filter(row => Number.isSafeInteger(row.count) && row.count > 0);
  sources.set('JP/surname', [{ kind: 'published',
    meta: { source: 'Japanese Personal Name Dataset — surname frequencies',
      sourceUrl: 'https://github.com/shuheilocale/japanese-personal-name-dataset' },
    records: japaneseSurnames }]);

  const taiwan = JSON.parse(readFileSync(join(foreign, 'taiwan-official/given-names-by-cohort-2023.json'), 'utf8'));
  if (taiwan.table !== 56 || ['male', 'female'].some(gender =>
    taiwan[gender]?.length !== 12 || taiwan[gender].some(cohort => cohort.names.length !== 10)))
    throw Error('Incomplete Taiwan given-name cohort table');
  const taiwanNames = ['male', 'female'].flatMap(gender => {
    const maxByName = new Map();
    for (const cohort of taiwan[gender]) {
      for (const [name, count] of cohort.names) {
        if (!isUsableRankingName('TW', name, 'given_name') || !Number.isSafeInteger(count) || count < 1)
          throw Error('Unexpected Taiwan given-name cohort row');
        maxByName.set(name, Math.max(maxByName.get(name) ?? 0, count));
      }
    }
    // Cohort counts determine supplemental order but cannot be used as national counts.
    return [...maxByName].sort((a, b) => b[1] - a[1]).map(([name]) => ({ name, gender }));
  });
  sources.set('TW/given_name', [{
    kind: 'published',
    meta: { source: '內政部《全國姓名統計分析》表五十六 — 出生年代別', sourceUrl: taiwan.sourceUrl },
    records: taiwanNames,
  }]);

  const entities = { CN: 'Q148', JP: 'Q17', KR: 'Q884', IN: 'Q668', TH: 'Q869', VN: 'Q881',
    ID: 'Q252', PH: 'Q928', MX: 'Q96', TW: 'Q865', MV: 'Q826' };
  for (const [country, entity] of Object.entries(entities)) {
    for (const type of ['given_name', 'surname']) {
      const key = country + '/' + type;
      const file = join(directory, `${country}-${type}.json.gz`);
      if (!existsSync(file)) continue;
      const { query, bindings, country: actualCountry, type: actualType } = readGzip(file);
      const property = type === 'given_name' ? 'P735' : 'P734';
      if (actualCountry !== country || actualType !== type || !query.includes(`wdt:P27 wd:${entity}`) ||
          !query.includes(`wdt:${property} ?name`) || !query.includes('wdt:P31 wd:Q5') || !query.includes('COUNT(DISTINCT ?person)'))
        throw Error(`Invalid citizenship evidence: ${key}`);
      const groups = new Map();
      for (const { name, label, sex, count } of bindings) {
        const id = name?.value?.split('/').at(-1);
        const gender = { Q6581097: 'male', Q6581072: 'female' }[sex?.value?.split('/').at(-1)];
        const occurrences = Number(count?.value);
        if (!/^Q\d+$/.test(id ?? '') || !label?.['xml:lang'] || !Number.isSafeInteger(occurrences) || occurrences < 1 ||
            (type === 'given_name' && !gender)) continue;
        const idKey = id + '/' + (gender ?? '');
        const group = groups.get(idKey) ?? { labels: {}, gender, count: occurrences };
        group.labels[label['xml:lang']] = label.value;
        groups.set(idKey, group);
      }
      const records = [];
      for (const { labels, gender, count } of groups.values()) {
        const name = observedNativeLabel(country, type, labels);
        if (!name) continue;
        const aliases = country === 'IN' ? [...new Set(Object.values(labels))]
          .filter(label => label !== name && isUsableRankingName(country, label)) : [];
        records.push({ name, ...(gender ? { gender } : {}), count, ...(aliases.length ? { aliases } : {}) });
      }
      const existing = sources.get(key) ?? [];
      existing.push({ kind: 'country_association',
        meta: { source: 'Wikidata — citizenship and name records', sourceUrl: 'https://www.wikidata.org/wiki/Wikidata:Data_access' },
        records: records.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'en')) });
      sources.set(key, existing);
    }
  }
  for (const [country, fileId, minimum, source, sourceUrl] of [
    ['CN', 10803450, 30, 'Chinese Gender — aggregate counts in shareholder records through 2018', 'https://doi.org/10.7910/DVN/UAARYY'],
    ['IN', 6292042, 50, 'Naampy — aggregate counts in historical electoral rolls', 'https://doi.org/10.7910/DVN/WZGJBM'],
  ]) {
    const snapshot = readGzip(join(directory, `${country}-given-name-counts-${fileId}.json.gz`));
    const records = ['female', 'male'].flatMap(gender => {
      const rows = snapshot[gender];
      if (snapshot.country !== country || snapshot.fileId !== fileId || rows?.length < 20_000 || rows?.length > 25_000 ||
          !Array.isArray(rows) || new Set(rows.map(([name]) => name)).size !== rows.length)
        throw Error(`Incomplete aggregate given-name snapshot: ${country}/${gender}`);
      return rows.map(([name, count], index) => {
        if (!isUsableRankingName(country, name, 'given_name') || !Number.isSafeInteger(count) || count < minimum ||
            (index > 0 && rows[index - 1][1] < count)) throw Error(`Invalid aggregate given-name row: ${country}/${gender}`);
        return { name, count, gender };
      });
    });
    const key = country + '/given_name';
    const existing = sources.get(key) ?? [];
    existing.push({ kind: 'country_frequency', meta: { source, sourceUrl }, records });
    sources.set(key, existing);
  }
  return sources;
}

function birthRecords(rows) {
  const names = new Map();
  for (const { name, gender, count } of rows) {
    if (!name || !Number.isSafeInteger(count) || count < 1) continue;
    const key = (gender ?? '') + '|' + name.normalize('NFC').toLowerCase();
    const record = names.get(key) ?? { name: name.normalize('NFC'), ...(gender ? { gender } : {}), count: 0 };
    record.count += count;
    names.set(key, record);
  }
  return [...names.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'en'));
}

async function additionalRegisteredNames(directory) {
  const berlin = await JSZip.loadAsync(readFileSync(join(directory, 'berlin-birth-names-34ce79c.zip')));
  const tables = berlin.file(/\/20(?:1[2-9]|2[0-3])\/all_names\.json$/);
  if (tables.length !== 12) throw Error('Incomplete Berlin birth registration archive');
  const berlinRows = [];
  for (const table of tables) {
    const { common_names: districts, rare_names: rare, year } = JSON.parse(await table.async('string'));
    for (const nameCounts of [...Object.values(districts), rare]) {
      for (const [name, counts] of Object.entries(nameCounts)) {
        if ((name.match(/\p{L}/gu)?.length ?? 0) < 2) continue;
        for (const [sex, gender] of [['m', 'male'], ['w', 'female']]) {
          const positions = counts[sex];
          // The publisher pools all positions before 2017. Subsequent tables identify first position.
          const count = typeof positions === 'number' ? positions : year < 2017
            ? Object.values(positions ?? {}).reduce((sum, value) => sum + value, 0)
            : positions?.['1'];
          if (count >= 2) berlinRows.push({ name, gender, count });
        }
      }
    }
  }

  const sweden = await JSZip.loadAsync(readFileSync(join(directory, 'se-scb-TAB5665.zip')));
  const swedishText = new TextDecoder('windows-1252').decode(await sweden.file('TAB5665_sv.csv').async('nodebuffer'));
  const [header, ...lines] = swedishText.trim().split(/\r?\n/);
  if (header !== '"tilltalsnamn","kön","år","Antal nyfödda"' || lines.length < 650000)
    throw Error('Unexpected Statistics Sweden name table');
  const swedishRows = [];
  for (const line of lines) {
    if (line.endsWith(',..')) continue;
    const row = /^"([^"]+)","(flickor|pojkar)","\d{4}",(\d+)$/.exec(line);
    if (!row) throw Error('Invalid Statistics Sweden name table row');
    const [, name, sex, count] = row;
    if ((name.match(/\p{L}/gu)?.length ?? 0) >= 2) swedishRows.push({ name, gender: sex === 'flickor' ? 'female' : 'male', count: Number(count) });
  }

  const swiss = [];
  for (const [gender, id] of [['female', '36752506'], ['male', '36752513']]) {
    const [header, ...lines] = gunzipSync(readFileSync(join(directory, `ch-fso-${id}.csv.gz`))).toString('utf8').trim().split(/\r?\n/);
    if (header !== '"TIME_PERIOD","firstname","YEAROFBIRTH","VALUE","OBS_STATUS"' || lines.length < 400000)
      throw Error(`Unexpected Swiss Federal Statistical Office name table: ${id}`);
    const rows = [];
    for (const line of lines) {
      const row = /^"2025","([^"]+)","\d{4}","(\d+)","A"$/.exec(line);
      if (!row) throw Error(`Invalid Swiss Federal Statistical Office name table row: ${id}`);
      const [, name, count] = row;
      if ((name.match(/\p{L}/gu)?.length ?? 0) >= 2) rows.push({ name, gender, count: Number(count) });
    }
    swiss.push({ kind: 'published', meta: {
      source: 'Swiss Federal Statistical Office — resident first names, 2025',
      sourceUrl: `https://statistik.admin.ch/en/asset/${id}`,
    }, records: birthRecords(rows).filter(row => row.count >= 5) });
  }

  const [israelHeader, ...israelLines] = readFileSync(join(directory, 'il-babynamesIL-63b88aa.csv'), 'utf8').trim().split(/\r?\n/);
  if (israelHeader !== 'sector,sex,name,total' || israelLines.length < 10000) throw Error('Unexpected Israeli birth name table');
  const israelRows = israelLines.map(line => {
    const row = /^(?:Jewish|Muslim|Christian-Arab|Druze),(F|M),([^,]+),(\d+)$/.exec(line);
    if (!row) throw Error('Invalid Israeli birth name table row');
    const [, sex, name, count] = row;
    return { name, gender: sex === 'F' ? 'female' : 'male', count: Number(count) };
  });
  return [
    ...swiss.map(source => ['CH/given_name', source]),
    ['DE/given_name', { kind: 'published', meta: { source: 'BerlinOnline / LABO — Berlin birth registrations', sourceUrl: berlinSource }, records: birthRecords(berlinRows) }],
    ['SE/given_name', { kind: 'published', meta: { source: 'Statistics Sweden — newborn given names 1998–2022', sourceUrl: swedenSource }, records: birthRecords(swedishRows) }],
    ['IL/given_name', { kind: 'published', meta: { source: 'Israel CBS / babynamesIL — birth names 1949–2024', sourceUrl: israelSource }, records: birthRecords(israelRows) }],
  ];
}

function irelandRows(table, gender) {
  const [statistic, year, name] = table.id;
  const countCode = Object.entries(table.dimension[statistic].category.label).find(([, label]) => !label.endsWith(' Rank'))?.[0];
  const countIndex = Object.values(table.dimension[statistic].category.index).indexOf(countCode);
  const [, years, names] = table.size;
  if (countIndex < 0 || table.dimension[year].label !== 'Year') throw Error('Unexpected CSO name table');
  const category = table.dimension[name].category;
  return Object.values(category.index).flatMap((id, i) => {
    const label = category.label[id];
    if (!label || /^(all |total|other names|unknown|not stated)/i.test(label)) return [];
    let count = 0;
    for (let y = 0; y < years; y++) count += table.value[(countIndex * years + y) * names + i] ?? 0;
    return [{ name: label, gender, count }];
  });
}

export async function loadApplicationRankingSources(root) {
  const foreign = join(root, 'data-sources/rankings/foreign');
  const asia = await asianSources(root, foreign);
  const births = join(foreign, 'attested-birth-names');
  const registered = await additionalRegisteredNames(births);
  const census = new ExcelJS.Workbook();
  await census.xlsx.readFile(join(births, 'us-census-2020-first-names.xlsx'));
  const censusSheet = census.worksheets[0];
  if (censusSheet.getCell('A3').value !== 'FIRST NAME' || censusSheet.getCell('F3').value !== 'MALE' ||
      censusSheet.getCell('G3').value !== 'FEMALE' || censusSheet.rowCount < 53000) throw Error('Unexpected U.S. Census name table');
  const censusRows = [];
  censusSheet.eachRow((row, index) => {
    if (index < 4) return;
    const spelling = row.getCell(1).value;
    if (typeof spelling !== 'string' || !isUsableRankingName('US', spelling)) return;
    const name = spelling.toLowerCase().replace(/(^|[ '-])\p{L}/gu, part => part.toUpperCase());
    for (const [gender, column] of [['male', 6], ['female', 7]]) {
      const count = row.getCell(column).value;
      // Keep names with at least 100 in this cohort, using the published adjusted counts.
      if (typeof count === 'number' && count >= 100) censusRows.push({ name, gender, count });
    }
  });
  const scotlandZip = await JSZip.loadAsync(readFileSync(join(births, 'scotland-1974-2025.zip')));
  const scotland = await scotlandZip.file('full-list-1974-2025.csv').async('nodebuffer');
  const [header, ...lines] = new TextDecoder('windows-1252').decode(scotland).split(/\r?\n/).filter(Boolean);
  if (header !== 'Year,Sex,Name,Number,Rank') throw Error('Unexpected Scottish name table');
  const scotlandRows = lines.map(line => {
    const [, sex, name, count] = line.split(',');
    if (sex !== 'Boy' && sex !== 'Girl') throw Error('Unexpected Scottish birth sex');
    return { name, gender: sex === 'Boy' ? 'male' : 'female', count: Number(count) };
  });
  const [nzHeader, ...nzLines] = readFileSync(join(births, 'nz-dia-1900-2025.csv'), 'utf8').trim().split(/\r?\n/);
  if (nzHeader !== 'Year,Sex,Rank,Name,Value,Value Unit,Value Label,Null Reason' || nzLines.length !== 74015)
    throw Error('Unexpected New Zealand birth name table');
  const nzRows = nzLines.flatMap(line => {
    const fields = /^(\d{4}),(Girls|Boys),(\d+),([^,]+),(\d+),number,Number of babies,$/.exec(line);
    if (!fields || Number(fields[1]) < 1900 || Number(fields[1]) > 2025 || Number(fields[5]) < 10)
      throw Error('Invalid New Zealand birth name row');
    const [, , sex, , name, count] = fields;
    // The source CSV has a few damaged Māori diacritics. Never publish those spellings.
    if (!/^[\p{L}\p{M}]+(?:[ '-][\p{L}\p{M}]+)*$/u.test(name) ||
        !isUsableRankingName('NZ', name, 'given_name')) return [];
    return [{ name, gender: sex === 'Boys' ? 'male' : 'female', count: Number(count) }];
  });
  const australiaZip = await JSZip.loadAsync(readFileSync(join(births, 'south-australia-1944-2013.zip')));
  const australiaFiles = australiaZip.file(/\/(?:female|male)_cy\d{4}_top\.csv$/);
  if (australiaFiles.length !== 140) throw Error('Incomplete South Australian birth name archive');
  const australiaRows = [];
  for (const file of australiaFiles) {
    const gender = file.name.includes('/female_') ? 'female' : 'male';
    const [header, ...data] = new TextDecoder('windows-1252').decode(await file.async('nodebuffer')).split(/\r?\n/).filter(Boolean);
    if (header !== 'Given Name,Amount,Position') throw Error(`Unexpected South Australian birth name table: ${file.name}`);
    for (const line of data) {
      if (line.startsWith('""BABY""')) continue;
      const match = /^"([^"]+)","(\d+)","=?\d+"$/.exec(line);
      if (!match) throw Error(`Invalid South Australian birth name row: ${file.name}`);
      const [, name, count] = match;
      if (/^(baby|baby boy|baby girl|not stated|unknown|unnamed|no name|total)$/i.test(name)) continue;
      australiaRows.push({
        name: name.toLowerCase().replace(/(^|[ '-])\p{L}/gu, part => part.toUpperCase()),
        gender, count: Number(count),
      });
    }
  }
  const ireland = (id, gender) => irelandRows(readGzip(join(births, id + '.json.gz')), gender);
  const published = new Map([
    ['US/given_name', {
      kind: 'published', meta: { source: 'U.S. Census Bureau — 2020 first names by sex', sourceUrl: usCensusSource },
      records: birthRecords(censusRows),
    }],
    ['AU/given_name', {
      kind: 'published', meta: { source: 'South Australia — birth registrations 1944–2013', sourceUrl: australiaSource },
      records: birthRecords(australiaRows),
    }],
    ['GB/given_name', {
      kind: 'published', meta: { source: 'National Records of Scotland — births 1974–2025', sourceUrl: scotlandSource },
      records: birthRecords(scotlandRows),
    }],
    ['NZ/given_name', {
      kind: 'published', meta: { source: 'New Zealand Department of Internal Affairs — births 1900–2025', sourceUrl: newZealandSource },
      records: birthRecords(nzRows).filter(row => row.count >= 20),
    }],
    ['IE/given_name', {
      kind: 'published', meta: { source: 'Central Statistics Office — Irish Babies’ Names 1964–2025', sourceUrl: irelandSource },
      records: birthRecords([...ireland('VSA50', 'male'), ...ireland('VSA60', 'female')]),
    }],
    ['IE/surname', {
      kind: 'published', meta: { source: 'Central Statistics Office — babies’ surnames 2023–2025', sourceUrl: irelandSource },
      records: birthRecords(ireland('VSA110')),
    }],
  ]);

  const directory = join(foreign, 'wikidata-country-names');
  const countries = new Map(readGzip(join(directory, 'country-codes.json.gz')).bindings
    .map(row => [row.iso.value, row.country.value.split('/').at(-1)]));
  countries.set('CY', 'Q229');
  const labels = readGzip(join(directory, 'entity-labels.json.gz')).labels;
  const nativeLabels = join(foreign, 'observed-name-rankings/native-labels.json.gz');
  if (existsSync(nativeLabels)) {
    for (const [id, values] of Object.entries(readGzip(nativeLabels).labels))
      labels[id] = { ...labels[id], ...values };
  }

  return (country, type) => {
    const sources = [...(asia.get(country + '/' + type) ?? [])];
    const birth = published.get(country + '/' + type);
    if (birth) sources.push(birth);
    for (const [key, source] of registered) if (key === country + '/' + type) sources.push(source);
    const entity = countries.get(country);
    const property = type === 'given_name' ? 'P735' : 'P734';
    for (const [relation, predicate] of [['citizenship', 'P27'], ['birthplace-v2', 'P19'], ['residence-v1', 'P551']]) {
      const path = join(directory, `${country}-${type}-${relation}.json.gz`);
      if (!existsSync(path)) continue;
      const { query, bindings } = readGzip(path);
      const countryEntity = query.match(/wdt:P27 wd:(Q\d+)/)?.[1] ?? query.match(/\) wd:(Q\d+)/)?.[1];
      if (!entity || countryEntity !== entity || !query.includes(`wdt:${predicate}`) ||
          !query.includes(`wdt:${property} ?name`) || !query.includes('wdt:P31 wd:Q5'))
        throw Error(`Invalid Wikidata association for ${country}/${type}/${relation}`);
      const records = new Map();
      for (const row of bindings) {
        const id = row.name?.value?.split('/').at(-1);
        if (!/^Q\d+$/.test(id ?? '')) continue;
        const sex = row.sex?.value?.split('/').at(-1);
        const gender = type === 'surname' ? undefined : { Q6581097: 'male', Q6581072: 'female' }[sex];
        if (type === 'given_name' && !gender) continue;
        const name = observedNativeLabel(country, type, labels[id] ?? {});
        if (name) records.set((gender ?? '') + '|' + name, { name, ...(gender ? { gender } : {}) });
      }
      sources.push({
        kind: 'country_association',
        meta: { source: 'Wikidata — ' + relation.replace(/-v\d$/, ''), sourceUrl: 'https://www.wikidata.org/wiki/Wikidata:Data_access' },
        records: [...records.values()].sort((a, b) => a.name.localeCompare(b.name, 'en')),
      });
    }
    return sources;
  };
}
