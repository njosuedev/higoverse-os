"use client";

import { useState } from "react";
import { Package } from "lucide-react";

export default function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const src = images[active];

  return (
    <div>
      <div className="aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <Package size={64} />
          </div>
        )}
      </div>

      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={img + i}
              type="button"
              onClick={() => setActive(i)}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-slate-50 transition ${
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
