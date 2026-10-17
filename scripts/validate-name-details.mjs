import { openDetails, transaction } from './name-details/db.mjs';
import { evaluateName,primaryGivenName } from './name-details/wikidata.mjs';

// Recheck cached name identity evidence without another network request.
// A restored, previously validated snapshot may not contain response cache entries.
const db = openDetails(process.env.NAMAE_DETAILS_DB);
let checked = 0, withdrawn = 0;
transaction(db, () => {
  for (const row of db.prepare('SELECT r.*,n.name,n.type FROM name_entities r JOIN names n ON n.id=r.name_id WHERE r.reviewed_by IS NULL').all()) {
    const proof = JSON.parse(row.evidence_json);
    const cached = db.prepare('SELECT body FROM response_cache WHERE key=?').get(`entity:${proof.nameItem}`);
    if (!cached) {
      if (row.status === 'verified' && proof.matchType !== 'label') {
        db.prepare("UPDATE name_entities SET status='pending' WHERE name_id=? AND entity_id=?").run(row.name_id,row.entity_id);
        withdrawn++;
      }
      continue;
    }
    const result = evaluateName(row.name,JSON.parse(cached.body),proof.languages ?? [],proof.ambiguousNameItems?.length ?? 0);
    const propertyMatches = proof.property === (row.type === 'surname' ? 'P734' : 'P735');
    const status = row.status === 'verified' && (result.status !== 'verified' || !propertyMatches) ? 'pending' : row.status;
    if (row.status === 'verified' && status === 'pending') withdrawn++;
    proof.matchType = result.matchType;
    let priority=row.priority;
    const person=db.prepare('SELECT body FROM response_cache WHERE key=?').get(`entity:${row.entity_id}`);
    if(person && row.type==='given_name') {
      proof.primaryGivenName=primaryGivenName(row.name,JSON.parse(person.body),proof.languages ?? []);
      priority=(proof.localNationality?100000:0)+(proof.primaryGivenName?10000:0)+Math.min(proof.wikipediaLanguages ?? 0,999);
    }
    db.prepare('UPDATE name_entities SET status=?,confidence=?,priority=?,evidence_json=? WHERE name_id=? AND entity_id=?').run(status,result.confidence,priority,JSON.stringify(proof),row.name_id,row.entity_id);
    checked++;
  }
});
db.close();
console.log(`Validated ${checked} cached name relationships; withdrew ${withdrawn} uncertain relationships.`);
