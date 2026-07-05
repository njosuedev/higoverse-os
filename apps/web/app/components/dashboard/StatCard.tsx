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
  blue: "bg-blue-50 text-blue-600",
  orange: "bg-orange-50 text-orange-600",
  green: "bg-emerald-50 text-emerald-600",
  red: "bg-red-50 text-red-600",
  amber: "bg-amber-50 text-amber-600",
  slate: "bg-slate-100 text-slate-600",
};

/** Shared KPI tile. Pass size="lg" for the hero metric (e.g. Revenue) in a stat row. */
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
      className={`hgv-card-hover flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white shadow-sm ${
        isLg ? "p-6" : "p-5"
      } ${className}`}
    >
      <div className="flex items-start justify-between">
        <p className={`font-medium text-slate-500 ${isLg ? "text-sm" : "text-xs"}`}>{label}</p>
        {icon && (
          <div
            className={`flex shrink-0 items-center justify-center rounded-xl ${TONE_MAP[tone]} ${
              isLg ? "h-12 w-12" : "h-10 w-10"
            }`}
          >
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <h3 className={`font-bold text-slate-900 ${isLg ? "text-4xl" : "text-2xl"}`}>{value}</h3>
        {delta && (
          <span
            className={`mb-1 flex shrink-0 items-center gap-0.5 text-xs font-semibold ${
              delta.direction === "up" ? "text-emerald-600" : "text-red-500"
            }`}
          >
            {delta.direction === "up" ? "▲" : "▼"} {delta.value}
          </span>
        )}
      </div>

      {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
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
