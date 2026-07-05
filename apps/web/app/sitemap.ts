import type { MetadataRoute } from "next";
import { getPublicProducts, getPublicShops } from "@/lib/marketplace-public";
import { CATEGORIES } from "@/lib/categories";
import { shopSlug } from "@/lib/slug";

const BASE_URL = "https://higoverse-os.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, shops] = await Promise.all([getPublicProducts(), getPublicShops()]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${BASE_URL}/products`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/categories`, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/suppliers`, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/search`, changeFrequency: "weekly", priority: 0.3 },
    { url: `${BASE_URL}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/contact`, changeFrequency: "monthly", priority: 0.4 },
  ];

  const categoryRoutes: MetadataRoute.Sitemap = CATEGORIES.map((c) => ({
    url: `${BASE_URL}/category/${c.key}`,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${BASE_URL}/product/${p.slug}`,
    changeFrequency: "daily",
    priority: 0.5,
  }));

  const shopRoutes: MetadataRoute.Sitemap = shops.map((s) => ({
    url: `${BASE_URL}/shop/${shopSlug(s.name, s.id)}`,
    changeFrequency: "daily",
    priority: 0.5,
  }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes, ...shopRoutes];
}
