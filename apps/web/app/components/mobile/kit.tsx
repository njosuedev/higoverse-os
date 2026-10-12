"use client";

// The phone layout's building blocks, copied from the Android app
// (apps/mobile/lib/src: format.dart, widgets.dart, media.dart) so a page
// on a phone looks and reads like the app: the same figures, cards, rows
// and words.

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Plus } from "lucide-react";

// ─── Words and numbers (format.dart) ─────────────────────────────────────────

/** A string with {name} placeholders filled in. */
export function tf(t: (k: string) => string, key: string, vars: Record<string, string | number> = {}) {
  return t(key).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** 1250000 → "1,250,000". */
export function groupDigits(n: number) {
  const v = Math.round(Math.abs(Number(n) || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (n < 0 ? "-" : "") + v;
}

/** "1,250,000 RWF". */
export const money = (n: number, currency: string) => `${groupDigits(n)} ${currency}`;

/** Short amounts for small tiles: 950 → "950 RWF", 22000000 → "22M RWF". */
export function compactMoney(n: number, currency: string) {
  const a = Math.abs(Number(n) || 0);
  const f = (v: number, u: string) => `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10}${u}`;
  const s = a < 10_000 ? groupDigits(a) : a < 1e6 ? f(a / 1e3, "K") : a < 1e9 ? f(a / 1e6, "M") : f(a / 1e9, "B");
  return `${n < 0 ? "-" : ""}${s} ${currency}`;
}

/** A number from whatever the server sent (decimal string, null…): 0 when unusable. */
export const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The last `days` days including today, as API date filters. */
export function lastDays(days: number) {
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return { from: ymd(from), to: ymd(new Date()) };
}

/** An API timestamp (UTC, sometimes without a zone) as a local date. */
export function parseTimestamp(ts: unknown): Date | null {
  if (typeof ts !== "string" || !ts) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole calendar days from `d` to today. */
export function daysAgo(d: Date) {
  const n = new Date();
  return Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
    - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000);
}

/** Change from `before` to `now` in percent, or null when there is no base. */
export const percentChange = (now: number, before: number) => (before === 0 ? null : ((now - before) / before) * 100);

/** "Now", "5 min ago", "3 h ago", "2 days ago" (never negative). */
export function ago(t: (k: string) => string, d: Date) {
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return t("dash.time_now");
  if (s < 3600) return tf(t, "dash.time_min", { n: Math.floor(s / 60) });
  if (s < 86400) return tf(t, "dash.time_hour", { n: Math.floor(s / 3600) });
  const n = Math.floor(s / 86400);
  return n === 1 ? t("dash.time_day") : tf(t, "dash.days_ago_n", { n });
}

const LOCALES: Record<string, string> = { en: "en-GB", rw: "rw-RW", fr: "fr-FR", sw: "sw-KE", zh: "zh-CN" };
export const weekdayShort = (lang: string, d: Date) => d.toLocaleDateString(LOCALES[lang] ?? "en-GB", { weekday: "short" });
export const shortDate = (lang: string, d: Date) => d.toLocaleDateString(LOCALES[lang] ?? "en-GB", { day: "numeric", month: "short" });
export const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Car attributes arrive as a JSON string (or an object). */
export function attributesOf(raw: unknown): Record<string, string> {
  if (!raw) return {};
  try {
    const o = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Object.fromEntries(Object.entries(o as Record<string, unknown>).map(([k, v]) => [k, v == null ? "" : String(v)]));
  } catch { return {}; }
}

// ─── Pieces (widgets.dart, media.dart) ───────────────────────────────────────

/** The app's Card: the page colour, a thin line, rounded 12. */
export function Card({ children, className = "", onClick, href }: {
  children: ReactNode; className?: string; onClick?: () => void; href?: string;
}) {
  const cls = `block overflow-hidden rounded-xl border border-border bg-white ${className}`;
  if (href) return <Link href={href} className={`${cls} active:bg-paper-dim`}>{children}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={`${cls} w-full text-left active:bg-paper-dim`}>{children}</button>;
  return <div className={cls}>{children}</div>;
}

/** A section title with an optional count and "View all". */
export function SectionHeader({ title, count, action, href }: { title: string; count?: number; action?: string; href?: string }) {
  return (
    <div className="flex items-center gap-2 px-0.5 pb-2 pt-[18px]">
      <h2 className="text-[15px] font-extrabold tracking-[-0.2px] text-text">{title}</h2>
      {!!count && count > 0 && (
        <span className="rounded-full bg-paper-dim px-[7px] py-px text-[12px] font-bold text-text-muted">{groupDigits(count)}</span>
      )}
      {action && href && <Link href={href} className="ml-auto text-[13px] font-semibold text-ink">{action}</Link>}
    </div>
  );
}

/** A round tinted icon (IconAvatar). */
export function IconAvatar({ icon, color, size = 34 }: { icon: ReactNode; color: string; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, color, backgroundColor: `color-mix(in srgb, ${color} 13%, transparent)` }}>
      {icon}
    </span>
  );
}

/** A one-line notice in a card (stock alert, money owed…). */
export function AlertCard({ icon, color, title, body, href }: {
  icon: ReactNode; color: string; title: string; body?: string; href?: string;
}) {
  return (
    <Card href={href}>
      <div className="flex items-center gap-2.5 py-2 pl-2.5 pr-2">
        <IconAvatar icon={icon} color={color} />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold text-text">{title}</p>
          {body && <p className="text-[12px] text-text-faint">{body}</p>}
        </div>
        {href && <ChevronRight size={20} className="shrink-0 text-text-faint" />}
      </div>
    </Card>
  );
}

/** A product or vehicle photo, or a quiet placeholder. */
export function Photo({ src, width, height, radius = 10, fallback }: {
  src?: string | null; width: number; height: number; radius?: number; fallback: ReactNode;
}) {
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden bg-paper-dim text-text-faint"
      style={{ width, height, borderRadius: radius }}>
      {src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
        : fallback}
    </span>
  );
}

