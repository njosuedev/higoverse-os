// Server-safe public marketplace data access. `itemRequest`/`listShops` already
// guard `getToken()` against a missing `window`, so these work in both
// Server Components (anonymous request) and client code (authenticated if logged in).
import { itemRequest } from "@/lib/product-api";
import { listShops, type Shop } from "@/lib/shop-api";
import { categoryOf } from "@/lib/categories";
import { productSlug } from "@/lib/slug";

// Shared between the marketplace homepage's Server Component (initial SSR
// fetch) and its client island (subsequent infinite-scroll pages) — one
// source of truth for how many products load per batch.
export const MARKETPLACE_PAGE_SIZE = 20;

export interface PublicProduct {
  id: string;
  shopId: string;
  name: string;
  description?: string;
  category: string;
  images: string[];
  price: number;
  quantity: number;
  listedAt?: string;
  slug: string;
}

export function parseImages(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** All listed products across every shop — the public catalog. */
export async function getPublicProducts(): Promise<PublicProduct[]> {
  try {
    const res = await itemRequest("/products/marketplace?limit=200");
    const items: Array<{
      id: string; shop_id: string; name: string; description?: string;
      category?: string; images?: unknown; selling_price: number; quantity: number;
    }> = res?.data?.items ?? [];

    return items.map((p) => ({
      id: p.id,
      shopId: p.shop_id,
      name: p.name,
      description: p.description,
      category: p.category || categoryOf(p.name, p.description),
      images: parseImages(p.images),
      price: p.selling_price,
      quantity: p.quantity,
      slug: productSlug(p.name, p.id),
    }));
  } catch {
    return [];
  }
}

export interface RawMarketplaceItem {
  id: string;
  shop_id: string;
  name: string;
  description?: string;
  category?: string;
  images?: unknown;
  selling_price: number;
  quantity: number;
  created_at?: string;
}

export interface MarketplaceFeedPage {
  items: RawMarketplaceItem[];
  nextCursor: string | null;
  /** Total matching row count — only present on the first (cursor-less) page. */
  total?: number | null;
}

/** Extra filters for the marketplace feed, forwarded as query params. */
export interface MarketplaceFeedParams {
  category?: string;
  q?: string;
  shopId?: string;
}

/** One page of the public marketplace feed — cursor-based, 20 items by default.
 *  Used by every marketplace listing page's infinite-scroll grid. Raw items
 *  are returned (not `PublicProduct`) since the caller joins them against a
 *  live shops list for shopName/shopLogoUrl/shopPhone. */
export async function getMarketplaceFeedPage(
  cursor: string | null,
  limit = MARKETPLACE_PAGE_SIZE,
  params?: MarketplaceFeedParams,
): Promise<MarketplaceFeedPage> {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (cursor) qs.set("cursor", cursor);
  if (params?.category) qs.set("category", params.category);
  if (params?.q) qs.set("q", params.q);
  if (params?.shopId) qs.set("shop_id", params.shopId);
  try {
    const res = await itemRequest(`/products/marketplace?${qs.toString()}`);
    return {
      items: res?.data?.items ?? [],
      nextCursor: res?.data?.next_cursor ?? null,
      total: res?.data?.total ?? null,
    };
  } catch {
    return { items: [], nextCursor: null, total: null };
  }
}

/** Product count per category — backs the /categories directory page
 *  without fetching the whole catalog just to tally counts. */
export async function getMarketplaceCategoryCounts(): Promise<Record<string, number>> {
  try {
    const res = await itemRequest("/products/marketplace/category-counts");
    const rows: Array<{ category: string | null; count: number }> = res?.data ?? [];
    const map: Record<string, number> = {};
    for (const row of rows) {
      if (row.category) map[row.category] = row.count;
    }
    return map;
  } catch {
    return {};
  }
}

export interface SitemapProductItem {
  id: string;
  name: string;
}

/** One offset-paginated, lean page of listed products — used only by
 *  app/sitemap.ts to chunk product URLs into multiple sitemap files at
 *  scale. Not for user-facing pages (see getMarketplaceFeedPage for that). */
export async function getMarketplaceSitemapPage(
  page: number,
  limit: number,
): Promise<{ items: SitemapProductItem[]; total: number }> {
  try {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    const res = await itemRequest(`/products/marketplace/sitemap?${qs.toString()}`);
    return { items: res?.data?.items ?? [], total: res?.data?.total ?? 0 };
  } catch {
    return { items: [], total: 0 };
  }
}

/** Product count for a small, bounded set of shops — used to caption shop
 *  cards (e.g. search results) without a full-catalog fetch. */
export async function getMarketplaceShopCounts(shopIds: string[]): Promise<Record<string, number>> {
  if (shopIds.length === 0) return {};
  try {
    const qs = new URLSearchParams({ shop_ids: shopIds.join(",") });
    const res = await itemRequest(`/products/marketplace/shop-counts?${qs.toString()}`);
    return res?.data ?? {};
  } catch {
    return {};
  }
}

/** One listed product by its slug-embedded id prefix (see lib/slug.ts's
 *  productSlug) — a single targeted lookup instead of scanning the whole
 *  catalog. Used by the product detail page. */
export async function getPublicProductBySlug(slug: string): Promise<PublicProduct | null> {
  const idPrefix = slug.slice(-6);
  try {
    const res = await itemRequest(`/products/marketplace/by-id/${idPrefix}`);
    const p = res?.data;
    if (!p) return null;
    return {
      id: p.id,
      shopId: p.shop_id,
      name: p.name,
      description: p.description,
      category: p.category || categoryOf(p.name, p.description),
      images: parseImages(p.images),
      price: p.selling_price,
      quantity: p.quantity,
      listedAt: p.created_at,
      slug: productSlug(p.name, p.id),
    };
  } catch {
    return null;
  }
}

/** Up to `limit` other listed products in the same category — used for the
 *  product detail page's "related" carousel without fetching the whole feed. */
export async function getPublicProductsByCategory(
  category: string, excludeId: string, limit = 10,
): Promise<PublicProduct[]> {
  try {
    const qs = new URLSearchParams({ limit: String(limit + 1), category });
    const res = await itemRequest(`/products/marketplace?${qs.toString()}`);
    const items: Array<{
      id: string; shop_id: string; name: string; description?: string;
      category?: string; images?: unknown; selling_price: number; quantity: number;
    }> = res?.data?.items ?? [];

    return items
      .filter((p) => p.id !== excludeId)
      .slice(0, limit)
      .map((p) => ({
        id: p.id,
        shopId: p.shop_id,
        name: p.name,
        description: p.description,
        category: p.category || categoryOf(p.name, p.description),
        images: parseImages(p.images),
        price: p.selling_price,
        quantity: p.quantity,
        slug: productSlug(p.name, p.id),
      }));
  } catch {
    return [];
  }
}

/** All approved (active) shops — the public supplier directory. */
export async function getPublicShops(): Promise<Shop[]> {
  try {
    const res = await listShops({ limit: 200 });
    return (res.items ?? []).filter((s) => s.is_active);
  } catch {
    return [];
  }
}

export function findProductBySlug(products: PublicProduct[], slug: string): PublicProduct | undefined {
  return products.find((p) => p.slug === slug) ?? products.find((p) => p.id === slug);
}

export function findShopBySlugOrId(shops: Shop[], slugOrId: string): Shop | undefined {
  const exact = shops.find((s) => s.id === slugOrId);
  if (exact) return exact;
  return shops.find((s) => slugOrId.endsWith(s.id.slice(0, 6)));
}
