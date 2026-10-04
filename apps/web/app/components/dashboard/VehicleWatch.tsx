"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Car, CheckCircle, ChevronRight, Clock, FileWarning, Phone, ShieldAlert, User } from "lucide-react";
import { itemRequest } from "@/lib/product-api";
import { saleRequest } from "@/lib/sale-api";
import { partnerRequest } from "@/lib/supplier-api";
import { useLanguage } from "@/lib/language-context";
import { useAutoRefresh } from "@/lib/hooks";
import CircleStack from "@/app/components/ui/CircleStack";
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

// Up to ROWS cars show as full rows; beyond that a panel switches to a row of
// circles (up to STACK, then "+N"), so every panel keeps the same height.
const ROWS = 2;
const STACK = 8;
const KINDS: Kind[] = ["pending", "penalties", "incomplete"];
const PENDING_SCALE_DAYS = 30; // a pending ring is full after this many days

function fetchLists() {
  return Promise.allSettled(KINDS.map((k) =>
    itemRequest(`/products?page=1&limit=${STACK}&status=${k}`)
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

/** Clicking a car opens it on the Vehicles page with the matching action. */
const HREF: Record<Kind, (id: string) => string> = {
  pending:    (id) => `/items?open=${id}`,
  penalties:  (id) => `/items?open=${id}&do=fines`,
  incomplete: (id) => `/items?open=${id}&do=edit`,
};

/** One way to show a car in a panel: its ring, its details line, and an
 *  optional count badge on the circle. */
interface View { done: number; color: string; badge?: number; line: React.ReactNode; label: string }

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

  const pendingView = (c: WatchCar): View => {
    const a = parseAttributes(c.attributes);
    const days = daysSince(a.pending_since);
    const text = `${t("vehicle.pending_docs")}${days !== null ? ` · ${days} ${t("vehicle.days")}` : ""}`;
    return {
      done: Math.min(1, (days ?? 0) / PENDING_SCALE_DAYS), color: "var(--color-warning)",
      line: <span className="text-text-muted">{text}</span>, label: text,
    };
  };

  const finesView = (c: WatchCar): View => {
    const a = parseAttributes(c.attributes);
    const n = Number(a.penalty_count || 0);
    const checked = daysSince(a.penalty_checked);
    const stale = checked !== null && checked > PENALTY_RECHECK_DAYS;
    const fines = `${n} ${n === 1 ? t("vehicle.fine") : t("vehicle.fines")}${a.penalty_amount ? ` · ${Number(a.penalty_amount).toLocaleString()}` : ""}`;
    const when = checked === null ? "" : stale ? t("vehicle.recheck") : checked === 0 ? t("vehicle.today") : `${checked} ${t("vehicle.days_ago")}`;
    return {
      done: 1, color: "var(--color-accent)", badge: n, label: fines,
      line: <>
        <span className="font-semibold text-accent-dark">{fines}</span>
        {when && <span className={stale ? "font-semibold text-warning" : "text-text-faint"}> · {when}</span>}
      </>,
    };
  };

  const incompleteView = (c: WatchCar): View => {
    const a = parseAttributes(c.attributes);
    const miss = missingDetails(c, a, t);
    const done = Math.max(0, 1 - miss.length / checkedCount(a));
    return {
      done, color: done < 0.5 ? "var(--color-accent)" : "var(--color-warning)",
      label: `${t("vehicle.missing")}: ${miss.join(", ")}`,
      line: <span className="text-text-muted" title={miss.join(", ")}>{t("vehicle.missing")}: <span className="font-semibold text-accent-dark">{miss.join(", ")}</span></span>,
    };
  };

  // Gaps most incomplete cars share, shown under the circles.
  const tally = new Map<string, number>();
  lists.incomplete.items.forEach((c) => missingDetails(c, parseAttributes(c.attributes), t).forEach((m) => tally.set(m, (tally.get(m) ?? 0) + 1)));
  const common = [...tally.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);

  return (
    <section className="grid gap-3 lg:grid-cols-3">
      <Panel kind="pending" icon={<Clock size={14} className="text-warning" />} title={t("vehicle.watch_pending")}
        total={lists.pending.total} loading={loading} empty={t("vehicle.no_pending")}>
        <CarList kind="pending" cars={lists.pending.items} total={lists.pending.total} view={pendingView} />
      </Panel>

      <Panel kind="penalties" icon={<ShieldAlert size={14} className="text-accent" />} title={t("vehicle.watch_fines")}
        total={lists.penalties.total} loading={loading} empty={t("vehicle.no_cars_with_fines")}>
        <CarList kind="penalties" cars={lists.penalties.items} total={lists.penalties.total} view={finesView} />
      </Panel>

      <Panel kind="incomplete" icon={<FileWarning size={14} className="text-ink" />} title={t("vehicle.incomplete")}
        total={lists.incomplete.total} loading={loading} empty={t("vehicle.all_complete")}>
        {/* Always circles: the gaps are the point, not the car list. */}
        <CarList kind="incomplete" cars={lists.incomplete.items} total={lists.incomplete.total} view={incompleteView} circles
          footer={common.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {common.map(([label, n]) => (
                <span key={label} className="rounded-full border border-border bg-paper px-2 py-0.5 text-[11px] font-semibold text-text">
                  {label} <span className="text-accent-dark">×{n}</span>
                </span>
              ))}
            </div>
          )} />
      </Panel>
    </section>
  );
}

function Panel({ kind, icon, title, total, loading, empty, children }: {
  kind: Kind; icon: React.ReactNode; title: string; total: number; loading: boolean; empty: string; children: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col overflow-hidden rounded-data border border-border bg-white">
      <div className="flex items-center justify-between gap-2 px-3.5 pb-2 pt-3.5">
        <h2 className="flex min-w-0 items-center gap-2 font-display text-base font-semibold text-text">
          {icon} <span className="truncate">{title}</span>
          {total > 0 && <span className="hgv-stamp text-[11px] text-accent-dark border-accent/50">{total}</span>}
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
      ) : children}
    </div>
  );
}

