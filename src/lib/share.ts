import { appRankNote, formatListPosition, usageEvidenceLabel } from './app-ranking-copy';
import { getRankingScopeCopy } from './ranking-scope-copy';
import type { Diagnosis } from './types';
import { formatName } from './name-presentation';
import { getCountryConfig } from './engine';
import { formatEquivalentRank, getUiCopy, localizedCountryName } from './ui-copy';
export async function createResultImage(result: Diagnosis): Promise<Blob> {
 const sourceCountry = result.input.sourceCountry ?? 'JP';
 const sourceConfig = getCountryConfig(sourceCountry)[0];
 const copy = getUiCopy(sourceCountry);
 const publicPeople = result.meta.rankingScope === "public_people";
 const scopeCopy = getRankingScopeCopy(copy.lang);
 await document.fonts.ready;
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('画像を生成できません');
 ctx.fillStyle='#101212';ctx.fillRect(0,0,1080,1920);
 const flags = new Map<string,HTMLImageElement>();
 await Promise.all([sourceCountry,...result.matches.map(m=>m.country.code),...(result.unavailableCountries ?? []).map(m=>m.country.code)].map(async code=>{try{const img=new Image();img.src=`/flags/${code}.svg`;await img.decode();flags.set(code,img);}catch{}}));
 const text=(value:string,x:number,y:number,size:number,color='#f5f6ee',width=900)=>{ctx.fillStyle=color;ctx.font=`600 ${size}px Arial, "Yu Gothic", sans-serif`;while(ctx.measureText(value).width>width&&size>12){size-=2;ctx.font=`600 ${size}px Arial, "Yu Gothic", sans-serif`;}ctx.fillText(value,x,y);};
 const rankingLabel=result.meta.rankingScope === "app" ? `${localizedCountryName(sourceCountry, sourceCountry)} · ${copy.rank}` : publicPeople ? scopeCopy.rank : sourceCountry !== 'JP' ? `${localizedCountryName(sourceCountry,sourceCountry)} · ${copy.rank}` : result.record?.rankingBasis==='overall'?(result.record.isEstimated?'総合推定順位':'読み方順位'):result.record?.rankingBasis==='spelling'?'漢字表記順位':result.record?.rankingBasis==='reading'?'読み方順位':`${sourceConfig.nameJa}ランキング`;
 const dataLabel=result.meta.rankingScope === "app" ? appRankNote(copy.lang) : publicPeople ? (result.record?.observation?.asOf ?? String(result.meta.dataYear)) : sourceCountry !== 'JP' ? `${copy.survey} · ${result.meta.dataYear || copy.unknownYear}` : result.record?.isEstimated?'公開傾向から推定':result.meta.dataYear?`${result.meta.dataYear}年調査`:'年度不明';
 text('NAMAE',80,115,44);text('YOUR PARALLEL NAME',80,210,24,'#c9ed9d');text(result.record ? formatName(result.record) : result.input.name,80,340,88);text(result.input.type==='given_name'?(result.input.gender==='male'?copy.male:copy.female):copy.surnameLabel,80,400,27,'#a5aba6');text(`${rankingLabel} · ${dataLabel}`,80,480,24,'#a5aba6');text(result.record?`#${result.record.rank}`:copy.unknown,80,565,70,'#f5f6ee',450);text(publicPeople ? `${result.record?.count ?? "—"} / ${result.record?.observation?.totalPeople ?? "—"} people` : result.meta.rankingScope === 'app' && result.record ? formatListPosition(result.record.rank, result.record.totalEntries, copy.lang) : `Rarity Score  ${result.record?`${result.score} / 100`:"—"}`,560,550,28,'#c9ed9d',440);text(publicPeople ? 'PUBLIC PEOPLE · AROUND THE WORLD' : 'IF YOU WERE BORN IN…',80,680,26,'#c9ed9d');
 const rows = [...result.matches, ...(result.unavailableCountries ?? []).map(({country}) => ({country, record:undefined, equivalentRank:undefined}))];
 const rowStep = Math.min(173, Math.floor(900 / Math.max(1,rows.length)));
 rows.forEach(({country,record,equivalentRank},i)=>{const y=735+i*rowStep;const bottom=Math.min(112,rowStep-30);ctx.fillStyle='#1b201d';ctx.beginPath();ctx.roundRect(65,y,950,rowStep-15,20);ctx.fill();const flag=flags.get(country.code);if(flag)ctx.drawImage(flag,95,y+13,42,42);else{text(country.flag,95,y+48,31,'#f5f6ee',45);}text(country.nameEn.toUpperCase(),152,y+43,22,'#a5aba6');text(record ? formatName(record) : copy.noData,95,y+bottom,Math.min(54,rowStep*.32),'#f5f6ee',600);if(record?.rank !== undefined)text(equivalentRank === undefined ? `#${record.rank}` : `#${record.rank} · ${formatEquivalentRank(equivalentRank, copy.lang)}`,720,y+bottom,26,'#a5aba6',260);if(record?.usageEvidence)text(usageEvidenceLabel(record.usageEvidence,copy.lang),540,y+43,19,'#a5aba6',440);});
 const sourceFlag = flags.get(sourceCountry);
 if (sourceFlag) ctx.drawImage(sourceFlag,930,260,70,70);
 else text(sourceConfig.flag,930,320,60,'#f5f6ee',75);
 text(copy.tagline,80,1710,32);text(result.meta.rankingScope === 'app' ? appRankNote(copy.lang) : sourceCountry === 'JP' ? '順位の対象・年度・出典は結果ページで確認。' : copy.rankSource,80,1770,24,'#a5aba6');
 if (!result.matches.some(match => match.equivalentRank !== undefined) || publicPeople) {
   text(result.meta.rankingScope === 'app' ? copy.sameRank : publicPeople ? 'PUBLIC PEOPLE · NOT POPULATION RANK' : sourceCountry === 'JP' ? (result.record?'同順位を優先。資料内順位は全国順位と比較不可。':'順位データがありません。') : (result.record ? copy.sameRank : copy.noData),80,1810,24,'#a5aba6');
 }
 text('NAMAE',80,1870,26,'#c9ed9d');text('Flags: Twemoji · CC BY 4.0',600,1870,16,'#a5aba6',400);
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('画像を保存できません')),'image/png'));
}
function download(blob:Blob) { const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='namae-story.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000); }
export async function saveResult(result:Diagnosis) {download(await createResultImage(result));return '画像を保存しました。ダウンロードをご確認ください。';}
export async function shareResult(result:Diagnosis) { const blob=await createResultImage(result);const file=new File([blob],'namae-story.png',{type:'image/png'});const scope=result.meta.rankingScope === 'app' ? appRankNote('ja') : result.meta.rankingScope === 'public_people' ? '公開人物データ内の順位（全国人口・出生の順位ではありません）' : result.matches.length ? '各資料の対象内の順位' : '順位データなし';const copy=getUiCopy(result.input.sourceCountry);const sourceName=result.record?formatName(result.record):result.input.name;const names=result.matches.map(m=>`${m.country.flag} ${formatName(m.record)}`).join(' / ');const text=result.input.sourceCountry && result.input.sourceCountry !== 'JP' ? `${copy.tagline} ${sourceName} → ${names}. #NAMAE (${result.matches.length ? copy.rank : copy.noData})` : `もし海外で生まれていたら、${sourceName}は ${names}。#NAMAE（${scope}）`;
 const summary = result.meta.rankingScope === 'app' ? text + ' · ' + appRankNote(copy.lang) : result.meta.rankingScope === 'public_people' ? text + ' · ' + getRankingScopeCopy(copy.lang).hint : text;
 const sharedText = summary + '\n' + window.location.origin + '/';
 try {
   if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'NAMAE',text:sharedText});return '共有先に結果を渡しました。';}
   if(navigator.share){await navigator.share({title:'NAMAE',text:sharedText});return '結果を共有しました。';}
 } catch (error) {
   if (error instanceof DOMException && error.name === 'AbortError') throw error;
 }
 try {
   if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(sharedText);return '結果をコピーしました。SNSに貼り付けて共有できます。';}
 } catch { /* A browser may require another gesture for clipboard access. */ }
 download(blob);return 'このブラウザーでは直接共有できないため、共有用画像を保存しました。';
}
