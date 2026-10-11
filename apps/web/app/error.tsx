"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, WifiOff } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { chunkReloadDue, reloadForChunkError } from "@/lib/chunk-error";
import { checkNow, useConnection } from "@/lib/connection";

/** A page failed while showing. After a deploy that is usually an old tab
 *  missing the new version's files: it reloads by itself. Without internet
 *  it says so and loads the page again once the connection is back.
 *  Otherwise the person can try again or go back, with the header still in place. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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

  if (reloading && !offline) return <div className="min-h-[60vh]" aria-busy="true" />;
  const Icon = offline ? WifiOff : AlertTriangle;
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-16">
      <Icon size={28} className="text-text-muted" aria-hidden="true" />
      <h1 className="mt-4 font-display text-2xl font-bold text-text">{t(offline ? "error.offline_title" : "error.title")}</h1>
      <p className="mt-2 text-[15px] text-text-muted">{t(offline ? "error.offline_body" : "error.body")}</p>
      <div className="mt-6 flex gap-2">
        <button onClick={() => { reset(); window.location.reload(); }}
          className="rounded-press bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-dark">{t("error.reload")}</button>
        <button onClick={() => window.history.back()}
          className="rounded-press border border-border bg-white px-4 py-2 text-sm font-semibold text-text hover:bg-paper-dim">{t("error.back")}</button>
      </div>
    </div>
  );
}
