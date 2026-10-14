"use client";

// Home on a phone: the Android app's Home (apps/mobile/lib/src/screens/
// dashboard_screen.dart), block for block — stories, who is active now,
// today against yesterday with the week as bars, four status tiles (car
// dealers: available, pending transfer, fines, sold), stock alerts, new
// arrivals, money owed, top sellers and the latest sales. Refreshed every
// minute, and when the tab comes back to the screen.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, CheckCircle2, Clock3, CloudOff, Inbox, Receipt, ShieldAlert, Tag, TrendingUp, Wallet, Package, Car,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { useShopSettings } from "@/lib/shop-settings-context";
import { useCanSeeFinancials } from "@/lib/permissions";
import { saleRequest } from "@/lib/sale-api";
import { itemRequest } from "@/lib/product-api";
import { useChat } from "@/lib/chat";
import Stories from "@/app/components/dashboard/Stories";
import StockAlertCircles from "@/app/components/dashboard/StockAlertCircles";
import {
  AlertCard, Bone, Card, DeltaChip, Photo, SectionHeader,
  ago, attributesOf, compactMoney, daysAgo, groupDigits, lastDays, money, num, parseTimestamp, percentChange,
  shortDate, tf, weekdayShort, ymd,
} from "./kit";

type Row = Record<string, unknown>;
type Summary = { revenue?: unknown; sales_count?: unknown; items_sold?: unknown };

interface HomeData {
  week: Summary; today: Summary; yesterday: Summary; daily: Row[]; top: Row[]; recent: Row[];
  stock: Row; alerts: Row[]; newest: Row[]; owed: number; owedCount: number;
}

const list = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const data = (r: unknown): Row => ((r as { data?: Row } | null)?.data ?? {}) as Row;

export default function MobileHome() {
  const { user } = useAuth();
  const { t, lang, layout } = useLanguage();
  const isCar = layout === "car";
  const fin = useCanSeeFinancials();
  const { currency, lowStock, loaded: settingsLoaded } = useShopSettings();
  const [d, setD] = useState<HomeData | null>(null);
  const [error, setError] = useState(false);
  const [day, setDay] = useState(6);

  const load = useCallback(async () => {
    const now = new Date();
    const today = ymd(now);
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const week = lastDays(7);
    const [sales, stock, debts] = await Promise.allSettled([
      Promise.all([
        saleRequest(`/sales/summary?from_date=${week.from}&to_date=${week.to}`),
        saleRequest(`/sales/summary?from_date=${today}&to_date=${today}`),
        saleRequest(`/sales/summary?from_date=${ymd(y)}&to_date=${ymd(y)}`),
        saleRequest("/sales/daily?days=7"),
        saleRequest(`/sales/top-products?limit=5&from_date=${week.from}&to_date=${week.to}`),
        saleRequest("/sales?page=1&limit=5"),
      ]),
      Promise.all([
        itemRequest(`/products/summary?threshold=${lowStock}`),
        itemRequest(`/products/stock-alerts?threshold=${lowStock}`),
        itemRequest("/products?page=1&limit=10"),
      ]),
      saleRequest("/debts?is_paid=false"),
    ]);
    // Figures already on screen stay when a refresh fails.
    if (sales.status === "rejected" && stock.status === "rejected") { setError(true); return; }
    setError(false);
    setD((prev) => {
      const s = sales.status === "fulfilled" ? sales.value : null;
      const p = stock.status === "fulfilled" ? stock.value : null;
      const owed = debts.status === "fulfilled" ? data(debts.value) : null;
      return {
        week: s ? data(s[0]) : prev?.week ?? {},
        today: s ? data(s[1]) : prev?.today ?? {},
        yesterday: s ? data(s[2]) : prev?.yesterday ?? {},
        daily: s ? list(s[3]?.data) : prev?.daily ?? [],
        top: s ? list(s[4]?.data) : prev?.top ?? [],
        recent: s ? list(data(s[5]).items) : prev?.recent ?? [],
        stock: p ? data(p[0]) : prev?.stock ?? {},
        // Emptiest first, as on the website: the circles show what needs restocking most.
        alerts: p ? [...list(p[1]?.data)].sort((a, b) => num(a.quantity) - num(b.quantity)).slice(0, 8) : prev?.alerts ?? [],
        newest: p ? list(data(p[2]).items) : prev?.newest ?? [],
        owed: owed ? num(owed.total_outstanding) : prev?.owed ?? 0,
        owedCount: owed ? num(owed.total) : prev?.owedCount ?? 0,
      };
    });
  }, [lowStock]);

  useEffect(() => {
    if (!user || !settingsLoaded) return;
    // First load on the next tick: the answers set state, never the effect itself.
    const first = setTimeout(() => void load(), 0);
    const every = setInterval(() => void load(), 60_000);
    const back = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", back);
    return () => { clearTimeout(first); clearInterval(every); document.removeEventListener("visibilitychange", back); };
  }, [user, settingsLoaded, load]);

  return (
    <main className="px-2 pb-5 pt-2">
      {!d && error ? (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-text-muted">
          <CloudOff size={36} className="text-text-faint" />
          <p className="text-sm">{t("dash.offline")}</p>
          <button type="button" onClick={() => void load()} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">{t("common.retry")}</button>
        </div>
      ) : !d ? (
        <HomeSkeleton isCar={isCar} />
      ) : (
        <>
          {error && <p className="mb-2 rounded-lg border border-warning/35 bg-warning/10 px-3 py-2 text-[12.5px] font-semibold text-warning">{t("dash.offline")}</p>}
          <Content d={d} t={t} lang={lang} isCar={isCar} fin={fin} currency={currency} lowStock={lowStock} day={day} setDay={setDay} />
        </>
      )}
    </main>
  );
}

