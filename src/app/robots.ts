import type { MetadataRoute } from "next";
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const site = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
  const base = site.href.replace(/\/$/, "");
  return { rules: { userAgent: "*", allow: site.pathname }, sitemap: `${base}/sitemap.xml` };
}
