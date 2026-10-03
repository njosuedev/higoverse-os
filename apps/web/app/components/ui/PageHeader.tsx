"use client";

import React from "react";
import { ChevronDown, Filter, Plus, RefreshCw, Search, X } from "lucide-react";

/** Shared page chrome: title row, search/filter row and stat tiles, so every
 *  business page reads the same way as Dashboard and Inventory. */

interface PageHeaderProps {
  title: string;
  /** Short line under the title — counts, last updated, etc. */
  subtitle?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshLabel?: string;
  /** The page's main action, e.g. "Record sale". */
  action?: { label: string; onClick: () => void; icon?: React.ReactNode };
  /** Extra buttons rendered before the main action. */
  extra?: React.ReactNode;
  /** Search/filter rows rendered under the title. */
  children?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, onRefresh, refreshing, refreshLabel = "Refresh", action, extra, children }: PageHeaderProps) {
  return (
    <header className="mb-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold text-text">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {extra}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              title={refreshLabel}
              aria-label={refreshLabel}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border-strong bg-white text-text-muted transition hover:border-ink hover:text-ink disabled:opacity-50"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </button>
          )}
          {action && (
            <button
              onClick={action.onClick}
              className="flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white transition hover:bg-ink-dark"
            >
              {action.icon ?? <Plus size={16} strokeWidth={2.5} />} {action.label}
            </button>
          )}
        </div>
      </div>
      {children}
    </header>
  );
}

/** A row that lays out a search field next to filters, stacking on phones. */
export function ToolbarRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">{children}</div>;
}

export function SearchField({ value, onChange, placeholder, clearLabel = "Clear" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; clearLabel?: string;
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border-strong bg-white px-3 py-2.5 transition focus-within:border-ink focus-within:ring-2 focus-within:ring-ink/20 sm:min-w-[240px]">
      <Search size={16} className="shrink-0 text-text-faint" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-[15px] text-text outline-none placeholder:text-text-faint"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={clearLabel}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-faint hover:bg-paper-dim hover:text-text"
        >
          <X size={14} />
        </button>
      )}
    </label>
  );
}

export function FilterSelect({ value, onChange, options, label }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label?: string;
}) {
  return (
    <div className="relative flex items-center rounded-lg border border-border-strong bg-white focus-within:border-ink">
      <Filter size={14} className="pointer-events-none absolute left-3 text-text-faint" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="w-full cursor-pointer appearance-none bg-transparent py-2.5 pl-9 pr-9 text-sm font-medium text-text outline-none"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-3 text-text-faint" />
    </div>
  );
}

export interface Stat {
  label: string;
  value: React.ReactNode;
  /** Tailwind text colour for the figure. */
  tone?: string;
  sub?: React.ReactNode;
}

/** A row of key figures. Use for the 3–5 numbers that matter on a page. */
export function StatTiles({ stats }: { stats: Stat[] }) {
  const cols = stats.length >= 5 ? "lg:grid-cols-5" : stats.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3";
  return (
    <div className={`mb-4 grid grid-cols-2 gap-3 ${cols}`}>
      {stats.map((s) => (
        <div key={s.label} className="rounded-data border border-border bg-white px-4 py-3">
          <p className="text-sm font-medium text-text-muted">{s.label}</p>
          <p className={`hgv-figure mt-0.5 break-words text-xl font-semibold leading-tight sm:text-2xl ${s.tone ?? "text-text"}`}>{s.value}</p>
          {s.sub && <p className="mt-0.5 text-[13px] text-text-faint">{s.sub}</p>}
        </div>
      ))}
    </div>
  );
}
