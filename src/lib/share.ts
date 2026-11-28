import { appRankNote, formatListPosition } from './app-ranking-copy';
import { getRankingScopeCopy } from './ranking-scope-copy';
import type { Diagnosis } from './types';
import { formatName } from './name-presentation';
import { getCountryConfig } from './engine';
import { getUiCopy } from './ui-copy';
export async function createResultImage(result: Diagnosis): Promise<Blob> {
 const sourceCountry = result.input.sourceCountry ?? 'JP';
 const sourceConfig = getCountryConfig(sourceCountry)[0];
 const copy = getUiCopy(sourceCountry);
 const publicPeople = result.meta.rankingScope === "public_people";
 await document.fonts.ready;
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('画像を生成できません');
 ctx.fillStyle='#101212';ctx.fillRect(0,0,1080,1920);
 const flags = new Map<string,HTMLImageElement>();
 await Promise.all([sourceCountry,...result.matches.map(m=>m.country.code),...(result.unavailableCountries ?? []).map(m=>m.country.code)].map(async code=>{try{const img=new Image();img.src=`/flags/${code}.svg`;await img.decode();flags.set(code,img);}catch{}}));
 const text=(value:string,x:number,y:number,size:number,color='#f5f6ee',width=900)=>{ctx.fillStyle=color;ctx.font=`600 ${size}px Arial, "Yu Gothic", sans-serif`;while(ctx.measureText(value).width>width&&size>12){size-=2;ctx.font=`600 ${size}px Arial, "Yu Gothic", sans-serif`;}ctx.fillText(value,x,y);};
 const rightText=(value:string,right:number,y:number,size:number,color='#f5f6ee',width=260)=>{ctx.fillStyle=color;ctx.font=`600 ${size}px Arial, "Yu Gothic", sans-serif`;while(ctx.measureText(value).width>width&&size>12){size-=2;ctx.font=`600 ${size}px Arial, "Yu Gothic", sans-serif`;}ctx.fillText(value,right-ctx.measureText(value).width,y);};
 text('NAMAE',80,115,44);text('YOUR PARALLEL NAME',80,210,24,'#c9ed9d');text(result.record ? formatName(result.record) : result.input.name,80,340,88);text(result.input.type==='given_name'?(result.input.gender==='male'?copy.male:copy.female):copy.surnameLabel,80,400,27,'#a5aba6');text(result.record?`#${result.record.rank}`:copy.unknown,80,520,78,'#f5f6ee',450);text(publicPeople ? `${result.record?.count ?? "—"} / ${result.record?.observation?.totalPeople ?? "—"} people` : result.meta.rankingScope === 'app' && result.record ? formatListPosition(result.record.rank, result.record.totalEntries, copy.lang) : `Rarity Score  ${result.record?`${result.score} / 100`:"—"}`,560,505,30,'#c9ed9d',440);text(publicPeople ? 'PUBLIC PEOPLE · AROUND THE WORLD' : 'IF YOU WERE BORN IN…',80,640,26,'#c9ed9d');
 const rows = [...result.matches, ...(result.unavailableCountries ?? []).map(({country}) => ({country, record:undefined, equivalentRank:undefined}))];
 const rowStep = Math.min(173, Math.floor(900 / Math.max(1,rows.length)));
 rows.forEach(({country,record},i)=>{const y=695+i*rowStep;const bottom=Math.min(120,rowStep-27);ctx.fillStyle='#1b201d';ctx.beginPath();ctx.roundRect(65,y,950,rowStep-15,20);ctx.fill();const flag=flags.get(country.code);if(flag)ctx.drawImage(flag,95,y+13,42,42);else{text(country.flag,95,y+48,31,'#f5f6ee',45);}text(country.nameEn.toUpperCase(),152,y+43,22,'#a5aba6');text(record ? formatName(record) : copy.noData,95,y+bottom,Math.min(60,rowStep*.36),'#f5f6ee',570);if(record?.rank !== undefined&&record.totalEntries){ctx.fillStyle='#303632';ctx.fillRect(700,y+25,2,rowStep-65);rightText('RELATIVE RANK',970,y+43,16,'#7f8982',240);rightText(formatListPosition(record.rank,record.totalEntries,copy.lang),970,y+bottom,34,'#c9ed9d',240);}});
 const sourceFlag = flags.get(sourceCountry);
 if (sourceFlag) ctx.drawImage(sourceFlag,930,260,70,70);
 else text(sourceConfig.flag,930,320,60,'#f5f6ee',75);
 text(copy.tagline,80,1750,32);
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
