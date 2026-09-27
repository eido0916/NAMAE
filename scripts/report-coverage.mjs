import { readFileSync, writeFileSync } from 'node:fs';
import { readDatasets } from './data-utils.mjs';
const target=10000;
const datasets=readDatasets('src/data');
const countries=JSON.parse(readFileSync('src/data/countries.json','utf8')).filter(c=>c.enabled);
const normalized=s=>s.normalize('NFKC').toLowerCase();
const coverage=countries.map(country=>{
 const rows={};
 for(const [field,type,gender] of [['male','given_name','male'],['female','given_name','female'],['surname','surname',undefined]]){
  const dataset=datasets.find(x=>x.dataset.meta.country===country.code&&x.dataset.meta.type===type)?.dataset;
  const records=(dataset?.records??[]).filter(r=>(!gender||r.gender===gender)&&(country.code!=='JP'||type!=='given_name'||r.rankingBasis==='overall'));
  const distinct=new Set(records.map(r=>normalized(r.name)));
  const published=new Set(records.filter(r=>!r.isEstimated).map(r=>normalized(r.name)));
  const inputs=new Set(records.flatMap(r=>[r.name,...(r.aliases??[])]).map(normalized));
  rows[field]={names:distinct.size,withPublishedEvidence:published.size,estimated:distinct.size-published.size,searchableSpellings:inputs.size,shortfall:Math.max(0,target-distinct.size),source:dataset?.meta.sourceUrl??null};
 }
 return {country:country.code,name:country.nameJa,...rows,meetsTarget:Object.values(rows).every(x=>x.names>=target)};
});
const report={targetPerCategory:target,countries:coverage.length,countriesMeetingAllTargets:coverage.filter(c=>c.meetsTarget).length,totalRecords:datasets.reduce((s,x)=>s+x.dataset.records.length,0),coverage};
writeFileSync('reports/name-coverage.json',JSON.stringify(report,null,2)+'\n');
writeFileSync('reports/name-coverage.md','# 国別の名前収録状況\n\n各区分の目標は10,000種類。年の重複は除外。名字は男女合計。日本の読み方件数と漢字表記数は別に数えます。辞書由来の推定順位を含むため、件数は人口調査の網羅性を意味しません。\n\n'+
'全区分達成: '+report.countriesMeetingAllTargets+' / '+report.countries+'か国。レコード総数: '+report.totalRecords.toLocaleString('ja-JP')+'。\n\n'+
'|国|男性名|女性名|名字|全区分1万以上|\n|---|---:|---:|---:|---|\n'+coverage.map(c=>'|'+c.name+' ('+c.country+')|'+c.male.names+'|'+c.female.names+'|'+c.surname.names+'|'+(c.meetsTarget?'達成':'未達')+'|').join('\n')+'\n\n未達は公開データの未取得・公開範囲の制限によるものです。未収録を希少名と断定したり、他国の名前を複製して件数を増やすことはしません。詳細な出典・推定件数・不足数はJSON版を参照。\n');
console.log(JSON.stringify({totalRecords:report.totalRecords,countriesMeetingAllTargets:report.countriesMeetingAllTargets,countries:report.countries}));