/** A few cars as rows; more than ROWS (or `circles`) as overlapping circles
 *  with the hovered/focused car's details underneath. */
function CarList({ kind, cars, total, view, circles = false, footer }: {
  kind: Kind; cars: WatchCar[]; total: number; view: (c: WatchCar) => View; circles?: boolean; footer?: React.ReactNode;
}) {
  if (!circles && total <= ROWS) {
    return <div className="pb-1">{cars.map((c) => <Row key={c.id} car={c} line={view(c).line} href={HREF[kind](c.id)} />)}</div>;
  }
  const byId = new Map(cars.map((c) => [c.id, c]));
  return (
    <CircleStack
      items={cars.map((c) => {
        const v = view(c);
        return { id: c.id, href: HREF[kind](c.id), label: `${c.name}: ${v.label}`, done: v.done, color: v.color, thumb: c.thumbnail, badge: v.badge };
      })}
      extra={total - cars.length}
      extraHref={`/items?status=${kind}`}
      caption={(id) => { const c = byId.get(id)!; return <div className="-mx-3.5"><Row car={c} line={view(c).line} href={HREF[kind](c.id)} bare /></div>; }}
      footer={footer}
    />
  );
}

function Row({ car, line, href, bare = false }: { car: WatchCar; line: React.ReactNode; href: string; bare?: boolean }) {
  const { t } = useLanguage();
  const a = parseAttributes(car.attributes);
  const contact = car.contact;
  return (
    <div className={`${bare ? "" : "hgv-ledger-row "}flex items-center gap-2.5 px-3.5 py-2`}>
      {!bare && (
        <Link href={href} aria-label={car.name} className="flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-press bg-paper-dim hover:opacity-90">
          {car.thumbnail
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={car.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
            : <Car size={16} className="text-text-faint" />}
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <Link href={href} className="block truncate text-xs font-semibold text-text hover:text-ink hover:underline">
          {car.name}{a.plate_no && <span className="ml-1.5 font-mono font-medium text-text-muted">{a.plate_no}</span>}
        </Link>
        <p className="truncate text-xs">{line}</p>
        {contact !== undefined && (
          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-text">
            <User size={11} className="shrink-0 text-text-faint" />
            {contact && (contact.name || contact.phone) ? <>
              <span className="truncate font-semibold">{contact.name || "-"}</span>
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
