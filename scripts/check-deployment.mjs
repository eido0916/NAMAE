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
if (manifest.schemaVersion !== 2 || manifest.datasets?.length !== 12)
  throw new Error("Unexpected data manifest");
for (const entry of [manifest.dictionary, ...manifest.datasets])
  await request(entry.path, "HEAD");
console.log(
  `Healthy: ${base}, data ${manifest.dataVersion}, ${manifest.datasets.length} datasets.`,
);
