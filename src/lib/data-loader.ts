import { calculateRankPercentile, configureEngine, setDatasetUnavailable, clearReferenceDataset, clearRankAlternatives, hash, getCohort, getDefaultDestinations, getNameRecord, hasReferenceName } from "./engine";
import { referenceLookupBucket, referenceLookupKey } from "./reference-lookup.mjs";
import { normalizePinyin } from "./chinese-surnames.mjs";
import { reportOperationalError } from "./monitoring";
import { withBasePath } from "./base-path";
import type { CountryConfig, Dataset, Gender, NameType, ReferenceDataset, RankingScope } from "./types";

type DictionaryEntry = { gender: string; reading: string; aliases: string[] };
type DataFile = { path: string; records: number; sha256: string; bytes: number };
type DataChunk = DataFile & { gender?: Gender; minRank: number; maxRank: number };
type ManifestDataset = {
  country: string;
  type: NameType;
  records: number;
  path?: string;
  sha256?: string;
  bytes?: number;
  chunks?: DataChunk[];
  inputLookup?: { directory: string; count: number; buckets: string[] };
};
type Manifest = {
  schemaVersion: number;
  dataVersion: string;
  countries: CountryConfig[];
  dictionary?: DataFile;
  datasets: ManifestDataset[];
  observedRankings?: ManifestDataset[];
  appRankings?: ManifestDataset[];
  rankAlternatives?: (DataFile & { country: string; type: NameType })[];
  references: { country: string; type: NameType; records: number; chunks: (DataFile & { gender?: Gender; evidenceRanked?: boolean })[]; lookup?: Record<string, DataFile>; lookupBuckets?: number }[];
};

export async function loadAppCoverage() {
  const entries = (await getManifest()).appRankings ?? [];
  return Object.fromEntries(entries.flatMap(entry => (entry.type === "surname" ? [undefined] : ["male", "female"]).map(gender => [
    [entry.country, entry.type, gender ?? ""].join("/"),
    (entry.chunks ?? []).filter(chunk => chunk.gender === gender).reduce((count, chunk) => count + chunk.records, 0),
  ])));
}

export async function loadAppInputName(input: { sourceCountry?: string; type: NameType; name: string; reading?: string }) {
  const country = input.sourceCountry ?? "JP";
  const { type, name, reading } = input;
  const entry = (await getManifest()).appRankings?.find(row => row.country === country && row.type === type);
  const lookup = entry?.inputLookup;
  if (!entry?.chunks || !lookup) return;
  // Search both cohorts so the engine can still detect a name in the other cohort.
  const spellings = [name, ...(reading ? [reading] : [])];
  if (country === "CN" && type === "surname") spellings.push(normalizePinyin(name));
  const keys = new Set((type === "surname" ? [undefined] : ["male", "female"]).flatMap(gender =>
    spellings.map(value => referenceLookupKey(value, gender))));
  const paths = new Set([...keys].map(key => referenceLookupBucket(key, lookup.count)).filter(bucket => lookup.buckets.includes(bucket)));
  const indices = new Set<number>();
  await Promise.all([...paths].map(async bucket => {
    const path = lookup.directory + "/" + bucket + ".json";
    let pending = lookupPromises.get(path);
    if (!pending) {
      pending = fetchJson<ReferenceLookup>(path).catch(error => { lookupPromises.delete(path); throw error; });
      lookupPromises.set(path, pending);
    }
    const data = await pending;
    if (data.country !== country || data.type !== type) throw Error("名前検索データの形式が一致しません。");
    for (const [key, index] of data.entries) if (keys.has(key)) indices.add(index);
  }));
  const files = [...indices].sort((a, b) => a - b).map(index => {
    const file = entry.chunks?.[index];
    if (!file) throw Error("名前検索データの参照先が一致しません。");
    return file;
  });
  const parts = await Promise.all(files.map(file => fetchScopedDataset(file, country, type, "app")));
  const first = parts[0] ?? await fetchScopedDataset(entry.chunks[0], country, type, "app");
  configureEngine({ appDatasets: [{ meta: first.meta, records: parts.flatMap(part => part.records) }] });
}

