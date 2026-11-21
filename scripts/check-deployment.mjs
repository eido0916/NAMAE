const base = (process.env.SITE_URL || process.argv[2] || "").replace(/\/$/, "");
if (!base) throw new Error("SITE_URL is required");
const allFiles = process.argv.includes("--all");

async function request(path, method = "GET") {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(`${base}${path}`, {
      method,
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) return response;
    if (![429, 502, 503, 504].includes(response.status) || attempt === 4)
      throw new Error(`${method} ${path}: ${response.status}`);
    await response.body?.cancel();
    await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
  }
  throw new Error(`${method} ${path}: retry limit exceeded`);
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
const dataFiles = app.filter(entry => allFiles || representatives.has(entry.country)).flatMap(entry => {
  const files = allFiles ? entry.chunks.map(chunk => chunk.path) : [entry.chunks[0]?.path, entry.chunks.at(-1)?.path];
  const buckets = allFiles ? entry.inputLookup?.buckets ?? [] : entry.inputLookup?.buckets.slice(0, 1) ?? [];
  for (const bucket of buckets) files.push(`${entry.inputLookup.directory}/${bucket}.json`);
  return files.filter(Boolean);
});
const details = await (await request("/data/name-details/manifest.json")).json();
const detailFiles = Object.values(details.shards ?? {});
const files = [...new Set([...dataFiles, ...(allFiles ? detailFiles : detailFiles.slice(0, 1))])];
let nextFile = 0;
await Promise.all(Array.from({ length: Math.min(8, files.length) }, async () => {
  while (nextFile < files.length) {
    const path = files[nextFile++];
    await request(path, "HEAD");
  }
}));
console.log(
  `Healthy: ${base}, data ${manifest.dataVersion}, ${app.length} application datasets, ${files.length} files checked.`,
);
