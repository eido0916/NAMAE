import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { writeDataFile } from './write-data-file.mjs';
const folder = 'data-sources/rankings/foreign/chinese-surnames/';
const source = JSON.parse(readFileSync(folder + 'given-national-2020.json', 'utf8'));
const path = 'src/data/cn/given-name/onomaverse.json';
const backup = folder + 'legacy-mixed-given-ranking.json';
if (!existsSync(backup)) writeDataFile(backup, readFileSync(path, 'utf8'));
const dataset = {
  meta: { country:'CN',type:'given_name',source:'公安部《二〇二〇年全国姓名报告》表6・表7',sourceUrl:source.sourceUrl,dataYear:2020,isOfficial:true,isSample:false,coverageLabel:'2020 新生儿 / newborns · Top 10',notes:'2020年出生、同年12月31日までに戸籍登録済みの新生児。男女別の上位10名。全年齢人口の順位とは別。漢字が異なる同音名を合算しません。収録外の順位を推測しません。' },
  records: ['male','female'].flatMap(gender => source[gender].map(([name,pinyin,count], index) => ({country:'CN',type:'given_name',name,aliases:[pinyin,pinyin.normalize('NFD').replace(/\p{M}/gu,'')],gender,rank:index+1,totalEntries:10,count,year:2020,dataYear:2020,isEstimated:false}))),
};
writeDataFile(path, JSON.stringify(dataset));
const provenancePath='data-sources/SOURCES.json';
const provenance=JSON.parse(readFileSync(provenancePath,'utf8'));
for(const entry of provenance.sources.filter(entry => ['onomaverse','popular-names-by-country'].includes(entry.id))) entry.datasets=entry.datasets.filter(key=>key!=='CN/given_name');
if(!provenance.sources.some(entry=>entry.id==='cn-national-given-2020')) provenance.sources.push({id:'cn-national-given-2020',name:dataset.meta.source,url:source.sourceUrl,datasets:['CN/given_name'],licenseName:'公開統計の事実情報（名前・人数・順位）のみ。本文・画像は公開アプリに含めません。',licenseUrl:source.sourceUrl,redistributionStatus:'permitted',attribution:'中国公安部户政管理研究中心《二〇二〇年全国姓名报告》表6・表7（新華社掲載）。拼音は検索補助。'});
writeDataFile(provenancePath,JSON.stringify(provenance,null,2)+'\n');
if(process.argv.includes('--accept-correction')) {
  const p='data/quality-baseline.json';const baseline=JSON.parse(readFileSync(p,'utf8'));const entry=baseline.datasets.find(entry=>entry.key==='CN/given_name');
  if(entry) Object.assign(entry,{records:20,estimated:0,minRank:1,maxRank:10,sha256:createHash('sha256').update(JSON.stringify(dataset)).digest('hex')});
  writeDataFile(p,JSON.stringify(baseline,null,2)+'\n');
}
console.log('CN/given_name: 2020 registered newborns; 10 male and 10 female names, in Han.');
