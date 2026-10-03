import { useEffect, useRef, useState } from "react";

export function useDebounce<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// Returns a stable callback that fires at most once per `delay` ms.
export function useDebounceCallback(fn: () => void, delay = 350) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, delay);
  };
}

/** Calls `refresh` every `intervalMs` while the tab is visible, and once when
 *  the user comes back to a tab whose data has gone stale. Nothing runs in a
 *  background tab, and nothing re-renders between refreshes. */
export function useAutoRefresh(refresh: () => void, intervalMs = 60_000) {
  const fn = useRef(refresh);
  useEffect(() => { fn.current = refresh; });

  useEffect(() => {
    let last = Date.now();
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      last = Date.now();
      fn.current();
    };
    const id = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last >= intervalMs) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);
}
