/** The page's CSS zoom (globals.css shrinks the whole app on computers).
 *  getBoundingClientRect and window.innerWidth are in screen pixels, while a
 *  `position: fixed` element's top/left are scaled by the zoom: divide screen
 *  pixels by this before placing anything with them. */
export function pageZoom(): number {
  if (typeof document === "undefined") return 1;
  const z = parseFloat(getComputedStyle(document.documentElement).zoom);
  return z > 0 ? z : 1;
}
