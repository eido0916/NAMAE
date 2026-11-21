import { canonicalizeNativeName, isNativeName, hasRankEvidence } from "./native-names";
import countries from "@/data/countries.json";
import { normalizeInputName } from "./reference-lookup.mjs";
import { findChineseSurnameCandidates } from "./chinese-surnames.mjs";
import type {
  CountryConfig,
  Dataset,
  Diagnosis,
  DiagnosisInput,
  MatchingMode,
  NameRecord,
  NameType,
  RankingBasis,
  RankingScope,
  ReferenceDataset,
  ReferenceNameRecord,
} from "./types";
type DictionaryEntry = {
  gender: string;
  reading: string;
  aliases: string[];
};

let datasets: Dataset[] = [];
const appDatasets = new Map<string, Dataset>();
const observedDatasets = new Map<string, Dataset>();
let dictionary: DictionaryEntry[] = [];
const references = new Map<string, ReferenceDataset>();
const supplementalNames = new Map<string, ReferenceNameRecord[]>();
function referenceRecords(country: string, type: NameType) {
  return [...(references.get(country + '/' + type)?.records ?? []), ...(supplementalNames.get(country + '/' + type) ?? [])];
}
const rankAlternatives = new Map<string, Dataset>();
export function clearRankAlternatives(country: string, type: NameType) {
  rankAlternatives.delete(`${country}/${type}`);
}
export function clearReferenceDataset(country: string, type: NameType) {
  references.delete(`${country}/${type}`);
}
const unavailableDatasets = new Map<string, string>();
export function setDatasetUnavailable(country: string, type: NameType, reason?: string) {
  const key = `${country}/${type}`;
  if (reason) unavailableDatasets.set(key, reason);
  else unavailableDatasets.delete(key);
}
export const normalizeName = normalizeInputName;
const readingIndex = new Map<string, Set<string>>();

function rebuildReadingIndex() {
  readingIndex.clear();
  for (const entry of dictionary)
    for (const alias of [entry.reading, ...entry.aliases]) {
      const key = `${entry.gender}|${normalizeName(alias)}`;
      if (!readingIndex.has(key)) readingIndex.set(key, new Set());
      readingIndex.get(key)!.add(entry.reading);
    }
}

