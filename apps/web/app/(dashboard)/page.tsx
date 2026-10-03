"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery, useQueryClient, useIsFetching } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { useShopSettings } from "@/lib/shop-settings-context";
import { useShop } from "@/lib/shop-context";
import { itemRequest } from "@/lib/product-api";
import { saleRequest } from "@/lib/sale-api";
import { reportRequest } from "@/lib/report-api";
import { expenseRequest } from "@/lib/expense-api";
import StatCard from "@/app/components/dashboard/StatCard";
import { useCanSeeFinancials } from "@/lib/permissions";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  Package, Boxes, Wallet, AlertTriangle, ShoppingCart, Plus, Search,
  RefreshCw, CheckCircle, ChevronRight, Receipt, BarChart3, TrendingUp, PackagePlus,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface InventorySummary {
  stock_value: number; cost_value: number; potential_profit: number;
  total_products: number; total_quantity: number; out_of_stock: number; low_stock: number;
}
interface StockAlert { id: string; name: string; quantity: number; selling_price: number; }
interface SaleSummary { revenue: number; profit: number; sales_count: number; items_sold: number; }
interface DailyRecord { day: string; revenue: number; profit: number; sales_count: number; }
interface RecentSale { id: string; product_name?: string; total_amount: number; quantity: number; created_at?: string; }
interface RecentProduct { id: string; name: string; quantity: number; selling_price: number; created_at?: string | null; }

