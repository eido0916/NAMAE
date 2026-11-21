import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDetails, root } from './name-details/db.mjs';

const db = openDetails(process.env.NAMAE_DETAILS_DB);
const rows = db.prepare(`SELECT n.country,n.name,n.type,n.language,n.reading_ja,n.reading_status,
 e.id,e.kind,e.name AS entity_name,e.description,e.source_url,r.status,r.confidence,r.evidence_json,r.reviewed_by
 FROM name_entities r JOIN names n ON n.id=r.name_id JOIN entities e ON e.id=r.entity_id
 ORDER BY n.country,n.type,n.name,r.priority DESC,e.sitelinks DESC`).all();
mkdirSync(resolve(root,'reports'), { recursive:true });
writeFileSync(resolve(root,'reports/name-details-review.json'),JSON.stringify(rows.map((r) => ({...r,evidence:JSON.parse(r.evidence_json),evidence_json:undefined})),null,2)+'\n');
const failed = db.prepare("SELECT n.country,n.name,n.type,j.state,j.error,j.evidence_json FROM collection_jobs j JOIN names n ON n.id=j.name_id WHERE j.state<>'complete' ORDER BY n.country,n.type,n.id").all();
writeFileSync(resolve(root,'reports/name-details-unresolved.json'),JSON.stringify(failed,null,2)+'\n');
console.log(`Review: ${rows.length} relations; ${failed.length} incomplete/unresolved names.`);
db.close();
