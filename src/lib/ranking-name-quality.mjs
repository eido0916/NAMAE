import { isNativeName } from './native-name-policy.mjs';
import { normalizeInputName } from './reference-lookup.mjs';

// Statistical table labels and missing-name values occasionally occur in name columns.
const placeholders = /^(?:unknown(?: name)?|unnamed|name (?:unknown|withheld)|not (?:stated|known|specified|available|recorded|provided|reported|declared|given|applicable)|no (?:first |last |given |family )?name|no surname|all (?:other )?(?:first |last |given |family )?names|other (?:first |last |given |family )?names|baby (?:boy|girl)|sin (?:nombre|apellido)|non renseign[ée]|sans (?:nom|prénom)|não informado|sem nome|unbekannt|не указано|неизвестно|未登録|不明|姓名不詳|姓名不详|未知|未命名|其他姓氏|その他の姓|미상|미등록|이름 없음|기타|없음|ไม่ทราบ|ไม่ระบุ|tidak diketahui|tanpa nama|không rõ)$/iu;
const nameCharacters = /^[\p{L}\p{M}ー々ヶヵ·・ .’'\-]+$/u;
const incompleteName = /^\p{M}|^[-·・.]|[-·・]$/u;
const initials = /^(?:\p{Script=Latin}\p{M}*\.?|(?:\p{Script=Latin}\p{M}*\.\s*){2,})$/u;

function hasNameShape(name) {
  return Array.from(name).length <= 30 && nameCharacters.test(name) &&
    /\p{L}/u.test(name) && !incompleteName.test(name) && !/^(\p{L})\1{3,}$/iu.test(name);
}

function isRejectedSpelling(country, type, name) {
  const spelling = name.normalize('NFKC').trim().replace(/\s+/g, ' ');
  return (type === 'given_name' && initials.test(normalizeInputName(spelling))) ||
    /^marico el que lo lea$/iu.test(spelling) ||
    (type === 'surname' && ['BE', 'FR'].includes(country) && /^famille /iu.test(spelling)) ||
    (country === 'BR' && type === 'surname' && /^(?:feeeeira|frrrrira)$/iu.test(spelling));
}

/** @param {string} name @param {string} [country] @param {string} [type] */
export function isRankingPlaceholder(name, country, type) {
  const normalized = name.normalize('NFKC').trim().replace(/\s+/g, ' ');
  // SSA and the Census Bureau document placeholder entries in the US first-name
  // tables. Ambiguous aggregates for these values cannot support a ranking.
  const label = normalized.replace(/[-.]+/g, ' ').trim().replace(/\s+/g, ' ');
  return placeholders.test(label) || /^un named$/i.test(label) || /x{4,}/i.test(normalized) ||
    (country === 'CA' && type === 'given_name' && /^(?:infant|male|female)$/i.test(label)) ||
    (country === 'TH' && /^(?:นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)$/u.test(label)) ||
    (country === 'US' && type === 'given_name' &&
      /^(?:baby|infant|newborn|child|person|female|male|ref|refused|blank)$/i.test(label));
}

/** @param {string} country @param {string} name @param {string} [type] */
export function isUsableRankingName(country, name, type) {
  return isUsableRankingAlias(country, name, type) && isNativeName(country, name);
}

/** @param {string} country @param {string} name @param {string} [type] */
export function isUsableRankingAlias(country, name, type) {
  // A verified alias may use a different script than the displayed name.
  return hasNameShape(name) && !isRejectedSpelling(country, type, name) &&
    !isRankingPlaceholder(name, country, type);
}
