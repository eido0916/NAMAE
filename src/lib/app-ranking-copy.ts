import type { NameRecord } from "./types";

const evidenceLabels = {
  published: ["公表統計", "Published statistics"],
  country_frequency: ["国別頻度資料", "Country frequency data"],
  public_people: ["公開人物の使用記録", "Public-person records"],
  country_association: ["公開人物の使用記録", "Public-person records"],
  name_corpus: ["実名の収集資料（頻度なし）", "Recorded names (no frequency data)"],
} as const;

export function usageEvidenceLabel(evidence: NameRecord["usageEvidence"], lang: string) {
  return evidence ? evidenceLabels[evidence.kind][lang === "ja" ? 0 : 1] : "";
}

export function appRankNote(lang: string) {
  return lang === "ja" ? "資料を統合したアプリ内順位" : "Rank in NAMAE’s combined list";
}

export function formatListPosition(rank: number, total: number, lang: string) {
  const ratio = rank / total;
  const maximumFractionDigits = ratio * 100 < 0.01 ? 4 : 2;
  const position = new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits }).format(ratio);
  return lang === "ja" ? `上位${position}` : `Top ${position}`;
}