// Dashboard figures refresh every minute while the tab is visible.
const LIVE = { staleTime: 30_000, refetchInterval: 60_000 } as const;
const DASH_KEY = "dashboard";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseUTC(ts: string | null | undefined): Date {
  if (!ts) return new Date(0);
  return new Date(ts.endsWith("Z") || ts.includes("+") ? ts : ts + "Z");
}
function timeAgo(d: Date, t: (key: string) => string) {
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}${t("dash.ago_sec")}`;
  if (s < 3600) return `${Math.floor(s / 60)}${t("dash.ago_min")}`;
  if (s < 86400) return `${Math.floor(s / 3600)}${t("dash.ago_hour")}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function fmtMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-RW", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${Math.round(n).toLocaleString()} ${currency}`;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const { shop } = useShop();
  const { t, layout } = useLanguage();
  const { currency, lowStock, loaded: settingsLoaded } = useShopSettings();
  const queryClient = useQueryClient();
  const isCar = layout === "car";
  const money = (n: number) => fmtMoney(n, currency);
  const today = toDateStr(new Date());
  const enabled = !!user;
  // Car companies keep money figures from their staff (enforced server-side too).
  const fin = useCanSeeFinancials();

  // ── Inventory ──
  const inventory = useQuery({
    queryKey: [DASH_KEY, "inventory", lowStock],
    queryFn: async () => ((await itemRequest(`/products/summary?threshold=${lowStock}`))?.data ?? null) as InventorySummary | null,
    enabled: enabled && settingsLoaded,
    ...LIVE,
  });
  const alerts = useQuery({
    queryKey: [DASH_KEY, "alerts", lowStock],
    queryFn: async () => ((await itemRequest(`/products/stock-alerts?threshold=${lowStock}`))?.data ?? []) as StockAlert[],
    enabled: enabled && settingsLoaded,
    ...LIVE,
  });
  const recentProducts = useQuery({
    queryKey: [DASH_KEY, "recent-products"],
    queryFn: async () => ((await itemRequest("/products?page=1&limit=5"))?.data?.items ?? []) as RecentProduct[],
    enabled,
    ...LIVE,
  });

  // ── Sales & money ──
  const salesToday = useQuery({
    queryKey: [DASH_KEY, "sales-today", today],
    queryFn: async () => ((await saleRequest(`/sales/summary?from_date=${today}&to_date=${today}`))?.data ?? null) as SaleSummary | null,
    enabled: enabled && fin,
    ...LIVE,
  });
  const recentSales = useQuery({
    queryKey: [DASH_KEY, "recent-sales"],
    queryFn: async () => ((await saleRequest("/sales?page=1&limit=6"))?.data?.items ?? []) as RecentSale[],
    enabled,
    ...LIVE,
  });
  const expensesToday = useQuery({
    queryKey: [DASH_KEY, "expenses-today", today],
    queryFn: async () => ((await expenseRequest(`/expenses/summary?from_date=${today}&to_date=${today}`))?.data?.total_expenses ?? 0) as number,
    enabled: enabled && fin,
    ...LIVE,
  });
  const daily = useQuery({
    queryKey: [DASH_KEY, "daily"],
    queryFn: async () => ((await reportRequest("/reports/daily?days=8"))?.data ?? []) as DailyRecord[],
    enabled: enabled && fin,
    staleTime: 5 * 60_000,
  });

  const refreshing = useIsFetching({ queryKey: [DASH_KEY] }) > 0;
  const refreshAll = () => queryClient.invalidateQueries({ queryKey: [DASH_KEY] });
  const lastUpdated = Math.max(inventory.dataUpdatedAt, salesToday.dataUpdatedAt, recentSales.dataUpdatedAt);

  const chartData = useMemo(() => {
    const byDay = new Map((daily.data ?? []).map((d) => [d.day, d]));
    return Array.from({ length: 8 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (7 - i));
      const row = byDay.get(toDateStr(d));
      return { day: d.toLocaleDateString([], { weekday: "short" }), revenue: row?.revenue ?? 0, profit: row?.profit ?? 0 };
    });
  }, [daily.data]);

  if (!user) return null;

  const inv = inventory.data;
  const sales = salesToday.data;
  const yesterdayRevenue = chartData[chartData.length - 2]?.revenue ?? 0;
  const revenue = sales?.revenue ?? 0;
  const revDeltaPct = yesterdayRevenue > 0 ? Math.round(((revenue - yesterdayRevenue) / yesterdayRevenue) * 100) : null;
  const expenses = expensesToday.data ?? 0;
  const netToday = (sales?.profit ?? 0) - expenses;
  const restockCount = (inv?.low_stock ?? 0) + (inv?.out_of_stock ?? 0);
  const alertList = [...(alerts.data ?? [])].sort((a, b) => a.quantity - b.quantity).slice(0, 8);
  const restockHref = isCar ? "/items" : "/purchases";

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6">

      {/* ── Header: who/when + the actions people take most ── */}
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-semibold text-text sm:text-[1.75rem]">
            {shop?.name || user.name || t("dash.my_shop")}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-text-muted">
            <span>{new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
            {lastUpdated > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>{t("dash.last_updated")} {timeAgo(new Date(lastUpdated), t)}</span>
              </>
            )}
            <button
              onClick={refreshAll}
              disabled={refreshing}
              className="inline-flex items-center gap-1 rounded-press px-1.5 py-0.5 font-medium text-ink hover:bg-ink-soft disabled:opacity-60"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> {t("common.refresh")}
            </button>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <ActionLink href="/sales?new=1" icon={<ShoppingCart size={16} />} label={t("dash.record_sale")} primary />
          <ActionLink href="/items?add=1" icon={<Plus size={16} />} label={t("dash.add_product")} />
          <ActionLink href={restockHref} icon={<PackagePlus size={16} />} label={t("items.stock_in")} />
          <ActionLink href="/items" icon={<Search size={16} />} label={t("dash.check_stock")} />
        </div>
      </section>

      {inventory.isError && (
        <div className="flex items-center gap-3 rounded-data border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent-dark">
          <AlertTriangle size={16} className="shrink-0" />
          <p className="flex-1">{t("dash.service_error")}</p>
          <button onClick={refreshAll} className="shrink-0 rounded-press bg-white px-3 py-1 font-semibold hover:bg-accent-soft">
            {t("common.retry")}
          </button>
        </div>
      )}

      {/* ── Inventory at a glance ── */}
      <section className={`grid grid-cols-2 gap-3 ${fin ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {inventory.isPending ? (
          Array.from({ length: fin ? 4 : 3 }).map((_, i) => <CardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label={t("dash.products")}
              value={(inv?.total_products ?? 0).toLocaleString()}
              icon={<Package />}
              href="/items"
              subtitle={t("dash.in_your_shop")}
            />
            <StatCard
              label={t("dash.units_in_stock")}
              value={(inv?.total_quantity ?? 0).toLocaleString()}
              icon={<Boxes />}
              href="/items"
              subtitle={t("dash.across_all_products")}
            />
            {fin && <StatCard
              label={t("dash.stock_value")}
              value={money(inv?.cost_value ?? 0)}
              icon={<Wallet />}
              tone="green"
              href="/reports"
              subtitle={`${t("dash.sells_for")} ${money(inv?.stock_value ?? 0)}`}
            />}
            <StatCard
              label={t("dash.needs_restock")}
              value={restockCount.toLocaleString()}
              icon={<AlertTriangle />}
              tone={(inv?.out_of_stock ?? 0) > 0 ? "red" : restockCount > 0 ? "amber" : "slate"}
              href="/items?stock=low"
              subtitle={`${inv?.out_of_stock ?? 0} ${t("dash.out_short")} · ${inv?.low_stock ?? 0} ${t("dash.low_short")}`}
            />
          </>
        )}
      </section>

      {/* ── Today (owner only at car companies) ── */}
      {fin && <section className="rounded-data border border-border bg-white">
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="font-display text-base font-semibold text-text">{t("dash.today")}</h2>
          <Link href="/reports" className="flex items-center gap-0.5 text-sm font-semibold text-ink hover:text-ink-dark">
            {t("dash.full_report")} <ChevronRight size={14} />
          </Link>
        </div>
        <div className="grid grid-cols-2 divide-border p-2 sm:grid-cols-4 sm:divide-x">
          <Figure
            label={t("dash.revenue_today")}
            loading={salesToday.isPending}
            value={money(revenue)}
            tone="text-text"
            note={revDeltaPct !== null
              ? <span className={revDeltaPct >= 0 ? "text-success" : "text-accent-dark"}>{revDeltaPct >= 0 ? "▲" : "▼"} {Math.abs(revDeltaPct)}% {t("dash.vs_yesterday")}</span>
              : null}
          />
          <Figure
            label={t("dash.sales_today")}
            loading={salesToday.isPending}
            value={(sales?.sales_count ?? 0).toLocaleString()}
            tone="text-text"
            note={`${(sales?.items_sold ?? 0).toLocaleString()} ${t("dash.unit_plural")}`}
          />
          <Figure
            label={t("nav.expenses")}
            loading={expensesToday.isPending}
            value={money(expenses)}
            tone="text-warning"
          />
          <Figure
            label={t("dash.net_today")}
            loading={salesToday.isPending || expensesToday.isPending}
            value={money(netToday)}
            tone={netToday >= 0 ? "text-success" : "text-accent-dark"}
            note={t("dash.net_today_note")}
          />
        </div>
      </section>}

      {/* ── Stock alerts + recent sales ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title={t("reports.stock_alerts")}
          icon={<AlertTriangle size={16} className="text-accent" />}
          count={restockCount || undefined}
          href="/items?stock=low"
          linkLabel={t("dash.view_all")}
        >
          {alerts.isPending ? (
            <RowsSkeleton />
          ) : alertList.length === 0 ? (
            <EmptyRow icon={<CheckCircle size={18} className="text-success" />} title={t("dash.all_stock_healthy")} sub={t("dash.no_restock_needed")} />
          ) : (
            <ul>
              {alertList.map((item) => (
                <li key={item.id} className="hgv-ledger-row flex items-center gap-3 px-5 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-text">{item.name}</p>
                    <p className="hgv-figure text-sm text-text-muted">{money(item.selling_price)}</p>
                  </div>
                  <span className={`hgv-figure shrink-0 rounded-press px-2.5 py-1 text-sm font-semibold ${
                    item.quantity === 0 ? "bg-accent-soft text-accent-dark" : "bg-warning-soft text-warning"
                  }`}>
                    {item.quantity === 0 ? t("items.out_stock") : `${item.quantity} ${t("dash.units_left")}`}
                  </span>
                  <Link href={restockHref} className="hidden shrink-0 text-sm font-semibold text-ink hover:text-ink-dark sm:inline">
                    {t("reports.restock")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={t("dash.recent_sales")}
          icon={<Receipt size={16} className="text-ink" />}
          href="/sales"
          linkLabel={t("dash.all_sales")}
        >
          {recentSales.isPending ? (
            <RowsSkeleton />
          ) : (recentSales.data ?? []).length === 0 ? (
            <EmptyRow icon={<ShoppingCart size={18} className="text-text-faint" />} title={t("dash.no_sales_today")} />
          ) : (
            <ul>
              {(recentSales.data ?? []).map((sale) => (
                <li key={sale.id} className="hgv-ledger-row flex items-center gap-3 px-5 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-text">{sale.product_name || t("nav.sales")}</p>
                    <p className="text-sm text-text-muted">
                      {sale.quantity} {sale.quantity !== 1 ? t("dash.unit_plural") : t("dash.unit_singular")}
                      {sale.created_at ? ` · ${timeAgo(parseUTC(sale.created_at), t)}` : ""}
                    </p>
                  </div>
                  <p className="hgv-figure shrink-0 text-[15px] font-semibold text-text">{money(sale.total_amount)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Inventory activity + trend ── */}
      <div className="grid gap-5 lg:grid-cols-5">
        <Panel
          className={fin ? "lg:col-span-2" : "lg:col-span-5"}
          title={t("dash.recently_added")}
          icon={<Package size={16} className="text-ink" />}
          href="/items"
          linkLabel={t("dash.view_all")}
        >
          {recentProducts.isPending ? (
            <RowsSkeleton rows={5} />
          ) : (recentProducts.data ?? []).length === 0 ? (
            <EmptyRow icon={<Package size={18} className="text-text-faint" />} title={t("dash.no_products_yet")} />
          ) : (
            <ul>
              {(recentProducts.data ?? []).map((p) => (
                <li key={p.id} className="hgv-ledger-row flex items-center gap-3 px-5 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-text">{p.name}</p>
                    {p.created_at && <p className="text-sm text-text-muted">{timeAgo(parseUTC(p.created_at), t)}</p>}
                  </div>
                  <p className="hgv-figure shrink-0 text-sm text-text-muted">
                    <span className="font-semibold text-text">{p.quantity.toLocaleString()}</span> {t("dash.unit_plural")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {fin && <Panel
          className="lg:col-span-3"
          title={t("dash.revenue_7d")}
          icon={<TrendingUp size={16} className="text-ink" />}
          href="/reports"
          linkLabel={t("dash.full_report")}
        >
          <div className="px-3 pb-4 pt-1">
            {daily.isPending ? (
              <div className="hgv-shimmer h-[180px] rounded-data" />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 12 }}>
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#666666" }} tickLine={false} axisLine={false} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #e0dfdc" }}
                    formatter={(v: unknown, name: unknown) => [
                      money(typeof v === "number" ? v : 0),
                      name === "revenue" ? t("dash.revenue_label") : t("dash.profit_label"),
                    ]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#0a66c2" fill="#0a66c2" fillOpacity={0.08} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="profit" stroke="#057642" fill="#057642" fillOpacity={0.06} strokeWidth={2} dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
            <div className="mt-2 flex items-center gap-4 px-2 text-sm text-text-muted">
              <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3 rounded bg-ink" /> {t("dash.revenue_label")}</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3 rounded bg-success" /> {t("dash.profit_label")}</span>
              <Link href="/reports" className="ml-auto flex items-center gap-1 font-semibold text-ink hover:text-ink-dark">
                <BarChart3 size={14} /> {t("dash.view_reports")}
              </Link>
            </div>
          </div>
        </Panel>}
      </div>
    </main>
  );
}

// ─── Building blocks ──────────────────────────────────────────────────────────
function ActionLink({ href, icon, label, primary = false }: { href: string; icon: React.ReactNode; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
        primary
          ? "bg-ink text-white hover:bg-ink-dark"
          : "border border-border-strong bg-white text-text hover:border-ink hover:text-ink"
      }`}
    >
      {icon} {label}
    </Link>
  );
}

