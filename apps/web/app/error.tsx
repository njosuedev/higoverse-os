"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Home, RotateCw, WifiOff } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { chunkReloadDue, reloadForChunkError } from "@/lib/chunk-error";
import { checkNow, useConnection } from "@/lib/connection";

/** Back to the previous page; opened straight on this page (no history, or
 *  from another site), go to the dashboard instead of doing nothing. */
function goBack() {
  let sameSite = false;
  try { sameSite = !!document.referrer && new URL(document.referrer).origin === window.location.origin; } catch { /* bad referrer */ }
  if (window.history.length > 1 && sameSite) window.history.back();
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load: the router may be what broke
  else window.location.assign("/");
}

/** A page failed while showing. After a deploy that is usually an old tab
 *  missing the new version's files: it reloads by itself. Without internet
 *  it says so and loads the page again once the connection is back.
 *  Otherwise the person can try again, go back or go to the dashboard. Inside
 *  the dashboard (app/(dashboard)/error.tsx) the header stays, so its menu
 *  still works. Every way out is a full page load: the app's own navigation
 *  may be what broke. */
export default function PageError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useLanguage();
  const offline = useConnection() === "offline";
  // Decided once, as the page appears: a reload is coming, so show nothing.
  const [reloading] = useState(() => chunkReloadDue(error));
  const wasOffline = useRef(false);

  useEffect(() => {
    console.error(error);
    // The failure may be the connection itself: find out, so the right message shows.
    void checkNow();
  }, [error]);

  useEffect(() => {
    if (offline) { wasOffline.current = true; return; }
    // Reloading while offline would only show the browser's own error page.
    if (reloading) reloadForChunkError();
    else if (wasOffline.current) window.location.reload();
  }, [offline, reloading]);

  if (reloading && !offline) return <div className="min-h-[60dvh]" aria-busy="true" />;
  const Icon = offline ? WifiOff : AlertTriangle;
  const btn = "inline-flex items-center justify-center gap-2 rounded-press px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40";
  return (
    <main className="flex min-h-[70dvh] items-center justify-center px-4 py-12">
      <div role="alert" className="w-full max-w-md rounded-2xl border border-border bg-white p-6 text-center shadow-sm sm:p-8">
        <span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${offline ? "bg-paper-dim text-text-muted" : "bg-warning-soft text-warning"}`}>
          <Icon size={26} aria-hidden="true" />
        </span>
        <h1 className="mt-5 font-display text-xl font-bold text-text sm:text-2xl">{t(offline ? "error.offline_title" : "error.title")}</h1>
        <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-text-muted">{t(offline ? "error.offline_body" : "error.body")}</p>

        {!offline && (
          <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button type="button" onClick={() => window.location.reload()}
              className={`${btn} bg-ink text-white hover:bg-ink-dark`}>
              <RotateCw size={15} aria-hidden="true" /> {t("error.reload")}
            </button>
            <button type="button" onClick={goBack}
              className={`${btn} border border-border bg-white text-text hover:bg-paper-dim`}>
              <ArrowLeft size={15} aria-hidden="true" /> {t("error.back")}
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full load: the app's own navigation may be what broke */}
            <a href="/" className={`${btn} border border-border bg-white text-text hover:bg-paper-dim`}>
              <Home size={15} aria-hidden="true" /> {t("error.home")}
            </a>
          </div>
        )}

        {/* What support needs to find the failure in the server logs. */}
        {!offline && error.digest && (
          <p className="mt-6 text-xs text-text-faint">
            {t("error.ref")}: <span className="select-all font-mono">{error.digest}</span>
          </p>
        )}
      </div>
    </main>
  );
}
