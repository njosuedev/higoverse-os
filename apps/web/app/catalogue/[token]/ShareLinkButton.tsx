"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/** Share the catalogue link (phone share sheet), or copy it where there's none. */
export default function ShareLinkButton({ url, title, label, copied, iconOnly = false }: {
  url: string; title: string; label: string; copied: string;
  /** A round icon button (phone header). */
  iconOnly?: boolean;
}) {
  const [done, setDone] = useState(false);

  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch { window.prompt(title, url); }
  }

  if (iconOnly) {
    return (
      <button type="button" onClick={share} aria-label={done ? copied : label}
        className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#d4d4d8] bg-white text-[#1d2330] active:bg-[#f4f4f5]">
        {done ? <Check size={18} /> : <Share2 size={18} />}
      </button>
    );
  }

  return (
    <button type="button" onClick={share}
      className="inline-flex items-center gap-2 rounded-full border-2 border-[#d4d4d8] bg-white px-4 py-1.5 text-sm font-bold text-[#1d2330] hover:bg-[#f4f4f5]">
      {done ? <Check size={16} /> : <Share2 size={16} />} {done ? copied : label}
    </button>
  );
}
