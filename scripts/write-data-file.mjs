import { writeFileSync, renameSync } from "node:fs";

// Replacing the directory entry also works when an editor on Windows has
// mapped the previous version of a JSON/report file into memory.
export function writeDataFile(path, contents) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, contents);
  renameSync(temporary, path);
}
