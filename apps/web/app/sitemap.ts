import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// Only indexable pages belong here — the dashboard is private and noindex.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE.url}/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    { url: `${SITE.url}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];
}
