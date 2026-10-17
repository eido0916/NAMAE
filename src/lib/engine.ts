import countries from "@/data/countries.json";
import { normalizeInputName } from "./reference-lookup.mjs";
import type {
  CountryConfig,
  Dataset,
  Diagnosis,
  DiagnosisInput,
  MatchingMode,
  NameRecord,
  NameType,
  RankingBasis,
  ReferenceDataset,
} from "./types";
type DictionaryEntry = {
  gender: string;
  reading: string;
  aliases: string[];
};

let datasets: Dataset[] = [];
let dictionary: DictionaryEntry[] = [];
const references = new Map<string, ReferenceDataset>();
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
  dictionary?: DictionaryEntry[];
  references?: ReferenceDataset[];
  rankAlternatives?: Dataset[];
}) {
  for (const dataset of data.rankAlternatives ?? [])
    rankAlternatives.set(`${dataset.meta.country}/${dataset.meta.type}`, dataset);
  for (const dataset of data.references ?? [])
    references.set(`${dataset.meta.country}/${dataset.meta.type}`, dataset);
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
    for (const dataset of data.datasets)
      byKey.set(`${dataset.meta.country}/${dataset.meta.type}`, dataset);
    datasets = [...byKey.values()];
  }
}
export function hasJapaneseReferenceName(input: DiagnosisInput) {
  if (input.sourceCountry && input.sourceCountry !== "JP") return false;
  return hasReferenceName(input);
}
export function hasReferenceName(input: DiagnosisInput) {
  const country = input.sourceCountry ?? "JP";
  const names = new Set([normalizeName(input.name), ...(country === "JP" && input.reading ? [normalizeName(input.reading)] : [])]);
  return references.get(`${country}/${input.type}`)?.records.some((record) =>
    (input.type === "surname" || record.gender === input.gender) &&
    [record.name, ...(record.aliases ?? [])].some((alias) => names.has(normalizeName(alias))),
  ) ?? false;
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
export function getInputExamples(country: string, type: NameType, gender: "male" | "female") {
  const input = { name: "", type, gender, sourceCountry: country };
  const ranked = getCohort(input, country).slice(0, 3).map((record) => record.name);
  if (ranked.length) return ranked;
  return references.get(`${country}/${type}`)?.records
    .filter((record) => type === "surname" || record.gender === gender)
    .slice(0, 3).map((record) => record.name) ?? [];
}
export function getDataset(country: string, type: NameType): Dataset {
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
) {
  const d = getDataset(country, type);
  return { ...d.meta, dataYear: year ?? d.meta.dataYear };
}
export function getCohort(
  input: DiagnosisInput,
  country: string,
  rankingBasis?: RankingBasis,
): NameRecord[] {
  const inferredRankingBasis =
    rankingBasis ??
    (country === "JP" && input.type === "given_name"
      ? "overall"
      : undefined);
  const records = getDataset(country, input.type).records.filter(
    (record) =>
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
  if (country === "JP" && input.type === "given_name")
    return findJapaneseGivenNameRecord(input);

  const normalized = normalizeName(input.name);
  const matchesReading = (r: NameRecord) =>
    [r.name, ...(r.aliases ?? [])].some(
      (alias) => normalizeName(alias) === normalized,
    );
  const cohortRecord = getCohort(input, country).find(matchesReading);
  return cohortRecord;
}
export const getSurnameRecord = (name: string, country = "JP") =>
  getNameRecord({ name, type: "surname" }, country);
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
  if (!sourceCountryCodes.includes(input.sourceCountry ?? "JP"))
    return "入力する名前の国・地域を選んでください。";
  if (!["given_name", "surname"].includes(input.type))
    return "診断の種類を選んでください。";
  if (!input.name.trim()) return "名前を入力してください。";
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
    if (input.sourceCountry && input.sourceCountry !== "JP") return;
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
          ...(input.sourceCountry ? { sourceCountry } : {}),
          ...(input.destinationCountries
            ? { destinationCountries: input.destinationCountries }
            : {}),
        }
      : { ...input, name: input.name.trim() };
  const record = getNameRecord(clean);
  const sourceYear = record?.year ?? getCohort(clean, sourceCountry)[0]?.year;
  const recognition = record
    ? clean.type === "given_name" &&
      record.rankingBasis !== "overall" &&
      clean.year !== undefined && record.year !== clean.year
      ? "historical"
      : "ranked"
    : hasReferenceName(clean) || (sourceCountry === "JP" && clean.type === "given_name" &&
        getReadingOptions(clean.name, clean.gender).length > 0)
      ? "dictionary"
      : "unrecognized";
  const matches: Diagnosis["matches"] = [];
  const unavailableCountries: NonNullable<Diagnosis["unavailableCountries"]> = [];
  for (const country of getCountryConfig().filter((c) =>
    c.code !== sourceCountry &&
    (clean.destinationCountries?.includes(c.code) ?? getDefaultDestinations(sourceCountry).includes(c.code)),
  )) {
    const reason = unavailableDatasets.get(`${country.code}/${input.type}`);
    const reference = references.get(`${country.code}/${input.type}`);
    // A Japanese label on an internationally named resident is not evidence of a
    // Japanese given name. Require the same gender and spelling in the Japanese
    // name dataset before using a public-person reference as an output candidate.
    // Keep reference lookup intact for people entering their own names.
    const japaneseNames = country.code === "JP" && clean.type === "given_name"
      ? new Set((datasets.find((d) => d.meta.country === "JP" && d.meta.type === "given_name")?.records ?? [])
        .filter((r) => r.gender === clean.gender && r.rankingBasis === "overall")
        .flatMap((r) => [r.name, ...(r.aliases ?? [])]).map(normalizeName))
      : undefined;
    const candidates = reference?.records.filter((r) =>
      (clean.type === "surname" || r.gender === clean.gender) &&
      (!japaneseNames || [r.name, ...(r.aliases ?? [])].some((name) => japaneseNames.has(normalizeName(name)))),
    ) ?? [];
    const fallback = () => {
      if (!reference || !candidates.length) return false;
      const counted = candidates.filter((candidate) => candidate.evidenceRank);
      const eligible = counted.length ? counted : candidates;
      const candidate = eligible[hash(`${normalizeName(clean.reading ?? clean.name)}|${clean.gender ?? ""}|${country.code}`) % eligible.length];
      matches.push({ country, record: candidate, meta: reference.meta });
      return true;
    };
    if (reason) {
      if (!fallback()) unavailableCountries.push({ country, reason });
      continue;
    }
    try {
      const match = findClosestEquivalentName(clean, country.code, record);
      if (record && match.rank !== record.rank) {
        const alternative = rankAlternatives.get(`${country.code}/${input.type}`);
        const exact = alternative?.records.find((r) => r.rank === record.rank &&
          (clean.type === "surname" || r.gender === clean.gender));
        if (exact && alternative) {
          matches.push({ country, record: exact, meta: { ...alternative.meta, dataYear: exact.dataYear ?? exact.year ?? alternative.meta.dataYear } });
          continue;
        }
      }
      if ((!record || match.rank !== record.rank) && fallback()) continue;
      matches.push({ country, record: match, meta: getDatasetMetadata(country.code, input.type, match.year) });
    } catch {
      if (!fallback()) unavailableCountries.push({ country, reason: "この診断条件の名前データは未収録です。" });
    }
  }
  return {
    input: clean,
    record,
    score: calculateRarityScore(record),
    recognition,
    meta: !record && hasReferenceName(clean)
      ? references.get(`${sourceCountry}/${input.type}`)!.meta
      : getDatasetMetadata(sourceCountry, input.type, sourceYear),
    matches,
    unavailableCountries,
  };
}
