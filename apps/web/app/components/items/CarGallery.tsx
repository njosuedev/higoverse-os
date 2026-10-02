"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { itemRequest } from "@/lib/product-api";
import { parseImages } from "@/lib/image";

/** Full-size photo viewer for one car; fetches its images on open. */
export default function CarGallery({ productId, title, onClose }: { productId: string; title: string; onClose: () => void }) {
  const { t } = useLanguage();
  const [images, setImages] = useState<string[] | null>(null);
  const [i, setI] = useState(0);

  useEffect(() => {
    let cancelled = false;
    itemRequest(`/products/${productId}`)
      .then((res) => { if (!cancelled) setImages(parseImages(res?.data?.images)); })
      .catch(() => { if (!cancelled) setImages([]); });
    return () => { cancelled = true; };
  }, [productId]);

  useEffect(() => {
    const n = images?.length ?? 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (n > 1 && e.key === "ArrowRight") setI((x) => (x + 1) % n);
      if (n > 1 && e.key === "ArrowLeft") setI((x) => (x - 1 + n) % n);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images, onClose]);

  const n = images?.length ?? 0;

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2 text-white">
          <p className="text-sm font-semibold truncate">{title}{n > 0 && <span className="text-white/60 font-normal"> · {i + 1}/{n}</span>}</p>
          <button onClick={onClose} aria-label={t("common.close")} className="p-1.5 rounded-lg hover:bg-white/10"><X size={18} /></button>
        </div>

        <div className="relative bg-black rounded-xl overflow-hidden aspect-[4/3] flex items-center justify-center">
          {images === null ? (
            <Loader2 size={28} className="animate-spin text-white/70" />
          ) : n === 0 ? (
            <p className="text-white/70 text-sm">{t("vehicle.no_images")}</p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={images[i]} alt={`${title} ${i + 1}`} className="max-w-full max-h-full object-contain" />
          )}
          {n > 1 && (
            <>
              <button onClick={() => setI((i - 1 + n) % n)} aria-label="Previous"
                className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/85 hover:bg-white flex items-center justify-center"><ChevronLeft size={18} /></button>
              <button onClick={() => setI((i + 1) % n)} aria-label="Next"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/85 hover:bg-white flex items-center justify-center"><ChevronRight size={18} /></button>
            </>
          )}
        </div>

        {n > 1 && (
          <div className="flex gap-2 mt-2 overflow-x-auto">
            {images!.map((src, j) => (
              <button key={j} onClick={() => setI(j)}
                className={`w-16 h-12 shrink-0 rounded-md overflow-hidden border-2 ${j === i ? "border-white" : "border-transparent opacity-60 hover:opacity-100"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
