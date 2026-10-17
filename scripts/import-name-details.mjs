import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDetails, normalize, root, transaction } from './name-details/db.mjs';
import { safeUrl } from './name-details/wikidata.mjs';

const data = JSON.parse(readFileSync(resolve(process.argv[2] ?? resolve(root, 'data-sources/name-details/editorial.json')), 'utf8'));
const db = openDetails(process.env.NAMAE_DETAILS_DB);
function nameId(n) {
  if (!/^[A-Z]{2}$/.test(n.country) || !['given_name','surname'].includes(n.type) || !n.name?.trim() || !n.language) throw Error('Invalid editorial name');
  db.prepare('INSERT OR IGNORE INTO names(country,name,normalized,type,language) VALUES (?,?,?,?,?)').run(n.country,n.name,normalize(n.name),n.type,n.language);
  return db.prepare('SELECT id FROM names WHERE country=? AND normalized=? AND type=? AND language=?').get(n.country,normalize(n.name),n.type,n.language).id;
}
transaction(db, () => {
  for (const n of data.readings ?? []) {
    if (!safeUrl(n.source) || !n.reading || !n.reviewedBy) throw Error('Reading needs source and reviewer');
    db.prepare("UPDATE names SET reading_ja=?,reading_source=?,reading_status='verified' WHERE id=?").run(n.reading,n.source,nameId(n));
  }
  for (const e of data.entities ?? []) {
    if (!/^(Q\d+|manual:[a-zA-Z0-9_-]+)$/.test(e.id) || !['person','character'].includes(e.kind) || !e.name || !safeUrl(e.source)) throw Error('Invalid editorial entity');
    if (!e.updatedAt || !Number.isFinite(Date.parse(e.updatedAt))) throw Error('Editorial entity requires an updatedAt timestamp');
    if (e.image && (!safeUrl(e.image.url) || !safeUrl(e.image.source) || !e.image.license || !e.image.credit)) throw Error('Image requires reviewed license, credit and source');
    db.prepare(`INSERT INTO entities(id,kind,name,description,work,source_url,updated_at,image_url,image_license,image_credit,image_source,image_approved,nationalities_json,occupations_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,work=excluded.work,source_url=excluded.source_url,updated_at=excluded.updated_at,image_url=excluded.image_url,image_license=excluded.image_license,image_credit=excluded.image_credit,image_source=excluded.image_source,image_approved=excluded.image_approved,nationalities_json=excluded.nationalities_json,occupations_json=excluded.occupations_json`).run(e.id,e.kind,e.name,e.description ?? null,e.work ?? null,e.source,e.updatedAt,e.image?.url ?? null,e.image?.license ?? null,e.image?.credit ?? null,e.image?.source ?? null,Number(!!e.image),JSON.stringify(e.nationalities ?? []),JSON.stringify(e.occupations ?? []));
  }
  for (const r of data.relations ?? []) {
    if (!r.reviewedBy || !r.evidence || !['verified','pending','rejected'].includes(r.status) || !(r.confidence >= 0 && r.confidence <= 1)) throw Error('Relation needs review status, evidence, confidence and reviewer');
    db.prepare('INSERT INTO name_entities(name_id,entity_id,country,confidence,status,priority,evidence_json,reviewed_by,reviewed_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(name_id,entity_id) DO UPDATE SET status=excluded.status,confidence=excluded.confidence,priority=excluded.priority,evidence_json=excluded.evidence_json,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at').run(nameId(r),r.entityId,r.country,r.confidence,r.status,r.priority ?? 0,JSON.stringify(r.evidence),r.reviewedBy,new Date().toISOString());
  }
});
db.close();
console.log('Imported reviewed editorial data.');
