const en = {
  label: 'Ranking dataset', published: 'Published name statistics', observed: 'Public people dataset',
  publishedHint: 'Population, birth cohort, period and coverage differ by source.',
  hint: 'Public people ranks count people recorded in Wikidata. They are not population or birth rankings.',
  rank: 'Public people rank', people: 'people in this dataset', ties: 'names tied at this rank',
};
type Copy = typeof en;
const localized: Record<string, Partial<Copy>> = {
  ja: { publishedHint: '提供元ごとに対象（人口・出生など）や年度が異なります。', label: 'ランキングの集計', published: '公表統計（人口・出生など）', observed: '公開人物データ内の集計', hint: 'Wikidataに記載された人物の出現人数順です。全国人口・出生の順位ではありません。', rank: '公開人物データ内の順位', people: '人（この資料内）', ties: '件が同順位' },
  zh: { publishedHint: '不同来源的统计对象（人口、新生儿等）及年份可能不同。', label: '排名数据', published: '公布的姓名统计（人口／新生儿等）', observed: '公开人物数据内的统计', hint: '按Wikidata所记录的人数排名，不是全国人口或新生儿排名。', rank: '公开人物数据内排名', people: '人（该数据内）', ties: '个名字并列' },
  'zh-Hant': { publishedHint: '不同來源的統計對象（人口、新生兒等）及年份可能不同。', label: '排名資料', published: '公布的姓名統計（人口／新生兒等）', observed: '公開人物資料內的統計', hint: '依Wikidata記錄的人數排名，並非全國人口或新生兒排名。', rank: '公開人物資料內排名', people: '人（該資料內）', ties: '個名字同排名' },
  ko: { label: '순위 자료', published: '인구·출생 통계', observed: '공개 인물 자료 내 집계', hint: 'Wikidata에 기록된 인물 수에 따른 순위입니다. 전체 인구·출생 순위가 아닙니다.', rank: '공개 인물 자료 내 순위' },
  fr: { label: 'Données du classement', published: 'Statistiques de population et de naissances', observed: 'Personnes dans les données publiques', hint: 'Classement des personnes répertoriées dans Wikidata, pas de la population ou des naissances.', rank: 'Rang dans les données publiques' },
  de: { label: 'Datensatz der Rangliste', published: 'Bevölkerungs- und Geburtsstatistik', observed: 'Öffentlich erfasste Personen', hint: 'Rang nach Personen in Wikidata, keine Bevölkerungs- oder Geburtenrangliste.', rank: 'Rang im Personendatensatz' },
  ru: { label: 'Данные рейтинга', published: 'Опубликованная статистика имён', observed: 'Люди в открытых данных', hint: 'Рейтинг по людям, записанным в Wikidata, а не по населению или новорождённым.', rank: 'Место в открытых данных' },
  uk: { label: 'Дані рейтингу', published: 'Статистика населення та народжень', observed: 'Люди у відкритих даних', hint: 'Рейтинг за людьми у Wikidata, а не за населенням чи новонародженими.', rank: 'Місце у відкритих даних' },
  ar: { label: 'بيانات الترتيب', published: 'إحصاءات السكان والمواليد', observed: 'الأشخاص في البيانات العامة', hint: 'ترتيب الأشخاص المسجلين في ويكي بيانات، وليس ترتيب السكان أو المواليد.', rank: 'الترتيب ضمن بيانات الأشخاص' },
  es: { label: 'Datos del ranking', published: 'Estadísticas de población y nacimientos', observed: 'Personas en datos públicos', hint: 'Ranking de personas registradas en Wikidata, no de la población ni de los nacimientos.', rank: 'Puesto en datos de personas' },
  pt: { label: 'Dados do ranking', published: 'Estatísticas de população e nascimentos', observed: 'Pessoas em dados públicos', hint: 'Ranking das pessoas registadas no Wikidata, não da população nem dos nascimentos.', rank: 'Posição nos dados de pessoas' },
  th: { label: 'ข้อมูลการจัดอันดับ', published: 'สถิติประชากรและการเกิด', observed: 'บุคคลในข้อมูลสาธารณะ', hint: 'จัดอันดับจากบุคคลที่บันทึกใน Wikidata ไม่ใช่อันดับประชากรหรือทารกเกิดใหม่', rank: 'อันดับในข้อมูลบุคคลสาธารณะ' },
  vi: { label: 'Dữ liệu xếp hạng', published: 'Thống kê dân số và khai sinh', observed: 'Người trong dữ liệu công khai', hint: 'Xếp hạng theo người được ghi trong Wikidata, không phải theo dân số hay trẻ sơ sinh.', rank: 'Hạng trong dữ liệu công khai' },
  id: { label: 'Data peringkat', published: 'Statistik penduduk dan kelahiran', observed: 'Orang dalam data publik', hint: 'Peringkat orang yang tercatat di Wikidata, bukan peringkat penduduk atau kelahiran.', rank: 'Peringkat dalam data publik' },
  it: { label: 'Dati della classifica', published: 'Statistiche demografiche e delle nascite', observed: 'Persone nei dati pubblici', hint: 'Classifica delle persone registrate in Wikidata, non della popolazione o delle nascite.', rank: 'Posizione nei dati pubblici' },
  nl: { label: 'Gegevens voor de ranglijst', published: 'Bevolkings- en geboortestatistieken', observed: 'Personen in openbare gegevens', hint: 'Rang van personen in Wikidata, geen bevolkings- of geboorteranglijst.', rank: 'Rang in openbare gegevens' },
  pl: { label: 'Dane rankingu', published: 'Statystyki ludności i urodzeń', observed: 'Osoby w danych publicznych', hint: 'Ranking osób zapisanych w Wikidata, a nie ludności lub noworodków.', rank: 'Miejsce w danych publicznych' },
  tr: { label: 'Sıralama verileri', published: 'Nüfus ve doğum istatistikleri', observed: 'Açık verilerdeki kişiler', hint: 'Wikidata kayıtlarındaki kişilerin sıralamasıdır; nüfus veya doğum sıralaması değildir.', rank: 'Açık kişi verilerindeki sıra' },
};
export function getRankingScopeCopy(language: string): Copy {
  return { ...en, ...(localized[language] ?? localized[language.split('-')[0]]) };
}