function Content({ d, t, lang, isCar, fin, currency, lowStock, day, setDay }: {
  d: HomeData; t: (k: string) => string; lang: string; isCar: boolean; fin: boolean; currency: string; lowStock: number;
  day: number; setDay: (i: number) => void;
}) {
  const n = (k: string) => num(d.stock[k]);
  const total = n("total_products"), sold = n("out_of_stock"), pending = n("pending"), fined = n("with_penalties");
  const available = Math.max(0, total - sold - pending);
  const low = n("low_stock") + sold;
  const fmt = (v: number) => (fin ? money(v, currency) : groupDigits(v));

  return (
    <>
      {/* Stories first, straight under the top bar, as on Facebook. */}
      {isCar && <div className="empty:hidden"><Stories /></div>}
      {isCar && <ActiveNow t={t} />}
      <div className="h-2" />
      <Overview d={d} t={t} lang={lang} fin={fin} fmt={fmt} day={day} setDay={setDay} />
      <div className="h-2" />

      {/* ── Status strip ── */}
      <div className="-mx-[3px] flex">
        {isCar ? (<>
          <StatusTile label={t("dash.available")} value={available} icon={<CheckCircle2 size={15} />} tone="success" href="/items?status=available" />
          <StatusTile label={t("stock.f_pending")} value={pending} icon={<Clock3 size={15} />} tone="warning" href="/items?status=pending" />
          <StatusTile label={t("dash.fines_short")} value={fined} icon={<ShieldAlert size={15} />} tone="danger" href="/items?status=penalties" />
          <StatusTile label={t("stock.f_sold")} value={sold} icon={<Tag size={15} />} tone="ink" href="/items?status=sold" />
        </>) : (<>
          {fin && <StatusTile label={t("dash.revenue")} text={compactMoney(num(d.week.revenue), currency)} icon={<TrendingUp size={15} />} tone="success" href="/sales" />}
          <StatusTile label={t("dash.sales")} value={num(d.week.sales_count)} icon={<Receipt size={15} />} tone="ink" href="/sales" />
          <StatusTile label={t("dash.products")} value={total} icon={<Package size={15} />} tone="ink" href="/items" />
          <StatusTile label={t("dash.need_restock")} value={low} icon={<AlertTriangle size={15} />} tone={low > 0 ? "warning" : "success"} href="/items?stock=low" />
        </>)}
      </div>

      {/* ── Few cars left ── */}
      {isCar && total > 0 && available <= lowStock && (
        <div className="pt-2.5">
          <AlertCard icon={<AlertTriangle size={18} />} color={available === 0 ? "var(--color-accent)" : "var(--color-warning)"}
            title={tf(t, "dash.few_cars", { n: groupDigits(available) })} body={t("dash.few_cars_sub")} href="/items?status=available" />
        </div>
      )}

      {/* ── Stock alerts: nested circles ── */}
      <SectionHeader title={t("dash.stock_alerts")} count={low} action={t("app.view_all")} href={isCar ? "/items" : "/items?stock=low"} />
      {d.alerts.length === 0 ? (
        <AlertCard icon={<CheckCircle2 size={18} />} color="var(--color-success)" title={t("dash.all_healthy")} body={t("dash.no_restock")} />
      ) : (
        <Card>
          <div className="px-2.5 pb-2.5 pt-2">
            <StockAlertCircles
              items={d.alerts.map((a) => ({ id: String(a.id), name: String(a.name ?? ""), quantity: num(a.quantity), selling_price: num(a.selling_price) }))}
              total={Math.max(d.alerts.length, low)} threshold={lowStock} isCar={isCar}
              allHref={isCar ? "/items" : "/items?stock=low"} fmtMoney={(v) => money(v, currency)} />
          </div>
        </Card>
      )}

      {/* ── Newly added ── */}
      {d.newest.length > 0 && (<>
        <SectionHeader title={t("dash.new_arrivals")} action={t("app.view_all")} href="/items" />
        <div className="hgv-stories -mx-2 flex snap-x gap-2 overflow-x-auto px-2 pb-0.5">
          {d.newest.slice(0, 10).map((it) => <Arrival key={String(it.id)} item={it} t={t} isCar={isCar} currency={currency} lowStock={lowStock} />)}
        </div>
      </>)}

      {/* ── Money owed ── */}
      {d.owedCount > 0 && (
        <div className="pt-3.5">
          <AlertCard icon={<Wallet size={18} />} color="var(--color-warning)"
            title={`${t("dash.owed")} · ${money(d.owed, currency)}`} body={tf(t, "dash.owed_detail", { n: d.owedCount })} href="/sales?view=debts" />
        </div>
      )}

      {/* ── Top sellers ── */}
      {d.top.length > 0 && (<>
        <SectionHeader title={t("dash.top_products")} />
        <TopSellers top={d.top} t={t} fin={fin} currency={currency} isCar={isCar} />
      </>)}

      {/* ── Latest sales ── */}
      <SectionHeader title={t("dash.recent_sales")} action={t("app.view_all")} href="/sales" />
      {d.recent.length === 0 ? (
        <AlertCard icon={<Inbox size={18} />} color="var(--color-text-faint)" title={t("dash.no_sales")} />
      ) : (
        <Card>
          {d.recent.map((r, i) => {
            const when = parseTimestamp(r.created_at);
            return (
              <Link key={String(r.id)} href="/sales" className={`flex items-center gap-2.5 px-3 py-[9px] active:bg-paper-dim ${i > 0 ? "border-t border-border" : ""}`}>
                <Photo src={r.thumbnail as string | null} width={44} height={44} fallback={<Receipt size={20} className="text-success" />} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold text-text">{String(r.product_name ?? t("sale.default"))}</p>
                  <p className="truncate text-[12px] font-medium text-text-faint">{num(r.quantity) || 1} × · {when ? ago(t, when) : ""}</p>
                </div>
                <span className="text-[13px] font-extrabold text-text">{money(num(r.total_amount), currency)}</span>
              </Link>
            );
          })}
        </Card>
      )}
    </>
  );
}

