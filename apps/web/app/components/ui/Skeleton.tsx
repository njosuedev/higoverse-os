"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLanguage } from "@/lib/language-context";

type Rounded = "md" | "lg" | "xl" | "2xl" | "full";

const ROUNDED_MAP: Record<Rounded, string> = {
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  full: "rounded-full",
};

/** One shimmer block. Compose these to build page-specific skeletons. */
export default function Skeleton({ className = "h-4 w-full", rounded = "lg" }: { className?: string; rounded?: Rounded }) {
  return <div aria-hidden="true" className={`hgv-shimmer ${ROUNDED_MAP[rounded]} ${className}`} />;
}

/** One placeholder block (see .hgv-shimmer in globals.css). Size it with classes. */
export function Bone({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={`hgv-shimmer block rounded-md ${className}`} style={style} />;
}

/**
 * Wraps a skeleton: screen readers hear "Loading" once (role=status,
 * aria-busy) and never the placeholders themselves.
 */
export function SkeletonRegion({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { t } = useLanguage();
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{t("common.loading")}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

/**
 * Whether to show a skeleton for something that is `loading`, following the
 * usual guidance for skeleton screens:
 * - not for the first `delay` ms: a fast answer never flashes a skeleton;
 * - once shown, at least `minShown` ms, so it never blinks.
 * While loading and this is false, show nothing (or what was there before).
 */
export function useSkeleton(loading: boolean, { delay = 180, minShown = 450 } = {}): boolean {
  const [show, setShow] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (loading && !show) {
      const t = setTimeout(() => { shownAt.current = Date.now(); setShow(true); }, delay);
      return () => clearTimeout(t);
    }
    if (!loading && show) {
      const t = setTimeout(() => setShow(false), Math.max(0, minShown - (Date.now() - shownAt.current)));
      return () => clearTimeout(t);
    }
  }, [loading, show, delay, minShown]);
  return show;
}
