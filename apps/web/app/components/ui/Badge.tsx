"use client";

import React from "react";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

interface BadgeProps {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

const TONE_MAP: Record<Tone, string> = {
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  info: "bg-blue-50 text-blue-700",
  neutral: "bg-slate-100 text-slate-600",
};

const DOT_MAP: Record<Tone, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-blue-500",
  neutral: "bg-slate-400",
};

export default function Badge({ tone = "neutral", children, className = "", dot = false }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_MAP[tone]} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOT_MAP[tone]}`} />}
      {children}
    </span>
  );
}
