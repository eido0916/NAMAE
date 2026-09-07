import type { Diagnosis } from './types';
export async function createResultImage(result: Diagnosis): Promise<Blob> {
 await document.fonts.ready;
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('画像を生成できません');
 ctx.fillStyle='#101212';ctx.fillRect(0,0,1080,1920);
 const flags = new Map<string,HTMLImageElement>();
 await Promise.all(['JP',...result.matches.map(m=>m.country.code)].map(async code=>{const img=new Image();img.src=`/flags/${code}.svg`;await img.decode();flags.set(code,img);}));
 const text=(value:string,x:number,y:number,size:number,color='#f5f6ee',width=900)=>{ctx.fillStyle=color;ctx.font=`600 ${size}px Arial, "Yu Gothic", sans-serif`;while(ctx.measureText(value).width>width&&size>12){size-=2;ctx.font=`600 ${size}px Arial, "Yu Gothic", sans-serif`;}ctx.fillText(value,x,y);};
 const rankingLabel=result.record?.rankingBasis==='overall'?(result.record.isEstimated?'総合推定順位':'読み方順位'):result.record?.rankingBasis==='spelling'?'漢字表記順位':result.record?.rankingBasis==='reading'?'読み方順位':'日本ランキング';
 const dataLabel=result.record?.isEstimated?'公開傾向から推定':result.meta.dataYear?`${result.meta.dataYear}年調査`:'年度不明';
 text('NAMAE®',80,115,44);text('YOUR PARALLEL NAME',80,210,24,'#c9ed9d');text(result.input.name,80,340,88);text(result.input.type==='given_name'?(result.input.gender==='male'?'男性':'女性'):'あなたの苗字',80,400,27,'#a5aba6');text(`${rankingLabel} · ${dataLabel}`,80,480,24,'#a5aba6');text(result.record?`#${result.record.rank}`:'ランキング圏外',80,565,70,'#f5f6ee',450);text(`Rarity Score  ${result.record?`${result.score} / 100`:"—"}`,560,550,28,'#c9ed9d',440);text('IF YOU WERE BORN IN…',80,680,26,'#c9ed9d');
 result.matches.forEach(({country,record},i)=>{const y=735+i*173;ctx.fillStyle='#1b201d';ctx.beginPath();ctx.roundRect(65,y,950,150,20);ctx.fill();ctx.drawImage(flags.get(country.code)!,95,y+13,42,42);text(country.nameEn.toUpperCase(),152,y+43,22,'#a5aba6');text(record.name,95,y+112,54);text(`#${record.rank} · ${result.record&&record.rank===result.record.rank?'日本と同じ順位':'収録範囲内の近い順位'}`,600,y+110,22,'#a5aba6',380);});
 ctx.drawImage(flags.get('JP')!,930,260,70,70);
 text('Same rank. Different country.',80,1710,32);text('各国の公開ランキングから取得できる範囲を使用。',80,1770,24,'#a5aba6');text('日本と同じ順位の名前を比較。',80,1810,24,'#a5aba6');text('NAMAE',80,1870,26,'#c9ed9d');text('Flags: Twemoji · CC BY 4.0',600,1870,16,'#a5aba6',400);
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('画像を保存できません')),'image/png'));
}
function download(blob:Blob) { const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='namae-story.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000); }
export async function saveResult(result:Diagnosis) {download(await createResultImage(result));return '画像を保存しました。ダウンロードをご確認ください。';}
export async function shareResult(result:Diagnosis) { const blob=await createResultImage(result);const file=new File([blob],'namae-story.png',{type:'image/png'});const text=`もし海外で生まれていたら、${result.input.name}は ${result.matches.map(m=>`${m.country.flag} ${m.record.name}`).join(' / ')}。#NAMAE（各国公開ランキング）`;
 if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'NAMAE',text});return '共有先に結果を渡しました。';}
 if(navigator.share){await navigator.share({title:'NAMAE',text});return '結果を共有しました。';}
 if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return '結果をコピーしました。SNSに貼り付けて共有できます。';}
 download(blob);return 'このブラウザーでは直接共有できないため、共有用画像を保存しました。';
}
