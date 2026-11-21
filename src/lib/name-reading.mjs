// Offline display hints, not verified pronunciations or name-identity evidence.
// Reviewed readings from the detail database always take precedence in the UI.
import countries from '../data/countries.json' with { type: 'json' };
const knownCountries = new Set(countries.map(country=>country.code));
const dictionaries = {
  en: `Emily=エミリー|Michael=マイケル|Ashley=アシュリー|Jacob=ジェイコブ|Jessica=ジェシカ|Matthew=マシュー|Christopher=クリストファー|Emma=エマ|Joshua=ジョシュア|Samantha=サマンサ|Daniel=ダニエル|Olivia=オリビア|Andrew=アンドリュー|Elizabeth=エリザベス|Joseph=ジョセフ|Sarah=サラ|Hannah=ハンナ|William=ウィリアム|David=デイビッド|Madison=マディソン|Abigail=アビゲイル|James=ジェームズ|Isabella=イザベラ|Nicholas=ニコラス|Anthony=アンソニー|Sophia=ソフィア|John=ジョン|Taylor=テイラー|Alexis=アレクシス|Ryan=ライアン|Alexander=アレクサンダー|Lauren=ローレン|Kayla=ケイラ|Tyler=タイラー|Amanda=アマンダ|Brandon=ブランドン|Jonathan=ジョナサン|Victoria=ビクトリア|Alyssa=アリッサ|Benjamin=ベンジャミン|Ava=エイヴァ|Zachary=ザカリー|Ethan=イーサン|Megan=メーガン|Justin=ジャスティン|Rachel=レイチェル|Brittany=ブリタニー|Robert=ロバート|Jennifer=ジェニファー|Noah=ノア|Brianna=ブリアナ|Samuel=サミュエル|Austin=オースティン|Stephanie=ステファニー|Dylan=ディラン|Mia=ミア|Christian=クリスチャン|Natalie=ナタリー|Kevin=ケビン|Nicole=ニコール|Grace=グレース|Nathan=ネイサン|Anna=アンナ|Thomas=トーマス|Jasmine=ジャスミン|Logan=ローガン|Chloe=クロエ|Jordan=ジョーダン|Aaron=アーロン|Katherine=キャサリン|Alexandra=アレクサンドラ|Jose=ホセ|Kyle=カイル|Morgan=モーガン|Allison=アリソン|Elijah=イライジャ|Mason=メイソン|Rebecca=レベッカ|Amber=アンバー|Gabriel=ゲイブリエル|Caleb=ケイレブ|Danielle=ダニエル|Eric=エリック|Julia=ジュリア|Charles=チャールズ|Kimberly=キンバリー|Cameron=キャメロン|Savannah=サバンナ|Liam=リアム|Maria=マリア|Adam=アダム|Ella=エラ|Hailey=ヘイリー|Jason=ジェイソン|Jackson=ジャクソン|Sydney=シドニー|Lucas=ルーカス|Michelle=ミシェル|Luke=ルーク|Oliver=オリバー|Harry=ハリー|Jack=ジャック|George=ジョージ|Oscar=オスカー|Charlie=チャーリー|Henry=ヘンリー|Archie=アーチー|Freddie=フレディ|Alfie=アルフィー|Theo=セオ|Arthur=アーサー|Leo=レオ|Lily=リリー|Lilly=リリー|Amelia=アメリア|Isla=アイラ|Isabelle=イザベル|Sophie=ソフィー|Alice=アリス|Daisy=デイジー|Florence=フローレンス|Ruby=ルビー|Rosie=ロージー|Eleanor=エレノア|Maisie=メイジー|Poppy=ポピー|Evie=イーヴィー|Phoebe=フィービー|Freya=フレイヤ|Craig=クレイグ|Ian=イアン|Sean=ショーン|Shawn=ショーン|Stephen=スティーブン|Steven=スティーブン|Peter=ピーター|Paul=ポール|Philip=フィリップ|Phillip=フィリップ|Mark=マーク|Martin=マーティン|Richard=リチャード|Edward=エドワード|Patrick=パトリック|Louis=ルイ／ルイス|Lewis=ルイス|Jan=ジャン／ヤン|Anne=アン|Mary=メアリー|Jane=ジェーン|Joan=ジョーン|Rose=ローズ|Susan=スーザン|Helen=ヘレン|Lucy=ルーシー|Nancy=ナンシー|Dennis=デニス|Scott=スコット|Evan=エヴァン|Owen=オーウェン|Connor=コナー|Duncan=ダンカン|Graham=グレアム|Shane=シェイン|Isaac=アイザック|Hugh=ヒュー|Hughes=ヒューズ|Smith=スミス|Jones=ジョーンズ|Brown=ブラウン|Williams=ウィリアムズ|Johnson=ジョンソン|Wilson=ウィルソン|Davis=デイビス|Miller=ミラー|Anderson=アンダーソン|Moore=ムーア|White=ホワイト|Robinson=ロビンソン|Thompson=トンプソン|Young=ヤング|Walker=ウォーカー|Wright=ライト|King=キング|Woods=ウッズ|Wood=ウッド|Clark=クラーク|Clarke=クラーク|Green=グリーン|Hill=ヒル|Baker=ベイカー|Turner=ターナー|Hall=ホール|Edwards=エドワーズ|Collins=コリンズ|Stewart=スチュワート|Roberts=ロバーツ|Evans=エヴァンズ|Potter=ポッター`,
  fr: `Marie=マリー|Jean=ジャン|Pierre=ピエール|Michel=ミシェル|Philippe=フィリップ|Alain=アラン|Nathalie=ナタリー|Isabelle=イザベル|Sylvie=シルヴィー|Catherine=カトリーヌ|Christine=クリスティーヌ|Patrick=パトリック|Christian=クリスチャン|Christophe=クリストフ|Laurent=ローラン|Vincent=ヴァンサン|Frédéric=フレデリック|Sébastien=セバスチャン|Nicolas=ニコラ|Thomas=トマ|Julien=ジュリアン|Olivier=オリヴィエ|Guillaume=ギヨーム|Stéphane=ステファン|Stéphanie=ステファニー|Sophie=ソフィー|Julie=ジュリー|Camille=カミーユ|Charlotte=シャルロット|Louise=ルイーズ|Emma=エマ|Léa=レア|Manon=マノン|Chloé=クロエ|Lucie=リュシー|Louis=ルイ|Lucas=リュカ|Gabriel=ガブリエル|Raphaël=ラファエル|Arthur=アルチュール|Paul=ポール|Hugo=ユーゴ|Jules=ジュール|Antoine=アントワーヌ|Alexandre=アレクサンドル|François=フランソワ|Jacques=ジャック|Henri=アンリ|Charles=シャルル|Georges=ジョルジュ|Bernard=ベルナール|Robert=ロベール|David=ダヴィッド|Daniel=ダニエル|Joseph=ジョゼフ|Martin=マルタン|Richard=リシャール|Simon=シモン|Benjamin=バンジャマン|Maxime=マクシム|Baptiste=バティスト|Clément=クレマン|Luc=リュック|Marc=マルク|Yves=イヴ|Denis=ドニ|Émile=エミール|Émilie=エミリー|Amélie=アメリー|Aurélie=オレリー|Céline=セリーヌ|Hélène=エレーヌ|Élodie=エロディー|Françoise=フランソワーズ|Jeanne=ジャンヌ|Anne=アンヌ|Alice=アリス|Rose=ローズ|Mélanie=メラニー|Éric=エリック|Jérôme=ジェローム|Édouard=エドゥアール|Wilfried=ウィルフリード|Lefebvre=ルフェーヴル|Dubois=デュボワ|Moreau=モロー|Laurent=ローラン|Leroy=ルロワ|Petit=プティ|Durand=デュラン|Bernard=ベルナール|Roux=ルー|Blanc=ブラン|Dupont=デュポン|Fournier=フルニエ|Girard=ジラール`,
  de: `Emilia=エミリア|Noah=ノア|Matteo=マテオ|Sophia=ゾフィア|Elias=エリアス|Emma=エマ|Hannah=ハンナ|Luca=ルカ|Leon=レオン|Mia=ミア|Lina=リーナ|Theo=テオ|Ella=エラ|Finn=フィン|Lia=リア|Paul=パウル|Emil=エーミール|Leni=レーニ|Henry=ヘンリー|Mila=ミラ|Ida=イーダ|Liam=リアム|Clara=クララ|Louis=ルイ|Leo=レオ|Mathilda=マティルダ|Felix=フェリックス|Frieda=フリーダ|Ben=ベン|Marie=マリー|Levi=レヴィ|Malia=マリア|Leonie=レオニー|Anton=アントン|Lilly=リリー|Lea=レア|Oskar=オスカー|Lukas=ルーカス|Maja=マヤ|Emily=エミリー|Milan=ミラン|Amelie=アメリー|Jakob=ヤーコプ|Anna=アンナ|Jonas=ヨーナス|Luisa=ルイーザ|Maximilian=マクシミリアン|Charlotte=シャルロッテ|Jonah=ヨナ|Lio=リオ|Luna=ルナ|David=ダーフィト|Sophie=ゾフィー|Adam=アーダム|Lena=レーナ|Linus=リーヌス|Nora=ノーラ|Jannis=ヤニス|Nele=ネーレ|Mira=ミラ|Moritz=モーリッツ|Johanna=ヨハンナ|Karl=カール|Juna=ユナ|Mats=マッツ|Lara=ララ|Max=マックス|Emilio=エミリオ|Lotta=ロッタ|Amalia=アマーリア|Raphael=ラファエル|Romy=ロミー|Samuel=ザムエル|Aaron=アーロン|Sarah=ザーラ|Alexander=アレクサンダー|Thea=テア|Elisa=エリーザ|Milo=ミロ|Carlo=カルロ|Paula=パウラ|Valentin=ヴァレンティン|Antonia=アントーニア|Toni=トーニ|Jonathan=ヨナタン|Maria=マリア|Mara=マーラ|Eva=エーファ|Helena=ヘレーナ|Johann=ヨハン|Elena=エレーナ|Marlon=マーロン|Elina=エリーナ|Hannes=ハンネス|Leonard=レオナルト|Michael=ミヒャエル|Thomas=トーマス|Christian=クリスティアン|Peter=ペーター|Hans=ハンス|Heinrich=ハインリヒ|Friedrich=フリードリヒ|Wolfgang=ヴォルフガング|Stefan=シュテファン|Stephan=シュテファン|Andreas=アンドレアス|Dieter=ディーター|Jürgen=ユルゲン|Klaus=クラウス|Werner=ヴェルナー|Gerhard=ゲルハルト|Bo=ボー|Jan=ヤン|Müller=ミュラー|Schmidt=シュミット|Schneider=シュナイダー|Fischer=フィッシャー|Weber=ヴェーバー|Meyer=マイヤー|Wagner=ヴァーグナー|Becker=ベッカー|Schulz=シュルツ|Hoffmann=ホフマン`,
  es: `José=ホセ|Jose=ホセ|Juan=フアン|María=マリア|Maria=マリア|Luis=ルイス|Carlos=カルロス|Antonio=アントニオ|Manuel=マヌエル|Francisco=フランシスコ|Javier=ハビエル|Jesús=ヘスス|Jesus=ヘスス|Jorge=ホルヘ|Miguel=ミゲル|Alejandro=アレハンドロ|Diego=ディエゴ|Ángel=アンヘル|Angel=アンヘル|Pedro=ペドロ|Pablo=パブロ|Sofía=ソフィア|Sofia=ソフィア|Lucía=ルシア|Lucia=ルシア|Martina=マルティナ|Carmen=カルメン|Paula=パウラ|García=ガルシア|Garcia=ガルシア|Rodríguez=ロドリゲス|Rodriguez=ロドリゲス|González=ゴンサレス|Gonzalez=ゴンサレス|Fernández=フェルナンデス|Fernandez=フェルナンデス|López=ロペス|Lopez=ロペス|Martínez=マルティネス|Martinez=マルティネス|Sánchez=サンチェス|Sanchez=サンチェス`,
  pt: `João=ジョアン|José=ジョゼ|Jose=ジョゼ|Maria=マリア|Ana=アナ|António=アントニオ|Antônio=アントニオ|Francisco=フランシスコ|Manuel=マヌエル|Luís=ルイス|Luis=ルイス|Pedro=ペドロ|Paulo=パウロ|Miguel=ミゲル|Gonçalo=ゴンサロ|Diogo=ディオゴ|Afonso=アフォンソ|Tiago=ティアゴ|Beatriz=ベアトリス|Inês=イネス|Sofia=ソフィア|Silva=シルヴァ|Santos=サントス|Ferreira=フェレイラ|Pereira=ペレイラ|Oliveira=オリヴェイラ|Costa=コスタ|Rodrigues=ロドリゲス`,
  it: `Giuseppe=ジュゼッペ|Giovanni=ジョヴァンニ|Francesco=フランチェスコ|Antonio=アントニオ|Alessandro=アレッサンドロ|Lorenzo=ロレンツォ|Leonardo=レオナルド|Matteo=マッテオ|Mattia=マッティア|Andrea=アンドレア|Luca=ルカ|Marco=マルコ|Giacomo=ジャコモ|Giorgio=ジョルジョ|Luigi=ルイージ|Paolo=パオロ|Pietro=ピエトロ|Maria=マリア|Giulia=ジュリア|Giada=ジャーダ|Chiara=キアラ|Giorgia=ジョルジャ|Francesca=フランチェスカ|Sofia=ソフィア|Ginevra=ジネヴラ|Vittoria=ヴィットーリア|Rossi=ロッシ|Russo=ルッソ|Ferrari=フェッラーリ|Esposito=エスポジト|Bianchi=ビアンキ|Romano=ロマーノ`,
  nl: `Jan=ヤン|Johannes=ヨハネス|Willem=ウィレム|Pieter=ピーテル|Peter=ペーター|Hendrik=ヘンドリック|Daan=ダーン|Luuk=ルーク|Bram=ブラム|Sem=セム|Sven=スヴェン|Mees=メース|Lars=ラース|Jansen=ヤンセン|Janssen=ヤンセン|Bakker=バッカー|Visser=フィッセル|Smit=スミット|De Jong=デ・ヨング`,
};
const tables = Object.fromEntries(Object.entries(dictionaries).map(([language, text]) => [language, new Map(text.split('|').map(pair => {const [name,kana]=pair.split('='); return [name.toLocaleLowerCase('und'),kana];}))]));
const countryLanguages = {};
for (const [language, countries] of Object.entries({
  en:'US GB IE AU NZ JM BS BB TT GY', fr:'FR MC', de:'DE AT LI', nl:'NL SR',
  es:'ES MX AR BO CL CO CR CU DO EC GT HN NI PA PE PR PY SV UY VE',
  pt:'PT BR AO MZ CV ST', it:'IT SM VA', ko:'KR KP',
  tr:'TR', pl:'PL', cs:'CZ SK', ro:'RO MD', hu:'HU',
  nordic:'DK SE NO FI IS EE', slavic:'HR SI BA', latin:'AL MT ID MY PH',
})) for (const country of countries.split(' ')) countryLanguages[country]=language;

