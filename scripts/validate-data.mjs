import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { hasExpectedScript, readDatasets } from "./data-utils.mjs";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = join(root, "src", "data");
const reportsRoot = join(root, "reports");
const baselinePath = join(root, "data", "quality-baseline.json");
const accept = process.argv.includes("--accept");
const errors = [];
const warnings = [];
const seenDatasets = new Set();
const provenance = JSON.parse(
  readFileSync(join(root, "data-sources", "SOURCES.json"), "utf8"),
);
const covered = new Set(
  provenance.sources.flatMap((source) => source.datasets),
);
const stats = [];

for (const { path, dataset } of readDatasets(sourceRoot)) {
  const { meta, records } = dataset;
  const key = `${meta?.country}/${meta?.type}`;
  if (seenDatasets.has(key)) errors.push(`${key}: データセットが重複しています`);
  seenDatasets.add(key);
  if (!covered.has(key)) errors.push(`${key}: SOURCES.jsonに出典がありません`);
  if (!meta?.source || !meta?.sourceUrl)
    errors.push(`${key}: source/sourceUrlがありません`);
  if (!Array.isArray(records) || records.length === 0) {
    errors.push(`${key}: レコードが空です`);
    continue;
  }
  const duplicateNames = new Set();
  const names = new Set();
  let estimated = 0;
  let minRank = Infinity;
  let maxRank = 0;
  for (const [index, record] of records.entries()) {
    const label = `${key}[${index}]`;
    if (record.country !== meta.country || record.type !== meta.type)
      errors.push(`${label}: country/typeがメタデータと一致しません`);
    if (!record.name?.trim()) errors.push(`${label}: nameが空です`);
    else if (!hasExpectedScript(meta.country, record.name))
      errors.push(`${label}: 想定外の文字体系です (${record.name})`);
    if (!Number.isInteger(record.rank) || record.rank < 1)
      errors.push(`${label}: rankが正の整数ではありません`);
    if (!Number.isInteger(record.totalEntries) || record.totalEntries < record.rank)
      errors.push(`${label}: totalEntriesがrank未満です`);
    if (meta.type === "given_name" && !["male", "female"].includes(record.gender))
      errors.push(`${label}: 下の名前にgenderがありません`);
    const nameKey = `${record.gender ?? ""}|${record.year ?? ""}|${record.rankingBasis ?? ""}|${record.name.normalize("NFKC").toLocaleLowerCase()}`;
    if (names.has(nameKey)) duplicateNames.add(nameKey);
    names.add(nameKey);
    if (record.isEstimated) estimated += 1;
    minRank = Math.min(minRank, record.rank);
    maxRank = Math.max(maxRank, record.rank);
  }
  if (duplicateNames.size)
    errors.push(`${key}: 同一集計内の名前が${duplicateNames.size}件重複しています`);
  stats.push({
    key,
    file: relative(root, path).replaceAll("\\", "/"),
    records: records.length,
    estimated,
    minRank,
    maxRank,
    sha256: createHash("sha256").update(JSON.stringify(dataset)).digest("hex"),
  });
}

for (const source of provenance.sources)
  if (source.redistributionStatus === "review_required")
    warnings.push(`${source.name}: 公開前に再配布条件の確認が必要です`);

const baseline = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, "utf8"))
  : { datasets: [] };
const oldByKey = new Map(baseline.datasets.map((item) => [item.key, item]));
const changes = stats.map((item) => ({
  key: item.key,
  before: oldByKey.get(item.key)?.records ?? null,
  after: item.records,
  delta: item.records - (oldByKey.get(item.key)?.records ?? item.records),
}));
for (const change of changes) {
  if (change.before && change.after < change.before * 0.9)
    errors.push(`${change.key}: 件数が10%以上減少しています (${change.before} → ${change.after})`);
}

const snapshot = {
  schemaVersion: 1,
  datasets: stats.sort((a, b) => a.key.localeCompare(b.key)),
};
const report = {
  provenanceReviewedAt: provenance.reviewedAt,
  ok: errors.length === 0,
  errors,
  warnings,
  changes,
  ...snapshot,
};
mkdirSync(reportsRoot, { recursive: true });
writeFileSync(join(reportsRoot, "data-quality.json"), JSON.stringify(report, null, 2) + "\n");
writeFileSync(
  join(reportsRoot, "data-quality.md"),
  `# データ品質レポート\n\n- 結果: ${report.ok ? "OK" : "NG"}\n- データセット: ${stats.length}\n- 順位レコード: ${stats.reduce((sum, item) => sum + item.records, 0).toLocaleString("ja-JP")}\n- 要確認の出典: ${warnings.length}\n\n## 件数差分\n\n| データ | 前回 | 今回 | 差分 |\n|---|---:|---:|---:|\n${changes.map((item) => `| ${item.key} | ${item.before ?? "—"} | ${item.after} | ${item.delta >= 0 ? "+" : ""}${item.delta} |`).join("\n")}\n\n## 警告\n\n${warnings.map((item) => `- ${item}`).join("\n") || "なし"}\n\n## エラー\n\n${errors.map((item) => `- ${item}`).join("\n") || "なし"}\n`,
);
if (accept) {
  mkdirSync(join(root, "data"), { recursive: true });
  writeFileSync(baselinePath, JSON.stringify(snapshot, null, 2) + "\n");
  console.log("Accepted the current data quality baseline.");
}
console.log(`Validated ${stats.length} datasets: ${errors.length} errors, ${warnings.length} warnings.`);
if (errors.length) process.exitCode = 1;
