"use client";

import { useMemo, useRef, type ReactNode } from "react";
import { useQuery, type InfiniteData } from "@tanstack/react-query";
import { listShops, type Shop } from "@/lib/shop-api";
import {
  parseImages,
  type MarketplaceFeedPage,
  type MarketplaceFeedParams,
  type RawMarketplaceItem,
  type PublicProduct,
} from "@/lib/marketplace-public";
import { useProductFeed } from "@/lib/hooks/useProductFeed";
import { useInfiniteScroll } from "@/lib/hooks/useInfiniteScroll";
import { categoryOf } from "@/lib/categories";
import { productSlug } from "@/lib/slug";
import LazyProductCard from "./LazyProductCard";
import ProductCardSkeleton from "./ProductCardSkeleton";

function toPublicProduct(item: RawMarketplaceItem): PublicProduct {
  return {
    id: item.id,
    shopId: item.shop_id,
    name: item.name,
    description: item.description,
    category: item.category || categoryOf(item.name, item.description),
    images: parseImages(item.images),
    price: item.selling_price,
    quantity: item.quantity,
    listedAt: item.created_at,
    slug: productSlug(item.name, item.id),
  };
}

const GRID_CLASSES = "grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";

export interface InfiniteProductGridProps {
  /** Server-fetched first page — renders immediately, no client refetch/flash. */
  initialItems: RawMarketplaceItem[];
  initialNextCursor: string | null;
  initialShops: Shop[];
  /** Filters forwarded to the feed endpoint (category/search/shop scoping). */
  fetchParams?: MarketplaceFeedParams;
  pageSize?: number;
  emptyState?: ReactNode;
}

/** Reusable HTML-first product grid: shows the server-rendered first page
 *  instantly, then infinite-scrolls further cursor pages client-side. Shared
 *  by every marketplace listing page instead of each hand-rolling its own
 *  fetch/observer/skeleton logic. */
export default function InfiniteProductGrid({
  initialItems, initialNextCursor, initialShops, fetchParams, pageSize = 20, emptyState,
}: InfiniteProductGridProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data: shops = [] } = useQuery({
    queryKey: ["marketplace-shops"],
    queryFn: async () => (await listShops({ limit: 200 })).items?.filter((s) => s.is_active) ?? [],
    initialData: initialShops,
  });

  const shopMap = useMemo(() => {
    const m: Record<string, Shop> = {};
    shops.forEach((s) => { m[s.id] = s; });
    return m;
  }, [shops]);

  const initialData: InfiniteData<MarketplaceFeedPage, string | null> = useMemo(() => ({
    pages: [{ items: initialItems, nextCursor: initialNextCursor }],
    pageParams: [null],
    // Only re-seed when the server actually handed us a different first page
    // (e.g. navigating from /category/a to /category/b), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [initialNextCursor, initialItems.length ? initialItems[0]?.id : null]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useProductFeed(pageSize, fetchParams, initialData);

  useInfiniteScroll(sentinelRef, {
    hasNextPage: !!hasNextPage,
    isFetchingNextPage,
    onLoadMore: fetchNextPage,
  });

  // Same safety net the homepage uses today — hides a product if its shop
  // isn't in the active-shops list. Becomes redundant (but harmless) once the
  // backend filters `shop_is_active` server-side (Stage 1/2).
  const items = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p.items).filter((item) => shopMap[item.shop_id]),
    [data, shopMap],
  );

  if (isLoading && items.length === 0) {
    return (
      <div className={GRID_CLASSES}>
        {Array.from({ length: pageSize }).map((_, i) => <ProductCardSkeleton key={i} />)}
      </div>
    );
  }

  if (items.length === 0) {
    return <>{emptyState ?? <p className="py-16 text-center text-sm text-slate-400">No products found.</p>}</>;
  }

  return (
    <>
      <div className={GRID_CLASSES}>
        {items.map((item, idx) => (
          <LazyProductCard
            key={item.id}
            priority={idx < 8}
            product={toPublicProduct(item)}
            shop={shopMap[item.shop_id]}
          />
        ))}
      </div>

      <div ref={sentinelRef} className="h-px" />

      {isFetchingNextPage && (
        <div className={`mt-2.5 ${GRID_CLASSES}`}>
          {Array.from({ length: pageSize }).map((_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      )}

      {!hasNextPage && items.length > pageSize && (
        <p className="py-5 text-center text-xs text-slate-300">All {items.length} products loaded</p>
      )}
    </>
  );
}
