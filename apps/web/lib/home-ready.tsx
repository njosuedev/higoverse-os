"use client";

import { createContext, useContext, useEffect } from "react";

// Home shows one skeleton until everything on it has its first data: its own
// figures and the widgets that load by themselves (stories, "last 3 days",
// car watch). Each widget says when it's ready; outside Home nobody listens.

const HomeReadyContext = createContext<((part: string) => void) | null>(null);

export const HomeReadyProvider = HomeReadyContext.Provider;

/** Tells Home that `part` has loaded (or given up: a failure counts too). */
export function useReportReady(part: string, ready: boolean) {
  const report = useContext(HomeReadyContext);
  useEffect(() => {
    if (ready && report) report(part);
  }, [ready, report, part]);
}
