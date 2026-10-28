"use client";

import { useEffect, useState } from "react";
import { chunkReloadDue, reloadForChunkError } from "@/lib/chunk-error";

/** The whole site failed (the root layout included), so nothing else is
 *  loaded: plain HTML, its own colours (light and dark). A missing code file
 *  after a deploy reloads by itself; anything else offers Reload / Back. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  // Decided once, as the page appears: a reload is coming, so show nothing.
  const [reloading] = useState(() => chunkReloadDue(error));
  useEffect(() => {
    if (reloading) reloadForChunkError();
    else console.error(error);
  }, [error, reloading]);
  return (
    <html lang="en">
      <body className="hgv-ge">
        <style>{`
          .hgv-ge{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
            font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f4f2ee;color:#191919}
          .hgv-ge p{color:#5e5e5e}
          .hgv-ge :is(button,a){text-decoration:none;display:inline-block;font:inherit;font-size:14px;font-weight:600;border-radius:6px;padding:8px 16px;cursor:pointer}
          .hgv-ge .go{background:#0a66c2;color:#fff;border:1px solid #0a66c2}
          .hgv-ge .back{background:transparent;color:inherit;border:1px solid #d6d4cf}
          @media (prefers-color-scheme:dark){.hgv-ge{background:#0c1014;color:#f1f1f1}.hgv-ge p{color:#a8a8a8}.hgv-ge .back{border-color:#3a3f45}}
        `}</style>
        {!reloading && (
          <main style={{ maxWidth: 420, padding: 24 }}>
            <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>Higoverse couldn&apos;t load this page</h1>
            <p style={{ margin: "0 0 24px", fontSize: 15 }}>Something went wrong. Your data is safe: reload to try again, or go back.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="go" onClick={() => window.location.reload()}>Reload</button>
              <button className="back" onClick={() => {
                let sameSite = false;
                try { sameSite = new URL(document.referrer).origin === window.location.origin; } catch { /* no referrer */ }
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- the app itself failed
                if (window.history.length > 1 && sameSite) window.history.back(); else window.location.assign("/");
              }}>Back</button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full load: the app itself failed */}
              <a className="back" href="/">Dashboard</a>
            </div>
          </main>
        )}
      </body>
    </html>
  );
}
