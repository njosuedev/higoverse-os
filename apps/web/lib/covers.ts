"use client";

// Sharp photos for cards. Product lists only carry a 160 px thumbnail (fine
// for a 40 px table icon, blurry on a 300 px card); this asks product-service
// for each product's first photo resized for the card (`/products/covers`),
// 30 ids per request, and remembers them for the session. Cards show the
// thumbnail at once and swap in the sharp photo when it arrives.

import { useEffect, useState } from "react";
import { itemRequest } from "@/lib/product-api";

const cache = new Map<string, string | null>(); // `${size}:${id}` → data URL (null: no photo)
const inFlight = new Set<string>();

async function fetchCovers(ids: string[], size: number) {
  const todo = ids.filter((id) => !cache.has(`${size}:${id}`) && !inFlight.has(`${size}:${id}`));
  for (let i = 0; i < todo.length; i += 30) {
    const chunk = todo.slice(i, i + 30);
    chunk.forEach((id) => inFlight.add(`${size}:${id}`));
    try {
      const r = await itemRequest(`/products/covers?ids=${chunk.join(",")}&size=${size}`);
      const data = (r?.data ?? {}) as Record<string, string>;
      chunk.forEach((id) => cache.set(`${size}:${id}`, data[id] ?? null));
    } catch { /* keep the thumbnails; a later render tries again */ }
    finally { chunk.forEach((id) => inFlight.delete(`${size}:${id}`)); }
  }
}

/** Sharp covers for these product ids (id → data URL), filled in as they load.
 *  `size` is the longest side in px: about twice the card's width on screen. */
export function useCovers(ids: string[], size = 800): Record<string, string> {
  const key = ids.join(",");
  const [, bump] = useState(0);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    fetchCovers(key.split(","), size).then(() => { if (alive) bump((n) => n + 1); });
    return () => { alive = false; };
  }, [key, size]);
  const out: Record<string, string> = {};
  for (const id of ids) {
    const v = cache.get(`${size}:${id}`);
    if (v) out[id] = v;
  }
  return out;
}
