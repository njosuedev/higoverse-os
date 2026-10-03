"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Car, Clock, Plus, ShieldAlert, Sparkles } from "lucide-react";
import { itemRequest } from "@/lib/product-api";
import { useLanguage } from "@/lib/language-context";
import { useAutoRefresh } from "@/lib/hooks";
import { parseAttributes } from "@/lib/business-layout";

interface Car { id: string; name: string; thumbnail?: string | null; attributes?: string | null; created_at?: string | null }
type Kind = "new" | "fine" | "pending";
interface Story { key: string; kind: Kind; car: Car; note: string }

// Status dates are written as UTC calendar days (see VehicleGrid `today()`),
// and created_at is a UTC timestamp — compare everything on the UTC day.
const utcToday = () => new Date().toISOString().slice(0, 10);
const utcDay = (ts?: string | null) => {
  if (!ts) return "";
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts}Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

const KIND: Record<Kind, { ring: string; icon: React.ReactNode; badge: string; href: (id: string) => string }> = {
  new:     { ring: "var(--color-success)", icon: <Plus size={10} strokeWidth={3} />,  badge: "bg-success",  href: (id) => `/items?open=${id}` },
  fine:    { ring: "var(--color-accent)",  icon: <ShieldAlert size={10} />,           badge: "bg-accent",   href: (id) => `/items?open=${id}&do=fines` },
  pending: { ring: "var(--color-warning)", icon: <Clock size={10} />,                 badge: "bg-warning",  href: (id) => `/items?open=${id}` },
};

async function loadStories(t: (k: string) => string): Promise<Story[]> {
  const today = utcToday();
  const [latest, fines, pending] = await Promise.allSettled([
    itemRequest("/products?page=1&limit=50"), // newest first
    itemRequest("/products?page=1&limit=200&status=penalties"),
    itemRequest("/products?page=1&limit=200&status=pending"),
  ]);
  const list = (r: PromiseSettledResult<{ data?: { items?: Car[] } }>) => (r.status === "fulfilled" ? r.value?.data?.items ?? [] : []);
  const out: Story[] = [];
  for (const c of list(pending)) {
    const a = parseAttributes(c.attributes);
    if (a.pending_since === today) out.push({ key: `p-${c.id}`, kind: "pending", car: c, note: a.buyer_name || t("vehicle.status_pending") });
  }
  for (const c of list(fines)) {
    const a = parseAttributes(c.attributes);
    const n = Number(a.penalty_count || 0);
    if (a.penalty_checked === today && n > 0) out.push({ key: `f-${c.id}`, kind: "fine", car: c, note: `${n} ${n === 1 ? t("vehicle.fine") : t("vehicle.fines")}` });
  }
  for (const c of list(latest)) {
    if (utcDay(c.created_at) === today) out.push({ key: `n-${c.id}`, kind: "new", car: c, note: t("dash.today_new_car") });
  }
  return out;
}

/** Car companies: today's changes as status-style circles — cars added,
 *  fines found and cars put on pending. Tap one to open that car. */
export default function TodayStatus() {
  const { t } = useLanguage();
  const [stories, setStories] = useState<Story[] | null>(null);
  const load = useCallback(() => loadStories(t), [t]);

  useEffect(() => {
    let alive = true;
    load().then((s) => { if (alive) setStories(s); }).catch(() => { if (alive) setStories([]); });
    return () => { alive = false; };
  }, [load]);
  useAutoRefresh(() => { load().then(setStories).catch(() => {}); });

  const count = (k: Kind) => stories?.filter((s) => s.kind === k).length ?? 0;
  const chips: { kind: Kind; label: string }[] = [
    { kind: "new", label: t("dash.today_new_cars") },
    { kind: "fine", label: t("dash.today_new_fines") },
    { kind: "pending", label: t("dash.today_new_pending") },
  ];

  return (
    <section className="rounded-data border border-border bg-white px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 className="flex items-center gap-1.5 font-display text-base font-semibold text-text">
          <Sparkles size={14} className="text-ink" /> {t("dash.today")}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span key={c.kind} className="flex items-center gap-1.5 rounded-full border border-border bg-paper px-2.5 py-0.5 text-xs font-semibold text-text">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: KIND[c.kind].ring }} />
              <span className="hgv-figure">{stories ? count(c.kind) : "…"}</span> {c.label}
            </span>
          ))}
        </div>
      </div>

      {stories === null ? (
        <div className="mt-3 flex gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 w-14 animate-pulse rounded-full bg-paper-dim" />)}</div>
      ) : stories.length === 0 ? (
        <p className="mt-2 text-sm text-text-muted">{t("dash.today_nothing")}</p>
      ) : (
        <div className="hgv-nav-scroll mt-3 flex gap-3 overflow-x-auto pb-1">
          {stories.map((s) => {
            const k = KIND[s.kind];
            return (
              <Link key={s.key} href={k.href(s.car.id)} title={`${s.car.name} · ${s.note}`}
                className="group flex w-[76px] shrink-0 flex-col items-center gap-1 text-center">
                <span className="relative block h-14 w-14 rounded-full p-[3px] transition-transform group-hover:-translate-y-0.5" style={{ background: k.ring }}>
                  <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-white bg-paper-dim">
                    {s.car.thumbnail
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={s.car.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
                      : <Car size={18} className="text-text-faint" />}
                  </span>
                  <span className={`absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white text-white ${k.badge}`}>{k.icon}</span>
                </span>
                <span className="w-full truncate text-[11px] font-semibold leading-tight text-text">{s.car.name}</span>
                <span className="-mt-0.5 w-full truncate text-[10px] leading-tight text-text-muted">{s.note}</span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
