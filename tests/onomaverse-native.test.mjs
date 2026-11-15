import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceDisplayName } from '../scripts/onomaverse-native.mjs';

test('frequency rows retain original native spellings, counts, IDs and search aliases', () => {
  for (const [country, name, latin] of [['RU', 'Петрова', 'Petrova'], ['EG', 'محمد', 'Mohamed'], ['IL', 'כהן', 'Cohen'], ['BD', 'ইসলাম', 'Islam']]) {
    const source = { name, nameId: 'source-id', count: 120, gender: 'male' };
    const record = sourceDisplayName(country, source, [latin]);
    assert.equal(record.name, name);
    assert.equal(record.count, 120);
    assert.equal(record.nameId, 'source-id');
    assert.deepEqual(record.aliases, [latin]);
  }
});

test('missing original spellings are never reverse-transliterated or copied from another language', () => {
  assert.equal(sourceDisplayName('GR', {name:'John', count:40}, []).name, 'John');
  assert.equal(sourceDisplayName('RU', {name:'漢字', count:50}, []), undefined);
  assert.deepEqual(sourceDisplayName('RU', {name:'Петрова',count:60}, ['Petrova','Petrova','Петрова']).aliases, ['Petrova']);
});

test('Arabic presentation forms keep their source alias without becoming separate spellings', () => {
  const original = 'ﻣﺤﻤﺪ';
  const record = sourceDisplayName('EG', {name:original,count:100,nameId:'original'}, ['Mohamed']);
  assert.equal(record.name, 'محمد');
  assert.equal(record.count, 100);
  assert.ok(record.aliases.includes(original));
  assert.ok(record.aliases.includes('Mohamed'));
});
