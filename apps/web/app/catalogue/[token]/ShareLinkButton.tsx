"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/** Share the catalogue link (phone share sheet), or copy it where there's none. */
export default function ShareLinkButton({ url, title, label, copied, iconOnly = false, compact = false }: {
  url: string; title: string; label: string; copied: string;
  /** A round icon button (phone header). */
  iconOnly?: boolean;
  /** The small header size. */
  compact?: boolean;
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
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d4d4d8] bg-white text-[#1d2330] active:bg-[#f4f4f5]">
        {done ? <Check size={16} /> : <Share2 size={16} />}
      </button>
    );
  }

  return (
    <button type="button" onClick={share}
      className={`inline-flex items-center rounded-full border border-[#d4d4d8] bg-white font-bold text-[#1d2330] hover:bg-[#f4f4f5] ${compact ? "h-8 gap-1.5 px-3 text-xs" : "gap-2 px-4 py-1.5 text-sm"}`}>
      {done ? <Check size={compact ? 14 : 16} /> : <Share2 size={compact ? 14 : 16} />} {done ? copied : label}
    </button>
  );
}
