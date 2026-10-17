import test from 'node:test';
import assert from 'node:assert/strict';
import countries from '../src/data/countries.json';
import translations from '../src/lib/ui-locales.json';
import { getUiCopy, getCountryPickerCopy, supportedUiLanguages } from '../src/lib/ui-copy';
import { detailUiLanguage, getDetailCopy, getDetailReadingCopy } from '../src/lib/detail-copy';

const representatives: Record<string, string> = { JP:'ja', US:'en', FR:'fr', KR:'ko', DE:'de', IT:'it', ES:'es', PT:'pt', BR:'pt-BR', CN:'zh', TW:'zh-Hant', NL:'nl', SE:'sv', DK:'da', NO:'nb', FI:'fi', PL:'pl', RU:'ru', TR:'tr' };
test('every supported language covers the complete input, result, picker and detail interfaces', () => {
  const keys = Object.keys(getUiCopy('US')).sort();
  assert.equal(supportedUiLanguages.length, 19);
  for (const [language, catalog] of Object.entries(translations)) {
    assert.deepEqual(Object.keys(catalog.ui).sort(), keys, language);
  }
  for (const [country, language] of Object.entries(representatives)) {
    const copy = getUiCopy(country);
    assert.equal(copy.lang, language, country);
    assert.deepEqual(Object.keys(copy).sort(), keys, country);
    assert.ok(Object.values(copy).every(value => typeof value === 'string' && value.trim()), country);
    assert.equal(detailUiLanguage(country), language, country);
    assert.ok(Object.values(getCountryPickerCopy(country)).every(value => value.trim()), country);
    assert.ok(Object.values(getDetailCopy(country)).every(value => value.trim()), country);
    assert.ok(getDetailReadingCopy(country).missing, country);
  }
  for (const country of countries.filter(country => country.enabled)) {
    assert.ok(getCountryPickerCopy(country.code).search, country.code);
    assert.ok(getDetailReadingCopy(country.code).missing, country.code);
  }
});

test('regional language choices and new translations use the right semantic fields', () => {
  assert.equal(getUiCopy('IT').rank, 'Classifica');
  assert.equal(getUiCopy('IT').addCountry, 'Aggiungi un paese');
  assert.equal(getUiCopy('ES').surname, 'Apellido');
  assert.equal(getUiCopy('MX').lang, 'es');
  assert.equal(getUiCopy('AO').lang, 'pt');
  assert.equal(getUiCopy('BR').surname, 'Sobrenome');
  assert.equal(getUiCopy('PT').surname, 'Apelido');
  assert.equal(getUiCopy('CN').save, '保存图片');
  assert.equal(getUiCopy('TW').save, '儲存圖片');
  assert.equal(getUiCopy('HK').lang, 'zh-Hant');
  assert.equal(getUiCopy('MO').lang, 'zh-Hant');
  assert.equal(getUiCopy('BE').lang, 'nl');
  assert.equal(getUiCopy('AT').lang, 'de');
  assert.equal(getUiCopy('RU').male, 'Мужской');
  assert.equal(getUiCopy('TR').female, 'Kadın');
  assert.equal(getUiCopy('VN').lang, 'en');
});
