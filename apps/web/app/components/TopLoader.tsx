"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const SHOW_AFTER_MS = 120;  // quick pages finish before the bar appears
const GIVE_UP_MS = 15_000;  // never leave it running

/** A thin bar across the top while a page loads (like LinkedIn's): no
 *  percentage, just movement. Starts when an internal link is followed and
 *  stops when the new page takes over. */
export default function TopLoader() {
  const pathname = usePathname();
  const [on, setOn] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const clear = () => { timers.current.forEach((id) => window.clearTimeout(id)); timers.current = []; };
    const stop = () => { clear(); setOn(false); };
    const start = () => {
      clear();
      timers.current.push(window.setTimeout(() => setOn(true), SHOW_AFTER_MS));
      timers.current.push(window.setTimeout(() => setOn(false), GIVE_UP_MS));
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    };

    // The router records the new address once the next page is ready: that's the end.
    const push = history.pushState;
    history.pushState = function (...args) { stop(); return push.apply(this, args); };

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", stop);
    return () => {
      clear();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", stop);
      history.pushState = push;
    };
  }, []);

  // Safety net: a new page path always means the load is over.
  const [path, setPath] = useState(pathname);
  if (path !== pathname) { setPath(pathname); setOn(false); }

  if (!on) return null;
  return (
    <div role="progressbar" aria-label="Loading" className="hgv-toploader" aria-busy="true">
      <span />
    </div>
  );
}
