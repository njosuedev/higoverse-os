"use client";

import React from "react";

type Tone = "blue" | "orange" | "flat";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  tone?: Tone;
  actions?: React.ReactNode;
  /** Optional search/filter row rendered below the title row. */
  children?: React.ReactNode;
  className?: string;
}

export default function PageHeader({
  title,
  subtitle,
  tone = "blue",
  actions,
  children,
  className = "",
}: PageHeaderProps) {
  const isGradient = tone === "blue" || tone === "orange";
  const gradientClass =
    tone === "orange"
      ? "bg-gradient-to-br from-orange-500 via-orange-500 to-orange-600"
      : "bg-gradient-to-br from-blue-600 via-blue-600 to-blue-800";

  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-5 sm:p-6 ${
        isGradient ? `${gradientClass} text-white` : "bg-white border border-slate-200"
      } ${className}`}
    >
      {isGradient && (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        />
      )}
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
          {subtitle && (
            <p className={`mt-1 text-sm ${isGradient ? "text-white/75" : "text-slate-500"}`}>{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="relative mt-4">{children}</div>}
    </div>
  );
}
