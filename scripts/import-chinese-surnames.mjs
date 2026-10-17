import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { writeDataFile } from "./write-data-file.mjs";

const path = "src/data/cn/surname/onomaverse.json";
const source = JSON.parse(readFileSync("data-sources/rankings/foreign/chinese-surnames/national-2020.json", "utf8"));
if (source.names.length !== 100 || new Set(source.names.map(([name]) => name)).size !== 100) throw new Error("Chinese national table must contain 100 distinct surnames");
const backup = "data-sources/rankings/foreign/chinese-surnames/legacy-mixed-ranking.json";
if (existsSync(path) && !existsSync(backup)) {
  const original = JSON.parse(readFileSync(path, "utf8"));
  if (!original.meta.isOfficial) writeDataFile(backup, JSON.stringify(original));
}
const dataset = {
  meta: {
    country: "CN", type: "surname", source: source.title, sourceUrl: source.sourceUrl, dataYear: source.year,
    isOfficial: true, isSample: false,
    coverageLabel: "2020年・全国户籍人口姓氏 Top 100",
    notes: "中国公安部の2020年全国姓名報告・表1の人口順上位100姓。香港・マカオ・台湾を除く全国の戸籍人口が対象。新生児順位とは別。漢字を識別子とし、拼音・繁体字は検索別名。上位100姓の外は順位不明として扱い、他資料の人数や辞書を混ぜて連番化しません。Rarity Scoreは収録100姓内の順位比であり人口割合ではありません。",
  },
  records: source.names.map(([name, pinyin, ...traditional], index) => ({
    country: "CN", type: "surname", name,
    aliases: [...new Set([pinyin, ...traditional, ...(pinyin.includes("ü") || pinyin.includes("ǚ") ? ["Lv", "Lyu"] : [])])],
    rank: index + 1, totalEntries: source.names.length, year: source.year, dataYear: source.year, isEstimated: false,
  })),
};
mkdirSync("src/data/cn/surname", { recursive: true });
writeDataFile(path, JSON.stringify(dataset));
const sourcesPath = "data-sources/SOURCES.json";
const provenance = JSON.parse(readFileSync(sourcesPath, "utf8"));
for (const old of provenance.sources.filter((entry) => ["onomaverse", "popular-names-by-country"].includes(entry.id))) {
  old.datasets = old.datasets.filter((key) => key !== "CN/surname");
}
if (!provenance.sources.some((entry) => entry.id === "cn-national-surnames-2020")) {
  provenance.sources.push({
    id: "cn-national-surnames-2020", name: source.title, url: source.sourceUrl, datasets: ["CN/surname"],
    licenseName: "公開統計の事実情報（姓と順位）のみ。本文・表画像は公開アプリに含めません。", licenseUrl: source.sourceUrl,
    redistributionStatus: "permitted", attribution: "出典：中国公安部户政管理研究中心《二〇二〇年全国姓名报告》表1（新華社掲載）。拼音・繁体字別名は検索補助。",
  });
}
writeDataFile(sourcesPath, JSON.stringify(provenance, null, 2) + "\n");

// This correction intentionally removes mixed-source synthetic ranks. Update only
// this dataset's baseline; unrelated local data changes still require review.
const baselinePath = "data/quality-baseline.json";
if (process.argv.includes("--accept-correction") && existsSync(baselinePath)) {
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const entry = baseline.datasets.find((entry) => entry.key === "CN/surname");
  if (entry) Object.assign(entry, { records: 100, estimated: 0, minRank: 1, maxRank: 100, sha256: createHash("sha256").update(JSON.stringify(dataset)).digest("hex") });
  writeDataFile(baselinePath, JSON.stringify(baseline, null, 2) + "\n");
}
console.log("CN/surname: 100 verified national ranks; 李 = #2; legacy mixed ranking archived.");
