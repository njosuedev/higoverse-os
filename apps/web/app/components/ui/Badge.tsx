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
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-accent-soft text-accent-dark",
  info: "bg-ink-soft text-ink",
  neutral: "bg-paper-dim text-text-muted",
};

/** Status mark styled like a rubber stamp — see .hgv-stamp in globals.css. */
export default function Badge({ tone = "neutral", children, className = "", dot = false }: BadgeProps) {
  return (
    <span className={`hgv-stamp ${TONE_MAP[tone]} ${className}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
