"use client";

import { Suspense, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useIsPhone } from "@/lib/use-phone";

// A page on a phone shows the Android app's screen (`phone`); wider screens
// show the website's page (`children`). A link that asks the page to do
// something (new sale, open an item…) — or full=1 — shows the website's
// page, which knows how; once it has acted, DeepLink leaves full=1 in the
// address so its form stays open until the tab is tapped again.

/** Link parameters that run an action on the website's pages. */
export const ACTION_PARAMS = ["full", "new", "add", "open", "do", "pay", "debt", "product", "stockin", "assign", "proforma"];

function Switch({ phone, children }: { phone: ReactNode; children: ReactNode }) {
  const params = useSearchParams();
  const full = ACTION_PARAMS.some((k) => params.has(k));
  return <>{useIsPhone() && !full ? phone : children}</>;
}

export default function PhoneOr({ phone, children }: { phone: ReactNode; children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Switch phone={phone}>{children}</Switch>
    </Suspense>
  );
}

/** A link to the website's page for an action: `full("/sales", { new: 1 })`. */
export function full(path: string, params: Record<string, string | number> = {}) {
  const q = new URLSearchParams({ full: "1", ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  return `${path}?${q}`;
}
