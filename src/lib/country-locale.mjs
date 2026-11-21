const nativeLocales = {
  JP: "ja", KR: "ko", FR: "fr", DE: "de", IT: "it", ES: "es", PT: "pt", BR: "pt-BR", NL: "nl", BE: "nl", CH: "de", AT: "de",
  MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es", EC: "es", UY: "es", PY: "es", BO: "es", CU: "es", CR: "es", PA: "es", DO: "es", PR: "es", GT: "es", HN: "es", SV: "es", NI: "es",
  CN: "zh-CN", TW: "zh-TW", HK: "zh-HK", MO: "zh-HK", IN: "hi", TR: "tr", PL: "pl", CZ: "cs", SK: "sk", HU: "hu", RO: "ro", MD: "ro",
  RU: "ru", UA: "uk", BY: "be", BG: "bg", RS: "sr", ME: "sr", HR: "hr", BA: "bs", SI: "sl", MK: "mk", AL: "sq", XK: "sq", GR: "el", CY: "el",
  SE: "sv", NO: "nb", DK: "da", FI: "fi", IS: "is", FO: "fo", GL: "kl", EE: "et", LV: "lv", LT: "lt", IE: "en", LU: "fr", LI: "de", MC: "fr", SM: "it", AD: "ca", MT: "mt",
  TH: "th", VN: "vi", ID: "id", MY: "ms", BN: "ms", PH: "fil", KH: "km", LA: "lo", MM: "my", MN: "mn", NP: "ne", BD: "bn", LK: "si", MV: "dv", PK: "ur",
  SA: "ar", AE: "ar", QA: "ar", KW: "ar", BH: "ar", OM: "ar", YE: "ar", IQ: "ar", SY: "ar", JO: "ar", LB: "ar", PS: "ar", IL: "he", IR: "fa", AF: "fa",
  KZ: "kk", UZ: "uz", KG: "ky", TJ: "tg", TM: "tk", AZ: "az", GE: "ka", AM: "hy",
  EG: "ar", MA: "ar", DZ: "ar", TN: "ar", LY: "ar", SD: "ar", ET: "am", SO: "so", KE: "sw", TZ: "sw", SN: "fr", CM: "fr", BF: "fr", ML: "fr", BI: "fr", DJ: "fr", MU: "fr", HT: "fr", AO: "pt", MZ: "pt", GQ: "es",
};
/** @param {string} country */
export function countryLocale(country) { return nativeLocales[country] ?? "en"; }
/** @param {string} country */
export function countryLanguage(country) {
  if (country === 'BR') return 'pt-BR';
  if (['TW', 'HK', 'MO'].includes(country)) return 'zh-Hant';
  return countryLocale(country).split('-')[0];
}
