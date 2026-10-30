"use client";

import { CheckCircle2, CircleDashed, CirclePause, Moon, Sparkles } from "lucide-react";
import type { CompanyHealth } from "@/lib/admin-api";

/** How a company is doing, as an icon and a word (never colour alone). */
const HEALTH_STYLE: Record<CompanyHealth, { icon: typeof CheckCircle2; cls: string }> = {
  active:   { icon: CheckCircle2, cls: "bg-success-soft text-success border-success/30" },
  slowing:  { icon: CirclePause,  cls: "bg-warning-soft text-warning border-warning/30" },
  new:      { icon: Sparkles,     cls: "bg-ink-soft text-ink border-ink/30" },
  dormant:  { icon: Moon,         cls: "bg-accent-soft text-accent-dark border-accent/30" },
  inactive: { icon: CircleDashed, cls: "bg-paper-dim text-text-muted border-border" },
};

export function HealthBadge({ health, t, size = "sm" }: { health: CompanyHealth; t: (k: string) => string; size?: "sm" | "md" }) {
  const { icon: Icon, cls } = HEALTH_STYLE[health];
  return (
    <span title={t(`admin.health_${health}_hint`)}
      className={`inline-flex items-center gap-1 rounded-full border font-semibold ${cls} ${size === "md" ? "px-2.5 py-1 text-xs" : "px-1.5 py-0.5 text-[11px]"}`}>
      <Icon size={size === "md" ? 13 : 10} /> {t(`admin.health_${health}`)}
    </span>
  );
}

export function HealthIcon({ health, size = 14 }: { health: CompanyHealth; size?: number }) {
  const { icon: Icon, cls } = HEALTH_STYLE[health];
  return <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${cls}`}><Icon size={size} /></span>;
}

/** "Oct" for 2026-10, in the reader's language. */
export function monthShort(ym: string, lang: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString(lang, { month: "short", timeZone: "UTC" });
}

export function monthLong(ym: string, lang: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString(lang, { month: "long", year: "numeric", timeZone: "UTC" });
}

function parse(ts: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : ts + "Z");
}

/** "3 days ago", "just now", or "Never". */
export function ago(ts: string | null | undefined, t: (k: string) => string): string {
  if (!ts) return t("admin.never");
  const mins = Math.floor((Date.now() - parse(ts).getTime()) / 60000);
  if (mins < 2) return t("admin.just_now");
  if (mins < 60) return t("admin.mins_ago").replace("{n}", String(mins));
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("admin.hours_ago").replace("{n}", String(hrs));
  const days = Math.floor(hrs / 24);
  if (days === 1) return t("admin.yesterday");
  if (days < 60) return t("admin.days_ago").replace("{n}", String(days));
  return t("admin.months_ago").replace("{n}", String(Math.floor(days / 30)));
}

export function fullDate(ts: string | null | undefined, lang: string): string {
  return ts ? parse(ts).toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" }) : "-";
}

/** Change from the previous period: "+40%", "-12%", "new" or null. */
export function trend(now: number, before: number): { label: string; up: boolean } | null {
  if (!now && !before) return null;
  if (!before) return { label: "new", up: true };
  const pct = Math.round(((now - before) / before) * 100);
  return { label: `${pct > 0 ? "+" : ""}${pct}%`, up: pct >= 0 };
}

/** Setup steps, in the order a company usually does them. */
export const SETUP_STEPS = ["profile", "logo", "email", "products", "first_sale", "team"] as const;

export function setupDone(s: Record<(typeof SETUP_STEPS)[number], boolean>): number {
  return SETUP_STEPS.filter((k) => s[k]).length;
}

/** Shared look for the admin's chart tooltips. */
export const TOOLTIP_STYLE = {
  fontSize: 12, borderRadius: 8, border: "1px solid var(--color-border, #e5e7eb)",
  background: "var(--color-paper, #fff)", color: "var(--color-text, #111)",
} as const;
