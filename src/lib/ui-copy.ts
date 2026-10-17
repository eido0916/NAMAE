import countries from "@/data/countries.json";
import { countryLocale, countryLanguage } from "./country-locale.mjs";
import additionalLocales from './ui-locales.json';

type PickerCopy = { search: string; empty: string; close: string };
const extraLocales: Record<string, { ui: Partial<UiCopy> & { lang: string; changeCountries: string }; picker: PickerCopy }> = additionalLocales;
export const supportedUiLanguages = ['ja', 'en', 'fr', 'ko', 'de', ...Object.keys(extraLocales)];

export const countryNativeNames: Record<string, string> = Object.fromEntries(
  countries.map(({ code }) => [code, new Intl.DisplayNames([countryLocale(code)], { type: "region" }).of(code) ?? code]),
);

export function getCountryPickerCopy(country: string) {
  const lang = getUiCopy(country).lang;
  if (extraLocales[lang]) return extraLocales[lang].picker;
  return ({
    ja: { search: "国名で検索", empty: "該当する国・地域がありません", close: "閉じる" },
    en: { search: "Search countries", empty: "No countries or regions found", close: "Close" },
    fr: { search: "Rechercher un pays", empty: "Aucun pays ou région trouvé", close: "Fermer" },
    ko: { search: "국가 검색", empty: "일치하는 국가·지역이 없습니다", close: "닫기" },
    de: { search: "Land suchen", empty: "Keine Länder oder Regionen gefunden", close: "Schließen" },
  } as Record<string, { search: string; empty: string; close: string }>)[lang];
}

