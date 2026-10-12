"use client";

import { useSyncExternalStore } from "react";

// Phones get the Android app's layout (app/components/mobile), wider screens
// the website's. The same width as the tab bar's breakpoint (md, 768px).
const QUERY = "(max-width: 767px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** True on a phone-sized screen. The signed-in pages render only after
 *  sign-in is read in the browser, so the first render already knows. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