export function configureEngine(data: {
  datasets?: Dataset[];
  observedDatasets?: Dataset[];
  appDatasets?: Dataset[];
  dictionary?: DictionaryEntry[];
  references?: ReferenceDataset[];
  rankAlternatives?: Dataset[];
}) {
  for (const dataset of data.appDatasets ?? []) appDatasets.set(dataset.meta.country + '/' + dataset.meta.type, dataset);
  for (const dataset of data.observedDatasets ?? [])
    observedDatasets.set(dataset.meta.country + '/' + dataset.meta.type, dataset);
  for (const dataset of data.rankAlternatives ?? [])
    rankAlternatives.set(`${dataset.meta.country}/${dataset.meta.type}`, dataset);
  for (const dataset of data.references ?? [])
    references.set(`${dataset.meta.country}/${dataset.meta.type}`, { ...dataset, records: dataset.records.map(canonicalizeNativeName) });
  if (data.dictionary) {
    dictionary = data.dictionary;
    rebuildReadingIndex();
  }
  if (data.datasets) {
    const byKey = new Map(
      datasets.map((dataset) => [
        `${dataset.meta.country}/${dataset.meta.type}`,
        dataset,
      ]),
    );
    for (const dataset of data.datasets) {
      const records = dataset.records.map(canonicalizeNativeName);
      const key = dataset.meta.country + '/' + dataset.meta.type;
      supplementalNames.set(key, records.filter(record => !hasRankEvidence(record, dataset.meta)).map(record => {
        const { rank: _rank, totalEntries: _total, ...reference } = record;
        void _rank; void _total;
        return reference;
      }));
      byKey.set(key, { ...dataset, records });
    }
    datasets = [...byKey.values()];
  }
}
export function hasJapaneseReferenceName(input: DiagnosisInput) {
  if (input.sourceCountry && input.sourceCountry !== "JP") return false;
  return hasReferenceName(input);
}
export function hasReferenceName(input: DiagnosisInput) {
  if (input.rankingScope === 'public_people' || input.rankingScope === 'app') return false;
  const country = input.sourceCountry ?? "JP";
  const names = new Set([normalizeName(input.name), ...(country === "JP" && input.reading ? [normalizeName(input.reading)] : [])]);
  return referenceRecords(country, input.type).some((record) =>
    (input.type === "surname" || record.gender === input.gender) &&
    [record.name, ...(record.aliases ?? [])].some((alias) => names.has(normalizeName(alias))),
  );
}
export function getReadingOptions(
  name: string,
  gender: string = "male",
): string[] {
  return [
    ...(readingIndex.get(`${gender}|${normalizeName(name)}`) ?? []),
    ...(readingIndex.get(`unknown|${normalizeName(name)}`) ?? []),
  ].filter((reading, index, all) => all.indexOf(reading) === index).sort();
}
export function getCountryConfig(code?: string): CountryConfig[] {
  return countries.filter((c) => c.enabled && (!code || c.code === code));
}
export const sourceCountryCodes = getCountryConfig().map((country) => country.code);
export function getDefaultDestinations(sourceCountry = "JP") {
  return ["JP", "US", "GB", "FR", "KR", "DE"].filter((code) => code !== sourceCountry).slice(0, 5);
}
export function getInputExamples(country: string, type: NameType, gender: "male" | "female", rankingScope?: RankingScope) {
  const input = { name: "", type, gender, sourceCountry: country, rankingScope };
  const ranked = getCohort(input, country).slice(0, 3).map((record) => record.name);
  if (ranked.length || rankingScope === 'public_people') return ranked;
  return referenceRecords(country, type)
    .filter((record) => isNativeName(country, record.name) && (type === "surname" || record.gender === gender))
    .slice(0, 3).map((record) => record.name) ?? [];
}
export function getDataset(country: string, type: NameType, rankingScope?: RankingScope): Dataset {
  if (rankingScope === 'app') {
    const dataset = appDatasets.get(country + '/' + type);
    if (!dataset) throw Error('対応データがありません');
    return dataset;
  }
  if (rankingScope === 'public_people') {
    const dataset = observedDatasets.get(country + '/' + type);
    if (!dataset) throw Error('公開人物の順位データがありません');
    return dataset;
  }
  const d = (datasets as Dataset[]).find(
    (d) => d.meta.country === country && d.meta.type === type,
  );
  if (!d) throw Error("対応データがありません");
  return d;
}
export function getDatasetMetadata(
  country: string,
  type: NameType,
  year?: number,
  rankingScope?: RankingScope,
) {
  const d = getDataset(country, type, rankingScope);
  if (rankingScope === 'public_people' || rankingScope === 'app') return d.meta;
  if (country === 'CN' && type === 'given_name' && (year === 2020 || year === 2021)) {
    return { ...d.meta, dataYear: year,
      source: '公安部《全国姓名报告》' + year + '年新生儿名字',
      sourceUrl: year === 2020 ? 'https://www.xinhuanet.com/politics/2021-02/08/c_1127079509.htm' : d.meta.sourceUrl,
      coverageLabel: year + ' 新生儿 / newborns · 男女別 Top 10' };
  }
  return { ...d.meta, dataYear: year ?? d.meta.dataYear };
}
export function getCohort(
  input: DiagnosisInput,
  country: string,
  rankingBasis?: RankingBasis,
): NameRecord[] {
  if (input.rankingScope === 'app') return getDataset(country, input.type, 'app').records.filter(record => input.type === 'surname' || record.gender === input.gender);
  const inferredRankingBasis =
    rankingBasis ??
    (country === "JP" && input.type === "given_name" && input.rankingScope !== "public_people"
      ? "overall"
      : undefined);
  const dataset = getDataset(country, input.type, input.rankingScope);
  const records = dataset.records.filter(
    (record) =>
      isNativeName(country, record.name) && hasRankEvidence(record, dataset.meta) &&
      (input.type === "surname" || record.gender === input.gender) &&
      (!inferredRankingBasis ||
        record.rankingBasis === inferredRankingBasis),
  );
  if (input.type === "surname" || inferredRankingBasis === "overall")
    return records;
  const years = [
    ...new Set(
      records.map((r) => r.year).filter((y): y is number => y !== undefined),
    ),
  ];
  const year = years.sort(
    (a, b) =>
      Math.abs(a - (input.year ?? a)) - Math.abs(b - (input.year ?? b)) ||
      b - a,
  )[0];
  return records.filter((r) => r.year === year);
}

