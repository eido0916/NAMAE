import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const root = resolve(import.meta.dirname, '../..');
// Do not remove accents, transliterate, or split compound names.
export const normalize = (name) => name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('und');
export function openDetails(path = resolve(root, 'data/name-details.sqlite')) {
  path ||= resolve(root, 'data/name-details.sqlite');
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version === 0) db.exec(readFileSync(resolve(root, 'scripts/name-details/schema.sql'), 'utf8'));
  else if (version !== 1) throw Error(`Unsupported name details schema: ${version}`);
  // Additive extension: retain translated labels independently of the expiring API cache.
  db.exec(`CREATE TABLE IF NOT EXISTS entity_localizations (
    entity_id TEXT NOT NULL, locale TEXT NOT NULL, type TEXT NOT NULL,
    body TEXT NOT NULL, PRIMARY KEY(entity_id,locale,type)
  )`);
  return db;
}
export function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = action(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
