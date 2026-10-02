"use client";

import React from "react";
import Link from "next/link";

type Tone = "blue" | "orange" | "green" | "red" | "amber" | "slate";
type Size = "md" | "lg";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  subtitle?: string;
  tone?: Tone;
  size?: Size;
  href?: string;
  delta?: { value: string; direction: "up" | "down" };
  className?: string;
}

const TONE_MAP: Record<Tone, string> = {
  blue: "text-ink",
  orange: "text-accent-dark",
  green: "text-success",
  red: "text-accent-dark",
  amber: "text-warning",
  slate: "text-text-muted",
};

/** Shared KPI tile. Pass size="lg" for the hero metric (e.g. Revenue) in a stat row.
 *  No icon-in-colored-box chrome — the number does the work, set in the display face. */
export default function StatCard({
  label,
  value,
  icon,
  subtitle,
  tone = "blue",
  size = "md",
  href,
  delta,
  className = "",
}: StatCardProps) {
  const isLg = size === "lg";

  const body = (
    <div
      className={`hgv-card-hover flex h-full flex-col justify-between border border-border bg-white rounded-data ${
        isLg ? "p-6" : "p-5"
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`font-medium uppercase tracking-wide text-text-muted ${isLg ? "text-xs" : "text-[11px]"}`}>{label}</p>
        {icon && (
          <span className={`shrink-0 ${TONE_MAP[tone]} ${isLg ? "[&>svg]:h-5 [&>svg]:w-5" : "[&>svg]:h-4 [&>svg]:w-4"}`}>
            {icon}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <h3 className={`hgv-figure font-display font-semibold text-text ${isLg ? "text-4xl" : "text-[1.75rem]"}`}>{value}</h3>
        {delta && (
          <span
            className={`hgv-figure mb-1 flex shrink-0 items-center gap-0.5 text-xs font-semibold ${
              delta.direction === "up" ? "text-success" : "text-accent-dark"
            }`}
          >
            {delta.direction === "up" ? "▲" : "▼"} {delta.value}
          </span>
        )}
      </div>

      {subtitle && <p className="mt-1 text-xs text-text-faint">{subtitle}</p>}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {body}
      </Link>
    );
  }
  return body;
}
