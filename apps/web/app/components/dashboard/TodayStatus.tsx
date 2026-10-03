"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Car } from "lucide-react";
import { itemRequest } from "@/lib/product-api";
import { useLanguage } from "@/lib/language-context";
import { useAutoRefresh } from "@/lib/hooks";
import { parseAttributes } from "@/lib/business-layout";

interface CarRow { id: string; name: string; thumbnail?: string | null; attributes?: string | null; created_at?: string | null }
type Kind = "added" | "fines" | "pending";
interface Entry { key: string; kind: Kind; car: CarRow; day: string; detail?: string }

const DAYS = 3;
const MAX_SHOWN = 12;

// Status dates are written as UTC calendar days (VehicleGrid `today()`), and
// created_at is a UTC timestamp — so compare everything on the UTC day.
const utcDayOffset = (offset: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - offset); return d.toISOString().slice(0, 10); };
const utcDay = (ts?: string | null) => {
  if (!ts) return "";
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts}Z`);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

const COLOR: Record<Kind, string> = {
  added: "var(--color-success)",
  fines: "var(--color-accent)",
  pending: "var(--color-warning)",
};
const HREF: Record<Kind, (id: string) => string> = {
  added: (id) => `/items?open=${id}`,
  fines: (id) => `/items?open=${id}&do=fines`,
  pending: (id) => `/items?open=${id}`,
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
    if (window.has(day)) out.push({ key: `a-${c.id}`, kind: "added", car: c, day });
  }
  for (const c of list(fines)) {
    const a = parseAttributes(c.attributes);
    const n = Number(a.penalty_count || 0);
    if (n > 0 && a.penalty_checked && window.has(a.penalty_checked)) out.push({ key: `f-${c.id}`, kind: "fines", car: c, day: a.penalty_checked, detail: String(n) });
  }
  for (const c of list(pending)) {
    const a = parseAttributes(c.attributes);
    if (a.pending_since && window.has(a.pending_since)) out.push({ key: `p-${c.id}`, kind: "pending", car: c, day: a.pending_since, detail: a.buyer_name });
  }
  return out.sort((x, y) => y.day.localeCompare(x.day));
}

/** Car companies: what changed in the last three days — cars added, fines
 *  found, cars put on pending — as a centred row of photo circles. */
export default function TodayStatus() {
  const { t } = useLanguage();
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadEntries().then((e) => { if (alive) setEntries(e); }).catch(() => { if (alive) setEntries([]); });
    return () => { alive = false; };
  }, []);
  useAutoRefresh(useCallback(() => { loadEntries().then(setEntries).catch(() => {}); }, []));

  const when = (day: string) => {
    if (day === utcDayOffset(0)) return t("dash.day_today");
    if (day === utcDayOffset(1)) return t("dash.day_yesterday");
    return t("dash.days_ago_n").replace("{n}", "2");
  };
  const kindLabel: Record<Kind, string> = {
    added: t("dash.recent_added"), fines: t("dash.recent_fines"), pending: t("dash.recent_pending"),
  };
  const count = (k: Kind) => entries?.filter((e) => e.kind === k).length ?? 0;
  const shown = entries?.slice(0, MAX_SHOWN) ?? [];
  const extra = (entries?.length ?? 0) - shown.length;

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
        <div className="mt-4 flex justify-center gap-5">
          {[0, 1, 2].map((i) => <div key={i} className="h-12 w-12 animate-pulse rounded-full bg-paper-dim" />)}
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-3 text-center text-sm text-text-muted">{t("dash.recent_nothing")}</p>
      ) : (
        <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-4">
          {shown.map((e) => {
            const line = e.kind === "fines" ? `${e.detail} ${Number(e.detail) === 1 ? t("vehicle.fine") : t("vehicle.fines")}`
              : e.kind === "pending" && e.detail ? e.detail : kindLabel[e.kind];
            return (
              <Link key={e.key} href={HREF[e.kind](e.car.id)} title={`${e.car.name} — ${line}, ${when(e.day)}`}
                className="group flex w-[88px] flex-col items-center text-center">
                <span className="block h-12 w-12 rounded-full p-[2px] transition-shadow group-hover:shadow-[0_0_0_3px_rgb(0_0_0_/_0.06)]" style={{ background: COLOR[e.kind] }}>
                  <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-white bg-paper-dim">
                    {e.car.thumbnail
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={e.car.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
                      : <Car size={16} className="text-text-faint" />}
                  </span>
                </span>
                <span className="mt-1.5 w-full truncate text-[11px] font-semibold leading-tight text-text group-hover:text-ink">{e.car.name}</span>
                <span className="w-full truncate text-[10px] leading-tight text-text-muted">{line}</span>
                <span className="w-full truncate text-[10px] leading-tight text-text-faint">{when(e.day)}</span>
              </Link>
            );
          })}
          {extra > 0 && (
            <Link href="/items" className="flex w-[88px] flex-col items-center text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-paper text-xs font-semibold text-text">+{extra}</span>
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
