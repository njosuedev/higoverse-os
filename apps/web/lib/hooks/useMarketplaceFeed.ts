import { useInfiniteQuery } from "@tanstack/react-query";
import { getMarketplaceFeedPage } from "@/lib/marketplace-public";

/** Infinite-scroll feed of the public marketplace's listed products, 24 at a
 *  time via cursor-based pagination. Dedupe, caching, and race-condition
 *  guards (no double-fetching the same page) are handled by React Query. */
export function useMarketplaceFeed(limit = 24) {
  return useInfiniteQuery({
    queryKey: ["marketplace-feed"],
    queryFn: ({ pageParam }: { pageParam: string | null }) => getMarketplaceFeedPage(pageParam, limit),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: null as string | null,
  });
}
