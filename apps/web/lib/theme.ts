"use client";

import { useEffect, useState } from "react";

/** Appearance chosen on this device. "system" follows the OS light/dark setting. */
export type ThemePref = "system" | "light" | "dark";

export { THEME_KEY } from "./theme-boot";
import { THEME_KEY } from "./theme-boot";

function systemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Puts the resolved theme on <html data-theme> (see globals.css). */
export function applyTheme(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && systemDark());
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#000000" : "#0a66c2");
}

/** Current preference + setter; follows OS changes while on "system". */
export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>("system");

  useEffect(() => {
    // Read the stored choice after mount (the head script already applied it).
    const stored = readThemePref();
    const id = requestAnimationFrame(() => setPref(stored));
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if (readThemePref() === "system") applyTheme("system"); };
    mq.addEventListener("change", onChange);
    return () => { cancelAnimationFrame(id); mq.removeEventListener("change", onChange); };
  }, []);

  const choose = (p: ThemePref) => {
    setPref(p);
    try { localStorage.setItem(THEME_KEY, p); } catch { /* preference only */ }
    applyTheme(p);
  };
  return [pref, choose];
}
