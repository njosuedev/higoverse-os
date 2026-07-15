import type { MetadataRoute } from "next";

const BASE_URL = "https://aandtconsultants.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE_URL}/login`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
