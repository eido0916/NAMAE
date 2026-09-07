import { configureEngine } from "./engine";
import type { CountryConfig, Dataset, NameType } from "./types";

type DictionaryEntry = {
  gender: string;
  reading: string;
  aliases: string[];
};
type Manifest = {
  version: number;
  countries: CountryConfig[];
  dictionary: string;
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

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok)
    throw new Error(`診断データを読み込めませんでした (${response.status})`);
  return response.json() as Promise<T>;
}

function getManifest() {
  manifestPromise ??= fetchJson<Manifest>("/data/manifest.json");
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
    dictionaryPromise ??= fetchJson<DictionaryEntry[]>(manifest.dictionary);
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
