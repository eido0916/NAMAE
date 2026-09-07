import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function collectDatasetFiles(sourceRoot) {
  const files = [];
  const walk = (dir) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, item.name);
      if (item.isDirectory()) walk(path);
      else if (item.name.endsWith(".json")) files.push(path);
    }
  };
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true }))
    if (entry.isDirectory() && entry.name !== "dictionary")
      walk(join(sourceRoot, entry.name));
  return files.sort();
}

export function readDatasets(sourceRoot) {
  return collectDatasetFiles(sourceRoot).map((path) => ({
    path,
    dataset: JSON.parse(readFileSync(path, "utf8")),
  }));
}

const latinName = /^[\p{Script=Latin}\p{M} .'-]+$/u;
const koreanName = /^[\p{Script=Hangul} .'-]+$/u;
const japaneseName = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{M}ー々ヶヵ .・'-]+$/u;

export function hasExpectedScript(country, name) {
  if (country === "KR") return koreanName.test(name);
  if (country === "JP") return japaneseName.test(name);
  return latinName.test(name);
}
