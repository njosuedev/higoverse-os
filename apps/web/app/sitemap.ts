import type { MetadataRoute } from "next";
import { getPublicShops, getMarketplaceSitemapPage } from "@/lib/marketplace-public";
import { CATEGORIES } from "@/lib/categories";
import { productSlug, shopSlug } from "@/lib/slug";

const BASE_URL = "https://higoverse-os.vercel.app";

// Well under Google's 50k-URL-per-sitemap-file limit, and small enough that
// each chunk's offset-paginated backend query stays cheap even at "millions
// of products" scale (see /products/marketplace/sitemap).
const PRODUCTS_PER_SITEMAP = 40000;

export async function generateSitemaps() {
  const { total } = await getMarketplaceSitemapPage(1, 1);
  const productChunks = Math.max(1, Math.ceil(total / PRODUCTS_PER_SITEMAP));
  // id 0 = static + category + shop routes; id 1..N = product chunks.
  return Array.from({ length: productChunks + 1 }, (_, i) => ({ id: i }));
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  if (id === 0) {
    const shops = await getPublicShops();

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

    const shopRoutes: MetadataRoute.Sitemap = shops.map((s) => ({
      url: `${BASE_URL}/shop/${shopSlug(s.name, s.id)}`,
      changeFrequency: "daily",
      priority: 0.5,
    }));

    return [...staticRoutes, ...categoryRoutes, ...shopRoutes];
  }

  // id 1 -> page 1 (products 1..40000), id 2 -> page 2, etc.
  const { items } = await getMarketplaceSitemapPage(id, PRODUCTS_PER_SITEMAP);

  return items.map((p) => ({
    url: `${BASE_URL}/product/${productSlug(p.name, p.id)}`,
    changeFrequency: "daily",
    priority: 0.5,
  }));
}