/** Teammates online now, as on Instagram (only when someone is). */
function ActiveNow({ t }: { t: (k: string) => string }) {
  const chat = useChat();
  const others = chat.members.filter((m) => m.id !== chat.me && chat.online.includes(m.id));
  if (others.length === 0) return null;
  return (
    <div className="pt-3.5">
      <p className="text-[13px] font-bold text-text-muted">{t("live.active_now")}</p>
      <div className="hgv-stories mt-2 flex gap-3.5 overflow-x-auto">
        {others.map((m) => (
          <Link key={m.id} href={`/messages?with=${m.id}`} className="flex w-14 shrink-0 flex-col items-center">
            <span className="relative flex h-[46px] w-[46px] items-center justify-center rounded-full bg-ink-soft text-[15px] font-bold text-ink">
              {m.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-paper bg-success" />
            </span>
            <span className="mt-[5px] max-w-full truncate text-[12px] font-semibold text-text-muted">{m.name.split(" ")[0]}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Today's figure against yesterday, then the week as bars (tap a day). */
function Overview({ d, t, lang, fin, fmt, day, setDay }: {
  d: HomeData; t: (k: string) => string; lang: string; fin: boolean; fmt: (v: number) => string; day: number; setDay: (i: number) => void;
}) {
  const headline = (m: Summary | Row | undefined) => (fin && m?.revenue != null ? num(m.revenue) : num(m?.sales_count));
  const todayV = headline(d.today), yV = headline(d.yesterday);
  const delta = percentChange(todayV, yV);
  const bars = useMemo(() => {
    const byDay = new Map(d.daily.map((r) => [String(r.day), r]));
    return Array.from({ length: 7 }, (_, k) => {
      const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - k));
      return { date, value: headline(byDay.get(ymd(date))), label: k === 6 ? t("dash.today") : weekdayShort(lang, date) };
    });
  }, [d.daily, fin, lang, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = bars[Math.min(day, bars.length - 1)];
  const max = Math.max(1, ...bars.map((b) => b.value));
  const weekTotal = bars.reduce((a, b) => a + b.value, 0);
  return (
    <Card>
      <div className="px-3 pb-2 pt-2.5">
        <div className="flex items-center">
          <span className="text-[12px] font-bold text-text-muted">{t("dash.today")}</span>
          <span className="ml-auto">{delta != null && Math.abs(delta) >= 0.05 && <DeltaChip delta={delta} suffix={t("dash.vs_yesterday")} />}</span>
        </div>
        <p className="mt-0.5 truncate text-[26px] font-black tracking-[-0.6px] text-text">{fmt(todayV)}</p>
        <p className="text-[12px] text-text-faint">
          {tf(t, "dash.today_detail", { n: groupDigits(num(d.today.sales_count)), items: groupDigits(num(d.today.items_sold)) })}
        </p>
        <div className="my-2.5 border-t border-border" />
        <div className="flex items-baseline gap-1.5">
          <span className="text-[13px] font-extrabold text-text">{t("dash.this_week")}</span>
          <span className="min-w-0 truncate text-[12px] font-semibold text-text-muted">
            · {daysAgo(sel.date) === 0 ? t("dash.today") : `${weekdayShort(lang, sel.date)} ${shortDate(lang, sel.date)}`}: {fmt(sel.value)}
          </span>
        </div>
        <p className="text-[11px] text-text-faint">{tf(t, "dash.week_total", { v: fmt(weekTotal) })}</p>
        <div className="mt-2 flex h-[58px] items-end gap-1.5" role="group">
          {bars.map((b, i) => (
            <button key={i} type="button" onClick={() => setDay(i)} aria-pressed={i === day} aria-label={`${b.label}: ${fmt(b.value)}`}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className={`w-full rounded-[4px] transition-colors ${i === day ? "bg-ink" : "bg-ink/25"}`}
                style={{ height: `${Math.max(4, (b.value / max) * 40)}px` }} />
              <span className={`text-[10px] leading-none ${i === day ? "font-bold text-text" : "text-text-faint"}`}>{b.label}</span>
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** A small square figure. Colour only for what needs attention, and only when there is some. */
function StatusTile({ label, value, text, icon, tone, href }: {
  label: string; value?: number; text?: string; icon: React.ReactNode; tone: "success" | "warning" | "danger" | "ink"; href: string;
}) {
  const color = { success: "var(--color-success)", warning: "var(--color-warning)", danger: "var(--color-accent)", ink: "var(--color-ink)" }[tone];
  const alert = (tone === "warning" || tone === "danger") && (value ?? 0) > 0;
  return (
    <div className="min-w-0 flex-1 px-[3px]">
      <Card href={href}>
        <div className="pb-[9px] pl-2.5 pr-2 pt-2.5">
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full"
            style={{ color: alert ? color : "var(--color-text-muted)", backgroundColor: alert ? `color-mix(in srgb, ${color} 13%, transparent)` : "var(--color-paper-dim)" }}>
            {icon}
          </span>
          {/* Long figures shrink to fit the tile, as the app's FittedBox does. */}
          {(() => {
            const shown = text ?? groupDigits(value ?? 0);
            const size = shown.length <= 7 ? 17 : shown.length <= 9 ? 14 : 12;
            return <p className="mt-1.5 truncate font-black tracking-[-0.3px] text-text" style={{ fontSize: size, lineHeight: "22px" }}>{shown}</p>;
          })()}
          <p className="truncate text-[11px] font-semibold text-text-muted">{label}</p>
        </div>
      </Card>
    </div>
  );
}

/** A newly added product or vehicle: photo first, like a feed card. */
function Arrival({ item, t, isCar, currency, lowStock }: { item: Row; t: (k: string) => string; isCar: boolean; currency: string; lowStock: number }) {
  const a = attributesOf(item.attributes);
  const qty = num(item.quantity);
  const status = qty <= 0 ? { label: t("stock.f_sold"), bg: "var(--color-text-faint)" }
    : isCar && a.sale_status === "pending" ? { label: t("stock.f_pending"), bg: "var(--color-warning)" } : null;
  const fines = parseInt(a.penalty_count || "0", 10) || 0;
  const sub = isCar
    ? [a.plate_no, a.year].filter(Boolean).join(" · ")
    : qty <= 0 ? t("dash.out_of_stock") : tf(t, "stock.in_stock_n", { n: groupDigits(qty) });
  const added = parseTimestamp(item.created_at);
  return (
    <Link href={`/items?open=${item.id}`} className="w-[156px] shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-white active:bg-paper-dim">
      <div className="relative">
        <Photo src={item.thumbnail as string | null} width={156} height={112} radius={0}
          fallback={isCar ? <Car size={30} /> : <Package size={30} />} />
        {(status || fines > 0) && (
          <span className="absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold text-white"
            style={{ backgroundColor: status?.bg ?? "var(--color-accent)" }}>
            {status?.label ?? (fines === 1 ? t("stock.fine_one") : tf(t, "stock.fines_n", { n: fines }))}
          </span>
        )}
        {added && <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-extrabold text-white">{ago(t, added)}</span>}
      </div>
      <div className="px-[9px] pb-2 pt-[7px]">
        <p className="truncate text-[13px] font-bold text-text">{String(item.name ?? "")}</p>
        <p className={`truncate text-[11px] ${!isCar && qty <= lowStock ? "text-warning" : "text-text-faint"}`}>{sub}</p>
        <p className="mt-[3px] truncate text-[12.5px] font-extrabold text-ink">{money(num(item.selling_price), currency)}</p>
      </div>
    </Link>
  );
}

function TopSellers({ top, t, fin, currency, isCar }: { top: Row[]; t: (k: string) => string; fin: boolean; currency: string; isCar: boolean }) {
  const value = (p: Row) => (fin && p.revenue != null ? num(p.revenue) : num(p.qty_sold));
  const max = Math.max(0, ...top.map(value));
  return (
    <Card>
      <div className="space-y-2.5 px-2.5 pb-2.5 pt-2">
        {top.map((p, i) => (
          <div key={String(p.product_id ?? i)} className="flex items-center">
            <span className={`w-[18px] text-[14px] font-black ${i === 0 ? "text-ink" : "text-text-faint"}`}>{i + 1}</span>
            <Photo src={p.thumbnail as string | null} width={40} height={40} fallback={isCar ? <Car size={18} /> : <Package size={18} />} />
            <div className="ml-2.5 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-text">{String(p.product_name ?? "")}</span>
                <span className="text-[12px] font-extrabold text-text">
                  {fin && p.revenue != null ? money(num(p.revenue), currency) : tf(t, "dash.sold_n", { n: groupDigits(num(p.qty_sold)) })}
                </span>
              </div>
              <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-paper-dim">
                <div className={`h-full rounded-full ${i === 0 ? "bg-ink" : "bg-ink/45"}`} style={{ width: `${max <= 0 ? 0 : (value(p) / max) * 100}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Home's shape while its figures load. */
function HomeSkeleton({ isCar }: { isCar: boolean }) {
  return (
    <div aria-busy="true">
      {isCar && <div className="mb-3 flex gap-2 overflow-hidden">{[0, 1, 2, 3].map((i) => <Bone key={i} w={112} h={200} r={12} className="shrink-0" />)}</div>}
      <div className="rounded-xl border border-border bg-white p-3">
        <Bone w={44} /><Bone w={170} h={26} r={7} className="mt-2" /><Bone w={120} h={9} className="mt-1.5" />
        <div className="my-2.5 border-t border-border" />
        <Bone w={150} h={11} /><Bone w={90} h={8} className="mt-1.5" />
        <div className="mt-2.5 flex h-11 items-end gap-2.5">
          {[0.45, 0.7, 0.35, 0.85, 0.55, 0.65, 1].map((h, i) => <span key={i} className="flex-1"><Bone h={44 * h} r={4} /></span>)}
        </div>
      </div>
      <div className="-mx-[3px] mt-2 flex">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex-1 px-[3px]">
            <div className="rounded-xl border border-border bg-white p-2.5"><Bone circle h={26} /><Bone w={30} h={15} className="mt-2" /><Bone w={48} h={9} className="mt-1.5" /></div>
          </div>
        ))}
      </div>
      <Bone w={110} h={13} className="mb-2.5 mt-5" />
      <div className="flex justify-around rounded-xl border border-border bg-white py-3">
        {[0, 1, 2, 3].map((i) => <Bone key={i} circle h={54} />)}
      </div>
    </div>
  );
}
