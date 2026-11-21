import { DatabaseSync } from 'node:sqlite';
import { readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './name-details/db.mjs';
import { nameReadingHint } from '../src/lib/name-reading.mjs';

const ranking=new DatabaseSync(resolve(root,'data/namae.sqlite'),{readOnly:true});
const countries=JSON.parse(readFileSync(resolve(root,'src/data/countries.json'),'utf8'));
const result=[];
for (const country of countries.filter(c=>c.enabled && c.code!=='JP')) {
  const counts={country:country.code,names:0,conventional:0,estimated:0,unsupported:0};
  for (const type of ['given_name','surname']) {
    let rows=ranking.prepare('SELECT name,MIN(rank) rank FROM ranking_entries WHERE country=? AND type=? GROUP BY name ORDER BY rank,name LIMIT 500').all(country.code,type);
    if (!rows.length) rows=ranking.prepare('SELECT DISTINCT name FROM reference_entries WHERE country=? AND type=? ORDER BY name LIMIT 500').all(country.code,type);
    for (const {name} of rows) {
      counts.names++;
      const hint=nameReadingHint(country.code,name);
      counts[hint?.kind ?? 'unsupported']++;
    }
  }
  result.push(counts);
}
ranking.close();
const totals=result.reduce((sum,c)=>({names:sum.names+c.names,conventional:sum.conventional+c.conventional,estimated:sum.estimated+c.estimated,unsupported:sum.unsupported+c.unsupported}),{names:0,conventional:0,estimated:0,unsupported:0});
const report={checkedAt:new Date().toISOString(),method:'Up to 500 unique given names and 500 surnames per foreign country. Hints are not pronunciation accuracy measurements; reviewed DB readings are not counted here.',networkRequests:0,totals,countries:result};
writeFileSync(resolve(root,'reports/name-reading-coverage.json'),JSON.stringify(report,null,2)+'\n');
console.log(totals);
