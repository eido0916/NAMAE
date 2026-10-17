import index from '../data/native-name-index.json';
import { isNativeName, resolveNativeName } from './native-name-policy.mjs';
import type { NameRecord, ReferenceNameRecord, DatasetMeta } from './types';
export { isNativeName };
export function canonicalizeNativeName<T extends NameRecord | ReferenceNameRecord>(record: T): T {
  const native = resolveNativeName(record, index);
  if (!native || native === record.name) return record;
  return { ...record, name: native, aliases: [...new Set([record.name, ...(record.aliases ?? [])])].filter(alias => alias !== native) };
}
export function hasRankEvidence(record: NameRecord, meta: DatasetMeta) {
  // Appending dictionary names after the last ordinal does not establish rank.
  if (meta.isOfficial || meta.country === 'JP') return true;
  if (meta.source.includes('Popular Names by Country')) return false;
  if (meta.source.includes('Onomaverse')) return typeof record.count === 'number' && record.count > 0;
  return true;
}
