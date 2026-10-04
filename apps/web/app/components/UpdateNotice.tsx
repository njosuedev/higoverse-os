"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLanguage } from "@/lib/language-context";

const CHECK_EVERY_MS = 2 * 60 * 1000;
const RETRY_SAFE_MS = 15 * 1000;

/** Someone is in the middle of something a reload would lose: typing in a
 *  field, or a form / dialog is open (modals are fixed full-screen layers). */
function busy(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return true;
  return !!document.querySelector('[role="dialog"], [aria-modal="true"], .fixed.inset-0');
}

/** After a new version of the website is deployed, open pages (browser tabs,
 *  the desktop app) update themselves: they reload as soon as nothing would be
 *  lost. Until then a notice offers the reload. */
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

  // A newer version is out: reload by itself once it's safe.
  useEffect(() => {
    if (!newer) return;
    const tryReload = () => { if (!busy()) window.location.reload(); };
    tryReload();
    const id = setInterval(tryReload, RETRY_SAFE_MS);
    return () => clearInterval(id);
  }, [newer]);

  if (!newer) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-4 z-[200] flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full border border-border bg-white py-1.5 pl-4 pr-1.5 text-sm text-text shadow-[0_12px_32px_-10px_rgb(0_0_0_/_0.35)]">
        <span>{t("update.available")}</span>
        <button onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink-dark">
          <RefreshCw size={12} /> {t("update.reload")}
        </button>
      </div>
    </div>
  );
}
