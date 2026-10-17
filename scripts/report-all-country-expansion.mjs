import { readFileSync, existsSync } from "node:fs";
import { writeDataFile } from "./write-data-file.mjs";

const before = JSON.parse(readFileSync("reports/all-country-expansion-before.json", "utf8"));
const after = JSON.parse(readFileSync("reports/global-expansion.json", "utf8"));
const original = new Map(before.audit.map((row) => [row.country, row]));
const collection = JSON.parse(readFileSync("reports/wikidata-country-names.json", "utf8"));
const collected = new Map(collection.countries.map((row) => [row.country, row]));
const failuresPath = "data-sources/rankings/foreign/wikidata-country-names/failures.json";
const failures = existsSync(failuresPath) ? JSON.parse(readFileSync(failuresPath, "utf8")) : [];
const audit = after.audit.map((row) => {
  const fields = {};
  for (const band of ["male", "female", "surname"]) {
    const previous = original.get(row.country)?.[band]?.totalNames ?? 0;
    const current = row[band].totalNames;
    fields[band] = { before: previous, after: current, added: current - previous, ranked: row[band].ranked, reference: row[band].referenceOnly, remainingReason: current <= previous ? "今回取得できた実在名は既収録名と重複、または性別・表記を確認できないため、この区分では追加できませんでした。" : null };
  }
  const requests = collected.get(row.country);
  if (!requests) throw new Error(`Country not audited: ${row.country}`);
  return { country: row.country, name: row.name, ...fields, sourceCandidates: requests, collectionFailures: failures.filter((failure) => failure.country === row.country), expanded: Object.values(fields).some((field) => field.added > 0), allBandsExpanded: Object.values(fields).every((field) => field.added > 0) };
});
const totals = Object.fromEntries(["male", "female", "surname"].map((band) => [band, audit.reduce((total, row) => total + row[band].added, 0)]));
const report = { checkedAt: new Date().toISOString(), checkedCountries: audit.length, expandedCountries: audit.filter((r) => r.expanded).length, allBandsExpandedCountries: audit.filter((r) => r.allBandsExpanded).length, added: totals, nameEntities: collection.nameEntities, audit };
writeDataFile("reports/all-country-expansion.json", JSON.stringify(report, null, 2) + "\n");
const number = (n) => n.toLocaleString("ja-JP");
const bands = ["male", "female", "surname"];
writeDataFile("reports/all-country-expansion.md", `# 今回の全搭載国の拡張\n\n全${audit.length}か国を対象に取得・照合。${report.expandedCountries}か国で候補が増え、${report.allBandsExpandedCountries}か国で男性名・女性名・名字の全区分が増えました。\n\n追加数：男性名 ${number(totals.male)}、女性名 ${number(totals.female)}、名字 ${number(totals.surname)}。\n\n統計の公開人数から作る順位付きデータと、国籍・出生地の明示記録で補う順位なし辞書を区別しています。公人の辞書は人口全体を代表しません。\n\n|国|男性名：変更前→変更後|女性名：変更前→変更後|名字：変更前→変更後|\n|---|---:|---:|---:|\n` + audit.map((row) => `|${row.name} (${row.country})|` + bands.map((band) => `${number(row[band].before)} → ${number(row[band].after)} (+${number(row[band].added)})`).join("|") + "|").join("\n") + "\n\n重複を除いた件数です。区分別の未追加理由と取得失敗はJSON版に記録しています。\n");
console.log(JSON.stringify({ checked: report.checkedCountries, expanded: report.expandedCountries, allBandsExpanded: report.allBandsExpandedCountries, added: totals }));
