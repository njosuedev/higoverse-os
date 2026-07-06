"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ProductCard, { type ProductCardProps } from "./ProductCard";
import ProductCardSkeleton from "./ProductCardSkeleton";
import { readyCardIds } from "@/lib/product-card-cache";

/** Skeleton shows until the card enters the viewport AND its image fully
 *  downloads. The real card renders off-screen (opacity 0) while its image
 *  downloads so the browser fetches in parallel; once ready it swaps in with
 *  a fade-up animation — Alibaba-style diagonal grid fill-in. */
export default function LazyProductCard(props: ProductCardProps) {
  const pid = props.product.id;
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  // Initialise from module-level cache so remounts never regress to skeleton.
  const [ready, setReady] = useState(() => readyCardIds.has(pid));
  // Only cards that flip skeleton → loaded *during this mount* get the reveal
  // animation — cards already cached from a prior render show instantly.
  const [justRevealed, setJustRevealed] = useState(false);

  useEffect(() => {
    if (ready) return;
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } },
      { rootMargin: "600px 0px" }, // pre-fetch images well before card is visible
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ready]);

  const handleReady = useCallback(() => {
    readyCardIds.add(pid); // persist across remounts
    const el = ref.current;
    // Diagonal wave: cards further right/down in the grid reveal a beat later.
    const h = el ? Math.min(el.getBoundingClientRect().left / window.innerWidth, 1) : 0;
    const v = el ? Math.min(el.getBoundingClientRect().top / window.innerHeight, 1) : 0;
    const delay = (h * 0.7 + v * 0.3) * 90;
    setTimeout(() => { setJustRevealed(true); setReady(true); }, delay);
  }, [pid]);

  if (ready) {
    if (!justRevealed) return <ProductCard {...props} onReady={undefined} />;
    return (
      <div className="hgv-card-reveal">
        <ProductCard {...props} onReady={undefined} />
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <ProductCardSkeleton />
      {inView && (
        <div style={{ position: "absolute", inset: 0, opacity: 0, pointerEvents: "none" }}>
          <ProductCard {...props} onReady={handleReady} />
        </div>
      )}
    </div>
  );
}
