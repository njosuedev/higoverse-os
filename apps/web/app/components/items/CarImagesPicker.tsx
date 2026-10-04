"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Star, X } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { compressImage } from "@/lib/image";
import { notify } from "@/lib/dialogs";

export const MAX_CAR_IMAGES = 7;

/** Up to 7 car photos; the first one is the cover shown in lists. */
export default function CarImagesPicker({
  images,
  onChange,
}: {
  images: string[];
  onChange: (imgs: string[]) => void;
}) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const left = MAX_CAR_IMAGES - images.length;

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const picked = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (picked.length > left) notify(t("vehicle.images_limit"), "warning");
    setBusy(true);
    try {
      const added = await Promise.all(picked.slice(0, left).map((f) => compressImage(f, 1280, 0.78)));
      onChange([...images, ...added]);
    } catch {
      notify(t("vehicle.images_read_failed"));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const makeCover = (i: number) => onChange([images[i], ...images.filter((_, j) => j !== i)]);
  const remove = (i: number) => onChange(images.filter((_, j) => j !== i));

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {t("vehicle.images")}{" "}
        <span className="text-gray-400 font-normal">({images.length}/{MAX_CAR_IMAGES} · {t("common.optional")})</span>
      </label>
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
        {images.map((src, i) => (
          <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`${t("vehicle.image")} ${i + 1}`} className="w-full h-full object-cover" />
            {i === 0 ? (
              <span className="absolute bottom-0 inset-x-0 text-center text-[11px] font-bold text-white bg-black/55 py-0.5">{t("vehicle.cover")}</span>
            ) : (
              <button type="button" onClick={() => makeCover(i)} title={t("vehicle.make_cover")} aria-label={t("vehicle.make_cover")}
                className="absolute bottom-1 left-1 w-5 h-5 rounded-full bg-white/90 text-amber-500 flex items-center justify-center shadow">
                <Star size={11} />
              </button>
            )}
            <button type="button" onClick={() => remove(i)} title={t("common.delete")} aria-label={t("common.delete")}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow hover:bg-red-600">
              <X size={11} />
            </button>
          </div>
        ))}
        {left > 0 && (
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            className="aspect-square rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-[#0a66c2] hover:text-[#0a66c2] flex flex-col items-center justify-center gap-0.5 transition disabled:opacity-60">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
            <span className="text-[11px] font-semibold">{t("vehicle.add_images")}</span>
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
    </div>
  );
}