const vowels = ['ア','イ','ウ','エ','オ'];
const rows = {k:['カ','キ','ク','ケ','コ'],g:['ガ','ギ','グ','ゲ','ゴ'],s:['サ','シ','ス','セ','ソ'],z:['ザ','ジ','ズ','ゼ','ゾ'],t:['タ','ティ','トゥ','テ','ト'],d:['ダ','ディ','ドゥ','デ','ド'],n:['ナ','ニ','ヌ','ネ','ノ'],h:['ハ','ヒ','フ','ヘ','ホ'],b:['バ','ビ','ブ','ベ','ボ'],p:['パ','ピ','プ','ペ','ポ'],m:['マ','ミ','ム','メ','モ'],r:['ラ','リ','ル','レ','ロ'],l:['ラ','リ','ル','レ','ロ'],f:['ファ','フィ','フ','フェ','フォ'],v:['ヴァ','ヴィ','ヴ','ヴェ','ヴォ'],w:['ワ','ウィ','ウ','ウェ','ウォ'],y:['ヤ','イ','ユ','イェ','ヨ'],j:['ジャ','ジ','ジュ','ジェ','ジョ'],c:['カ','キ','ク','ケ','コ'],q:['カ','キ','ク','ケ','コ']};
const singles = {b:'ブ',c:'ク',d:'ド',f:'フ',g:'グ',h:'フ',j:'ジ',k:'ク',l:'ル',m:'ム',n:'ン',p:'プ',q:'ク',r:'ル',s:'ス',t:'ト',v:'ヴ',w:'ウ',x:'クス',y:'イ',z:'ズ'};
const common = {sha:'シャ',shi:'シ',shu:'シュ',she:'シェ',sho:'ショ',cha:'チャ',chi:'チ',chu:'チュ',che:'チェ',cho:'チョ',nya:'ニャ',nyi:'ニ',nyu:'ニュ',nye:'ニェ',nyo:'ニョ',kya:'キャ',kyu:'キュ',kyo:'キョ',tsa:'ツァ',tsi:'ツィ',tsu:'ツ',tse:'ツェ',tso:'ツォ'};

