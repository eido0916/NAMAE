import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import JSZip from 'jszip';
import { readDatasets, hasExpectedScript } from './data-utils.mjs';
const root=resolve(import.meta.dirname,'..');
const cache=join(root,'data-sources/rankings/foreign');
const datasets=readDatasets(join(root,'src/data'));
const audit=[];
const clean=name=>name.normalize('NFKC').trim().replace(/[’‘]/g,"'").replace(/[‐‑–]/g,'-').replace(/\s+/g,' ');
const read=name=>JSON.parse(gunzipSync(readFileSync(join(cache,name+'.json.gz'))));
function save(country,type,rows,meta){
 const target=datasets.find(x=>x.dataset.meta.country===country&&x.dataset.meta.type===type);
 if(!target)throw Error('Missing dataset '+country+'/'+type);
 const groups=new Map(); let rejected=0;
 for(const [raw,count,sex] of rows){
  const name=clean(raw); const gender=type==='given_name'?sex:undefined;
  if(!hasExpectedScript(country,name)||!Number.isSafeInteger(count)||count<=0||(type==='given_name'&&!['male','female'].includes(gender))){rejected++;continue;}
  const key=(gender??'')+'|'+name.toLowerCase();
  const old=groups.get(key);
  if(old)old.count+=count;
  else groups.set(key,{country,type,name,count,...(gender?{gender}:{}),year:meta.dataYear,dataYear:meta.dataYear,isEstimated:false});
 }
 const records=[];
 for(const gender of type==='given_name'?['male','female']:[undefined]){
  const rows=[...groups.values()].filter(x=>x.gender===gender).sort((a,b)=>b.count-a.count||(a.name<b.name?-1:a.name>b.name?1:0));
  for(const [i,r] of rows.entries())records.push({...r,rank:i+1,totalEntries:rows.length});
 }
 if(!records.length)throw Error('Empty import '+country+'/'+type);
 // An ordinal from published counts, not a fabricated national census rank.
 const dataset={meta:{country,type,isOfficial:true,isSample:false,...meta,notes:meta.notes+' 公開人数の降順で独自集計。同数は名前の文字順。非公開人数は加算しません。'},records};
 writeFileSync(target.path,JSON.stringify(dataset));
 audit.push({country,type,before:target.dataset.records.length,after:records.length,rejected,source:meta.sourceUrl,coverageLabel:meta.coverageLabel});
 console.log(country,type,records.length,'rejected',rejected);
}
function meta(source,sourceUrl,dataYear,coverageLabel,notes){return {source,sourceUrl,dataYear,coverageLabel,notes};}
for(const type of ['given_name','surname']){
 const given=type==='given_name';
 save('FI',type,read('fi-'+(given?'given':'surnames')+'-2026'),meta('Digi- ja väestötietovirasto (DVV)','https://avoindata.suomi.fi/data/fi/dataset/57282ad6-3ab1-48fb-983a-8aba5ff8d29a',2026,'2026年8月・フィンランド国籍の存命者',given?'全ての下の名前（第2名以降も含む）。5人未満は非公開。':'20人未満は非公開。'));
 save('ES',type,read('es-'+(given?'given':'surnames')+'-2025'),meta('Instituto Nacional de Estadística (INE)','https://www.ine.es/dyngs/INEbase/operacion.htm?c=Estadistica_C&cid=1254736177009&idp=1254735572981&menu=resultados',2025,'2025年1月・スペイン居住者',given?'20人以上の名前。複合名も原表のまま収録。':'第一姓を持つ人数。第二姓の人数とは合算しません。20人以上。'));
 save('PL',type,read('pl-'+(given?'given':'surname')+'-2026'),meta('Ministerstwo Cyfryzacji — PESEL','https://dane.gov.pl/pl/dataset/'+(given?'1501':'1681'),2026,given?'2026年1月・PESEL登録者（故人を含む）':'2026年1月・PESELの存命者',given?'第一名の公開件数を男女別に集計。':'男女の同一表記を合算。男女で異なる姓表記は別の名字として保持。'));
 save('BR',type,read('br-'+(given?'given':'surnames')+'-2022'),meta('IBGE Censo 2022 / Gabriel Lobo compilation','https://huggingface.co/datasets/olob0/ibge-nomes-no-brasil-2022',2022,'2022年・ブラジル国勢調査',given?'IBGE公開の男女別人数。性別人数が非公開の名前はその性別に追加しません。':'IBGE公開の名字別人数。アクセントのない原データ表記を保持。'));
}
save('GB','given_name',read('gb-given-1996-2025'),meta('Office for National Statistics','https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/datasets/babynamesinenglandandwalesfrom1996',2025,'1996–2025年・イングランド／ウェールズ出生累計','全収録年の公開人数を男女別に合算。英国全域ではありません。各年3人未満の人数は非公開。'));
const frZip=await JSZip.loadAsync(readFileSync(join(cache,'fr-2024.zip')));
const frCsv=await frZip.files[Object.keys(frZip.files).find(x=>x.endsWith('.csv'))].async('string');
const frRows=[];
for(const line of frCsv.split(/\r?\n/).slice(1)){
 const [sex,name,year,count]=line.split(';');
 if(['1','2'].includes(sex)&&/^\d{4}$/.test(year)&&Number(year)>=1900&&Number(year)<=2024)frRows.push([name,Number(count),sex==='1'?'male':'female']);
}
save('FR','given_name',frRows,meta('Insee — Fichier des prénoms','https://www.insee.fr/fr/statistiques/8894961',2024,'1900–2024年・フランス出生累計','公開されている各年の丸め済み人数を合算。年次順位ではありません。'));
const frSurnames=await JSZip.loadAsync(readFileSync(join(cache,'fr-surnames-1891-2000.zip')));
const surnameText=new TextDecoder('windows-1252').decode(await frSurnames.files[Object.keys(frSurnames.files).find(x=>x.endsWith('.txt'))].async('uint8array'));
const surnameRows=surnameText.split(/\r?\n/).slice(1).filter(Boolean).map(line=>{const [name,...counts]=line.split('\t');return [name,counts.reduce((s,n)=>s+Number(n),0)];}).filter(([name])=>name!=='AUTRES NOMS');
save('FR','surname',surnameRows,meta('Insee — Fichier des noms','https://www.insee.fr/fr/statistiques/3536630',2000,'1891–2000年・フランス出生累計','期間内に30回以上付けられた姓。統計対象範囲は出典の説明を参照。現在の人口順位ではありません。'));
const usRows=[];
for(const file of readdirSync(join(root,'data-sources/rankings')).filter(x=>/^us-\d{4}\.txt$/.test(x))){
 for(const line of readFileSync(join(root,'data-sources/rankings',file),'utf8').split(/\r?\n/)){
  const [name,sex,count]=line.split(',');if(['M','F'].includes(sex))usRows.push([name,Number(count),sex==='M'?'male':'female']);
 }
}
save('US','given_name',usRows,meta('U.S. Social Security Administration','https://www.ssa.gov/oact/babynames/limits.html',2020,'1989–2020年・米国出生登録累計','ローカルに収録する32年分の公開件数を男女別に合算。各年5件未満の名前は非公開。'));
writeFileSync(join(root,'reports/official-import.json'),JSON.stringify(audit,null,2)+'\n');
