import { readdirSync,readFileSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root='src/data';
const files=[];
function walk(dir){for(const item of readdirSync(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isDirectory())walk(path);else if(item.name.endsWith('.json'))files.push(path);}}
for(const dir of readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()&&d.name!=='dictionary'))walk(join(root,dir.name));
const datasets=files.sort().map(f=>JSON.parse(readFileSync(f,'utf8')));
const seen=new Set();
for(const d of datasets){const key=`${d.meta.country}/${d.meta.type}`;if(seen.has(key))throw Error(`Duplicate dataset: ${key}`);seen.add(key);if(!d.records.length)throw Error(`Empty dataset: ${key}`);for(const r of d.records){if(r.rank<1||r.rank>r.totalEntries)throw Error(`Invalid rank: ${r.name}`);}}
writeFileSync(join(root,'registry.json'),JSON.stringify(datasets,null,2)+'\n');
console.log(`Registered ${datasets.length} datasets.`);