function latinHint(input, language) {
  let text = input.toLowerCase().normalize('NFC');
  if (language === 'de') text=text.replace(/eu|äu/g,'oi').replace(/ä/g,'e').replace(/ö/g,'e').replace(/ü/g,'yu').replace(/ß/g,'ss').replace(/tsch|sch|ch/g,m=>({tsch:'ch',sch:'sh',ch:'h'})[m]).replace(/ei/g,'ai').replace(/ie/g,'ii').replace(/z/g,'ts').replace(/j/g,'y').replace(/v/g,'f').replace(/w/g,'v').replace(/^s(?=[aeiou])/,'z').replace(/^st/,'sht').replace(/^sp/,'shp');
  if (language === 'fr') text=text.replace(/eaux?$/,'o').replace(/eau/g,'o').replace(/aux$/,'o').replace(/ch/g,'sh').replace(/gn/g,'ny').replace(/ou/g,'u').replace(/oi/g,'wa').replace(/(?:ain|ein|in|im)(?=[^aeiouy]|$)/g,'an').replace(/(?:an|am|en|em)(?=[^aeiouy]|$)/g,'an').replace(/on(?=[^aeiouy]|$)/g,'on').replace(/qu/g,'k').replace(/[tdsxz]$/,'').replace(/e$/,'');
  if (language === 'es') text=text.replace(/h/g,'').replace(/ñ/g,'ny').replace(/ll/g,'y').replace(/qu(?=[eiéí])/g,'k').replace(/gu(?=[eiéí])/g,'g').replace(/g(?=[eiéí])/g,'h').replace(/j/g,'h').replace(/c(?=[eiéí])/g,'s').replace(/z/g,'s');
  if (language === 'pt') text=text.replace(/nh/g,'ny').replace(/lh/g,'ry').replace(/ch/g,'sh').replace(/ão/g,'an').replace(/qu(?=[ei])/g,'k').replace(/ç/g,'s');
  if (language === 'it') text=text.replace(/gli/g,'ryi').replace(/gn/g,'ny').replace(/chi/g,'ki').replace(/che/g,'ke').replace(/ci(?=[ao])/g,'ch').replace(/gi(?=[ao])/g,'j').replace(/c(?=[ei])/g,'ch').replace(/g(?=[ei])/g,'j');
  if (language === 'en') text=text.replace(/tion/g,'shon').replace(/tch/g,'ch').replace(/ph/g,'f').replace(/th/g,'s').replace(/ck/g,'k').replace(/qu/g,'kw').replace(/igh/g,'ai').replace(/ee|ea/g,'ii').replace(/oo/g,'uu').replace(/ai|ay/g,'ei').replace(/ow/g,'au').replace(/er$/,'aa').replace(/y$/,'i').replace(/e$/,'').replace(/c(?=[ei])/g,'s').replace(/g(?=[ei])/g,'j');
  if (language === 'nl') text=text.replace(/ij|ei/g,'ai').replace(/oe/g,'u').replace(/sch/g,'sh').replace(/j/g,'y').replace(/g/g,'h');
  if (language === 'tr') text=text.replace(/ş/g,'sh').replace(/ç/g,'ch').replace(/c/g,'j').replace(/ğ/g,'').replace(/ı/g,'u').replace(/ö/g,'o').replace(/ü/g,'yu');
  if (language === 'pl') text=text.replace(/j/g,'y').replace(/w/g,'v').replace(/ł/g,'w').replace(/sz/g,'sh').replace(/cz|c/g,'ts').replace(/rz|ż|ź/g,'j');
  if (['cs','slavic','ro','hu'].includes(language)) text=text.replace(/j/g,'y').replace(/š/g,'sh').replace(/č|ć/g,'ch').replace(/ž/g,'j');
  if (language === 'nordic') text=text.replace(/å/g,'o').replace(/æ/g,'e').replace(/ø/g,'e').replace(/j/g,'y');
  text=text.replace(/œ/g,'e').replace(/æ/g,'e').normalize('NFD').replace(/\p{M}/gu,'');
  if (!/^[a-z]+$/.test(text)) return;
  text=text.replace(/([bcdfghjklmnpqrstvwxyz])\1/g,'$1');
  let result='';
  while (text) {
    const special=Object.keys(common).find(key=>text.startsWith(key));
    if (special) {result+=common[special];text=text.slice(special.length);continue;}
    const index='aiueo'.indexOf(text[1] ?? '');
    if (text.length>1 && rows[text[0]] && index>=0) {result+=rows[text[0]][index];text=text.slice(2);continue;}
    const vowel='aiueo'.indexOf(text[0]);
    result+=vowel>=0?vowels[vowel]:singles[text[0]] ?? '';
    text=text.slice(1);
  }
  return result || undefined;
}

