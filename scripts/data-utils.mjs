import { isNativeName } from "../src/lib/native-name-policy.mjs";
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

export function readReferenceDatasets(root = "src/reference-data") {
  const index = JSON.parse(readFileSync(join(root, "index.json"), "utf8"));
  return index.files.map((file) => ({
    path: file.path,
    dataset: JSON.parse(readFileSync(file.path, "utf8")),
  }));
}

export function* iterateReferenceDatasets(root = "src/reference-data") {
  const index = JSON.parse(readFileSync(join(root, "index.json"), "utf8"));
  for (const file of index.files) yield { path: file.path, dataset: JSON.parse(readFileSync(file.path, "utf8")) };
}

const latinName = /^[\p{Script=Latin}\p{M} .'-]+$/u;
const koreanName = /^[\p{Script=Hangul} .'-]+$/u;
const japaneseName = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{M}ー々ヶヵ .・'-]+$/u;

export function hasExpectedScript(country, name) {
  if (country === "CN" && /^[\p{Script=Han}·]+$/u.test(name) && /\p{Script=Han}/u.test(name)) return true;
  if (country === "KR") return koreanName.test(name);
  if (country === "JP") return japaneseName.test(name);
  return isNativeName(country, name) || latinName.test(name);
}
