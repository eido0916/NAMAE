import type { MetadataRoute } from "next";
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return ["", "/name", "/surname", "/sources", "/privacy", "/legal"].map(
    (path) => ({ url: `${base}${path}`, changeFrequency: "monthly" as const }),
  );
}
