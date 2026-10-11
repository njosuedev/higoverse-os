"use client";

import { useSyncExternalStore } from "react";

// Whether this device can reach Higoverse right now.
//
// The browser's own online/offline events are instant but not enough: on a
// Wi-Fi or mobile network with no internet behind it the browser still says
// "online". So a failed request (reportNetworkFailure, from authFetch) or the
// browser's "online" event is checked against the server itself, and while
// offline the server is asked again every few seconds until it answers.

export type Connection = "online" | "offline";

const RETRY_MS = 5_000;
const PING_TIMEOUT_MS = 6_000;

let state: Connection = "online";
let started = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let checking: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function set(next: Connection) {
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
  if (next === "offline") scheduleRetry();
  else if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
}

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => { retryTimer = null; void checkNow(); }, RETRY_MS);
}

/** Asks the server (a tiny, uncached answer) whether it can be reached. */
async function ping(): Promise<boolean> {
  try {
    const res = await fetch("/api/version", { cache: "no-store", signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Checks the connection now (one check at a time) and updates the state. */
export function checkNow(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(true);
  if (!checking) {
    checking = (async () => {
      const ok = navigator.onLine !== false && (await ping());
      set(ok ? "online" : "offline");
      if (!ok) scheduleRetry();
      return ok;
    })().finally(() => { checking = null; });
  }
  return checking;
}

/** A request failed before any answer came back: find out whether the connection is gone. */
export function reportNetworkFailure() {
  void checkNow();
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  if (navigator.onLine === false) set("offline");
  window.addEventListener("offline", () => set("offline"));
  window.addEventListener("online", () => void checkNow());
  // Coming back to the tab after a while: look again if it was offline.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state === "offline") void checkNow();
  });
}

export function isOffline(): boolean {
  return state === "offline";
}

export function subscribeConnection(listener: () => void) {
  start();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useConnection(): Connection {
  return useSyncExternalStore(subscribeConnection, () => state, () => "online");
}
