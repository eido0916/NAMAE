import { configureEngine } from "./engine";
import { reportOperationalError } from "./monitoring";
import type { CountryConfig, Dataset, NameType } from "./types";

type DictionaryEntry = {
  gender: string;
  reading: string;
  aliases: string[];
};
type Manifest = {
  schemaVersion: number;
  dataVersion: string;
  countries: CountryConfig[];
  dictionary: {
    path: string;
    records: number;
    sha256: string;
    bytes: number;
  };
  datasets: Array<{
    country: string;
    type: NameType;
    path: string;
    records: number;
  }>;
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
  manifestPromise ??= fetchJson<Manifest>("/data/manifest.json", {
    cache: "no-store",
  })
    .then((manifest) => {
      if (manifest.schemaVersion !== 2 || !manifest.dataVersion)
        throw new Error("診断データの形式に対応していません");
      return manifest;
    })
    .catch((error) => {
      manifestPromise = undefined;
      throw error;
    });
  return manifestPromise;
}

async function loadDataset(country: string, type: NameType) {
  const key = `${country}/${type}`;
  let pending = datasetPromises.get(key);
  if (!pending) {
    pending = getManifest().then((manifest) => {
      const entry = manifest.datasets.find(
        (dataset) => dataset.country === country && dataset.type === type,
      );
      if (!entry) throw new Error(`対応データがありません: ${key}`);
      return fetchJson<Dataset>(entry.path);
    });
    pending = pending.catch((error) => {
      datasetPromises.delete(key);
      throw error;
    });
    datasetPromises.set(key, pending);
  }
  const dataset = await pending;
  configureEngine({ datasets: [dataset] });
  return dataset;
}

export async function loadInputData(type: NameType) {
  const manifest = await getManifest();
  const work: Promise<unknown>[] = [loadDataset("JP", type)];
  if (type === "given_name") {
    dictionaryPromise ??= fetchJson<DictionaryEntry[]>(
      manifest.dictionary.path,
    ).catch((error) => {
      dictionaryPromise = undefined;
      throw error;
    });
    work.push(
      dictionaryPromise.then((dictionary) => configureEngine({ dictionary })),
    );
  }
  await Promise.all(work);
}

export async function loadDiagnosisData(type: NameType) {
  await loadInputData(type);
  const manifest = await getManifest();
  await Promise.all(
    manifest.datasets
      .filter((dataset) => dataset.country !== "JP" && dataset.type === type)
      .map((dataset) => loadDataset(dataset.country, dataset.type)),
  );
}
