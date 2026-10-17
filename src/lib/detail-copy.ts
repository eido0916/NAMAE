import { countryLanguage } from './country-locale.mjs';

const en = {
  close: 'Close details', registered: 'Registered name', work: 'Work', nationality: 'Nationality',
  people: 'People with this name', characters: 'Characters with this name', loading: 'Loading name details…',
  error: 'Name details could not be loaded.', retry: 'Try again', searching: 'Looking for people with this name…',
  pending: 'Checking which people match this name.', background: 'The search is continuing. Please open this again later.',
  empty: 'No people or characters have been confirmed for this name yet.', wikipedia: 'Search this name on Wikipedia', source: 'View source', flag: 'flag',
};
type DetailCopy = typeof en;
const keys = Object.keys(en) as (keyof DetailCopy)[];
function row(text: string): DetailCopy {
  const values = text.split('|');
  if (values.length !== keys.length) throw new Error('Invalid detail translation');
  return Object.fromEntries(keys.map((key, i) => [key, values[i]])) as DetailCopy;
}
const translations: Record<string, DetailCopy> = {
  en,
  ru: row('Закрыть сведения|Зарегистрированное имя|Произведение|Гражданство|Известные люди с этим именем|Персонажи с этим именем|Загрузка сведений об имени…|Не удалось загрузить сведения.|Повторить|Поиск людей с этим именем…|Проверяем соответствие имени и людей.|Поиск продолжается. Откройте это окно позже.|Люди или персонажи с этим именем пока не подтверждены.|Искать это имя в Википедии|Открыть источник|флаг'),
  tr: row('Ayrıntıları kapat|Kayıtlı ad|Eser|Uyruk|Bu ada sahip tanınmış kişiler|Bu ada sahip karakterler|Ad bilgileri yükleniyor…|Ayrıntılar yüklenemedi.|Yeniden dene|Bu ada sahip kişiler aranıyor…|Bu adla eşleşen kişiler doğrulanıyor.|Arama sürüyor. Lütfen daha sonra yeniden açın.|Bu ad için henüz kişi veya karakter doğrulanmadı.|Bu adı Vikipedi’de ara|Kaynağı aç|bayrak'),
  'zh-Hant': row('關閉詳情|登記姓名|登場作品|國籍|同名名人|同名角色|正在載入姓名資訊…|無法載入詳細資訊。|重試|正在尋找同名人物…|正在核實與此姓名對應的人物。|搜尋仍在繼續，請稍後重新開啟。|尚未確認此姓名的名人或角色資訊。|在維基百科中搜尋此姓名|查看來源|國旗'),
  'pt-BR': row('Fechar detalhes|Nome registrado|Obra|Nacionalidade|Pessoas conhecidas com este nome|Personagens com este nome|Carregando as informações…|Não foi possível carregar os detalhes.|Tentar novamente|Procurando pessoas com este nome…|Verificando as pessoas com este nome.|A busca continua. Abra novamente mais tarde.|Ainda não foram confirmadas pessoas ou personagens com este nome.|Buscar este nome na Wikipédia|Ver fonte|bandeira'),
  ja: row('詳細を閉じる|登録されている名前|登場作品|国籍|同じ名前の著名人|同じ名前のキャラクター|名前の情報を読み込んでいます…|詳細情報を読み込めませんでした。|再読み込み|同じ名前の人物を探しています…|同じ表記の名前が複数あり、人物との対応を確認中です。|人物情報の収集を続けています。しばらくしてから開き直してください。|この名前の著名人・キャラクター情報は、まだ確認できていません。|Wikipediaでこの名前を調べる|出典を見る|国旗'),
  ko: row('상세 정보 닫기|등록된 이름|등장 작품|국적|같은 이름의 유명인|같은 이름의 캐릭터|이름 정보를 불러오는 중…|상세 정보를 불러오지 못했습니다.|다시 시도|같은 이름의 인물을 찾는 중…|이 이름에 해당하는 인물을 확인하고 있습니다.|검색을 계속하고 있습니다. 잠시 후 다시 열어 주세요.|이 이름의 유명인·캐릭터 정보는 아직 확인되지 않았습니다.|위키백과에서 이 이름 검색|출처 보기|국기'),
  fr: row('Fermer les détails|Nom enregistré|Œuvre|Nationalité|Personnalités portant ce nom|Personnages portant ce nom|Chargement des informations…|Impossible de charger les informations.|Réessayer|Recherche de personnes portant ce nom…|Vérification des personnes correspondant à ce nom.|La recherche continue. Revenez dans quelques instants.|Aucune personnalité ni aucun personnage confirmé pour ce nom.|Rechercher ce nom sur Wikipédia|Voir la source|drapeau'),
  de: row('Details schließen|Registrierter Name|Werk|Staatsangehörigkeit|Bekannte Personen mit diesem Namen|Figuren mit diesem Namen|Namensdetails werden geladen…|Die Details konnten nicht geladen werden.|Erneut versuchen|Personen mit diesem Namen werden gesucht…|Die Zuordnung dieses Namens wird geprüft.|Die Suche läuft weiter. Bitte später erneut öffnen.|Für diesen Namen wurden noch keine Personen oder Figuren bestätigt.|Diesen Namen auf Wikipedia suchen|Quelle ansehen|Flagge'),
  it: row('Chiudi dettagli|Nome registrato|Opera|Nazionalità|Persone famose con questo nome|Personaggi con questo nome|Caricamento delle informazioni…|Impossibile caricare i dettagli.|Riprova|Ricerca di persone con questo nome…|Verifica delle persone associate a questo nome.|La ricerca continua. Riapri più tardi.|Non sono ancora confermate persone o personaggi con questo nome.|Cerca questo nome su Wikipedia|Vedi la fonte|bandiera'),
  es: row('Cerrar detalles|Nombre registrado|Obra|Nacionalidad|Personas conocidas con este nombre|Personajes con este nombre|Cargando información…|No se pudo cargar la información.|Reintentar|Buscando personas con este nombre…|Comprobando las personas que coinciden con este nombre.|La búsqueda continúa. Vuelve a abrir más tarde.|Todavía no se han confirmado personas o personajes con este nombre.|Buscar este nombre en Wikipedia|Ver fuente|bandera'),
  pt: row('Fechar detalhes|Nome registado|Obra|Nacionalidade|Pessoas conhecidas com este nome|Personagens com este nome|A carregar informações…|Não foi possível carregar os detalhes.|Tentar novamente|A procurar pessoas com este nome…|A verificar as pessoas associadas a este nome.|A pesquisa continua. Volte a abrir mais tarde.|Ainda não foram confirmadas pessoas ou personagens com este nome.|Pesquisar este nome na Wikipédia|Ver fonte|bandeira'),
  zh: row('关闭详情|登记姓名|登场作品|国籍|同名名人|同名角色|正在加载姓名信息…|无法加载详细信息。|重试|正在查找同名人物…|正在核实与此姓名对应的人物。|搜索仍在继续，请稍后重新打开。|暂未确认此姓名的名人或角色信息。|在维基百科中搜索此姓名|查看来源|国旗'),
  nl: row('Details sluiten|Geregistreerde naam|Werk|Nationaliteit|Bekende personen met deze naam|Personages met deze naam|Naamgegevens laden…|De gegevens konden niet worden geladen.|Opnieuw proberen|Personen met deze naam zoeken…|Overeenkomende personen controleren.|Het zoeken gaat verder. Open dit later opnieuw.|Er zijn nog geen personen of personages met deze naam bevestigd.|Deze naam op Wikipedia zoeken|Bron bekijken|vlag'),
  sv: row('Stäng detaljer|Registrerat namn|Verk|Nationalitet|Kända personer med detta namn|Figurer med detta namn|Läser in namninformation…|Det gick inte att läsa in informationen.|Försök igen|Söker efter personer med detta namn…|Kontrollerar personer som matchar namnet.|Sökningen fortsätter. Öppna igen senare.|Inga personer eller figurer har ännu bekräftats för detta namn.|Sök efter namnet på Wikipedia|Visa källa|flagga'),
  da: row('Luk detaljer|Registreret navn|Værk|Nationalitet|Kendte personer med dette navn|Figurer med dette navn|Indlæser navneoplysninger…|Oplysningerne kunne ikke indlæses.|Prøv igen|Søger efter personer med dette navn…|Kontrollerer personer med dette navn.|Søgningen fortsætter. Åbn igen senere.|Ingen personer eller figurer er endnu bekræftet for dette navn.|Søg efter navnet på Wikipedia|Se kilde|flag'),
  nb: row('Lukk detaljer|Registrert navn|Verk|Nasjonalitet|Kjente personer med dette navnet|Figurer med dette navnet|Laster navneinformasjon…|Kunne ikke laste informasjonen.|Prøv igjen|Søker etter personer med dette navnet…|Kontrollerer personer med dette navnet.|Søket fortsetter. Åpne igjen senere.|Ingen personer eller figurer er bekreftet for dette navnet ennå.|Søk etter navnet på Wikipedia|Se kilde|flagg'),
  fi: row('Sulje tiedot|Rekisteröity nimi|Teos|Kansalaisuus|Tunnetut henkilöt tällä nimellä|Hahmot tällä nimellä|Ladataan nimitietoja…|Tietojen lataaminen epäonnistui.|Yritä uudelleen|Etsitään henkilöitä tällä nimellä…|Tarkistetaan nimeä vastaavia henkilöitä.|Haku jatkuu. Avaa tiedot myöhemmin uudelleen.|Tälle nimelle ei ole vielä vahvistettu henkilöitä tai hahmoja.|Hae nimeä Wikipediasta|Näytä lähde|lippu'),
  pl: row('Zamknij szczegóły|Zarejestrowane imię|Utwór|Obywatelstwo|Znane osoby o tym imieniu|Postacie o tym imieniu|Ładowanie informacji…|Nie udało się wczytać informacji.|Spróbuj ponownie|Wyszukiwanie osób o tym imieniu…|Sprawdzanie osób pasujących do tego imienia.|Wyszukiwanie trwa. Otwórz ponownie później.|Nie potwierdzono jeszcze osób ani postaci o tym imieniu.|Wyszukaj to imię w Wikipedii|Zobacz źródło|flaga'),
};
export function detailLanguage(country: string) { return countryLanguage(country); }
export function getDetailCopy(country: string) { return translations[detailLanguage(country)] ?? en; }
export function detailUiLanguage(country: string) { const lang = detailLanguage(country); return translations[lang] ? lang : 'en'; }
const readings: Record<string, { reading: string; hint: string; missing: string }> = {
  ru: { reading: 'Произношение', hint: 'Подсказка по чтению', missing: 'Произношение на этом языке пока не подтверждено.' },
  tr: { reading: 'Telaffuz', hint: 'Okuma rehberi', missing: 'Bu dildeki telaffuz henüz doğrulanmadı.' },
  'zh-Hant': { reading: '讀音', hint: '讀音提示', missing: '尚未確認此語言的讀音。' },
  'pt-BR': { reading: 'Pronúncia', hint: 'Guia de leitura', missing: 'A pronúncia neste idioma ainda não está disponível.' },
  ja: { reading: '読み方', hint: '読み方の目安', missing: '読み方は未確認です。' },
  en: { reading: 'Pronunciation', hint: 'Reading guide', missing: 'Pronunciation is not yet available in this language.' },
  ko: { reading: '읽는 법', hint: '발음 안내', missing: '이 언어의 발음 정보는 아직 확인되지 않았습니다.' },
  fr: { reading: 'Prononciation', hint: 'Guide de lecture', missing: 'La prononciation dans cette langue n’est pas encore disponible.' },
  de: { reading: 'Aussprache', hint: 'Lesehilfe', missing: 'Die Aussprache in dieser Sprache ist noch nicht verfügbar.' },
  it: { reading: 'Pronuncia', hint: 'Guida alla lettura', missing: 'La pronuncia in questa lingua non è ancora disponibile.' },
  es: { reading: 'Pronunciación', hint: 'Guía de lectura', missing: 'La pronunciación en este idioma aún no está disponible.' },
  pt: { reading: 'Pronúncia', hint: 'Guia de leitura', missing: 'A pronúncia neste idioma ainda não está disponível.' },
  zh: { reading: '读音', hint: '读音提示', missing: '暂未确认此语言的读音。' },
  nl: { reading: 'Uitspraak', hint: 'Leeshulp', missing: 'De uitspraak in deze taal is nog niet beschikbaar.' },
  sv: { reading: 'Uttal', hint: 'Läshjälp', missing: 'Uttalet på detta språk är ännu inte tillgängligt.' },
  da: { reading: 'Udtale', hint: 'Læsevejledning', missing: 'Udtalen på dette sprog er endnu ikke tilgængelig.' },
  nb: { reading: 'Uttale', hint: 'Lesehjelp', missing: 'Uttalen på dette språket er ikke tilgjengelig ennå.' },
  fi: { reading: 'Ääntäminen', hint: 'Lukuohje', missing: 'Ääntämistä tällä kielellä ei ole vielä saatavilla.' },
  pl: { reading: 'Wymowa', hint: 'Wskazówka wymowy', missing: 'Wymowa w tym języku nie jest jeszcze dostępna.' },
};
export function getDetailReadingCopy(country: string) { return readings[detailUiLanguage(country)]; }
