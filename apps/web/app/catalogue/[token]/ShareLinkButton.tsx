"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/** Share the catalogue link (phone share sheet), or copy it where there's none. */
export default function ShareLinkButton({ url, title, label, copied }: {
  url: string; title: string; label: string; copied: string;
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

  return (
    <button type="button" onClick={share}
      className="inline-flex items-center gap-2 rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
      {done ? <Check size={16} /> : <Share2 size={16} />} {done ? copied : label}
    </button>
  );
}
