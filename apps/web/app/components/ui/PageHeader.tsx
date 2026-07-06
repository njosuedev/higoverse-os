"use client";

import React, { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

type Tone = "blue" | "orange" | "flat";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  tone?: Tone;
  /** Small icon badge shown to the left of the title. */
  icon?: React.ReactNode;
  /** Status pill rendered next to the title, e.g. a "Live" or "Beta" tag. */
  badge?: React.ReactNode;
  /** Breadcrumb / context row shown above the title (e.g. "Inventory / Items"). */
  meta?: React.ReactNode;
  /** Short informative messages (tips, announcements) that auto-rotate every 5s. */
  tips?: string[];
  actions?: React.ReactNode;
  /** Optional search/filter row rendered below the title row. */
  children?: React.ReactNode;
  className?: string;
}

// Cycles through `length` items every `intervalMs`, fading out/in across the swap.
function useTipRotator(length: number, intervalMs = 5000) {
  const [index, setIndex]     = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (length <= 1) return;
    const tick = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % length);
        setVisible(true);
      }, 220);
    }, intervalMs);
    return () => clearInterval(tick);
  }, [length, intervalMs]);
  return [index, visible] as const;
}

export default function PageHeader({
  title,
  subtitle,
  tone = "blue",
  icon,
  badge,
  meta,
  tips,
  actions,
  children,
  className = "",
}: PageHeaderProps) {
  const isGradient = tone === "blue" || tone === "orange";
  const [tipIndex, tipVisible] = useTipRotator(tips?.length ?? 0);
  const gradientClass =
    tone === "orange"
      ? "bg-gradient-to-br from-orange-500 via-orange-500 to-orange-600"
      : "bg-gradient-to-br from-blue-600 via-blue-600 to-blue-800";

  // Cross-fade the title/subtitle when they change after mount (e.g. switching
  // tabs under the same header) instead of an abrupt text swap.
  const [display, setDisplay] = useState({ title, subtitle });
  const [settled, setSettled] = useState(true);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (display.title === title && display.subtitle === subtitle) return;
    setSettled(false);
    const t = setTimeout(() => {
      setDisplay({ title, subtitle });
      setSettled(true);
    }, 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, subtitle]);

  return (
    <div
      className={`hgv-header-in relative overflow-hidden rounded-2xl p-5 sm:p-6 ${
        isGradient ? `${gradientClass} text-white` : "bg-white border border-slate-200"
      } ${className}`}
    >
      {isGradient && (
        <>
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
              backgroundSize: "18px 18px",
            }}
          />
          <div className="hgv-header-glow pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
        </>
      )}

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <div
              className={`hgv-header-in flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                isGradient ? "bg-white/15 backdrop-blur-sm" : "border border-slate-200 bg-slate-50"
              }`}
              style={{ animationDelay: "60ms" }}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0">
            {meta && (
              <div
                className={`mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-medium ${
                  isGradient ? "text-white/70" : "text-slate-400"
                }`}
              >
                {meta}
              </div>
            )}
            <div className={`flex items-center gap-2 transition-opacity duration-200 ${settled ? "opacity-100" : "opacity-0"}`}>
              <h1 className="truncate text-xl font-bold sm:text-2xl">{display.title}</h1>
              {badge && <span className="shrink-0">{badge}</span>}
            </div>
            {display.subtitle && (
              <p
                className={`mt-1 text-sm transition-opacity duration-200 ${settled ? "opacity-100" : "opacity-0"} ${
                  isGradient ? "text-white/75" : "text-slate-500"
                }`}
              >
                {display.subtitle}
              </p>
            )}
            {tips && tips.length > 0 && (
              <div
                className={`mt-2 flex items-center gap-1.5 text-xs transition-opacity duration-200 ${
                  tipVisible ? "opacity-100" : "opacity-0"
                } ${isGradient ? "text-white/80" : "text-slate-500"}`}
              >
                <Sparkles size={12} className="shrink-0" />
                <span className="truncate">{tips[tipIndex]}</span>
              </div>
            )}
          </div>
        </div>
        {actions && (
          <div className="hgv-header-in flex flex-wrap items-center gap-2" style={{ animationDelay: "120ms" }}>
            {actions}
          </div>
        )}
      </div>
      {children && <div className="relative mt-4">{children}</div>}
    </div>
  );
}
