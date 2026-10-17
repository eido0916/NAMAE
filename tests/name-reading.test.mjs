import test from 'node:test';
import assert from 'node:assert/strict';
import { nameReadingHint } from '../src/lib/name-reading.mjs';

test('common name hints respect country language and distinguish conventional spellings from rules', () => {
  for (const [country,name,expected] of [
    ['US','Emily','エミリー'],['GB','Olivia','オリビア'],['FR','MARIE','マリー'],['DE','Emilia','エミリア'],
    ['US','Michael','マイケル'],['DE','Michael','ミヒャエル'],['US','Paul','ポール'],['DE','Paul','パウル'],
    ['FR','Thomas','トマ'],['GB','Thomas','トーマス'],['US','Craig','クレイグ'],['DE','Bo','ボー'],
    ['IT','Giuseppe','ジュゼッペ'],['ES','José','ホセ'],['PT','José','ジョゼ'],['DE','Jürgen','ユルゲン'],
    ['US','Ｅｍｉｌｙ','エミリー'],['NL','De Jong','デ・ヨング'],
  ]) {
    const reading=nameReadingHint(country,name);
    assert.equal(reading.text,expected,`${country}/${name}`);
    assert.equal(reading.kind,'conventional');
    assert.equal(reading.source,undefined, 'hints must not invent reviewed sources');
  }
  assert.equal(nameReadingHint('US','Emily-Smith').text,'エミリー・スミス');
  assert.equal(nameReadingHint('ES','Paloma').kind,'estimated');
  assert.equal(nameReadingHint('ES','Paloma').text,'パロマ');
  assert.equal(nameReadingHint('ES','Josefa').text,'ホセファ');
  assert.equal(nameReadingHint('DE','Wolfram').text,'ヴォルフラム');
});

test('Hangul readings cover uncollected names, normalize decomposed syllables and handle liaison', () => {
  for (const [name,kana] of [['서윤','ソユン'],['서준','ソジュン'],['호영','ホヨン'],['지안','ジアン'],['민준','ミンジュン'],['수빈','スビン'],['최','チェ'],['준우','ジュヌ']]) {
    const reading=nameReadingHint('KR',name);
    assert.equal(reading.text,kana,name);
    assert.equal(reading.kind,'estimated');
    assert.deepEqual(nameReadingHint('KR',name.normalize('NFD')),reading);
  }
});

test('unsupported countries and mixed or unknown scripts never produce partial fabricated readings', () => {
  for (const [country,name] of [['CN','王'],['US','瑛真'],['US','John王'],['US','John123'],['US','<script>'],['KR','Seo-jun'],['ZZ','Emily'],['US',''],['US','a'.repeat(161)]]) {
    assert.equal(nameReadingHint(country,name),undefined,`${country}/${name}`);
  }
});
