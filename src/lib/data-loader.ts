import { configureEngine } from "./engine";
import { reportOperationalError } from "./monitoring";
import type { CountryConfig, Dataset, Gender, NameType } from "./types";

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
};
type Manifest = {
  schemaVersion: number;
  dataVersion: string;
  countries: CountryConfig[];
  dictionary: DataFile;
  datasets: ManifestDataset[];
};

let manifestPromise: Promise<Manifest> | undefined;
let dictionaryPromise: Promise<DictionaryEntry[]> | undefined;
const datasetPromises = new Map<string, Promise<Dataset>>();

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(path, init);
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
      if (manifest.schemaVersion !== 3 || !manifest.dataVersion)
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

async function loadDataset(country: string, type: NameType, targetRank?: number, gender?: Gender) {
  const manifest = await getManifest();
  const entry = manifest.datasets.find(
    (dataset) => dataset.country === country && dataset.type === type,
  );
  if (!entry) throw new Error(`対応データがありません: ${country}/${type}`);
  const file = selectDataFile(entry, targetRank, gender);
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
    }));
    pending = pending.catch((error) => {
      datasetPromises.delete(file.path);
      throw error;
    });
    datasetPromises.set(file.path, pending);
  }
  const dataset = await pending;
  configureEngine({ datasets: [dataset] });
  return dataset;
}

export async function loadInputData(type: NameType) {
  const manifest = await getManifest();
  const work: Promise<unknown>[] = [loadDataset("JP", type)];
  if (type === "given_name") {
    dictionaryPromise ??= fetchJson<DictionaryEntry[]>(manifest.dictionary.path).catch((error) => {
      dictionaryPromise = undefined;
      throw error;
    });
    work.push(dictionaryPromise.then((dictionary) => configureEngine({ dictionary })));
  }
  await Promise.all(work);
}

export async function loadDiagnosisData(
  type: NameType,
  countries?: string[],
  targetRank?: number,
  gender?: Gender,
) {
  await loadInputData(type);
  const manifest = await getManifest();
  await Promise.all(
    manifest.datasets
      .filter(
        (dataset) =>
          dataset.country !== "JP" &&
          dataset.type === type &&
          (!countries || countries.includes(dataset.country)),
      )
      .map((dataset) => loadDataset(dataset.country, dataset.type, targetRank, gender)),
  );
}
