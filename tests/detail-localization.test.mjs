import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openDetails } from '../scripts/name-details/db.mjs';
import { localizeDetailEntity } from '../scripts/name-details/localize.mjs';
import { getDetailCopy, getDetailReadingCopy, detailUiLanguage } from '../src/lib/detail-copy.ts';

test('detail entities use destination labels and descriptions without changing their identity', () => {
  const directory = mkdtempSync(join(tmpdir(), 'namae-localization-'));
  const database = join(directory, 'details.sqlite');
  const db = openDetails(database);
  const save = (id, body) => db.prepare('INSERT INTO response_cache VALUES (?,?,?)').run(`entity:${id}`, JSON.stringify(body), new Date().toISOString());
  const claim = (id) => [{ mainsnak: { snaktype: 'value', datavalue: { value: { id } } } }];
  save('Q211691', { labels: { ja: { value: '石鉉俊' }, ko: { value: '석현준' }, en: { value: 'Suk Hyun-jun' }, fr: { value: 'Suk Hyun-jun' } }, descriptions: { ja: { value: '韓国のサッカー選手' }, ko: { value: '대한민국의 축구 선수' }, en: { value: 'South Korean footballer' } }, claims: { P27: claim('Q884'), P106: claim('Q937857'), P735: claim('Q1') }, sitelinks: { kowiki: { url: 'https://ko.wikipedia.org/wiki/석현준' }, enwiki: { url: 'https://en.wikipedia.org/wiki/Suk_Hyun-jun' } } });
  save('Q884', { labels: { ko: { value: '대한민국' }, en: { value: 'South Korea' } } });
  save('Q937857', { labels: { ko: { value: '축구 선수' }, en: { value: 'association football player' } } });
  save('Q1', { labels: { ko: { value: '현준' }, en: { value: 'Hyun-jun' } } });
  const entity = { id: 'Q211691', name: '石鉉俊', description: '韓国のサッカー選手' };
  const ko = localizeDetailEntity(db, entity, 'KR', ['현준']);
  assert.equal(ko.name, '석현준');
  assert.equal(ko.description, '대한민국의 축구 선수');
  assert.deepEqual(ko.nationalities, ['대한민국']);
  assert.deepEqual(ko.occupations, ['축구 선수']);
  assert.deepEqual(ko.registeredNames, ['현준']);
  assert.match(ko.source, /^https:\/\/ko.wikipedia.org\//);
  const fr = localizeDetailEntity(db, entity, 'FR');
  assert.equal(fr.description, 'South Korean footballer');
  assert.equal(entity.name, '石鉉俊');
  assert.equal(localizeDetailEntity(db, entity, 'JP'), undefined);
  const missing = localizeDetailEntity(db, { id: 'Q2', name: 'カタカナ名', description: '日本語の説明' }, 'DE');
  assert.equal(missing.name, 'Q2');
  assert.equal(missing.description, undefined);
  db.prepare('DELETE FROM response_cache').run();
  assert.deepEqual(localizeDetailEntity(db, entity, 'KR', ['현준']), JSON.parse(JSON.stringify(ko)));
  db.close();
  const snapshot = join(directory, 'snapshot.json');
  const restored = join(directory, 'restored.sqlite');
  execFileSync(process.execPath, ['scripts/backup-name-details.mjs', 'save', snapshot], { env: { ...process.env, NAMAE_DETAILS_DB: database } });
  execFileSync(process.execPath, ['scripts/backup-name-details.mjs', 'restore', snapshot], { env: { ...process.env, NAMAE_DETAILS_DB: restored } });
  const copy = openDetails(restored);
  assert.equal(localizeDetailEntity(copy, entity, 'KR').name, '석현준');
  copy.close();
});

test('detail controls and reading messages use the initial input country language', () => {
  assert.equal(getDetailCopy('KR').close, '상세 정보 닫기');
  assert.equal(getDetailCopy('FR').source, 'Voir la source');
  assert.equal(getDetailCopy('AT').source, 'Quelle ansehen');
  assert.equal(detailUiLanguage('KR'), 'ko');
  assert.equal(detailUiLanguage('TR'), 'tr');
  assert.equal(getDetailReadingCopy('KR').missing, '이 언어의 발음 정보는 아직 확인되지 않았습니다.');
  for (const code of ['US', 'GB', 'FR', 'KR', 'DE', 'IT', 'ES', 'BR', 'CN', 'NL', 'SE', 'FI', 'DK', 'NO', 'PL', 'TR']) {
    const copy = getDetailCopy(code);
    assert.equal(Object.keys(copy).length, 16);
    assert.ok(Object.values(copy).every((value) => value && !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value)), code);
  }
});
