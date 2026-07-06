import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import {
  getMarketplaceFeedPage,
  type MarketplaceFeedPage,
  type MarketplaceFeedParams,
} from "@/lib/marketplace-public";

/** Params-aware infinite-scroll feed — backs InfiniteProductGrid so every
 *  marketplace listing page (category/search/products/shop) shares one
 *  fetching/caching implementation. Each distinct `params` gets its own
 *  React Query cache entry. */
export function useProductFeed(
  limit: number,
  params?: MarketplaceFeedParams,
  initialData?: InfiniteData<MarketplaceFeedPage, string | null>,
) {
  return useInfiniteQuery({
    queryKey: ["product-feed", params ?? {}],
    queryFn: ({ pageParam }: { pageParam: string | null }) => getMarketplaceFeedPage(pageParam, limit, params),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: null as string | null,
    initialData,
  });
}
