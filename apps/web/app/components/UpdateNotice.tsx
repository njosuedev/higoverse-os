"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLanguage } from "@/lib/language-context";

const CHECK_EVERY_MS = 5 * 60 * 1000;

/** After a new version of the website is deployed, offers a reload so open
 *  pages (browser tabs, the desktop app) pick up the changes. */
export default function UpdateNotice() {
  const { t } = useLanguage();
  const loaded = useRef<string | null>(null);
  const [newer, setNewer] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: string };
        if (!build || build === "dev") return;
        if (loaded.current === null) loaded.current = build;
        else if (build !== loaded.current && alive) setNewer(true);
      } catch { /* offline: try again later */ }
    };
    check();
    const id = setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  if (!newer) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-4 z-[200] flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full border border-border bg-white py-2 pl-4 pr-2 text-sm font-medium text-text shadow-[0_12px_32px_-10px_rgb(0_0_0_/_0.35)]">
        <span>{t("update.available")}</span>
        <button onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink-dark">
          <RefreshCw size={12} /> {t("update.reload")}
        </button>
      </div>
    </div>
  );
}
