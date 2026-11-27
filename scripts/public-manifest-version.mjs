import { createHash } from 'node:crypto';

export function publicManifestVersion(manifest) {
  return createHash('sha256').update(JSON.stringify({
    dictionaryHash: manifest.dictionary.sha256,
    observedRankings: manifest.observedRankings,
    appRankings: manifest.appRankings,
    rankAlternatives: manifest.rankAlternatives,
    datasets: manifest.datasets.map(({ country, type, sha256, chunks }) => ({
      country, type, sha256, chunks: chunks?.map(({ sha256: chunkHash }) => chunkHash),
    })),
    sources: manifest.sources,
    references: manifest.references,
  })).digest('hex').slice(0, 16);
}

export function manifestSourcesFromLedger(ledger) {
  return ledger.sources.map(({ id, name, url, licenseName, licenseUrl, redistributionStatus, attribution }) =>
    ({ id, name, url, licenseName, licenseUrl, redistributionStatus, attribution }))
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
}
