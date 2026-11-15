const base = (process.env.SITE_URL || process.argv[2] || "").replace(/\/$/, "");
if (!base) throw new Error("SITE_URL is required");

async function request(path, method = "GET") {
  const response = await fetch(`${base}${path}`, {
    method,
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status}`);
  return response;
}

const home = await (await request("/")).text();
if (!home.includes("NAMAE")) throw new Error("Home page signature is missing");
const manifest = await (await request("/data/manifest.json")).json();
const expectedDatasets = manifest.countries
  ?.filter((country) => country.enabled)
  .flatMap((country) => {
    const types = [];
    if (country.supportsGivenName) types.push(`${country.code}/given_name`);
    if (country.supportsSurname) types.push(`${country.code}/surname`);
    return types;
  });
const app = manifest.appRankings ?? [];
const actualDatasets = new Set(app.map(dataset => `${dataset.country}/${dataset.type}`));
if (
  manifest.schemaVersion !== 4 ||
  !manifest.dataVersion ||
  !expectedDatasets?.length ||
  expectedDatasets.some((key) => !actualDatasets.has(key))
)
  throw new Error("Unexpected data manifest");
const representatives = new Set(["JP", "US", "CN", "KR", "IN", "PL", "GL"]);
const dataFiles = app.filter(entry => representatives.has(entry.country)).flatMap(entry => {
  const files = [entry.chunks[0]?.path, entry.chunks.at(-1)?.path];
  if (entry.inputLookup?.buckets.length) files.push(`${entry.inputLookup.directory}/${entry.inputLookup.buckets[0]}.json`);
  return files.filter(Boolean);
});
const details = await (await request("/data/name-details/manifest.json")).json();
const detail = Object.values(details.shards ?? {})[0];
await Promise.all([...new Set([...dataFiles, ...(detail ? [detail] : [])])].map(path => request(path, "HEAD")));
console.log(
  `Healthy: ${base}, data ${manifest.dataVersion}, ${app.length} application datasets.`,
);
