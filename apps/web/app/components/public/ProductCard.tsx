"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Package, BadgeCheck, Camera, ShoppingCart, Check } from "lucide-react";
import { formatRwf } from "@/lib/format";
import { categoryLabel } from "@/lib/categories";
import type { PublicProduct } from "@/lib/marketplace-public";
import { failedImgUrls, loadedImgUrls } from "@/lib/product-card-cache";
import { addToCart } from "@/lib/cart";

export interface ProductCardProps {
  product: PublicProduct;
  isMine?: boolean;
  priority?: boolean;
  /** Fired once the card knows what it'll render (image loaded/failed, or no image) — used by LazyProductCard's reveal wrapper. */
  onReady?: () => void;
}

export default function ProductCard({ product, isMine, priority, onReady }: ProductCardProps) {
  const [, forceRender] = useState(0);
  const cover = product.images.find((u) => !failedImgUrls.has(u));
  const [imgLoaded, setImgLoaded] = useState(() => !!cover && loadedImgUrls.has(cover));
  const inStock = product.quantity > 0;
  const [added, setAdded] = useState(false);

  function handleAddToCart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!inStock) return;
    addToCart({
      productId: product.id,
      name: product.name,
      image: cover,
      price: product.price,
      maxQuantity: product.quantity,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  const readyFired = useRef(false);
  useEffect(() => {
    if (readyFired.current || !onReady) return;
    if (!cover || loadedImgUrls.has(cover)) { readyFired.current = true; onReady(); }
  }, [cover, onReady]);

  return (
    <Link
      href={`/product/${product.slug}`}
      prefetch={false}
      className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      {/* ── Image / no-photo area ── */}
      <div className="relative aspect-square shrink-0 overflow-hidden">
        {cover ? (
          <div className="absolute inset-0">
            {!imgLoaded && <div className="hgv-shimmer absolute inset-0" />}
            <Image
              src={cover}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, (max-width: 1536px) 20vw, 16vw"
              priority={priority}
              // data: URIs (base64-in-Postgres, pre-Cloudinary-migration rows)
              // gain nothing from the optimizer — skip the proxy/decode overhead.
              unoptimized={cover.startsWith("data:")}
              className={`object-cover transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => {
                loadedImgUrls.add(cover);
                setImgLoaded(true);
                if (!readyFired.current && onReady) { readyFired.current = true; onReady(); }
              }}
              onError={() => {
                failedImgUrls.add(cover);
                forceRender((n) => n + 1);
                if (!readyFired.current && onReady) { readyFired.current = true; onReady(); }
              }}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-slate-300">
            <Package size={32} />
          </div>
        )}

        {/* Top-left badges */}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {isMine && (
            <span className="rounded bg-orange-500 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide text-white">YOURS</span>
          )}
          {!inStock && (
            <span className="rounded bg-red-500/90 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">Out of stock</span>
          )}
        </div>

        {/* Gallery indicator */}
        {cover && (
          <span className="absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow">
            <Camera size={12} />
          </span>
        )}

        {/* Add to cart */}
        {inStock && (
          <button
            type="button"
            onClick={handleAddToCart}
            aria-label="Add to cart"
            title="Add to cart"
            className={`absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full shadow transition ${
              added ? "bg-emerald-500 text-white" : "bg-white/90 text-slate-600 hover:bg-orange-500 hover:text-white"
            }`}
          >
            {added ? <Check size={13} /> : <ShoppingCart size={13} />}
          </button>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <p className="line-clamp-2 min-h-[2.4em] text-xs leading-snug text-slate-700">{product.name}</p>
        <span className="text-base font-bold leading-none text-slate-900">{formatRwf(product.price)}</span>
        <p className="text-[10px] font-medium text-slate-600">
          Min. 1 unit · {categoryLabel(product.category)}
        </p>

        <p className="mt-auto flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
          <BadgeCheck size={11} /> Verified
        </p>
      </div>
    </Link>
  );
}
