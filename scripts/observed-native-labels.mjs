import { countryLocale } from '../src/lib/country-locale.mjs';
import { isNativeName } from '../src/lib/native-name-policy.mjs';

export function observedLabelLanguages(country) {
  const special = { TW: ['zh-hant', 'zh-tw', 'zh'], HK: ['zh-hant', 'zh-hk', 'zh'], MO: ['zh-hant', 'zh-hk', 'zh'],
    CN: ['zh-hans', 'zh-cn', 'zh'], BY: ['be', 'ru'], KZ: ['kk', 'ru'], KG: ['ky', 'ru'], TJ: ['tg', 'ru'],
    AF: ['fa', 'ps', 'ar'], PK: ['ur', 'ar'], IL: ['he', 'ar'], LK: ['si', 'ta'], ET: ['am', 'ti'] };
  return [...new Set([...(special[country] ?? [countryLocale(country).split('-')[0]]), 'en'])];
}

export function observedNativeLabel(country, type, labels) {
  for (const language of observedLabelLanguages(country)) {
    const raw = labels[language];
    if (!raw) continue;
    let name = raw.replace(/[^\p{Script=Han}]+/gu, value => value.normalize('NFKC')).trim().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
    if (['CN', 'TW', 'HK', 'MO'].includes(country) && type === 'surname') name = name.replace(/^([\p{Script=Han}]{1,12})[姓氏]$/u, '$1');
    if (Array.from(name).length > 30 || !/^[\p{L}\p{M}ー々ヶヵ·・ .’'\-]+$/u.test(name) || !isNativeName(country, name)) continue;
    if (/^[\p{Script=Latin}\p{M} .'-]+$/u.test(name) && (name.match(/\p{Script=Latin}/gu)?.length ?? 0) < 2) continue;
    return name;
  }
}
