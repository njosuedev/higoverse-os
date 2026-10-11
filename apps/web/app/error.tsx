"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { chunkReloadDue, reloadForChunkError } from "@/lib/chunk-error";

/** A page failed while showing. After a deploy that is usually an old tab
 *  missing the new version's files: it reloads by itself. Otherwise the
 *  person can try again or go back, with the header still in place. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useLanguage();
  // Decided once, as the page appears: a reload is coming, so show nothing.
  const [reloading] = useState(() => chunkReloadDue(error));
  useEffect(() => {
    if (reloading) reloadForChunkError();
    else console.error(error);
  }, [error, reloading]);
  if (reloading) return <div className="min-h-[60vh]" aria-busy="true" />;
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-16">
      <AlertTriangle size={28} className="text-text-muted" aria-hidden="true" />
      <h1 className="mt-4 font-display text-2xl font-bold text-text">{t("error.title")}</h1>
      <p className="mt-2 text-[15px] text-text-muted">{t("error.body")}</p>
      <div className="mt-6 flex gap-2">
        <button onClick={() => { reset(); window.location.reload(); }}
          className="rounded-press bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-dark">{t("error.reload")}</button>
        <button onClick={() => window.history.back()}
          className="rounded-press border border-border bg-white px-4 py-2 text-sm font-semibold text-text hover:bg-paper-dim">{t("error.back")}</button>
      </div>
    </div>
  );
}
