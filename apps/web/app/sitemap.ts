import type { MetadataRoute } from "next";

const BASE_URL = "https://higoverse-os.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE_URL}/login`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/register`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
