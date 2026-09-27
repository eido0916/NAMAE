import { readFileSync, writeFileSync, renameSync } from 'node:fs';
const datasetPath='src/data/jp/given-name/sample.json';
const dictionaryPath='src/data/dictionary/names.json';
const dataset=JSON.parse(readFileSync(datasetPath,'utf8'));
const dictionary=JSON.parse(readFileSync(dictionaryPath,'utf8'));
const normalize=s=>s.normalize('NFKC').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));
const latest=new Map();
for(const row of JSON.parse(readFileSync('data-sources/rankings/jp-baby-calendar.json','utf8')).records){
 const gender=row.sex==='m'?'male':'female';const key=gender+'|'+normalize(row.reading);
 if(!latest.has(key)||latest.get(key).year<row.year)latest.set(key,{...row,gender});
}
const records=new Map(dataset.records.filter(r=>r.rankingBasis==='overall').map(r=>[r.gender+'|'+normalize(r.name),r]));
const entries=new Map(dictionary.map(r=>[r.gender+'|'+normalize(r.reading),r]));
let added=0, corrected=0;
for(const [key,row] of latest){
 let record=records.get(key);
 if(!record){record={country:'JP',type:'given_name',gender:row.gender,name:normalize(row.reading),rankingBasis:'overall'};dataset.records.push(record);records.set(key,record);added++;}
 else if(record.isEstimated||record.rank!==row.rank)corrected++;
 Object.assign(record,{rank:row.rank,year:row.year,dataYear:row.year,isEstimated:false});
 if(!entries.has(key)){const entry={gender:row.gender,reading:record.name,aliases:[]};dictionary.push(entry);entries.set(key,entry);}
}
for(const gender of ['male','female']){
 const group=dataset.records.filter(r=>r.gender===gender&&r.rankingBasis==='overall');
 for(const r of group)r.totalEntries=Math.max(group.length,r.rank);
}
dataset.meta.notes='公開された読み順位を優先。名前辞書だけの読みは推定の参考順位であり、全国人口順位ではありません。かな表記名・複数性別分類・公開順位の辞書未収録名を含みます。';
for(const [path,value] of [[datasetPath,dataset],[dictionaryPath,dictionary]]){writeFileSync(path+'.tmp',JSON.stringify(value));renameSync(path+'.tmp',path);}
console.log({added,corrected,total:dataset.records.length});
