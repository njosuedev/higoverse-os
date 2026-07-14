import type { MetadataRoute } from "next";

const BASE_URL = "https://higoverse-os.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/login", "/register"],
      disallow: ["/"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
