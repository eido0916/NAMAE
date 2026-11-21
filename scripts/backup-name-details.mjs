import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { openDetails, root, transaction } from './name-details/db.mjs';

// Portable source snapshot; API response cache and operational logs stay local.
const tables = ['names','entities','name_entities','collection_jobs','entity_localizations'];
const path = resolve(process.argv[3] ?? resolve(root,'data-sources/name-details/collected.json'));
const db = openDetails(process.env.NAMAE_DETAILS_DB);
if (process.argv[2] === 'restore') {
  if (!existsSync(path) || db.prepare('SELECT COUNT(*) count FROM names').get().count > 0) {
    console.log('Snapshot restore skipped: no snapshot or database already initialized.');
    db.close();
    process.exit(0);
  }
  const snapshot = JSON.parse(readFileSync(path,'utf8'));
  if (snapshot.version !== 1) throw Error('Unsupported snapshot version');
  transaction(db, () => {
    for (const table of tables) {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
      for (const row of snapshot[table] ?? []) {
        if (Object.keys(row).some((key) => !columns.includes(key))) throw Error('Invalid snapshot column');
        const keys = Object.keys(row);
        db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((key) => row[key]));
      }
    }
  });
} else if (process.argv[2] === 'save') {
  const snapshot = { version:1 };
  db.exec('BEGIN');
  try {
    for (const table of tables) snapshot[table] = db.prepare(`SELECT * FROM ${table} ORDER BY ${table === 'entity_localizations' ? 'entity_id,locale,type' : table === 'names' ? 'id' : table === 'entities' ? 'id' : 'name_id'}`).all();
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  mkdirSync(dirname(path),{recursive:true});
  writeFileSync(path,JSON.stringify(snapshot)+'\n');
} else throw Error('Use: node scripts/backup-name-details.mjs save|restore [path]');
db.close();