/** A placeholder block for skeletons. */
export function Bone({ w, h = 10, r = 5, circle = false, className = "" }: { w?: number | string; h?: number; r?: number; circle?: boolean; className?: string }) {
  return <span className={`hgv-shimmer block ${className}`} style={{ width: circle ? h : w, height: h, borderRadius: circle ? "50%" : r }} />;
}

/** A small up/down change chip ("▲ 12% vs yesterday"). */
export function DeltaChip({ delta, suffix }: { delta: number; suffix: string }) {
  const up = delta >= 0;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${up ? "bg-success/10 text-success" : "bg-accent/10 text-accent-dark"}`}>
      {up ? "▲" : "▼"} {Math.abs(Math.round(delta))}% {suffix}
    </span>
  );
}

/** The app's bottom sheet: dims the page, slides up, drag handle, closes on
 *  tap outside or Escape. Sits above the tab bar and the phone's gesture bar
 *  (drawn on the page itself, so a sheet opened from the top bar isn't held
 *  under the tab bar). */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="hgv-sheet relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[20px] bg-white px-3.5 pb-[calc(20px+env(safe-area-inset-bottom))]">
        <div className="sticky top-0 flex justify-center bg-inherit pb-3 pt-2.5"><span className="h-1 w-8 rounded-full bg-border-strong" /></div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** A label and its value on one line (InfoRow). */
export function InfoRow({ label, value, color, strong }: { label: string; value: ReactNode; color?: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-text-muted">{label}</span>
      <span className={`text-right ${strong ? "font-extrabold" : "font-semibold"}`} style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

/** A thin progress bar. */
export function Meter({ value, color = "var(--color-success)", height = 5 }: { value: number; color?: string; height?: number }) {
  return (
    <div className="overflow-hidden rounded-full bg-paper-dim" style={{ height }}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: color }} />
    </div>
  );
}

/** The app's SegmentedButton. */
export function Segmented<V extends string | number>({ value, options, onChange }: {
  value: V; options: { value: V; label: string }[]; onChange: (v: V) => void;
}) {
  return (
    <div role="radiogroup" className="flex overflow-hidden rounded-full border border-border-strong">
      {options.map((o, i) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}
          className={`h-10 min-w-0 flex-1 truncate px-2 text-[14px] font-semibold ${i > 0 ? "border-l border-border-strong" : ""} ${
            o.value === value ? "bg-ink-soft text-ink" : "text-text"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The app's ChoiceChip. */
export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick}
      className={`h-8 shrink-0 rounded-lg border px-3 text-[14px] font-semibold ${selected ? "border-transparent bg-ink-soft text-ink" : "border-border-strong text-text"}`}>
      {children}
    </button>
  );
}

/** The app's floating "+ New …" button, above the tab bar. */
export function Fab({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href}
      className="fixed right-4 z-40 flex h-14 items-center gap-2 rounded-2xl bg-ink px-5 font-bold text-white shadow-[0_6px_16px_-4px_rgb(0_0_0_/_0.35)] active:scale-[0.97]"
      style={{ bottom: "calc(var(--hgv-tabbar, 0px) + 16px)" }}>
      <Plus size={22} /> {label}
    </Link>
  );
}

/** Nothing to show (or it failed): an icon, a sentence, maybe Retry. */
export function EmptyState({ icon, message, onRetry, retry }: { icon: ReactNode; message: string; onRetry?: () => void; retry?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-14 text-center">
      <span className="text-text-faint">{icon}</span>
      <p className="text-[15px] text-text-muted">{message}</p>
      {onRetry && <button type="button" onClick={onRetry} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white">{retry ?? "Retry"}</button>}
    </div>
  );
}

/** Rows loading (ListSkeleton). */
export function ListSkeleton({ count = 8, thumb = false }: { count?: number; thumb?: boolean }) {
  const widths = [150, 120, 170, 105, 140, 160, 115, 135];
  return (
    <div aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`flex items-center gap-4 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
          {thumb && <Bone w={52} h={40} r={8} />}
          <div className="flex-1"><Bone w={widths[i % 8]} h={12} /><Bone w={110} h={9} className="mt-2" /></div>
          <Bone w={72} h={12} />
        </div>
      ))}
    </div>
  );
}

/** Calls `onEnd` when this marker scrolls into view (load the next page). */
export function useEndOfList(onEnd: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onEnd);
  useEffect(() => { cb.current = onEnd; });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) cb.current(); }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}