function findJapaneseGivenNameRecord(
  input: DiagnosisInput,
): NameRecord | undefined {
  const normalizedName = normalizeName(input.name);
  const options = getReadingOptions(input.name, input.gender);
  const reading = input.reading
    ? normalizeName(input.reading)
    : options.length === 1
      ? options[0]
      : normalizedName;
  return getDataset("JP", "given_name").records.find(
    (record) =>
      (record.gender === input.gender || record.gender === "unknown") &&
      record.rankingBasis === "overall" &&
      [record.name, ...(record.aliases ?? [])].some((alias) => normalizeName(alias) === reading),
  );
}

export function getNameRecord(
  input: DiagnosisInput,
  country = input.sourceCountry ?? "JP",
): NameRecord | undefined {
  if (input.rankingScope === 'app') {
    const cohort = getCohort(input, country);
    const normalized = normalizeName(input.name);
    const exact = cohort.find(row => normalizeName(row.name) === normalized);
    if (exact) return exact;
    const keys = new Set([normalized, ...(country === 'JP' && input.reading ? [normalizeName(input.reading)] : [])]);
    const matches = country === 'CN' && input.type === 'surname' ? findChineseSurnameCandidates(input.name, cohort) : cohort.filter(row => [row.name, ...(row.aliases ?? [])].some(alias => keys.has(normalizeName(alias))));
    if (matches.length === 1) return matches[0];
    return undefined;
  }
  if (input.rankingScope !== 'public_people' && country === "JP" && input.type === "given_name")
    return findJapaneseGivenNameRecord(input);
  if (input.rankingScope !== 'public_people' && country === "CN" && input.type === "surname") {
    const candidates = getChineseSurnameCandidates(input.name);
    return candidates.length === 1 ? candidates[0] : undefined;
  }

  const normalized = normalizeName(input.name);
  const matchesReading = (r: NameRecord) =>
    [r.name, ...(r.aliases ?? [])].some(
      (alias) => normalizeName(alias) === normalized,
    );
  let cohort = getCohort(input, country);
  // Search older published tables only when no year was requested.
  if (input.year === undefined && input.type === 'given_name' && !cohort.some(matchesReading)) {
    const dataset = getDataset(country, input.type, input.rankingScope);
    cohort = dataset.records.filter(record =>
      isNativeName(country, record.name) && hasRankEvidence(record, dataset.meta) &&
      record.gender === input.gender && matchesReading(record))
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  }
  if (country === "JP" && input.rankingScope !== 'public_people') return cohort.find(matchesReading);
  const exact = cohort.filter(record => normalizeName(record.name) === normalized);
  if (!exact.length && input.year === undefined) {
    const candidates = getDataset(country, input.type, input.rankingScope).records.filter(record =>
      isNativeName(country, record.name) && (input.type === 'surname' || record.gender === input.gender) && matchesReading(record));
    if (new Set(candidates.map(record => record.name)).size > 1) return undefined;
  }
  const matches = exact.length ? exact : cohort.filter(matchesReading);
  return new Set(matches.map(record => record.name)).size === 1 ? matches[0] : undefined;
}
export function getChineseSurnameCandidates(name: string): NameRecord[] {
  return findChineseSurnameCandidates(name, getDataset("CN", "surname").records);
}
export function getInputNameCandidates(input: DiagnosisInput): (NameRecord | ReferenceNameRecord)[] {
  const country = input.sourceCountry ?? 'JP';
  if (input.rankingScope === 'app') {
    const records = appDatasets.get(country + '/' + input.type)?.records ?? [];
    if (country === 'CN' && input.type === 'surname') return findChineseSurnameCandidates(input.name, records);
    const normalized = normalizeName(input.name);
    const matching = records.filter(row => (input.type === 'surname' || row.gender === input.gender) && [row.name, ...(row.aliases ?? [])].some(alias => normalizeName(alias) === normalized));
    const exact = matching.filter(row => normalizeName(row.name) === normalized);
    return exact.length ? exact : matching;
  }
  if (country === 'JP' && input.rankingScope !== 'public_people') return [];
  if (country === 'CN' && input.type === 'surname' && input.rankingScope !== 'public_people') return getChineseSurnameCandidates(input.name);
  const normalized = normalizeName(input.name);
  if (!normalized) return [];
  const ranked = input.rankingScope === 'public_people' ? observedDatasets.get(country + '/' + input.type)?.records ?? [] : datasets.find(d => d.meta.country === country && d.meta.type === input.type)?.records ?? [];
  const matching = [...ranked, ...(input.rankingScope === 'public_people' ? [] : referenceRecords(country, input.type))].filter(record =>
    isNativeName(country, record.name) && (input.type === 'surname' || record.gender === input.gender) &&
    [record.name, ...(record.aliases ?? [])].some(alias => normalizeName(alias) === normalized));
  const exact = matching.filter(record => normalizeName(record.name) === normalized);
  return [...new Map((exact.length ? exact : matching).map(record => [record.name, record])).values()];
}
export const getSurnameRecord = (name: string, country = "JP", rankingScope?: RankingScope) =>
  getNameRecord({ name, type: "surname", rankingScope }, country);