let manifestPromise: Promise<Manifest> | undefined;
let dictionaryPromise: Promise<DictionaryEntry[]> | undefined;
let japaneseReferencesPromise: Promise<ReferenceDataset | undefined> | undefined;
const datasetPromises = new Map<string, Promise<Dataset>>();
const inputDatasetPromises = new Map<string, Promise<Dataset>>();
const inputReferencePromises = new Map<string, Promise<ReferenceDataset>>();
const referenceFilePromises = new Map<string, Promise<ReferenceDataset>>();
type ReferenceLookup = { country: string; type: NameType; entries: [string, number][] };
const lookupPromises = new Map<string, Promise<ReferenceLookup>>();

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(withBasePath(path), init);
    if (!response.ok)
      throw new Error(`診断データを読み込めませんでした (${response.status})`);
    return response.json() as Promise<T>;
  } catch (error) {
    reportOperationalError("data_load_failed", {
      asset: path.includes("manifest") ? "manifest" : "ranking_data",
    });
    throw error;
  }
}

function getManifest() {
  manifestPromise ??= fetchJson<Manifest>("/data/manifest.json", { cache: "no-store" })
    .then((manifest) => {
      if (manifest.schemaVersion !== 4 || !manifest.dataVersion)
        throw new Error("診断データの形式に対応していません");
      return manifest;
    })
    .catch((error) => {
      manifestPromise = undefined;
      throw error;
    });
  return manifestPromise;
}

function chunkDistance(chunk: DataChunk, rank: number) {
  if (rank < chunk.minRank) return chunk.minRank - rank;
  if (rank > chunk.maxRank) return rank - chunk.maxRank;
  return 0;
}

function selectDataFile(entry: ManifestDataset, targetRank?: number, gender?: Gender): DataFile {
  if (entry.path && entry.sha256 && entry.bytes !== undefined)
    return { path: entry.path, records: entry.records, sha256: entry.sha256, bytes: entry.bytes };
  const candidates = (entry.chunks ?? []).filter(
    (chunk) => entry.type === "surname" || !gender || chunk.gender === gender,
  );
  if (!candidates.length) throw new Error(`対応データがありません: ${entry.country}/${entry.type}`);
  if (!targetRank) return candidates.reduce((last, chunk) => chunk.maxRank > last.maxRank ? chunk : last);
  return candidates.reduce((best, chunk) =>
    chunkDistance(chunk, targetRank) < chunkDistance(best, targetRank) ? chunk : best,
  );
}

async function fetchPublishedDataset(file: DataFile) {
  let pending = datasetPromises.get(file.path);
  if (!pending) {
    pending = fetchJson<Dataset>(file.path).then((dataset) => ({
      ...dataset,
      records: dataset.records.map((record) => ({
        ...record,
        country: dataset.meta.country,
        type: dataset.meta.type,
        dataYear: record.dataYear ?? dataset.meta.dataYear,
      })),
    })).catch((error) => {
      datasetPromises.delete(file.path);
      throw error;
    });
    datasetPromises.set(file.path, pending);
  }
  return pending;
}

async function loadDataset(country: string, type: NameType, targetRank?: number, gender?: Gender) {
  const manifest = await getManifest();
  const entry = manifest.datasets.find(
    (dataset) => dataset.country === country && dataset.type === type,
  );
  if (!entry) throw new Error(`対応データがありません: ${country}/${type}`);
  const dataset = await fetchPublishedDataset(selectDataFile(entry, targetRank, gender));
  configureEngine({ datasets: [dataset] });
  return dataset;
}

function fetchScopedDataset(file: DataFile, country: string, type: NameType, scope: 'public_people' | 'app') {
  let pending = datasetPromises.get(file.path);
  if (!pending) {
    pending = fetchJson<Dataset>(file.path).then(dataset => {
      if (dataset.meta.rankingScope !== scope || dataset.meta.country !== country || dataset.meta.type !== type)
        throw new Error('公開人物の順位データの形式が一致しません');
      return dataset;
    }).catch(error => { datasetPromises.delete(file.path); throw error; });
    datasetPromises.set(file.path, pending);
  }
  return pending;
}

const observedInputPromises = new Map<string, Promise<Dataset>>();
async function loadObservedDataset(country: string, type: NameType, targetRank?: number, gender?: Gender, full = false, scope: 'public_people' | 'app' = 'public_people') {
  const manifest = await getManifest();
  const entry = (scope === 'app' ? manifest.appRankings : manifest.observedRankings)?.find(row => row.country === country && row.type === type);
  if (!entry) throw new Error('公開人物の順位データがありません');
  const load = (file: DataFile) => fetchScopedDataset(file, country, type, scope);
  let dataset: Dataset;
  if (full) {
    const key = scope + '/' + country + '/' + type;
    let pending = observedInputPromises.get(key);
    if (!pending) {
      pending = (async () => {
        const parts: Dataset[] = [];
        const files = entry.chunks ?? [];
        for (let offset = 0; offset < files.length; offset += 6)
          parts.push(...await Promise.all(files.slice(offset, offset + 6).map(load)));
        if (!parts.length) throw new Error('公開人物の順位データがありません');
        return { meta: parts[0].meta, records: parts.flatMap(part => part.records) };
      })().catch(error => { observedInputPromises.delete(key); throw error; });
      observedInputPromises.set(key, pending);
    }
    dataset = await pending;
  } else dataset = await load(selectDataFile(entry, targetRank, gender));
  configureEngine(scope === 'app' ? { appDatasets: [dataset] } : { observedDatasets: [dataset] });
  return dataset;
}

