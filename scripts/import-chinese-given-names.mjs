import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { writeDataFile } from './write-data-file.mjs';
const folder = 'data-sources/rankings/foreign/chinese-surnames/';
const sources = [2020, 2021].map(year => JSON.parse(readFileSync(folder + `given-national-${year}.json`, 'utf8')));
const source = sources.at(-1);
const path = 'src/data/cn/given-name/onomaverse.json';
const backup = folder + 'legacy-mixed-given-ranking.json';
if (!existsSync(backup)) writeDataFile(backup, readFileSync(path, 'utf8'));
const dataset = {
  meta: { country:'CN',type:'given_name',source:'公安部《全国姓名报告》2020・2021年 新生儿名字',sourceUrl:source.sourceUrl,dataYear:2021,isOfficial:true,isSample:false,coverageLabel:'2020–2021 新生儿 / newborns · 各年男女別 Top 10',notes:'各年出生、同年12月31日までに戸籍登録済みの新生児。男女別の各年上位10名を別集計として保持し、人数を年度間で合算しません。原表：2020年表6・表7（https://www.xinhuanet.com/politics/2021-02/08/c_1127079509.htm）、2021年表2・表3（出典リンク）。全年齢人口の順位とは別。漢字が異なる同音名を合算しません。収録外の順位を推測しません。' },
  records: sources.flatMap(source => ['male','female'].flatMap(gender => source[gender].map(([name,pinyin,count], index) => ({country:'CN',type:'given_name',name,aliases:[pinyin,pinyin.normalize('NFD').replace(/\p{M}/gu,'')],gender,rank:index+1,totalEntries:10,count,year:source.year,dataYear:source.year,isEstimated:false})))),
};
writeDataFile(path, JSON.stringify(dataset));
const provenancePath='data-sources/SOURCES.json';
const provenance=JSON.parse(readFileSync(provenancePath,'utf8'));
for(const entry of provenance.sources.filter(entry => ['onomaverse','popular-names-by-country'].includes(entry.id))) entry.datasets=entry.datasets.filter(key=>key!=='CN/given_name');
for (const source of sources) if(!provenance.sources.some(entry=>entry.id===`cn-national-given-${source.year}`)) provenance.sources.push({id:`cn-national-given-${source.year}`,name:`公安部《全国姓名报告》${source.year}年新生儿名字`,url:source.sourceUrl,datasets:['CN/given_name'],licenseName:'公開統計の事実情報（名前・人数・順位）のみ。本文・画像は公開アプリに含めません。',licenseUrl:source.sourceUrl,redistributionStatus:'permitted',attribution:`中国公安部户政管理研究中心《全国姓名报告》${source.year}年。拼音は検索補助。`});
writeDataFile(provenancePath,JSON.stringify(provenance,null,2)+'\n');
if(process.argv.includes('--accept-correction')) {
  const p='data/quality-baseline.json';const baseline=JSON.parse(readFileSync(p,'utf8'));const entry=baseline.datasets.find(entry=>entry.key==='CN/given_name');
  if(entry) Object.assign(entry,{records:dataset.records.length,estimated:0,minRank:1,maxRank:10,sha256:createHash('sha256').update(JSON.stringify(dataset)).digest('hex')});
  writeDataFile(p,JSON.stringify(baseline,null,2)+'\n');
}
console.log('CN/given_name: 2020 and 2021 registered newborns; 40 annual rank records, in Han.');
