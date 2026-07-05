// Server-safe public marketplace data access. `itemRequest`/`listShops` already
// guard `getToken()` against a missing `window`, so these work in both
// Server Components (anonymous request) and client code (authenticated if logged in).
import { itemRequest } from "@/lib/product-api";
import { listShops, type Shop } from "@/lib/shop-api";
import { categoryOf } from "@/lib/categories";
import { productSlug } from "@/lib/slug";

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

function parseImages(raw: unknown): string[] {
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
