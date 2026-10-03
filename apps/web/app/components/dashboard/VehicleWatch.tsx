"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Car, CheckCircle, ChevronRight, Clock, FileWarning, Phone, ShieldAlert, User } from "lucide-react";
import { itemRequest } from "@/lib/product-api";
import { saleRequest } from "@/lib/sale-api";
import { partnerRequest } from "@/lib/supplier-api";
import { useLanguage } from "@/lib/language-context";
import { useAutoRefresh } from "@/lib/hooks";
import { daysSince, parseAttributes, PENALTY_RECHECK_DAYS, type Attributes } from "@/lib/business-layout";

interface WatchCar {
  id: string;
  name: string;
  thumbnail?: string | null;
  attributes?: string | null;
  /** Who to call about this car: the pending buyer, or whoever bought it. */
  contact?: Contact | null;
}
interface Contact { name: string; phone: string }
type Kind = "pending" | "penalties" | "incomplete";
type Lists = Record<Kind, { items: WatchCar[]; total: number }>;

const SHOWN = 5;
// Incomplete cars are drawn as a compact row of circles, so more fit.
const STACK = 8;
const KINDS: Kind[] = ["pending", "penalties", "incomplete"];

function fetchLists() {
  return Promise.allSettled(KINDS.map((k) =>
    itemRequest(`/products?page=1&limit=${k === "incomplete" ? STACK : SHOWN}&status=${k}`)
      .then(async (r) => {
        let items = (r?.data?.items ?? []) as WatchCar[];
        if (k !== "incomplete") items = await Promise.all(items.map(async (c) => ({ ...c, contact: await findContact(c) })));
        return { items, total: Number(r?.data?.total ?? 0) };
      })));
}

/** The buyer recorded on a pending car; otherwise the customer on the car's
 *  latest sale (a sold car with fines). Missing pieces just stay empty. */
async function findContact(c: WatchCar): Promise<Contact | null> {
  const a = parseAttributes(c.attributes);
  if (a.buyer_name || a.buyer_phone) return { name: a.buyer_name ?? "", phone: a.buyer_phone ?? "" };
  try {
    const sale = (await saleRequest(`/sales?page=1&limit=1&product_id=${encodeURIComponent(c.id)}`))?.data?.items?.[0];
    if (!sale?.customer_id) return null;
    const p = (await partnerRequest(`/suppliers/${encodeURIComponent(sale.customer_id)}`))?.data;
    return p ? { name: p.name ?? "", phone: p.phone ?? "" } : null;
  } catch { return null; }
}
const EMPTY: Lists = { pending: { items: [], total: 0 }, penalties: { items: [], total: 0 }, incomplete: { items: [], total: 0 } };

/** How many details a car is checked for (pending cars also need the buyer's phone and ID). */
const checkedCount = (a: Attributes) => (a.sale_status === "pending" ? 8 : 6);

/** What a car still lacks — mirrors the server's "incomplete" filter. */
function missingDetails(c: WatchCar, a: Attributes, t: (k: string) => string): string[] {
  const out: string[] = [];
  if (!a.plate_no) out.push(t("vehicle.plate_no"));
  if (!a.chassis_no) out.push(t("vehicle.chassis_no"));
  if (!a.car_type) out.push(t("vehicle.car_type"));
  if (!a.year) out.push(t("vehicle.year"));
  if (!a.color) out.push(t("vehicle.color"));
  if (!c.thumbnail) out.push(t("vehicle.image"));
  if (a.sale_status === "pending") {
    if (!a.buyer_phone) out.push(t("vehicle.buyer_phone"));
    if (!a.buyer_id_no) out.push(t("vehicle.buyer_id"));
  }
  return out;
}

/** Car companies' home: the cars that need someone's attention today —
 *  reserved for a buyer, carrying traffic fines, or missing details. */
