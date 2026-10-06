"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Car, Images } from "lucide-react";
import CarQuickView from "@/app/components/items/CarQuickView";
import { itemRequest } from "@/lib/product-api";
import { useLanguage } from "@/lib/language-context";
import { useAutoRefresh } from "@/lib/hooks";
import { carTypeLabel, parseAttributes } from "@/lib/business-layout";

interface CarRow { id: string; name: string; thumbnail?: string | null; attributes?: string | null; created_at?: string | null; selling_price?: number | null }
type Kind = "added" | "fines" | "pending";
/** `day` is the UTC calendar day; `at` the exact time when it's known. */
interface Entry { key: string; kind: Kind; car: CarRow; day: string; at?: string; detail?: string }

const DAYS = 3;
const MAX_SHOWN = 8;

// Status dates are written as UTC calendar days (VehicleGrid `today()`), and
// created_at is a UTC timestamp — so compare everything on the UTC day.
const utcDayOffset = (offset: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - offset); return d.toISOString().slice(0, 10); };
/** A UTC timestamp as ISO (the API sends some without a zone). */
const toIso = (ts?: string | null) => {
  if (!ts) return "";
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts}Z`);
  return isNaN(d.getTime()) ? "" : d.toISOString();
};
const utcDay = (ts?: string | null) => toIso(ts).slice(0, 10);

const COLOR: Record<Kind, string> = {
  added: "var(--color-success)",
  fines: "var(--color-accent)",
  pending: "var(--color-warning)",
};
const BADGE: Record<Kind, string> = {
  added: "bg-emerald-600", fines: "bg-red-600", pending: "bg-amber-500",
};

async function loadEntries(): Promise<Entry[]> {
  const window = new Set(Array.from({ length: DAYS }, (_, i) => utcDayOffset(i)));
  const [latest, fines, pending] = await Promise.allSettled([
    itemRequest("/products?page=1&limit=100"), // newest first
    itemRequest("/products?page=1&limit=300&status=penalties"),
    itemRequest("/products?page=1&limit=300&status=pending"),
  ]);
  const list = (r: PromiseSettledResult<{ data?: { items?: CarRow[] } }>) => (r.status === "fulfilled" ? r.value?.data?.items ?? [] : []);
  const out: Entry[] = [];
  for (const c of list(latest)) {
    const day = utcDay(c.created_at);
    if (window.has(day)) out.push({ key: `a-${c.id}`, kind: "added", car: c, day, at: toIso(c.created_at) });
  }
  for (const c of list(fines)) {
    const a = parseAttributes(c.attributes);
    const n = Number(a.penalty_count || 0);
    if (n > 0 && a.penalty_checked && window.has(a.penalty_checked)) {
      // The exact time is only meaningful when it was saved on the check day.
      const at = utcDay(a.penalty_saved_at) === a.penalty_checked ? toIso(a.penalty_saved_at) : undefined;
      out.push({ key: `f-${c.id}`, kind: "fines", car: c, day: a.penalty_checked, at, detail: String(n) });
    }
  }
  for (const c of list(pending)) {
    const a = parseAttributes(c.attributes);
    if (a.pending_since && window.has(a.pending_since)) {
      const at = utcDay(a.pending_at) === a.pending_since ? toIso(a.pending_at) : undefined;
      out.push({ key: `p-${c.id}`, kind: "pending", car: c, day: a.pending_since, at, detail: a.buyer_name });
    }
  }
  // What needs action (fines, then pending) before new arrivals, so it never
  // hides behind "+N"; newest first within each.
  const rank: Record<Kind, number> = { fines: 0, pending: 1, added: 2 };
  return out.sort((x, y) => rank[x.kind] - rank[y.kind] || (y.at || y.day).localeCompare(x.at || x.day));
}

/** Car companies: what changed in the last three days — cars added, fines
 *  found, cars put on pending — as listing cards (sharp photo, price, specs,
 *  chassis and plate, what happened and when). A card opens the car's quick
 *  view: every photo and every detail. Eight, then "+N". */
export default function TodayStatus() {
  const { t } = useLanguage();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  // Sharp covers (the list only carries a small thumbnail).
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<CarRow | null>(null);
  // Ticks so "Now" / "10 min ago" stay true while the page is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    loadEntries().then((e) => { if (alive) setEntries(e); }).catch(() => { if (alive) setEntries([]); });
    return () => { alive = false; };
  }, []);
  useAutoRefresh(useCallback(() => { loadEntries().then(setEntries).catch(() => {}); }, []));

  // "Now", "10 min ago", "3 h ago", "1 day ago", "3 days ago". Older records
  // only have a date, so the same day reads "Today".
  const when = (e: Entry) => {
    const days = (n: number) => (n === 1 ? t("dash.time_day") : t("dash.days_ago_n").replace("{n}", String(n)));
    if (e.at) {
      const s = Math.max(0, (now - new Date(e.at).getTime()) / 1000);
      if (s < 60) return t("dash.time_now");
      if (s < 3600) return t("dash.time_min").replace("{n}", String(Math.floor(s / 60)));
      if (s < 86400) return t("dash.time_hour").replace("{n}", String(Math.floor(s / 3600)));
      return days(Math.floor(s / 86400));
    }
    const today = new Date(now).toISOString().slice(0, 10);
    const n = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${e.day}T00:00:00Z`)) / 86_400_000);
    return n <= 0 ? t("dash.day_today") : days(n);
  };
  const kindLabel: Record<Kind, string> = {
    added: t("dash.recent_added"), fines: t("dash.recent_fines"), pending: t("dash.recent_pending"),
  };
  const count = (k: Kind) => entries?.filter((e) => e.kind === k).length ?? 0;
  const shown = entries?.slice(0, MAX_SHOWN) ?? [];
  const extra = (entries?.length ?? 0) - shown.length;
  const shownIds = [...new Set(shown.map((e) => e.car.id))].join(",");
  useEffect(() => {
    if (!shownIds) return;
    let alive = true;
    itemRequest(`/products/covers?ids=${shownIds}&size=640`)
      .then((r) => { if (alive && r?.data) setCovers((c) => ({ ...c, ...r.data })); })
      .catch(() => {});
    return () => { alive = false; };
  }, [shownIds]);

  return (
    <section className="rounded-data border border-border bg-white px-4 py-4">
      <div className="text-center">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">{t("dash.last_3_days")}</h2>
        <p className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-text-muted">
          {(["added", "fines", "pending"] as Kind[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: COLOR[k] }} />
              <span className="hgv-figure font-semibold text-text">{entries ? count(k) : "–"}</span> {kindLabel[k]}
            </span>
          ))}
        </p>
      </div>

      {entries === null ? (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-[230px] animate-pulse rounded-xl bg-paper-dim" />)}
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-3 text-center text-sm text-text-muted">{t("dash.recent_nothing")}</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {shown.map((e) => {
            const a = parseAttributes(e.car.attributes);
            const fineText = `${e.detail} ${Number(e.detail) === 1 ? t("vehicle.fine") : t("vehicle.fines")}`;
            const event = e.kind === "fines"
              ? `${fineText}${a.penalty_amount ? ` · ${Number(a.penalty_amount).toLocaleString()} RWF` : ""}`
              : e.kind === "pending" ? `${kindLabel.pending}${e.detail ? ` · ${e.detail}` : ""}` : kindLabel.added;
            const specs = [a.year, a.car_type && carTypeLabel(t, a.car_type), a.color, a.battery_range && `${a.battery_range} km`].filter(Boolean).join(" · ");
            const photo = covers[e.car.id] || e.car.thumbnail;
            return (
              <button key={e.key} type="button" onClick={() => setOpen(e.car)} title={`${e.car.name} · ${event}, ${when(e)}`}
                className="group overflow-hidden rounded-xl border border-border bg-white text-left transition hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_10px_24px_-14px_rgb(0_0_0_/_0.45)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink">
                <span className="relative block aspect-[16/10] w-full bg-paper-dim overflow-hidden">
                  {photo
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={photo} alt={e.car.name} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                    : <span className="flex h-full w-full items-center justify-center"><Car size={28} className="text-text-faint" /></span>}
                  {/* What happened, as a badge on the photo */}
                  <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold text-white shadow ${BADGE[e.kind]}`}>
                    {e.kind === "fines" ? fineText : kindLabel[e.kind]}
                  </span>
                  <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100" aria-hidden>
                    <Images size={14} />
                  </span>
                  <span className="absolute left-2 bottom-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">{when(e)}</span>
                </span>
                <span className="block p-3">
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-text group-hover:text-ink">{e.car.name}</span>
                    {e.car.selling_price ? <span className="shrink-0 text-sm font-bold tabular-nums text-text">{Math.round(e.car.selling_price).toLocaleString()}</span> : null}
                  </span>
                  {specs && <span className="mt-0.5 block truncate text-xs text-text-muted">{specs}</span>}
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {a.plate_no && <span className="rounded border border-border bg-paper px-1.5 py-0.5 font-mono text-[11px] tracking-wide text-text">{a.plate_no}</span>}
                    {a.chassis_no && <span className="max-w-full truncate rounded border border-border bg-paper px-1.5 py-0.5 font-mono text-[11px] tracking-wide text-text-muted">{a.chassis_no}</span>}
                  </span>
                  <span className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
                    <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: COLOR[e.kind] }} />
                    <span className="truncate">{event}</span>
                  </span>
                </span>
              </button>
            );
          })}
          {extra > 0 && (
            <Link href="/items" title={`+${extra}`}
              className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-paper text-text transition hover:border-ink hover:text-ink">
              <span className="font-display text-2xl font-semibold">+{extra}</span>
              <span className="text-xs text-text-muted">{t("dash.view_all")}</span>
            </Link>
          )}
        </div>
      )}
      {open && <CarQuickView productId={open.id} cover={covers[open.id] || open.thumbnail} onClose={() => setOpen(null)} />}
    </section>
  );
}