async function loadPercentileChunks(
  entry: ManifestDataset,
  initial: Dataset,
  targetRank: number,
  gender: Gender | undefined,
  percentile: number,
  destinationTotals: number[],
  load: (file: DataFile) => Promise<Dataset>,
): Promise<Dataset> {
  if (!entry.chunks || !destinationTotals.length) return initial;
  const firstPath = selectDataFile(entry, targetRank, gender).path;
  const chunks = entry.chunks.filter(chunk => chunk.records > 0 && (entry.type === "surname" || chunk.gender === gender));
  const additional = new Set<DataChunk>();
  for (const total of new Set(destinationTotals)) {
    const rank = total * percentile;
    const lower = chunks.findLast(chunk => chunk.minRank <= rank);
    const upper = chunks.find(chunk => chunk.maxRank >= rank);
    if (lower && lower.path !== firstPath) additional.add(lower);
    if (upper && upper.path !== firstPath) additional.add(upper);
  }
  if (!additional.size) return initial;
  const parts = await Promise.all([...additional].map(load));
  return { ...initial, records: [...initial.records, ...parts.flatMap(part => part.records)] };
}

export async function loadInputData(type: NameType, sourceCountry = "JP", rankingScope?: RankingScope) {
  if (rankingScope === 'app') {
    const manifest = await getManifest();
    const entry = manifest.appRankings?.find(row => row.country === sourceCountry && row.type === type);
    if (entry?.inputLookup) {
      const first = entry.chunks?.filter(chunk => chunk.minRank <= 1) ?? [];
      const parts = await Promise.all(first.map(file => fetchScopedDataset(file, sourceCountry, type, "app")));
      if (!parts.length) throw Error("名前データを読み込めませんでした。");
      configureEngine({ appDatasets: [{ meta: parts[0].meta, records: parts.flatMap(part => part.records) }] });
      return;
    }
    await loadObservedDataset(sourceCountry, type, undefined, undefined, true, 'app');
    if (sourceCountry === 'JP' && type === 'given_name' && manifest.dictionary) {
      dictionaryPromise ??= fetchJson<DictionaryEntry[]>(manifest.dictionary.path).catch(error => { dictionaryPromise = undefined; throw error; });
      configureEngine({ dictionary: await dictionaryPromise });
    }
    return;
  }
  if (rankingScope === 'public_people') { await loadObservedDataset(sourceCountry, type, undefined, undefined, true); return; }
  const manifest = await getManifest();
  if (sourceCountry !== "JP") {
    const key = `${sourceCountry}/${type}`;
    if (!manifest.datasets.some((entry) => entry.country === sourceCountry && entry.type === type)) {
      let pending = inputReferencePromises.get(key);
      if (!pending) {
        pending = (async () => {
          const entry = manifest.references.find((entry) => entry.country === sourceCountry && entry.type === type);
          if (!entry?.chunks.length) throw new Error("この国・地域の入力データは未対応です。");
          if (entry.lookup) {
            const first = await fetchJson<ReferenceDataset>(entry.chunks[0].path);
            return { ...first, records: first.records.map((record) => ({ ...record, country: sourceCountry, type })) };
          }
          const parts: ReferenceDataset[] = [];
          for (let offset = 0; offset < entry.chunks.length; offset += 6) {
            parts.push(...await Promise.all(entry.chunks.slice(offset, offset + 6).map((file) => fetchJson<ReferenceDataset>(file.path))));
          }
          return { meta: parts[0].meta, records: parts.flatMap((part) => part.records.map((record) => ({ ...record, country: sourceCountry, type }))) };
        })().catch((error) => { inputReferencePromises.delete(key); throw error; });
        inputReferencePromises.set(key, pending);
      }
      const reference = await pending;
      // Dictionary-only sources have no population rank, including evidenceRank.
      configureEngine({ datasets: [{ meta: reference.meta, records: [] }], references: [reference] });
      return;
    }
    let pending = inputDatasetPromises.get(key);
    if (!pending) {
      pending = (async () => {
        const entry = manifest.datasets.find((dataset) => dataset.country === sourceCountry && dataset.type === type);
        if (!entry) throw new Error("この国・地域の入力データは未対応です。");
        // Input lookup needs every rank, not just the chunk used for an output candidate.
        const parts: Dataset[] = [];
        if (entry.path) parts.push(await loadDataset(sourceCountry, type));
        else {
          const chunks = entry.chunks ?? [];
          // Limit concurrent requests for large surname datasets.
          for (let offset = 0; offset < chunks.length; offset += 6) {
            parts.push(...await Promise.all(chunks.slice(offset, offset + 6).map((chunk) =>
              loadDataset(sourceCountry, type, chunk.minRank, chunk.gender),
            )));
          }
        }
        if (!parts.length) throw new Error("この国・地域の入力データは未対応です。");
        return { meta: parts[0].meta, records: parts.flatMap((part) => part.records) };
      })().catch((error) => {
        inputDatasetPromises.delete(key);
        throw error;
      });
      inputDatasetPromises.set(key, pending);
    }
    configureEngine({ datasets: [await pending] });
    return;
  }
  const work: Promise<unknown>[] = [loadDataset("JP", type)];
  if (type === "given_name" && manifest.dictionary) {
    dictionaryPromise ??= fetchJson<DictionaryEntry[]>(manifest.dictionary.path).catch((error) => {
      dictionaryPromise = undefined;
      throw error;
    });
    work.push(dictionaryPromise.then((dictionary) => configureEngine({ dictionary })));
    const entry = manifest.references.find((entry) => entry.country === "JP" && entry.type === type);
    if (entry) {
      japaneseReferencesPromise ??= Promise.all(entry.chunks.map((file) => fetchJson<ReferenceDataset>(file.path)))
        .then((parts) => {
          return { meta: parts[0].meta, records: parts.flatMap((part) => part.records.map((record) => ({ ...record, country: "JP", type: "given_name" as const }))) };
        }).catch(() => { japaneseReferencesPromise = undefined; return undefined; });
      work.push(japaneseReferencesPromise.then((dataset) => {
        if (dataset) configureEngine({ references: [dataset] });
      }));
    }
  }
  await Promise.all(work);
}

