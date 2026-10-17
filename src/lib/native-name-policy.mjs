// A country can use several scripts. Latin is deliberately allowed for
// multilingual countries such as Singapore, Malaysia and South Africa.
const groups = {
  Han: 'CN TW HK MO', Hangul: 'KR', Cyrillic: 'RU UA BY BG MK MN KZ KG TJ',
  Greek: 'GR CY', Armenian: 'AM', Georgian: 'GE', Hebrew: 'IL',
  Arabic: 'AE AF BH DZ EG IQ IR JO KW LB LY MA OM PK PS QA SA SD SY TN YE',
  Bengali: 'BD', Devanagari: 'NP', Thai: 'TH', Khmer: 'KH', Lao: 'LA',
  Myanmar: 'MM', Thaana: 'MV', Ethiopic: 'ET',
};
const scripts = new Map(Object.entries(groups).flatMap(([script, countries]) => countries.split(' ').map(country => [country, [script]])));
scripts.set('JP', ['Han', 'Hiragana', 'Katakana']);
scripts.set('IN', ['Devanagari', 'Bengali', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Gujarati', 'Gurmukhi', 'Oriya', 'Arabic', 'Latin']);
scripts.set('SG', ['Latin', 'Han', 'Tamil']);
scripts.set('MY', ['Latin', 'Han', 'Arabic', 'Tamil']);
scripts.set('IL', ['Hebrew', 'Arabic']);
scripts.set('LK', ['Sinhala', 'Tamil']);
scripts.set('RS', ['Cyrillic', 'Latin']);
scripts.set('ME', ['Cyrillic', 'Latin']);
const patterns = new Map();
/** @param {string} country @param {string} name */
export function isNativeName(country, name) {
  const allowed = scripts.get(country) ?? ['Latin'];
  const key = allowed.join('|');
  if (!patterns.has(key)) patterns.set(key, new RegExp(`^[${allowed.map(script => `\\p{Script=${script}}`).join('')}\\p{M}\\p{N} .’'·・ー々ヶヵ\\-]+$`, 'u'));
  return patterns.get(key).test(name.normalize('NFKC')) && /\p{L}/u.test(name);
}
/** @param {string} name */
export const nativeNameKey = name => name.normalize('NFKC').trim().toLowerCase();

/**
 * Only use explicitly linked source spellings. Never reverse-transliterate or
 * choose the first of several possible native spellings.
 * @param {{country:string,type:string,name:string,aliases?:string[]}} record
 * @param {Record<string, string[]>} index
 */
export function resolveNativeName(record, index) {
  if (isNativeName(record.country, record.name)) {
    const linked = index[record.country + '/' + record.type + '/' + nativeNameKey(record.name)] ?? [];
    return /^[\x00-\x7f]+$/.test(record.name) && linked.length === 1 ? linked[0] : record.name;
  }
  const aliases = (record.aliases ?? []).filter(name => isNativeName(record.country, name));
  const candidates = new Set(aliases.length ? aliases : [record.name, ...(record.aliases ?? [])].flatMap(name => index[`${record.country}/${record.type}/${nativeNameKey(name)}`] ?? []));
  return candidates.size === 1 ? [...candidates][0] : undefined;
}
