import { countryLanguage } from '../../src/lib/country-locale.mjs';
import { ids, safeUrl } from './wikidata.mjs';

// Reuse the verified entities' cached labels; translating a label never changes identity.
export function localizeDetailEntity(db, entity, country, registeredNames = [], type = 'given_name', cache = new Map()) {
  const language = countryLanguage(country);
  if (language === 'ja') return;
  const read = db.prepare('SELECT body FROM response_cache WHERE key=?');
  function raw(id) {
    if (!cache.has(id)) {
      const row = read.get(`entity:${id}`);
      cache.set(id, row ? JSON.parse(row.body) : {});
    }
    return cache.get(id);
  }
  const languages = [...new Set([...(language === 'zh-Hant' ? ['zh-hant', 'zh-tw', 'zh-hk', 'zh'] : language === 'pt-BR' ? ['pt-br', 'pt'] : [language]), 'en', 'mul'])];
  const text = (values) => languages.map((lang) => values?.[lang]?.value).find(Boolean);
  const label = (id) => text(raw(id).labels);
  const clean = (value) => value && !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value) ? value : undefined;
  const value = raw(entity.id);
  const stored = db.prepare('SELECT body FROM entity_localizations WHERE entity_id=? AND locale=? AND type=?').get(entity.id, language, type);
  if (!value.labels && stored) return JSON.parse(stored.body);
  const names = (property) => ids(value, property).map(label).filter(Boolean);
  const wiki = languages.map((lang) => {
    const site = lang === 'nb' ? 'no' : lang.split('-')[0];
    const link = value.sitelinks?.[`${site}wiki`];
    return link?.url ?? (link?.title ? `https://${site}.wikipedia.org/wiki/${encodeURIComponent(link.title.replaceAll(' ', '_'))}` : undefined);
  }).find((url) => safeUrl(url));
  const localized = {
    language,
    name: label(entity.id) ?? clean(entity.name) ?? entity.id,
    registeredNames: names(type === 'surname' ? 'P734' : 'P735').length ? names(type === 'surname' ? 'P734' : 'P735') : registeredNames.filter(clean),
    nationalities: names('P27'),
    occupations: names('P106'),
    description: text(value.descriptions),
    work: [...names('P1441'), ...names('P1080')].join(' / ') || undefined,
    source: wiki ?? (/^Q\d+$/.test(entity.id) ? `https://www.wikidata.org/wiki/${entity.id}` : entity.source_url),
  };
  if (value.labels) {
    const body = JSON.stringify(localized);
    if (stored?.body !== body) db.prepare('INSERT OR REPLACE INTO entity_localizations VALUES (?,?,?,?)').run(entity.id, language, type, body);
  }
  return localized;
}
