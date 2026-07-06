import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { getMarketplaceFeedPage, type MarketplaceFeedPage } from "@/lib/marketplace-public";

/** Infinite-scroll feed of the public marketplace's listed products, 24 at a
 *  time via cursor-based pagination. Dedupe, caching, and race-condition
 *  guards (no double-fetching the same page) are handled by React Query.
 *
 *  `initialData` lets a Server Component's already-fetched first page seed
 *  the query so the client never re-fetches (or shows a loading flash) for
 *  data it was just handed as props. */
export function useMarketplaceFeed(
  limit = 24,
  initialData?: InfiniteData<MarketplaceFeedPage, string | null>,
) {
  return useInfiniteQuery({
    queryKey: ["marketplace-feed"],
    queryFn: ({ pageParam }: { pageParam: string | null }) => getMarketplaceFeedPage(pageParam, limit),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: null as string | null,
    initialData,
  });
}
