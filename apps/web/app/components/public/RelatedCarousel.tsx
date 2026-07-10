"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ProductCard from "@/app/components/public/ProductCard";
import type { PublicProduct } from "@/lib/marketplace-public";

export default function RelatedCarousel({ products }: { products: PublicProduct[] }) {
  const trackRef = useRef<HTMLDivElement>(null);

  function scrollBy(dir: number) {
    trackRef.current?.scrollBy({ left: dir * 300, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => scrollBy(-1)}
        aria-label="Scroll left"
        className="absolute left-0 top-24 z-10 hidden h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md transition hover:text-orange-600 sm:flex"
      >
        <ChevronLeft size={16} />
      </button>

      <div
        ref={trackRef}
        className="flex gap-4 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {products.map((p) => (
          <div key={p.id} className="w-40 shrink-0 sm:w-48">
            <ProductCard product={p} />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => scrollBy(1)}
        aria-label="Scroll right"
        className="absolute right-0 top-24 z-10 hidden h-9 w-9 translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md transition hover:text-orange-600 sm:flex"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