export default function VehicleWatch() {
  const { t } = useLanguage();
  const [lists, setLists] = useState<Lists>(EMPTY);
  const [loading, setLoading] = useState(true);

  // Keep the last good list for a kind if its refresh fails.
  const apply = useCallback((res: PromiseSettledResult<{ items: WatchCar[]; total: number }>[]) => {
    setLists((prev) => {
      const next = { ...prev };
      res.forEach((r, i) => { if (r.status === "fulfilled") next[KINDS[i]] = r.value; });
      return next;
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchLists().then((res) => { if (alive) apply(res); });
    return () => { alive = false; };
  }, [apply]);
  useAutoRefresh(() => { fetchLists().then(apply); });

  return (
    <section className="grid gap-3 lg:grid-cols-3">
      <Panel kind="pending" icon={<Clock size={14} className="text-warning" />} title={t("vehicle.watch_pending")}
        total={lists.pending.total} loading={loading} empty={t("vehicle.no_pending")}>
        {lists.pending.items.map((c) => {
          const a = parseAttributes(c.attributes);
          const days = daysSince(a.pending_since);
          return (
            <Row key={c.id} car={c} a={a}
              line={<span className="text-text-muted">{t("vehicle.pending_docs")}{days !== null && <> · {days} {t("vehicle.days")}</>}</span>} />
          );
        })}
      </Panel>

      <Panel kind="penalties" icon={<ShieldAlert size={14} className="text-accent" />} title={t("vehicle.watch_fines")}
        total={lists.penalties.total} loading={loading} empty={t("vehicle.no_cars_with_fines")}>
        {lists.penalties.items.map((c) => {
          const a = parseAttributes(c.attributes);
          const n = Number(a.penalty_count || 0);
          const checked = daysSince(a.penalty_checked);
          const stale = checked !== null && checked > PENALTY_RECHECK_DAYS;
          return (
            <Row key={c.id} car={c} a={a}
              line={<>
                <span className="font-semibold text-accent-dark">
                  {n} {n === 1 ? t("vehicle.fine") : t("vehicle.fines")}{a.penalty_amount ? ` · ${Number(a.penalty_amount).toLocaleString()}` : ""}
                </span>
                {checked !== null && (
                  <span className={stale ? "font-semibold text-warning" : "text-text-faint"}>
                    {" · "}{stale ? t("vehicle.recheck") : checked === 0 ? t("vehicle.today") : `${checked} ${t("vehicle.days_ago")}`}
                  </span>
                )}
              </>} />
          );
        })}
      </Panel>

      <Panel kind="incomplete" icon={<FileWarning size={14} className="text-ink" />} title={t("vehicle.incomplete")}
        total={lists.incomplete.total} loading={loading} empty={t("vehicle.all_complete")} moreLink={false}>
        <IncompleteStack cars={lists.incomplete.items} total={lists.incomplete.total} />
      </Panel>
    </section>
  );
}

function Panel({ kind, icon, title, total, loading, empty, children, moreLink = true }: {
  kind: Kind; icon: React.ReactNode; title: string; total: number; loading: boolean; empty: string; children: React.ReactNode;
  moreLink?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col overflow-hidden rounded-data border border-border bg-white">
      <div className="flex items-center justify-between gap-2 px-3.5 pb-2 pt-3.5">
        <h2 className="flex min-w-0 items-center gap-2 font-display text-base font-semibold text-text">
          {icon} <span className="truncate">{title}</span>
          {total > 0 && <span className="hgv-stamp text-[9px] text-accent-dark border-accent/50">{total}</span>}
        </h2>
        <Link href={`/items?status=${kind}`} className="flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-ink hover:text-ink-dark">
          {t("dash.view_all")} <ChevronRight size={12} />
        </Link>
      </div>
      {loading ? (
        <div className="space-y-2 px-3.5 pb-3.5">
          {[0, 1, 2].map((i) => <div key={i} className="h-11 animate-pulse rounded-press bg-paper-dim" />)}
        </div>
      ) : total === 0 ? (
        <div className="flex items-center gap-2.5 px-3.5 pb-4 pt-1">
          <CheckCircle size={16} className="text-success" />
          <p className="text-xs font-semibold text-text">{empty}</p>
        </div>
      ) : (
        <div className="pb-1">
          {children}
          {moreLink && total > SHOWN && (
            <Link href={`/items?status=${kind}`} className="block px-3.5 py-2 text-xs font-semibold text-ink hover:bg-paper-dim">
              +{total - SHOWN} {t("vehicle.more")}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ car, a, line }: { car: WatchCar; a: Attributes; line: React.ReactNode }) {
  const { t } = useLanguage();
  const contact = car.contact;
  return (
    <div className="hgv-ledger-row flex items-center gap-2.5 px-3.5 py-2">
      <div className="flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-press bg-paper-dim">
        {car.thumbnail
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={car.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
          : <Car size={16} className="text-text-faint" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-text">
          {car.name}{a.plate_no && <span className="ml-1.5 font-mono font-medium text-text-muted">{a.plate_no}</span>}
        </p>
        <p className="truncate text-xs">{line}</p>
        {contact !== undefined && (
          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-text">
            <User size={11} className="shrink-0 text-text-faint" />
            {contact && (contact.name || contact.phone) ? <>
              <span className="truncate font-semibold">{contact.name || "—"}</span>
              {contact.phone && <span className="shrink-0 font-mono text-text-muted">· {contact.phone}</span>}
            </> : <span className="text-text-faint">{t("vehicle.no_customer")}</span>}
          </p>
        )}
      </div>
      {contact?.phone && (
        <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} title={`${t("vehicle.call")} ${contact.name} ${contact.phone}`}
          className="flex shrink-0 items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink-dark">
          <Phone size={12} /> {t("vehicle.call")}
        </a>
      )}
    </div>
  );
}

/** Incomplete cars as overlapping circles: each photo sits inside a ring
 *  that fills with how complete the car's details are. Hover or focus a
 *  circle for what's missing; below, the gaps most cars share. */
function IncompleteStack({ cars, total }: { cars: WatchCar[]; total: number }) {
  const { t } = useLanguage();
  const [active, setActive] = useState<string | null>(null);
  const rows = cars.map((c) => {
    const a = parseAttributes(c.attributes);
    const miss = missingDetails(c, a, t);
    return { c, miss, done: Math.max(0, 1 - miss.length / checkedCount(a)) };
  });
  const tally = new Map<string, number>();
  rows.forEach((r) => r.miss.forEach((m) => tally.set(m, (tally.get(m) ?? 0) + 1)));
  const common = [...tally.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
  const shown = rows.find((r) => r.c.id === active) ?? rows[0];
  const extra = total - rows.length;

  return (
    <div className="px-3.5 pb-3">
      <div className="flex items-center pl-1.5 pt-1" onMouseLeave={() => setActive(null)}>
        {rows.map((r, i) => (
          <Link key={r.c.id} href="/items?status=incomplete" aria-label={`${r.c.name}: ${t("vehicle.missing")} ${r.miss.join(", ")}`}
            onMouseEnter={() => setActive(r.c.id)} onFocus={() => setActive(r.c.id)}
            className={`relative -ml-2.5 first:ml-0 rounded-full transition-transform hover:z-20 hover:-translate-y-0.5 focus:z-20 focus:outline-none ${shown?.c.id === r.c.id ? "z-10" : ""}`}
            style={{ zIndex: shown?.c.id === r.c.id ? 15 : rows.length - i }}>
            <Ring done={r.done} thumb={r.c.thumbnail} />
          </Link>
        ))}
        {extra > 0 && (
          <Link href="/items?status=incomplete"
            className="relative -ml-2.5 flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-paper-dim text-xs font-bold text-text hover:bg-paper-deep">
            +{extra}
          </Link>
        )}
      </div>

      {shown && (
        <div className="mt-2.5 min-w-0">
          <p className="truncate text-xs font-semibold text-text">
            {shown.c.name}{(() => { const pl = parseAttributes(shown.c.attributes).plate_no; return pl ? <span className="ml-1.5 font-mono font-medium text-text-muted">{pl}</span> : null; })()}
          </p>
          <p className="truncate text-xs text-text-muted" title={shown.miss.join(", ")}>
            {t("vehicle.missing")}: <span className="font-semibold text-accent-dark">{shown.miss.join(", ")}</span>
          </p>
        </div>
      )}

      {common.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {common.map(([label, n]) => (
            <span key={label} className="rounded-full border border-border bg-paper px-2 py-0.5 text-[11px] font-semibold text-text">
              {label} <span className="text-accent-dark">×{n}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** A car photo nested in a completion ring (red under half done, amber after). */
function Ring({ done, thumb }: { done: number; thumb?: string | null }) {
  const R = 20, C = 2 * Math.PI * R;
  const color = done < 0.5 ? "var(--color-accent)" : "var(--color-warning)";
  return (
    <span className="relative block h-11 w-11 rounded-full bg-white">
      <svg viewBox="0 0 44 44" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="22" cy="22" r={R} fill="none" stroke="var(--color-border)" strokeWidth="3" />
        <circle cx="22" cy="22" r={R} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={`${C * done} ${C}`} />
      </svg>
      <span className="absolute inset-[5px] flex items-center justify-center overflow-hidden rounded-full bg-paper-dim">
        {thumb
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
          : <Car size={15} className="text-text-faint" />}
      </span>
    </span>
  );
}
