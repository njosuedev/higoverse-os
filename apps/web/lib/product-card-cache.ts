// Module-level caches shared by ProductCard/LazyProductCard — survive React
// remounts caused by catalog refreshes/pagination, so a card whose image
// already loaded (or that's already been revealed) never flashes back to a
// skeleton on re-render.
export const failedImgUrls = new Set<string>();
export const loadedImgUrls = new Set<string>();
export const readyCardIds = new Set<string>();

/** Kick off background downloads for the first N items' cover image so
 *  they're in the browser cache by the time their cards scroll into view. */
export function preloadCoverImages(items: { images: string[] }[], n = 16) {
  if (typeof window === "undefined") return;
  items.slice(0, n).forEach((item) => {
    const url = item.images.find((u) => !failedImgUrls.has(u) && !loadedImgUrls.has(u));
    if (!url) return;
    const img = new window.Image();
    img.onload = () => loadedImgUrls.add(url);
    img.onerror = () => failedImgUrls.add(url);
    img.src = url;
  });
}
