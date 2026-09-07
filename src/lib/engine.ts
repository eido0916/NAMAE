import countries from "@/data/countries.json";
import type {
  CountryConfig,
  Dataset,
  Diagnosis,
  DiagnosisInput,
  MatchingMode,
  NameRecord,
  NameType,
  RankingBasis,
} from "./types";
type DictionaryEntry = {
  gender: string;
  reading: string;
  aliases: string[];
};

let datasets: Dataset[] = [];
let dictionary: DictionaryEntry[] = [];
export const normalizeName = (name: string) =>
  name
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 96));
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
}) {
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
export function getReadingOptions(
  name: string,
  gender: string = "male",
): string[] {
  return [
    ...(readingIndex.get(`${gender}|${normalizeName(name)}`) ?? []),
  ].sort();
}
export function getCountryConfig(code?: string): CountryConfig[] {
  return countries.filter((c) => c.enabled && (!code || c.code === code));
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
      record.gender === input.gender &&
      record.rankingBasis === "overall" &&
      normalizeName(record.name) === reading,
  );
}

export function getNameRecord(
  input: DiagnosisInput,
  country = "JP",
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
  if (!["given_name", "surname"].includes(input.type))
    return "診断の種類を選んでください。";
  if (!input.name.trim()) return "名前を入力してください。";
  if (
    Array.from(input.name.trim()).length > 30 ||
    !/^[\p{L}\p{M}ー・ '’-]+$/u.test(input.name.trim())
  )
    return "名前は30文字以内の漢字・かな・英字で入力してください。";
  if (
    input.type === "given_name" &&
    !["male", "female"].includes(input.gender ?? "")
  )
    return "性別を選んでください。";
  if (input.type === "given_name") {
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
  const clean: DiagnosisInput =
    input.type === "surname"
      ? { name: input.name.trim(), type: input.type }
      : { ...input, name: input.name.trim() };
  const record = getNameRecord(clean);
  const sourceYear = record?.year ?? getCohort(clean, "JP")[0]?.year;
  const recognition = record
    ? clean.type === "given_name" &&
      record.rankingBasis !== "overall" &&
      record.year !== clean.year
      ? "historical"
      : "ranked"
    : clean.type === "given_name" &&
        getReadingOptions(clean.name, clean.gender).length > 0
      ? "dictionary"
      : "unrecognized";
  return {
    input: clean,
    record,
    score: calculateRarityScore(record),
    recognition,
    meta: getDatasetMetadata("JP", input.type, sourceYear),
    matches: getCountryConfig()
      .filter(
        (c) =>
          c.code !== "JP" &&
          (input.type === "surname" ? c.supportsSurname : c.supportsGivenName),
      )
      .map((country) => {
        const record = findClosestEquivalentName(
          clean,
          country.code,
          getNameRecord(clean),
        );
        return {
          country,
          record,
          meta: getDatasetMetadata(country.code, input.type, record.year),
        };
      }),
  };
}