export async function loadInputReferenceName(type: NameType, inputName: string, gender?: Gender, sourceCountry = "JP", rankingScope?: RankingScope) {
  if (rankingScope === "public_people" || rankingScope === "app") return;
  if (!inputName.trim()) return;
  const input = { name: inputName, type, gender, sourceCountry };
  if (getNameRecord(input) || hasReferenceName(input)) return;
  const manifest = await getManifest();
  const entry = manifest.references.find((r) => r.country === sourceCountry && r.type === type);
  if (!entry?.chunks.length) return;
  let files: DataFile[];
  if (entry.lookup) {
    const key = referenceLookupKey(inputName, type === "given_name" ? gender : undefined);
    const file = entry.lookup[referenceLookupBucket(key, entry.lookupBuckets ?? 256)];
    if (!file) return;
    let pending = lookupPromises.get(file.path);
    if (!pending) {
      pending = fetchJson<ReferenceLookup>(file.path).catch((error) => { lookupPromises.delete(file.path); throw error; });
      lookupPromises.set(file.path, pending);
    }
    const lookup = await pending;
    if (lookup.country !== sourceCountry || lookup.type !== type || !Array.isArray(lookup.entries)) throw new Error("名前検索データの形式が一致しません。");
    const indices = new Set(lookup.entries.filter(([name]) => name === key).map(([, index]) => index));
    files = [...indices].map((index) => {
      if (!Number.isSafeInteger(index) || index < 0 || index >= entry.chunks.length) throw new Error("名前検索データの参照先が一致しません。");
      return entry.chunks[index];
    });
  } else {
    files = entry.chunks.filter((file) => type === "surname" || !gender || file.gender === gender);
  }
  const parts: ReferenceDataset[] = [];
  for (let offset = 0; offset < files.length; offset += 6) {
    parts.push(...await Promise.all(files.slice(offset, offset + 6).map((file) => {
      let pending = referenceFilePromises.get(file.path);
      if (!pending) {
        pending = fetchJson<ReferenceDataset>(file.path).catch((error) => { referenceFilePromises.delete(file.path); throw error; });
        referenceFilePromises.set(file.path, pending);
      }
      return pending;
    })));
  }
  if (parts.length) configureEngine({ references: [{ meta: parts[0].meta, records: parts.flatMap((part) => part.records.map((record) => ({ ...record, country: sourceCountry, type }))) }] });
}

