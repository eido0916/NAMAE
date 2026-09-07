import { mkdirSync, writeFileSync } from 'node:fs';
// Fictional rankings for MVP interaction testing. Not population statistics.
const rows = [
 ['JP','日本','Japan','🇯🇵','はると/陽翔/Haruto,そうた/颯太/Sota,れん/蓮/Ren,ゆうと/悠斗/Yuto,みなと/湊/Minato,りく/陸/Riku,あおい/葵/Aoi,ひなた/陽向/Hinata,けんと/健人/Kento,たくみ/匠/Takumi,ゆうき/勇気/Yuki,かい/海/Kai','ゆい/結衣/Yui,あおい/葵/Aoi,さくら/桜/Sakura,ひまり/陽葵/Himari,りん/凛/Rin,めい/芽依/Mei,はな/花/Hana,みお/美桜/Mio,あかり/明莉/Akari,ゆな/優奈/Yuna,ことね/琴音/Kotone,しおり/栞/Shiori','佐藤/さとう/Sato,鈴木/すずき/Suzuki,高橋/たかはし/Takahashi,田中/たなか/Tanaka,伊藤/いとう/Ito,渡辺/渡邊/わたなべ/Watanabe,山本/やまもと/Yamamoto,中村/なかむら/Nakamura,小林/こばやし/Kobayashi,加藤/かとう/Kato,吉田/よしだ/Yoshida,山田/やまだ/Yamada'],
 ['US','アメリカ','United States','🇺🇸','Liam,Noah,Oliver,James,Elijah,William,Henry,Lucas,Benjamin,Theodore,Jack,Levi,Alexander,Jackson,Mateo,Daniel,Michael,Mason,Sebastian,Ethan,Ezra,Owen,Samuel,Hudson','Olivia,Emma,Charlotte,Amelia,Sophia,Isabella,Ava,Mia,Evelyn,Luna,Harper,Camila,Sofia,Scarlett,Elizabeth,Eleanor,Emily,Chloe,Mila,Violet,Penelope,Gianna,Aria,Abigail','Smith,Johnson,Williams,Brown,Jones,Garcia,Miller,Davis,Rodriguez,Martinez,Hernandez,Lopez,Gonzalez,Wilson,Anderson,Thomas,Taylor,Moore,Jackson,Martin,Lee,Perez,Thompson,White'],
 ['GB','イギリス','United Kingdom','🇬🇧','Oliver,George,Harry,Noah,Jack,Leo,Arthur,Muhammad,Oscar,Charlie,Henry,Freddie','Olivia,Amelia,Isla,Ava,Emily,Isabella,Mia,Poppy,Ella,Lily,Sophia,Grace','Smith,Jones,Taylor,Brown,Williams,Wilson,Johnson,Davies,Robinson,Wright,Thompson,Evans'],
 ['FR','フランス','France','🇫🇷','Gabriel,Léo,Raphaël,Arthur,Louis,Lucas,Adam,Jules,Hugo,Maël,Noah,Gabin','Jade,Louise,Emma,Ambre,Alice,Rose,Anna,Alba,Romy,Mia,Lina,Chloé','Martin,Bernard,Thomas,Petit,Robert,Richard,Durand,Dubois,Moreau,Laurent,Simon,Michel'],
 ['KR','韓国','South Korea','🇰🇷','Min-jun,Seo-jun,Do-yun,Ye-jun,Si-woo,Ha-jun,Ju-won,Ji-ho,Ji-hu,Jun-woo,Jun-seo,Geon-u','Seo-yeon,Seo-yun,Ji-woo,Seo-hyeon,Ha-eun,Ha-yun,Min-seo,Ji-yu,Yun-seo,Chae-won,Su-a,Ji-a','Kim,Lee,Park,Choi,Jung,Kang,Cho,Yoon,Jang,Lim,Han,Oh'],
 ['DE','ドイツ','Germany','🇩🇪','Noah,Matteo,Leon,Finn,Paul,Elias,Emil,Felix,Louis,Henry,Ben,Theo','Emilia,Hannah,Emma,Sophia,Mia,Lina,Mila,Ella,Lea,Klara,Marie,Ida','Müller,Schmidt,Schneider,Fischer,Weber,Meyer,Wagner,Becker,Schulz,Hoffmann,Schäfer,Koch']
];
const registry=[];
const countries=[];
for (const [code,nameJa,nameEn,flag,male,female,surnames] of rows) {
 countries.push({code,nameJa,nameEn,flag,enabled:true,supportsGivenName:true,supportsSurname:true});
 for (const type of ['given_name','surname']) {
  const records=[];
  for (const [gender,list] of type==='surname' ? [['unknown',surnames]] : [['male',male],['female',female]]) {
   const names=list.split(','); names.forEach((entry,i)=>{const [name,...aliases]=entry.split('/');records.push({country:code,type,name,aliases,rank:i+1,totalEntries:names.length,gender,...(type==='given_name'?{year:2007}:{}),dataYear:2007});});
  }
  const data={meta:{country:code,type,source:'NAMAE 動作確認用サンプル',dataYear:2007,isOfficial:false,isSample:true,notes:'順位は架空のサンプルです。2007年の固定データを全入力年に使用します。実際の人気・希少性を示すものではありません。'},records};
  const dir=`src/data/${code.toLowerCase()}/${type.replace('_','-')}`;mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/sample.json`,JSON.stringify(data,null,2)+'\n');registry.push(data);
 }
}
writeFileSync('src/data/registry.json',JSON.stringify(registry,null,2)+'\n');
writeFileSync('src/data/countries.json',JSON.stringify(countries,null,2)+'\n');
