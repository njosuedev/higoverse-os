"use client";

import { useEffect, useRef, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { checkNow, useConnection } from "@/lib/connection";
import { useLanguage } from "@/lib/language-context";

/** A bar at the bottom of every page while the internet is gone, and a short
 *  "back online" note when it returns. */
export default function ConnectionStatus() {
  const { t } = useLanguage();
  const connection = useConnection();
  const [checking, setChecking] = useState(false);
  const [back, setBack] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (connection === "offline") { wasOffline.current = true; return; }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    const show = setTimeout(() => setBack(true), 0);
    const hide = setTimeout(() => setBack(false), 3_000);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [connection]);

  const offline = connection === "offline";
  if (!offline && !back) return <div role="status" aria-live="polite" className="sr-only" />;

  return (
    <div role="status" aria-live="polite"
      className="fixed inset-x-4 bottom-[calc(1rem+var(--hgv-tabbar,0px))] z-[60] mx-auto flex max-w-xl items-center gap-3 rounded-data bg-text px-4 py-3 text-paper shadow-lg sm:inset-x-6">
      {offline ? <WifiOff size={20} className="shrink-0" aria-hidden="true" /> : <Wifi size={20} className="shrink-0" aria-hidden="true" />}
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{offline ? t("conn.offline_title") : t("conn.back")}</p>
        {offline && <p className="mt-0.5 opacity-80">{t("conn.offline_body")}</p>}
      </div>
      {offline && (
        <button type="button" disabled={checking}
          onClick={async () => { setChecking(true); await checkNow(); setChecking(false); }}
          className="shrink-0 rounded-press border border-paper/40 px-3 py-1.5 text-sm font-semibold hover:bg-paper/10 disabled:opacity-60">
          {checking ? t("conn.checking") : t("conn.retry")}
        </button>
      )}
    </div>
  );
}
