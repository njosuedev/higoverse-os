"use client";

import { useState } from "react";
import { Package } from "lucide-react";

export default function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const src = images[active];

  return (
    <div>
      <div className="aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50 sm:rounded-2xl">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <Package size={48} className="sm:h-16 sm:w-16" />
          </div>
        )}
      </div>

      {images.length > 1 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto sm:mt-3 sm:gap-2">
          {images.map((img, i) => (
            <button
              key={img + i}
              type="button"
              onClick={() => setActive(i)}
              className={`h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 bg-slate-50 transition sm:h-16 sm:w-16 sm:rounded-lg ${
                i === active ? "border-orange-500" : "border-transparent hover:border-slate-200"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt={`${alt} ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