export function calculateRankPercentile(rank: number, totalEntries: number) {
  if (
    !Number.isFinite(rank) ||
    !Number.isFinite(totalEntries) ||
    rank < 1 ||
    totalEntries < rank
  )
    throw Error("ランキングの範囲が不正です");
  return rank / totalEntries;
}
export const calculateRarityScore = (record?: NameRecord) =>
  record
    ? Math.round(
        calculateRankPercentile(record.rank, record.totalEntries) * 100,
      )
    : 97;
export function hash(value: string) {
  let h = 2166136261;
  for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function findClosestEquivalentName(
  input: DiagnosisInput,
  country: string,
  source?: NameRecord,
  mode: MatchingMode = "exactRank",
): NameRecord {
  const records = getCohort(input, country);
  if (!records.length) throw Error("該当するデータがありません");
  if (!source) {
    const tail = [...records]
      .sort((a, b) => a.rank - b.rank)
      .slice(-Math.max(1, Math.ceil(records.length * 0.2)));
    return tail[
      hash(
        `${normalizeName(input.reading ?? input.name)}|${input.year ?? ""}|${input.gender ?? ""}|${country}`,
      ) % tail.length
    ];
  }
  const distance = (r: NameRecord) => {
    if (mode === "populationShare") {
      if (source.share === undefined || r.share === undefined)
        throw Error("人数割合のデータが不足しています");
      return Math.abs(source.share - r.share);
    }
    return mode === "exactRank"
      ? Math.abs(source.rank - r.rank)
      : Math.abs(
          calculateRankPercentile(source.rank, source.totalEntries) -
            calculateRankPercentile(r.rank, r.totalEntries),
        );
  };
  return records.reduce((best, r) =>
    distance(r) < distance(best) ||
    (distance(r) === distance(best) && r.rank < best.rank)
      ? r
      : best,
  );
}
export const findClosestEquivalentSurname = (
  name: string,
  country: string,
  source?: NameRecord,
  mode?: MatchingMode,
) =>
  findClosestEquivalentName({ name, type: "surname" }, country, source, mode);
export function validateInput(input: DiagnosisInput): string | undefined {
  if (input.rankingScope && !["published", "public_people", "app"].includes(input.rankingScope)) return "ランキングの集計を選んでください。";
  if (!sourceCountryCodes.includes(input.sourceCountry ?? "JP"))
    return "入力する名前の国・地域を選んでください。";
  if (!["given_name", "surname"].includes(input.type))
    return "診断の種類を選んでください。";
  if (!input.name.trim()) return "名前を入力してください。";
  if (!input.rankingScope && input.sourceCountry === "CN" && input.type === "surname" && getChineseSurnameCandidates(input.name).length > 1)
    return "同じローマ字の姓が複数あります。漢字表記を選んでください。";
  if (getInputNameCandidates(input).length > 1) return '同じ表記に複数の名前が対応します。現地表記を選んでください。';
  if (
    input.destinationCountries &&
    (input.destinationCountries.length < 1 || input.destinationCountries.length > 8)
  )
    return "診断する国は1〜8か国で選んでください。";
  if (
    Array.from(input.name.trim()).length > 30 ||
    !/^[\p{L}\p{M}ー・ '’-]+$/u.test(input.name.trim())
  )
    return "名前は30文字以内の文字で入力してください。数字・記号は使えません。";
  if (
    input.type === "given_name" &&
    !["male", "female"].includes(input.gender ?? "")
  )
    return "性別を選んでください。";
  if (input.type === "given_name") {
    const otherGender = input.gender === "male" ? "female" : "male";
    if (!getNameRecord(input) && !hasReferenceName(input) && getNameRecord({ ...input, gender: otherGender }))
      return `この名前は${otherGender === "male" ? "男性" : "女性"}のデータに収録されています。${(input.sourceCountry ?? "JP") === "JP" ? "ランキングの性別を変更するか、読み方を入力してください。" : "ランキングの性別を変更してください。"}`;
    if (input.rankingScope === "public_people" || (input.sourceCountry && input.sourceCountry !== "JP")) return;
    const readings = getReadingOptions(input.name, input.gender);
    if (
      readings.length > 1 &&
      !input.reading &&
      !/^[ぁ-ゖー]+$/.test(normalizeName(input.name))
    )
      return "名前の読み方を選んでください。";
    if (
      input.reading &&
      (!/^[ぁ-ゖー]+$/.test(normalizeName(input.reading)) ||
        input.reading.length > 30)
    )
      return "読み方は30文字以内のひらがな・カタカナで入力してください。";
  }
}
export function diagnose(input: DiagnosisInput): Diagnosis {
  const error = validateInput(input);
  if (error) throw Error(error);
  const sourceCountry = input.sourceCountry ?? "JP";
  const clean: DiagnosisInput =
    input.type === "surname"
      ? {
          name: input.name.trim(),
          type: input.type,
          ...(input.rankingScope ? { rankingScope: input.rankingScope } : {}),
          ...(input.sourceCountry ? { sourceCountry } : {}),
          ...(input.destinationCountries
            ? { destinationCountries: input.destinationCountries }
            : {}),
        }
      : { ...input, name: input.name.trim() };
  const record = getNameRecord(clean);
  if (record && sourceCountry !== "JP") clean.name = record.name;
  else if (input.rankingScope !== "public_people" && input.rankingScope !== "app") {
    const names = referenceRecords(sourceCountry, clean.type).filter(r =>
      isNativeName(sourceCountry, r.name) && (clean.type === 'surname' || r.gender === clean.gender) &&
      [r.name, ...(r.aliases ?? [])].some(alias => normalizeName(alias) === normalizeName(clean.name)));
    if (new Set(names.map(r => r.name)).size === 1) clean.name = names[0].name;
  }
  const sourceYear = record?.year ?? getCohort(clean, sourceCountry)[0]?.year;
  const recognition = record
    ? clean.type === "given_name" &&
      record.rankingBasis !== "overall" &&
      clean.year !== undefined && record.year !== clean.year
      ? "historical"
      : "ranked"
    : hasReferenceName(clean) || (input.rankingScope !== "public_people" && sourceCountry === "JP" && clean.type === "given_name" &&
        getReadingOptions(clean.name, clean.gender).length > 0)
      ? "dictionary"
      : "unrecognized";
  const matches: Diagnosis["matches"] = [];
  const unavailableCountries: NonNullable<Diagnosis["unavailableCountries"]> = [];
  for (const country of getCountryConfig().filter((c) =>
    c.code !== sourceCountry &&
    (clean.destinationCountries?.includes(c.code) ?? getDefaultDestinations(sourceCountry).includes(c.code)),
  )) {
    if (!record) {
      unavailableCountries.push({ country, reason: "入力した名前の順位データがありません。" });
      continue;
    }
    const reason = unavailableDatasets.get(`${country.code}/${input.type}`);
    if (reason) {
      unavailableCountries.push({ country, reason });
      continue;
    }
    try {
      const exact = getCohort(clean, country.code).find(row => row.rank === record.rank);
      if (!exact && input.rankingScope !== "public_people" && input.rankingScope !== "app") {
        const alternative = rankAlternatives.get(`${country.code}/${input.type}`);
        const alternateMatch = alternative?.records.find((r) => r.rank === record.rank &&
          (clean.type === "surname" || r.gender === clean.gender));
        if (alternateMatch && alternative) {
          matches.push({ country, record: alternateMatch, meta: { ...alternative.meta, dataYear: alternateMatch.dataYear ?? alternateMatch.year ?? alternative.meta.dataYear } });
          continue;
        }
      }
      const match = exact ?? findClosestEquivalentName(clean, country.code, record, "normalizedRank");
      matches.push({
        country,
        record: match,
        meta: getDatasetMetadata(country.code, input.type, match.year, input.rankingScope),
        ...(!exact && { equivalentRank: record.rank }),
      });
    } catch {
      unavailableCountries.push({ country, reason: "この診断条件の名前データは未収録です。" });
    }
  }
  return {
    input: clean,
    record,
    score: calculateRarityScore(record),
    recognition,
    meta: !record && hasReferenceName(clean)
      ? references.get(`${sourceCountry}/${input.type}`)?.meta ?? getDatasetMetadata(sourceCountry, input.type, undefined, input.rankingScope)
      : getDatasetMetadata(sourceCountry, input.type, sourceYear, input.rankingScope),
    matches,
    unavailableCountries,
  };
}
