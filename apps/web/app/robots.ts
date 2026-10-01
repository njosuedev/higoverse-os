import type { MetadataRoute } from "next";

const BASE_URL = "https://higoverse.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/login"],
      disallow: ["/"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
