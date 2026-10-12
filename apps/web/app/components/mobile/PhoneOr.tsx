"use client";

import { Suspense, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useIsPhone } from "@/lib/use-phone";

// A page on a phone shows the Android app's screen (`phone`); wider screens
// show the website's page (`children`). The app's screens open the
// website's forms (new sale, edit item…) with full=1 in the link, which
// keeps the website's page until the tab is tapped again.

function Switch({ phone, children }: { phone: ReactNode; children: ReactNode }) {
  const full = useSearchParams().has("full");
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