function Panel({ title, icon, count, href, linkLabel, className = "", children }: {
  title: string; icon: React.ReactNode; count?: number; href: string; linkLabel: string;
  className?: string; children: React.ReactNode;
}) {
  return (
    <section className={`overflow-hidden rounded-data border border-border bg-white ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-text">
          {icon} {title}
          {count !== undefined && (
            <span className="hgv-figure rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent-dark">{count}</span>
          )}
        </h2>
        <Link href={href} className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-ink hover:text-ink-dark">
          {linkLabel} <ChevronRight size={14} />
        </Link>
      </div>
      {children}
    </section>
  );
}

function Figure({ label, value, tone, note, loading }: {
  label: string; value: string; tone: string; note?: React.ReactNode; loading: boolean;
}) {
  return (
    <div className="px-3 py-3">
      <p className="text-sm font-medium text-text-muted">{label}</p>
      {loading ? (
        <div className="hgv-shimmer mt-2 h-7 w-28 rounded" />
      ) : (
        <p className={`hgv-figure mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
      )}
      {note && !loading && <p className="mt-0.5 text-[13px] text-text-faint">{note}</p>}
    </div>
  );
}

function EmptyRow({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-6">
      {icon}
      <div>
        <p className="text-[15px] font-medium text-text">{title}</p>
        {sub && <p className="text-sm text-text-muted">{sub}</p>}
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-data border border-border bg-white p-5">
      <div className="hgv-shimmer h-3.5 w-24 rounded" />
      <div className="hgv-shimmer mt-4 h-8 w-20 rounded" />
      <div className="hgv-shimmer mt-2 h-3 w-28 rounded" />
    </div>
  );
}

function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-b-0">
          <div className="flex-1 space-y-2">
            <div className="hgv-shimmer h-3.5 w-2/3 rounded" />
            <div className="hgv-shimmer h-3 w-1/3 rounded" />
          </div>
          <div className="hgv-shimmer h-4 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}
