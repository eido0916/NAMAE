export function estimatedRankingNote(lang: string): string {
  const notes: Record<string, string> = {
    ja: '順位は推定を含みます。', en: 'Rankings include estimates.',
    zh: '排名包含估算。', 'zh-Hant': '排名包含估算。', ko: '순위에는 추정치가 포함됩니다.',
    fr: 'Les classements incluent des estimations.', de: 'Die Ranglisten enthalten Schätzungen.',
    es: 'Las clasificaciones incluyen estimaciones.', pt: 'As classificações incluem estimativas.',
    ru: 'Рейтинги включают приблизительные оценки.', ar: 'تتضمن التصنيفات تقديرات.',
    th: 'อันดับรวมค่าประมาณ', vi: 'Thứ hạng bao gồm các ước tính.',
    id: 'Peringkat mencakup perkiraan.', it: 'Le classifiche includono stime.',
    tr: 'Sıralamalar tahminler içerir.', hi: 'रैंकिंग में अनुमान शामिल हैं।',
  };
  return notes[lang] ?? notes.en;
}