const en = {
  lang: "en", about: "About NAMAE", tagline: "Your name, around the world.",
  sources: "Data sources", privacy: "Privacy", legal: "Terms of use",
  hero: "If you were born somewhere else,", heroAccent: "what would your name be?",
  title: "Meet yourself around the world.", intro: "Choose your country or region to begin.",
  countryHelp: "Choose the country whose name rankings you want to use.",
  given: "First name", surname: "Last name", nameLabel: "Your first name", surnameLabel: "Your last name",
  scriptHint: "Local spelling or an available alias", example: "e.g. ", try: "Try:",
  gender: "Gender in the ranking", male: "Male", female: "Female",
  loading: "Loading name data…", submitName: "Find my world names", submitSurname: "Find my world surnames",
  retry: "Reload data", dataError: "Name data could not be loaded. Please try again.",
  invalidName: "Enter a name of up to 30 letters, without numbers or emoji.",
  wrongGender: "This name is listed under a different gender. Change the ranking gender.",
  diagnosisError: "We could not find your results. Please try again.",
  privacyNote: "Your input stays in your browser.",
  howTitle: "One name. A whole new world.", step1: "Tell us your name", step1Body: "Choose a country and enter a first or last name. Free, with no registration.",
  step2: "Connect through popularity", step2Body: "We look for names with the same rank in other countries.",
  step3: "Share your parallel name", step3Body: "Save a story-sized image and try your friends’ names too.",
  dataNote: "Explore public name rankings and dictionaries from around the world.",
  resultTitle: "Meet your names around the world.", save: "Save image", share: "Share", again: "Try again",
  saveHint: "Save your results as a 9:16 story image.", saved: "Image saved. Check your downloads.",
  shared: "Your results are ready to share.", shareCancelled: "Sharing cancelled.", actionError: "Please try saving the image again.",
  countries: "Countries", changeCountries: "Add or change countries", addCountry: "Add a country", countryHint: "Select 1–8 countries to compare.",
  rank: "Ranking", estimated: "Estimated", unknown: "No published rank", sample: "Sample",
  sameRank: "Same rank as your country", nearRank: "Reference · nearest rank", reference: "Reference · no rank match",
  localRank: "Local ranking", referenceRank: "Reference ranking", dictionary: "Name dictionary", publicData: "Public data", details: "Pronunciation & name details",
  rankSource: "Ranking source", originalSource: "View original source", noData: "Data unavailable",
  rarityScale: "Common ← → Rare", rankCount: "names in this dataset", survey: "Survey", unknownYear: "Year unavailable",
  noRankNotice: "We could not confirm this name’s rank. These are reference suggestions, not matches in popularity or sound. Check the country or try another spelling.",
  surnameNotice: "This name matched a last name, so we used the surname ranking.",
};
type UiCopy = { [K in keyof typeof en]: string };
const ja: UiCopy = {
  lang: "ja", about: "NAMAEについて", tagline: "ひとつの名前から、世界が広がる。",
  sources: "データ出典", privacy: "プライバシー", legal: "利用上の注意",
  hero: "もし海外で生まれていたら、あなたは", heroAccent: "何という名前？",
  title: "世界のあなたに、会いにいこう。", intro: "国旗から、名前を調べる国・地域を選んでください。",
  countryHelp: "名前の人気順位を調べる国・地域です。",
  given: "下の名前", surname: "苗字", nameLabel: "あなたの名前", surnameLabel: "あなたの苗字",
  scriptHint: "現地の文字・収録済みの別表記", example: "例：", try: "試してみる：",
  gender: "ランキングの性別", male: "男性", female: "女性", loading: "診断データを読み込み中…",
  submitName: "世界の名前を見る", submitSurname: "世界の苗字を見る", retry: "データを再読み込み",
  dataError: "診断データを読み込めませんでした。もう一度お試しください。",
  invalidName: "名前は30文字以内で入力してください。数字や絵文字は使えません。",
  wrongGender: "この名前は別の性別のデータに収録されています。ランキングの性別を変更してください。",
  diagnosisError: "診断できませんでした。もう一度お試しください。", privacyNote: "入力情報は保存・送信されません",
  howTitle: "名前で見つける、もうひとつの世界。", step1: "あなたの名前を教えて", step1Body: "国・地域を選んで、下の名前や苗字を入力。登録なし、無料で楽しめます。",
  step2: "同じ人気度でつながる", step2Body: "各国のランキングから、選んだ国と同じ順位の名前を探します。",
  step3: "世界のあなたをシェア", step3Body: "結果をストーリーサイズで保存。友達の名前も、見てみよう。",
  dataNote: "世界各国の公開ランキングと名前辞書で診断します。",
  resultTitle: "世界には、こんなあなたがいる。", save: "結果を画像保存", share: "シェア", again: "もう一度診断",
  saveHint: "ストーリーにぴったりの9:16画像で保存できます。", saved: "画像を保存しました。ダウンロードをご確認ください。",
  shared: "結果を共有しました。", shareCancelled: "共有をキャンセルしました。", actionError: "処理できませんでした。画像保存をもう一度お試しください。",
  countries: "表示する国", changeCountries: "国を追加・変更", addCountry: "国を追加", countryHint: "最大8か国まで選べます。チェックした国のランキングを表示します。",
  rank: "人気度", estimated: "推定", unknown: "公開順位なし", sample: "サンプル", sameRank: "入力元と同じ順位",
  nearRank: "近い順位", reference: "参考候補", localRank: "現地ランキング", referenceRank: "資料内参考順位", dictionary: "名前辞書",
  publicData: "公開データ", details: "読み方・名前の詳細を見る", rankSource: "順位の出典", originalSource: "原本を見る", noData: "データ未対応",
  rarityScale: "一般的 ← → 珍しい", rankCount: "件の中での順位", survey: "調査", unknownYear: "年度不明",
  noRankNotice: "公開順位がないため、参考候補を表示しています。",
  surnameNotice: "下の名前の対象ランキングになく、苗字データに一致したため、苗字として診断しました。",
};
const fr: UiCopy = {
  ...en, lang: "fr", referenceRank: "Classement de référence", about: "À propos de NAMAE", tagline: "Votre prénom, autour du monde.", sources: "Sources", privacy: "Confidentialité", legal: "Conditions d’utilisation",
  hero: "Si vous étiez né ailleurs,", heroAccent: "quel serait votre prénom ?", title: "Découvrez vos noms à travers le monde.", intro: "Choisissez votre pays ou région.",
  countryHelp: "Choisissez le pays dont vous souhaitez utiliser le classement.", given: "Prénom", surname: "Nom de famille", nameLabel: "Votre prénom", surnameLabel: "Votre nom de famille",
  scriptHint: "Écriture locale ou variante disponible", example: "Ex. : ", try: "Essayez :", gender: "Genre du classement", male: "Masculin", female: "Féminin",
  loading: "Chargement des données…", submitName: "Découvrir mes prénoms", submitSurname: "Découvrir mes noms", retry: "Recharger les données",
  dataError: "Impossible de charger les données. Veuillez réessayer.", invalidName: "Saisissez un nom de 30 lettres maximum, sans chiffres ni émojis.", wrongGender: "Ce nom figure dans un autre genre. Modifiez le genre du classement.", diagnosisError: "Impossible d’afficher les résultats. Veuillez réessayer.",
  privacyNote: "Votre saisie reste dans votre navigateur.", howTitle: "Un nom. Un autre monde.", step1: "Indiquez votre nom", step1Body: "Choisissez un pays et saisissez votre prénom ou nom. Gratuit et sans inscription.", step2: "Un même rang, un autre nom", step2Body: "Nous cherchons des noms de même rang dans d’autres pays.", step3: "Partagez vos noms", step3Body: "Enregistrez une image au format story et essayez avec vos amis.", dataNote: "Explorez les classements publics et dictionnaires de noms du monde entier.",
  resultTitle: "Découvrez vos noms à travers le monde.", save: "Enregistrer l’image", share: "Partager", again: "Réessayer", saveHint: "Enregistrez vos résultats au format story 9:16.", saved: "Image enregistrée. Consultez vos téléchargements.", shared: "Vos résultats sont prêts à être partagés.", shareCancelled: "Partage annulé.", actionError: "Veuillez réessayer d’enregistrer l’image.",
  countries: "Pays", changeCountries: "Modifier les pays", addCountry: "Ajouter un pays", countryHint: "Choisissez de 1 à 8 pays à comparer.", rank: "Classement", estimated: "Estimation", unknown: "Rang non publié", sample: "Échantillon", sameRank: "Même rang que votre pays", nearRank: "Référence · rang proche", reference: "Référence · sans correspondance de rang", localRank: "Classement local", dictionary: "Dictionnaire de noms", publicData: "Données publiques", details: "Prononciation et détails", rankSource: "Source du classement", originalSource: "Voir la source", noData: "Données indisponibles", rarityScale: "Courant ← → Rare", rankCount: "noms dans ces données", survey: "Enquête", unknownYear: "Année inconnue",
  noRankNotice: "Le rang de ce nom n’a pas été confirmé. Ces suggestions ne correspondent pas nécessairement à sa popularité ou à sa sonorité. Vérifiez le pays ou essayez une autre orthographe.", surnameNotice: "Ce nom correspond à un nom de famille. Le classement des noms de famille a donc été utilisé.",
};
const ko: UiCopy = {
  ...en, lang: "ko", referenceRank: "참고 순위", about: "NAMAE 소개", tagline: "하나의 이름으로 만나는 세계.", sources: "데이터 출처", privacy: "개인정보 보호", legal: "이용 안내",
  hero: "다른 나라에서 태어났다면,", heroAccent: "내 이름은 무엇일까요?", title: "세계 속 또 다른 나를 만나보세요.", intro: "이름을 조회할 국가·지역을 선택하세요.",
  countryHelp: "이름 순위의 기준이 되는 국가·지역입니다.", given: "이름", surname: "성씨", nameLabel: "나의 이름", surnameLabel: "나의 성씨", scriptHint: "현지 표기 또는 수록된 다른 표기", example: "예: ", try: "예시:", gender: "순위 기준 성별", male: "남성", female: "여성",
  loading: "이름 데이터를 불러오는 중…", submitName: "세계의 이름 찾기", submitSurname: "세계의 성씨 찾기", retry: "데이터 다시 불러오기", dataError: "데이터를 불러오지 못했습니다. 다시 시도해 주세요.", invalidName: "숫자나 이모지 없이 30자 이내로 입력해 주세요.", wrongGender: "다른 성별로 수록된 이름입니다. 순위 기준 성별을 변경해 주세요.", diagnosisError: "결과를 불러오지 못했습니다. 다시 시도해 주세요.",
  privacyNote: "입력한 정보는 브라우저 안에서만 처리됩니다.", howTitle: "하나의 이름, 새로운 세계.", step1: "이름을 알려주세요", step1Body: "국가를 선택하고 이름 또는 성씨를 입력하세요. 가입 없이 무료로 이용할 수 있습니다.", step2: "같은 순위로 연결됩니다", step2Body: "다른 나라에서 같은 순위의 이름을 찾아드립니다.", step3: "세계 속 내 이름 공유하기", step3Body: "스토리 크기의 이미지로 저장하고 친구 이름도 찾아보세요.", dataNote: "세계 각국의 공개 순위와 이름 사전을 사용합니다.",
  resultTitle: "세계 속 또 다른 나의 이름입니다.", save: "이미지 저장", share: "공유", again: "다시 찾기", saveHint: "9:16 스토리 이미지로 저장할 수 있습니다.", saved: "이미지를 저장했습니다. 다운로드를 확인하세요.", shared: "공유할 결과가 준비되었습니다.", shareCancelled: "공유를 취소했습니다.", actionError: "이미지 저장을 다시 시도해 주세요.",
  countries: "표시할 국가", changeCountries: "국가 추가·변경", addCountry: "국가 추가", countryHint: "비교할 국가를 1~8개 선택하세요.", rank: "인기 순위", estimated: "추정", unknown: "공개 순위 없음", sample: "표본", sameRank: "기준 국가와 같은 순위", nearRank: "참고 후보 · 가까운 순위", reference: "참고 후보 · 순위 대응 없음", localRank: "현지 순위", dictionary: "이름 사전", publicData: "공개 데이터", details: "발음·이름 상세 보기", rankSource: "순위 출처", originalSource: "원본 보기", noData: "데이터 없음", rarityScale: "흔함 ← → 드묾", rankCount: "개 이름 중 순위", survey: "조사", unknownYear: "연도 미상",
  noRankNotice: "이 이름의 순위를 확인하지 못해 참고 후보를 표시합니다. 인기나 발음의 일치를 의미하지 않습니다. 국가·지역 또는 다른 표기를 확인해 주세요.", surnameNotice: "성씨 데이터와 일치하여 성씨 순위로 결과를 표시합니다.",
};
const de: UiCopy = {
  ...en, lang: "de", referenceRank: "Referenzrang", about: "Über NAMAE", tagline: "Dein Name, rund um die Welt.", sources: "Datenquellen", privacy: "Datenschutz", legal: "Nutzungshinweise",
  hero: "Wenn du woanders geboren wärst,", heroAccent: "wie würdest du heißen?", title: "Entdecke deine Namen weltweit.", intro: "Wähle dein Land oder deine Region.",
  countryHelp: "Wähle das Land, dessen Namensrangliste du nutzen möchtest.", given: "Vorname", surname: "Nachname", nameLabel: "Dein Vorname", surnameLabel: "Dein Nachname", scriptHint: "Lokale Schreibweise oder vorhandene Variante", example: "z. B. ", try: "Ausprobieren:", gender: "Geschlecht in der Rangliste", male: "Männlich", female: "Weiblich",
  loading: "Namensdaten werden geladen…", submitName: "Meine Vornamen weltweit finden", submitSurname: "Meine Nachnamen weltweit finden", retry: "Daten neu laden", dataError: "Die Daten konnten nicht geladen werden. Bitte versuche es erneut.", invalidName: "Gib einen Namen mit höchstens 30 Buchstaben ohne Zahlen oder Emojis ein.", wrongGender: "Dieser Name ist unter einem anderen Geschlecht erfasst. Ändere das Geschlecht der Rangliste.", diagnosisError: "Die Ergebnisse konnten nicht geladen werden. Bitte versuche es erneut.",
  privacyNote: "Deine Eingaben bleiben in deinem Browser.", howTitle: "Ein Name. Eine neue Welt.", step1: "Verrate uns deinen Namen", step1Body: "Wähle ein Land und gib deinen Vor- oder Nachnamen ein. Kostenlos, ohne Anmeldung.", step2: "Durch Beliebtheit verbunden", step2Body: "Wir suchen Namen mit demselben Rang in anderen Ländern.", step3: "Teile deine Namen", step3Body: "Speichere ein Bild im Story-Format und probiere die Namen deiner Freunde aus.", dataNote: "Entdecke öffentliche Namensranglisten und Namenswörterbücher weltweit.",
  resultTitle: "So heißen deine anderen Ichs weltweit.", save: "Bild speichern", share: "Teilen", again: "Erneut ausprobieren", saveHint: "Speichere dein Ergebnis als 9:16-Story-Bild.", saved: "Bild gespeichert. Sieh in deinen Downloads nach.", shared: "Deine Ergebnisse sind zum Teilen bereit.", shareCancelled: "Teilen abgebrochen.", actionError: "Bitte versuche erneut, das Bild zu speichern.",
  countries: "Länder", changeCountries: "Länder ändern", addCountry: "Land hinzufügen", countryHint: "Wähle 1–8 Länder zum Vergleichen.", rank: "Rangliste", estimated: "Geschätzt", unknown: "Kein veröffentlichter Rang", sample: "Stichprobe", sameRank: "Gleicher Rang wie in deinem Land", nearRank: "Referenz · nächster Rang", reference: "Referenz · ohne Rangentsprechung", localRank: "Lokale Rangliste", dictionary: "Namenswörterbuch", publicData: "Öffentliche Daten", details: "Aussprache und Namensdetails", rankSource: "Quelle der Rangliste", originalSource: "Originalquelle ansehen", noData: "Keine Daten verfügbar", rarityScale: "Häufig ← → Selten", rankCount: "Namen in diesem Datensatz", survey: "Erhebung", unknownYear: "Jahr unbekannt",
  noRankNotice: "Der Rang dieses Namens konnte nicht bestätigt werden. Dies sind Referenzvorschläge ohne Übereinstimmung in Beliebtheit oder Klang. Prüfe das Land oder eine andere Schreibweise.", surnameNotice: "Dieser Name wurde als Nachname erkannt. Daher wurde die Nachnamenrangliste verwendet.",
};
export function getUiCopy(country = "JP"): UiCopy {
  const language = countryLanguage(country);
  if (extraLocales[language]) return { ...en, ...extraLocales[language].ui, addCountry: extraLocales[language].ui.addCountry ?? extraLocales[language].ui.changeCountries };
  return ({ ja, en, fr, ko, de } as Record<string, UiCopy>)[language] ?? en;
}
export function localizedCountryName(code: string, sourceCountry: string) {
  return new Intl.DisplayNames([getUiCopy(sourceCountry).lang], { type: "region" }).of(code) ?? code;
}
export function localizeInputError(message: string, country: string) {
  if (message.includes("現地表記を選んで")) return country === "CN" ? "同一拼音对应多个名字，请选择汉字。" : country === "JP" ? message : "Choose the local spelling that matches your name.";
  if (country === "CN" && message.includes("同じローマ字")) return "同一拼音对应多个姓氏，请选择汉字。";
  if (country === "JP") return message;
  const copy = getUiCopy(country);
  if (message.includes("性別")) return copy.wrongGender;
  if (message.includes("30文字") || message.includes("名前を入力")) return copy.invalidName;
  if (message.includes("データ") || message.includes("読み込")) return copy.dataError;
  return copy.diagnosisError;
}
