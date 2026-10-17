import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { SOLUTIONS } from "@/lib/solutions";

// Only indexable pages belong here — the dashboard is private and noindex.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE.url}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${SITE.url}/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE.url}/download`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE.url}/solutions`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    ...SOLUTIONS.map((s) => ({
      url: `${SITE.url}/solutions/${s.slug}`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.8,
    })),
    { url: `${SITE.url}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];
}
