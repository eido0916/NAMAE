import { normalizeInputName } from "./reference-lookup.mjs";

// Preserve ü independently of u: Lü/Lv and Lu are different readings.
/** @param {string} value */
export function normalizePinyin(value) {
  return normalizeInputName(value).replace(/[üǖǘǚǜ]/g, "v").normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * @template {{name: string, aliases?: string[]}} T
 * @param {string} value
 * @param {T[]} records
 * @returns {T[]}
 */
export function findChineseSurnameCandidates(value, records) {
  const input = normalizeInputName(value);
  if (!input) return [];
  // Han and tone-marked spellings are matched exactly. Never drop tones before
  // testing Lǐ vs Lí, or collapse the different surnames 余 and 于.
  const exact = /\p{Script=Han}|[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/iu.test(input);
  return records.filter((record) => [record.name, ...(record.aliases ?? [])].some((alias) =>
    exact ? normalizeInputName(alias) === input : /^[\p{Script=Latin}\p{M} '-]+$/u.test(alias) && normalizePinyin(alias) === normalizePinyin(input),
  ));
}

/** @param {{country?: string, type?: string, name: string, aliases?: string[]}} record */
export function formatName(record) {
  if (record.country !== "CN" || record.type !== "surname" || !/\p{Script=Han}/u.test(record.name)) return record.name;
  const pinyin = record.aliases?.find((alias) => /^[\p{Script=Latin}\p{M} '-]+$/u.test(alias));
  return pinyin ? `${record.name}（${pinyin}）` : record.name;
}
