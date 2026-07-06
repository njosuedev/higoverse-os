import { useEffect, type RefObject } from "react";

interface UseInfiniteScrollOptions {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  /** How far before the sentinel reaches the viewport to trigger the next fetch. */
  rootMargin?: string;
}

/** Fetches the next page when a sentinel element nears the viewport. Shared
 *  by every marketplace listing page's infinite scroll (homepage, category,
 *  search, products, shop) so there's one IntersectionObserver implementation. */
export function useInfiniteScroll(
  sentinelRef: RefObject<Element | null>,
  { hasNextPage, isFetchingNextPage, onLoadMore, rootMargin = "400px" }: UseInfiniteScrollOptions,
) {
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          onLoadMore();
        }
      },
      { rootMargin },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [sentinelRef, hasNextPage, isFetchingNextPage, onLoadMore, rootMargin]);
}
