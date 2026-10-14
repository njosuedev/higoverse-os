"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PRODUCT_API } from "@/lib/api-config";

// Often enough that a sale or a new car shows within seconds; only while the
// page is on screen, and at once when it comes back.
const EVERY_MS = 8000;

/** Keeps an open catalogue current: asks product-service for the stock's
 *  version and re-reads the page (filters, search and an open car stay) when
 *  it has changed. */
export default function LiveUpdates({ token, version }: { token: string; version: string | null }) {
  const router = useRouter();

  useEffect(() => {
    if (!version) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      clearTimeout(timer);
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`${PRODUCT_API}/catalogue/public/${token}/version`, { cache: "no-store" });
        const v = res.ok ? (await res.json())?.data?.version : null;
        if (!stopped && v && v !== version) {
          router.refresh();
          return; // the new page brings the new version and starts again
        }
      } catch { /* offline for a moment: try again next round */ }
      if (!stopped) timer = setTimeout(check, EVERY_MS);
    };

    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    timer = setTimeout(check, EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, version, router]);

  return null;
}
