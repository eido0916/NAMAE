export function detailKey(name) {
  return name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('und');
}
export function detailBucket(name) {
  let hash = 2166136261;
  for (const c of detailKey(name)) hash = Math.imul(hash ^ c.codePointAt(0), 16777619);
  return ((hash >>> 0) % 64).toString().padStart(2, '0');
}
