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
const actualDatasets = new Set(
  [...(manifest.datasets ?? []), ...(manifest.references ?? [])].map((dataset) => `${dataset.country}/${dataset.type}`),
);
if (
  manifest.schemaVersion !== 4 ||
  !manifest.dataVersion ||
  !expectedDatasets?.length ||
  expectedDatasets.some((key) => !actualDatasets.has(key))
)
  throw new Error("Unexpected data manifest");
const dataFiles = manifest.datasets.flatMap((dataset) =>
  dataset.path ? [dataset] : (dataset.chunks ?? []),
);
for (const entry of [manifest.dictionary, ...dataFiles, ...manifest.references.flatMap((dataset) => dataset.chunks), ...manifest.references.flatMap((dataset) => Object.values(dataset.lookup ?? {}))])
  await request(entry.path, "HEAD");
console.log(
  `Healthy: ${base}, data ${manifest.dataVersion}, ${manifest.datasets.length} datasets.`,
);