// Hangul syllables are decoded directly. Coda-to-vowel liaison is applied;
// assimilation and personal preferences can still differ, hence an explicit hint.
function hangulHint(name) {
  const initial=['k','kk','n','t','tt','r','m','p','pp','s','ss','','j','jj','ch','k','t','p','h'];
  const vowel=['a','e','ya','ye','o','e','yo','ye','o','wa','we','we','yo','u','wo','we','wi','yu','u','ui','i'];
  const final=['','k','k','k','n','n','n','t','l','k','m','l','l','l','p','l','m','p','p','t','t','ng','t','t','k','t','p','t'];
  const liaison={1:0,2:1,4:2,7:3,8:5,16:6,17:7,19:9,20:10,22:12,23:13,24:14,25:15,26:16,27:17};
  const syllables=Array.from(name).map(char=>{const n=char.codePointAt(0)-0xac00;return {onset:Math.floor(n/588),vowel:Math.floor(n/28)%21,coda:n%28};});
  let result='';
  for (let i=0;i<syllables.length;i++) {
    const current=syllables[i], next=syllables[i+1];
    if (next?.onset===11 && liaison[current.coda]!==undefined) {next.onset=liaison[current.coda];current.coda=0;}
    let onset=initial[current.onset];
    if (i>0) onset=({k:'g',t:'d',p:'b'})[onset] ?? onset;
    onset=onset.replace(/kk/,'k').replace(/tt/,'t').replace(/pp/,'p').replace(/ss/,'s').replace(/jj/,'j');
    const syllable=onset+vowel[current.vowel];
    // Japanese convention uses チ/ジ/シ rather than ティ/ディ/スィ here.
    const overrides={ti:'ティ',ji:'ジ',si:'シ',sya:'シャ',syu:'シュ',syo:'ショ',ja:'ジャ',jo:'ジョ',ju:'ジュ',jya:'ジャ',jye:'ジェ',jyo:'ジョ',jyu:'ジュ',chya:'チャ',chyu:'チュ',chyo:'チョ',chwe:'チェ',jwe:'ジェ',ui:'ウィ'};
    result+=overrides[syllable] ?? latinHint(syllable,'latin') ?? '';
    const coda=final[current.coda];
    result+=({k:'ク',n:'ン',t:'ッ',l:'ル',m:'ム',p:'プ',ng:'ン'})[coda] ?? '';
  }
  return result;
}

