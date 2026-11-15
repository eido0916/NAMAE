import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { writeDataFile } from './write-data-file.mjs';

const endpoint = 'https://qlever.dev/api/wikidata';
const directory = 'data-sources/rankings/foreign/attested-asian-names';
const countries = { CN: ['Q148', ['zh-hans', 'zh-cn', 'zh']], KR: ['Q884', ['ko']], JP: ['Q17', ['ja']],
  IN: ['Q668', ['en', 'hi', 'bn', 'ta', 'te', 'ml', 'mr', 'gu', 'kn', 'pa', 'or', 'ur']],
  TH: ['Q869', ['th']], VN: ['Q881', ['vi', 'en']], ID: ['Q252', ['id', 'en']],
  PH: ['Q928', ['fil', 'tl', 'en']], MX: ['Q96', ['es', 'en']], TW: ['Q865', ['zh-hant', 'zh-tw', 'zh']],
  MV: ['Q826', ['dv']] };
mkdirSync(directory, { recursive: true });

for (const [country, [entity, languages]] of Object.entries(countries)) {
  if (process.argv.length > 2 && !process.argv.slice(2).includes(country)) continue;
  for (const type of ['given_name', 'surname']) {
    const given = type === 'given_name';
    const property = given ? 'P735' : 'P734';
    const gender = given ? '?sex' : '';
    const genderFilter = given ? '?person wdt:P21 ?sex. FILTER(?sex IN (wd:Q6581097, wd:Q6581072))' : '';
    const query = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?name ?label ${gender} ?count WHERE {
  { SELECT ?name ${gender} (COUNT(DISTINCT ?person) AS ?count) WHERE {
    ?person wdt:P31 wd:Q5; wdt:P27 wd:${entity}; wdt:${property} ?name.
    ${genderFilter}
    FILTER(STRSTARTS(STR(?name), "http://www.wikidata.org/entity/Q"))
  } GROUP BY ?name ${gender} }
  ?name rdfs:label ?label.
  FILTER(LANG(?label) IN (${languages.map(language => JSON.stringify(language)).join(', ')}))
}
ORDER BY ?name ${gender} ?label`;
    const response = await fetch(endpoint + '?' + new URLSearchParams({ query }), {
      headers: { accept: 'application/sparql-results+json', 'user-agent': 'NAMAE name evidence importer' },
      signal: AbortSignal.timeout(40000),
    });
    if (!response.ok) throw Error(`${country}/${type}: HTTP ${response.status}`);
    const { results } = await response.json();
    if (!Array.isArray(results?.bindings)) throw Error(`Invalid evidence: ${country}/${type}`);
    writeDataFile(join(directory, `${country}-${type}.json.gz`), gzipSync(JSON.stringify({
      country, type, endpoint, query, retrievedAt: new Date().toISOString(), bindings: results.bindings,
    })));
    console.log(country, type, results.bindings.length);
  }
}
