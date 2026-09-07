import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const publicRoot = join(root, "public");
const manifest = JSON.parse(
  readFileSync(join(publicRoot, "data", "manifest.json"), "utf8"),
);
if (manifest.schemaVersion !== 2 || !manifest.dataVersion)
  throw new Error("Unsupported or missing public data manifest version");
const entries = [manifest.dictionary, ...manifest.datasets];
for (const entry of entries) {
  const path = join(publicRoot, entry.path.replace(/^\//, ""));
  const content = readFileSync(path);
  const actual = createHash("sha256").update(content).digest("hex");
  if (actual !== entry.sha256)
    throw new Error(`Checksum mismatch: ${entry.path}`);
  if (content.byteLength !== entry.bytes)
    throw new Error(`Byte size mismatch: ${entry.path}`);
}
console.log(
  `Verified public data ${manifest.dataVersion}: ${entries.length} files.`,
);