export function nameReadingHint(country, name) {
  if (typeof name!=='string' || name.length>160) return;
  const normalized=name.normalize('NFKC').trim().replace(/\s+/gu,' ');
  if (!normalized) return;
  if (!knownCountries.has(country)) return;
  // A generic Latin hint is explicitly spelling-based, without claiming a local language.
  const language=countryLanguages[country] ?? 'latin';
  const whole=tables[language]?.get(normalized.toLocaleLowerCase('und'));
  if (whole) return {text:whole,kind:'conventional',language};
  // Never silently omit unsupported scripts, symbols, numbers or Han characters.
  const parts=normalized.split(/([\s\-‐‑–・·]+)/u);
  const output=[];
  let conventional=true;
  for (const part of parts) {
    if (/^[\s\-‐‑–・·]+$/u.test(part)) {output.push('・');continue;}
    const kana=tables[language]?.get(part.toLocaleLowerCase('und'));
    if (kana) {output.push(kana);continue;}
    conventional=false;
    if (language==='ko' && /^[가-힣]+$/u.test(part)) {output.push(hangulHint(part));continue;}
    if (!/^[\p{Script=Latin}'’]+$/u.test(part) || language==='ko') return;
    const result=latinHint(part.replace(/['’]/g,''),language);
    if (!result) return;
    output.push(result);
  }
  return {text:output.join(''),kind:conventional?'conventional':'estimated',language};
}
