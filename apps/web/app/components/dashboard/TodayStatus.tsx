"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Car, Images, Sparkles, TriangleAlert, Clock, X } from "lucide-react";
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
export default function TodayStatus({ leading }: {
  /** Shown first in the top band, at its own width (the stories tray); the
   *  "last 3 days" counters take whatever room is left, so the band is never
   *  half empty however many stories there are. */
  leading?: ReactNode;
}) {
  const { t } = useLanguage();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  // Sharp covers (the list only carries a small thumbnail).
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<CarRow | null>(null);
  // A counter, once tapped, shows only those cards.
  const [filter, setFilter] = useState<Kind | null>(null);
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
  const visible = (entries ?? []).filter((e) => !filter || e.kind === filter);
  const shown = visible.slice(0, MAX_SHOWN);
  const extra = visible.length - shown.length;
  // Sharp photos for the cards and the counters' little faces (max 30).
  const shownIds = [...new Set([...shown, ...(entries ?? [])].map((e) => e.car.id))].slice(0, 30).join(",");
  useEffect(() => {
    if (!shownIds) return;
    let alive = true;
    itemRequest(`/products/covers?ids=${shownIds}&size=640`)
      .then((r) => { if (alive && r?.data) setCovers((c) => ({ ...c, ...r.data })); })
      .catch(() => {});
    return () => { alive = false; };
  }, [shownIds]);

  const TILE: Record<Kind, { icon: typeof Car; tone: string }> = {
    added: { icon: Sparkles, tone: "bg-emerald-50 text-emerald-700" },
    fines: { icon: TriangleAlert, tone: "bg-red-50 text-red-700" },
    pending: { icon: Clock, tone: "bg-amber-50 text-amber-700" },
  };

  return (
    <div className="space-y-3">
      {/* ── Top band: stories at their own width, counters fill the rest ── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
        {leading && <div className="min-w-0 max-w-full shrink-0 empty:hidden lg:max-w-[58%]">{leading}</div>}
        <section aria-label={t("dash.last_3_days")} className="flex min-w-0 flex-1 flex-col rounded-xl border border-border bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">{t("dash.last_3_days")}</h2>
            {filter && (
              <button type="button" onClick={() => setFilter(null)} className="flex items-center gap-1 text-xs font-semibold text-ink hover:underline">
                <X size={12} /> {t("dash.show_all_recent")}
              </button>
            )}
          </div>
          <div className="grid flex-1 grid-cols-3 gap-2">
            {(["added", "pending", "fines"] as Kind[]).map((k) => {
              const n = count(k);
              const { icon: Icon, tone } = TILE[k];
              const ofKind = (entries ?? []).filter((e) => e.kind === k);
              const faces = ofKind.slice(0, 3);
              const active = filter === k;
              return (
                <button key={k} type="button" disabled={!entries || n === 0} aria-pressed={active}
                  onClick={() => setFilter(active ? null : k)}
                  className={`flex min-h-[96px] min-w-0 flex-col justify-start rounded-lg border p-2.5 text-left transition sm:p-3 disabled:cursor-default ${active ? "border-ink ring-2 ring-ink/20" : "border-border hover:border-border-strong hover:bg-paper"} disabled:hover:border-border disabled:hover:bg-white`}>
                  <span className="flex items-start justify-between gap-2">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full ${tone}`}><Icon size={15} /></span>
                    {/* Who it is: up to three photos of those cars */}
                    {faces.length > 0 && (
                      <span className="hidden -space-x-2 sm:flex">
                        {faces.map((e) => {
                          const src = covers[e.car.id] || e.car.thumbnail;
                          return src
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img key={e.key} src={src} alt="" className="h-7 w-7 rounded-full border-2 border-white object-cover" />
                            : <span key={e.key} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-paper-dim"><Car size={12} className="text-text-faint" /></span>;
                        })}
                      </span>
                    )}
                  </span>
                  <span className="mt-2 block min-w-0">
                    <span className="hgv-figure block text-2xl font-bold leading-none text-text">{entries ? n : "–"}</span>
                    <span className="mt-1 block truncate text-xs text-text-muted">{kindLabel[k]}</span>
                    {/* Which cars, on wide screens: the tile's spare room put to use */}
                    {ofKind.length > 0 && (
                      <span className="mt-2 hidden space-y-0.5 border-t border-border pt-2 lg:block">
                        {ofKind.slice(0, 2).map((e) => {
                          const plate = parseAttributes(e.car.attributes).plate_no;
                          return <span key={e.key} className="block truncate text-[11px] text-text-faint">{e.car.name}{plate ? ` · ${plate}` : ""}</span>;
                        })}
                        {ofKind.length > 2 && <span className="block text-[11px] font-medium text-text-muted">{t("dash.n_more").replace("{n}", String(ofKind.length - 2))}</span>}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

    <section className={`rounded-xl border border-border bg-white px-3 py-3 ${entries && entries.length === 0 ? "hidden" : ""}`}>
      {entries === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-[230px] animate-pulse rounded-xl bg-paper-dim" />)}
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-3 text-center text-sm text-text-muted">{t("dash.recent_nothing")}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
    </section>
      {open && <CarQuickView productId={open.id} cover={covers[open.id] || open.thumbnail} onClose={() => setOpen(null)} />}
    </div>
  );
}
