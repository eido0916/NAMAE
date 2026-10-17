/** @param {string} name @returns {string} */
export function normalizeInputName(name) {
  return name.normalize("NFKC").trim().replace(/[\s・'’]/g, "").toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 96));
}

/** @param {string} name @param {string | undefined} gender @returns {string} */
export function referenceLookupKey(name, gender) {
  return `${gender ?? ""}|${normalizeInputName(name)}`;
}

// A fixed bucket count keeps static lookup requests small without a server DB.
/** @param {string} key @param {number} [count=256] @returns {string} */
export function referenceLookupBucket(key, count = 256) {
  if (!Number.isInteger(count) || count < 1 || count > 256 || (count & (count - 1)) !== 0) throw new Error("Invalid name lookup bucket count");
  let value = 2166136261;
  for (let i = 0; i < key.length; i++) value = Math.imul(value ^ key.charCodeAt(i), 16777619);
  return ((value >>> 0) % count).toString(16).padStart(2, "0");
}