export async function loadDiagnosisData(
  type: NameType,
  countries?: string[],
  targetRank?: number,
  gender?: Gender,
  inputName = "",
  sourceCountry = "JP",
  rankingScope?: RankingScope,
  sourceTotalEntries?: number,
) {
  const manifest = await getManifest();
  if (rankingScope !== "app" ||
      !manifest.appRankings?.find(entry => entry.country === sourceCountry && entry.type === type)?.inputLookup)
    await loadInputData(type, sourceCountry, rankingScope);
  if (rankingScope === "app" && targetRank === undefined) return;
  await loadInputReferenceName(type, inputName, gender, sourceCountry, rankingScope);
  const comparison = { name: inputName, type, gender, sourceCountry, rankingScope };
  const sourceRecord = targetRank && sourceTotalEntries === undefined ? getNameRecord(comparison) : undefined;
  const total = sourceTotalEntries ?? (sourceRecord?.rank === targetRank ? sourceRecord?.totalEntries : undefined);
  const percentile = targetRank && total ? calculateRankPercentile(targetRank, total) : undefined;
  if (rankingScope === "public_people" || rankingScope === "app") {
    await Promise.all((countries ?? getDefaultDestinations(sourceCountry)).filter(country => country !== sourceCountry).map(async country => {
      try {
        const dataset = await loadObservedDataset(country, type, targetRank, gender, false, rankingScope);
        const entries = rankingScope === "app" ? manifest.appRankings : manifest.observedRankings;
        const entry = entries?.find(row => row.country === country && row.type === type);
        const cohort = getCohort(comparison, country);
        if (entry && targetRank && percentile !== undefined && !cohort.some(record => record.rank === targetRank)) {
          const withPercentile = await loadPercentileChunks(entry, dataset, targetRank, gender, percentile,
            cohort.map(record => record.totalEntries), file => fetchScopedDataset(file, country, type, rankingScope));
          configureEngine(rankingScope === "app" ? { appDatasets: [withPercentile] } : { observedDatasets: [withPercentile] });
        }
        setDatasetUnavailable(country, type);
      } catch {
        setDatasetUnavailable(country, type, "公開人物の順位データを読み込めませんでした。");
      }
    }));
    return;
  }
  const destinations = countries ?? getDefaultDestinations(sourceCountry);
  await Promise.all(destinations.filter((country) => country !== sourceCountry).map(async (country) => {
    clearReferenceDataset(country, type);
    clearRankAlternatives(country, type);
    const entry = manifest.datasets.find((dataset) => dataset.country === country && dataset.type === type);
    if (!entry || (type === "given_name" && entry.chunks && !entry.chunks.some((chunk) => chunk.gender === gender))) {
      setDatasetUnavailable(country, type, "この診断条件の名前データは未収録です。");
    } else {
      try {
        const dataset = await loadDataset(country, type, targetRank, gender);
        setDatasetUnavailable(country, type);
        const cohort = getCohort(comparison, country);
        if (targetRank && cohort.some((record) => record.rank === targetRank)) return;
        const alternateFile = targetRank && manifest.rankAlternatives?.find((file) => file.country === country && file.type === type);
        if (alternateFile) {
          try {
            const alternative = await fetchJson<Dataset>(alternateFile.path);
            if (alternative.records.some((record) => record.rank === targetRank && (type === "surname" || record.gender === gender))) {
              configureEngine({ rankAlternatives: [alternative] });
              return;
            }
          } catch {
            // Independent annual data is optional; preserve the available result.
          }
        }
        if (targetRank && percentile !== undefined && cohort.length) {
          const withPercentile = await loadPercentileChunks(entry, dataset, targetRank, gender, percentile,
            cohort.map(record => record.totalEntries), fetchPublishedDataset);
          configureEngine({ datasets: [withPercentile] });
          return;
        }
      } catch {
        setDatasetUnavailable(country, type, "データを読み込めませんでした。国を選び直すと再試行できます。");
      }
    }
    const reference = manifest.references.find((dataset) => dataset.country === country && dataset.type === type);
    const chunks = reference?.chunks.filter((chunk) => type === "surname" || chunk.gender === gender) ?? [];
    if (chunks.length) {
      try {
        const rankedChunks = chunks.filter((chunk) => chunk.evidenceRanked);
        const candidates = rankedChunks.length ? rankedChunks : chunks;
        const file = candidates[hash(`${inputName}|${gender ?? ""}|${country}`) % candidates.length];
        const dataset = await fetchJson<ReferenceDataset>(file.path);
        configureEngine({ references: [{ ...dataset, records: dataset.records.map((record) => ({ ...record, country, type })) }] });
      } catch {
        // Keep independently available ranked data; reference failures never fabricate results.
      }
    }
  }));
}
