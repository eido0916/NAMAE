import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { hasExpectedScript, readDatasets } from "./data-utils.mjs";

const cache = "data-sources/rankings/foreign/national-expanded";
mkdirSync(cache, { recursive: true });
async function cached(url, name) {
  const path = join(cache, name + ".gz");
  if (existsSync(path)) return gunzipSync(readFileSync(path)).toString("utf8");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { "user-agent": "NAMAE public statistics importer" } });
      if (!response.ok) throw new Error(`${response.status}: ${url}`);
      const text = await response.text();
      writeFileSync(path, gzipSync(text));
      return text;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}
function jsonp(text) {
  return JSON.parse(text.slice(text.indexOf("(") + 1, text.lastIndexOf(")")));
}
function save(country, values, meta) {
  const grouped = new Map();
  for (const value of values) {
    if (!["male", "female"].includes(value.gender) || !hasExpectedScript(country, value.name) || !Number.isSafeInteger(value.count) || value.count <= 0) continue;
    const key = `${value.gender}|${value.name.normalize("NFKC").toLowerCase()}`;
    const existing = grouped.get(key);
    if (existing) existing.count += value.count;
    else grouped.set(key, { name: value.name, gender: value.gender, count: value.count });
  }
  const records = [];
  for (const gender of ["male", "female"]) {
    const rows = [...grouped.values()].filter((row) => row.gender === gender).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    rows.forEach((row, index) => records.push({ ...row, country, type: "given_name", rank: index + 1, totalEntries: rows.length, year: meta.dataYear, dataYear: meta.dataYear, isEstimated: false }));
  }
  const target = readDatasets("src/data").find(({ dataset }) => dataset.meta.country === country && dataset.meta.type === "given_name");
  if (!target || records.length < target.dataset.records.length) throw new Error(`${country}: incomplete import; refusing to shrink coverage`);
  writeFileSync(target.path, JSON.stringify({ meta: { country, type: "given_name", isSample: false, ...meta }, records }));
  console.log(JSON.stringify({ country, before: target.dataset.records.length, after: records.length, male: records.filter((r) => r.gender === "male").length, female: records.filter((r) => r.gender === "female").length }));
}

if (!process.argv.includes("--korea-only")) {
  const base = "https://www.istat.it/wp-content/themes/EGPbs5-child/contanomi/nati/index2022.php";
  const availableYears = jsonp(await cached(base + "?type=years", "it-years"));
  const years = [];
  const values = [];
  for (const year of availableYears) {
    const text = await cached(`${base}?type=list&limit=100000&year=${year}`, `it-${year}`);
    if (/^\s*callback\(\s*\);?\s*$/.test(text)) {
      console.log(`Italy ${year}: full list not returned; excluded from cumulative cohort`);
      continue;
    }
    const result = jsonp(text);
    const rows = Object.values(result).filter(Array.isArray).flat().filter((r) => r && typeof r === "object");
    if (!rows.length) throw new Error(`Italy ${year}: empty data`);
    years.push(year);
    for (const row of rows) values.push({ name: row.name, count: Number(row.count), gender: row.gender === "m" ? "male" : row.gender === "f" ? "female" : undefined });
    console.log(`Italy ${year}: ${rows.length} rows`);
  }
  if (!years.length) throw new Error("Italy: no full yearly lists available");
  save("IT", values, { source: "Istat — Conta nomi", sourceUrl: "https://www.istat.it/dati/calcolatori/contanomi/", dataYear: Math.max(...years), isOfficial: true, coverageLabel: `${Math.min(...years)}–${Math.max(...years)}年・イタリア出生累計`, notes: "公開出生件数を全掲載年で合算し人数順に独自集計。同数は名前順。年次順位ではありません。誤記・複合名も原表の表記を保持し、想定文字体系に合わない表記は除外。Source: Istat, Iscritti in anagrafe per nascita. CC BY 4.0." });
  const path = "data-sources/SOURCES.json";
  const provenance = JSON.parse(readFileSync(path, "utf8"));
  provenance.sources = provenance.sources.filter((source) => source.id !== "istat-contanomi");
  provenance.sources.push({ id: "istat-contanomi", name: "Istat — Conta nomi", url: "https://www.istat.it/dati/calcolatori/contanomi/", datasets: ["IT/given_name"], licenseName: "CC BY 4.0", licenseUrl: "https://www.istat.it/note-legali/", redistributionStatus: "permitted", attribution: "Source: Istat, Iscritti in anagrafe per nascita / Conta nomi. Aggregated and adapted by NAMAE." });
  writeFileSync(path, JSON.stringify(provenance, null, 2) + "\n");
}

if (!process.argv.includes("--italy-only")) {
  const values = [];
  const seen = new Set();
  let page = 1;
  for (;;) {
    const html = await cached(`https://baby-name.kr/${encodeURIComponent("이름순위")}/${page}/`, `kr-all-${page}`);
    const tables = [...html.matchAll(/<div class="half-table">([\s\S]*?)<\/div>/gi)].map((match) => match[1]);
    if (tables.length !== 2) throw new Error(`Korea ${page}: changed page structure`);
    let additions = 0;
    for (const [index, gender] of ["male", "female"].entries()) {
      for (const row of tables[index].matchAll(/<tr[^>]*>[\s\S]*?<td[^>]*>\s*(\d+)[\s\S]*?<\/td>[\s\S]*?<td[^>]*>\s*<a[^>]*>([^<]+)<\/a>[\s\S]*?<td[^>]*>\s*([\d,]+)/gi)) {
        const name = row[2].trim();
        const key = `${gender}|${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        values.push({ name, gender, count: Number(row[3].replace(/,/g, "")) });
        additions++;
      }
    }
    if (!additions) throw new Error(`Korea ${page}: repeated or empty page; import incomplete`);
    if (page % 20 === 0) console.log(`Korea page ${page}: ${values.length} names`);
    const next = html.match(/href="([^\"]+)"[^>]*><span class="page\s*">Next<\/span>/i)?.[1];
    if (!next) break;
    const nextPage = Number(next.match(/\/(\d+)\/?$/)?.[1]);
    if (nextPage !== page + 1) throw new Error(`Korea ${page}: unexpected next page`);
    page = nextPage;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  save("KR", values, { source: "아기이름 — 전체 이름 순위", sourceUrl: "https://baby-name.kr/ranking/", dataYear: 2026, isOfficial: false, coverageLabel: "2026年取得・提供元の全期間出生届集計", notes: "公開されている全期間順位の全ページを取得。名前別掲載人数を男女別に並べた独自集計。同数は名前順。提供元は民間の集計サービスです。" });
}
