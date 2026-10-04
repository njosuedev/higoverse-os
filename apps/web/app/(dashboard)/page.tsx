"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { useShopSettings } from "@/lib/shop-settings-context";
import { useShop } from "@/lib/shop-context";
import { itemRequest } from "@/lib/product-api";
import { partnerRequest } from "@/lib/supplier-api";
import { saleRequest } from "@/lib/sale-api";
import { reportRequest } from "@/lib/report-api";
import { expenseRequest } from "@/lib/expense-api";
import { purchaseRequest } from "@/lib/purchase-api";
import { listShops, type Shop as ShopInfo } from "@/lib/shop-api";
import StatCard from "@/app/components/dashboard/StatCard";
import VehicleWatch from "@/app/components/dashboard/VehicleWatch";
import TodayStatus from "@/app/components/dashboard/TodayStatus";
import CarPerformanceChart from "@/app/components/dashboard/CarPerformanceChart";
import StockAlertCircles from "@/app/components/dashboard/StockAlertCircles";
import { useCanSeeFinancials, useShowsProfit } from "@/lib/permissions";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Package, Truck, BarChart3, ShoppingCart, Users, Settings, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Globe, CheckCircle, FileText, Plus, Activity, Receipt, Wallet, DollarSign, ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface StockAlert { id: string; name: string; quantity: number; selling_price: number; cost_price?: number | null; supplier_id?: string | null; }
interface Stats { products: number; partners: number; suppliers: number; sales: number; revenue: number; lowStock: number; outOfStock: number; }
interface DailyRecord { day: string; revenue: number; profit: number; sales_count: number; }
interface RecentSale { id: string; product_name?: string; total_amount: number; quantity: number; profit?: number; created_at?: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function fmtDate(d: Date) {
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}
function fmtMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-RW", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${Math.round(n).toLocaleString()} ${currency}`;
  }
}
function fmtShort(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
function timeAgo(d: Date, t: (key: string) => string) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)   return `${s}${t("dash.ago_sec")}`;
  if (s < 3600) return `${Math.floor(s / 60)}${t("dash.ago_min")}`;
  return `${Math.floor(s / 3600)}${t("dash.ago_hour")}`;
}
function parseUTC(ts: string | null | undefined): Date {
  if (!ts) return new Date(0);
  const s = ts.endsWith("Z") || ts.includes("+") ? ts : ts + "Z";
  return new Date(s);
}
function shortDay(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return parseUTC(dateStr).toLocaleDateString([], { weekday: "short" });
}

function shopPresence(lastSeenAt: string | null, now: Date) {
  if (!lastSeenAt) return { online: false, label: "never_seen", color: "bg-text-faint" };
  const d = parseUTC(lastSeenAt);
  const secs = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (secs < 300)   return { online: true,  label: "online_now",                         color: "bg-success" };
  if (secs < 3600)  return { online: false, label: `${Math.floor(secs / 60)}m ago`,      color: "bg-warning" };
  if (secs < 86400) return { online: false, label: `${Math.floor(secs / 3600)}h ago`,    color: "bg-accent" };
  const days = Math.floor(secs / 86400);
  if (days < 7)     return { online: false, label: `${days}d ago`,                       color: "bg-text-faint" };
  return { online: false, label: d.toLocaleDateString([], { month: "short", day: "numeric" }), color: "bg-text-faint" };
}

const REFRESH_INTERVAL = 60;

// ─── Dashboard cache (localStorage) ──────────────────────────────────────────
const DASH_CACHE_KEY = "hgv_dash_v4"; // v4: figures cover 7 days, not today
const DASH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface DashCache {
  stats: Stats; stockAlerts: StockAlert[]; dailyData: DailyRecord[];
  recentSales: RecentSale[]; yesterdayRevenue: number;
  expenseToday: { total_expenses: number; count: number };
  purchaseCostToday: number; shops: ShopInfo[];
}

function readDashCache(): DashCache | null {
  try {
    const raw = localStorage.getItem(DASH_CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: DashCache; ts: number };
    return Date.now() - ts < DASH_CACHE_TTL ? data : null;
  } catch { return null; }
}

function writeDashCache(data: DashCache) {
  try { localStorage.setItem(DASH_CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const { t, layout } = useLanguage();
  const isCar = layout === "car";
  // Car companies keep money figures from their staff (enforced server-side too).
  const fin = useCanSeeFinancials();
  // Car companies never show profit, loss or margins (owners included).
  const prof = useShowsProfit();
  // Settings → currency and low stock threshold.
  const { currency, lowStock, loaded: settingsLoaded } = useShopSettings();
  const { shop, loading: shopLoading } = useShop();
  // Product/customer counts arrive in the second loading phase — show "-"
  // until then rather than a misleading 0.
  const [countsReady, setCountsReady] = useState(false);
  const fmtCurrency = (n: number) => fmtMoney(n, currency);
  const lowStockRef = useRef(lowStock);
  lowStockRef.current = lowStock;
  // Car companies restock from Vehicles (stock in) — no Purchases page.
  const restockHref = isCar ? "/items" : "/purchases";

  const SERVICES_ALL = [
    { title: t("dash.items_inventory"), icon: Package,      href: "/items" },
    { title: t("nav.partners"),         icon: Users,        href: "/partners" },
    { title: t("nav.purchases"),        icon: Truck,        href: "/purchases" },
    { title: t("nav.sales"),            icon: ShoppingCart, href: "/sales" },
    { title: t("nav.expenses"),         icon: Wallet,       href: "/expenses" },
    { title: t("nav.reports"),          icon: BarChart3,    href: "/reports" },
    { title: t("nav.proforma"),         icon: FileText,     href: "/proforma" },
    { title: t("nav.settings"),         icon: Settings,     href: "/settings" },
  ];
  const SERVICES = isCar ? SERVICES_ALL.filter((x) => x.href !== "/purchases") : SERVICES_ALL;

  const [stats, setStats]             = useState<Stats>({ products: 0, partners: 0, suppliers: 0, sales: 0, revenue: 0, lowStock: 0, outOfStock: 0 });
  const partnersShown = layout === "car" ? Math.max(0, stats.partners - stats.suppliers) : stats.partners;
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [shops, setShops]             = useState<ShopInfo[]>([]);
  const [dailyData, setDailyData]     = useState<DailyRecord[]>([]);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [yesterdayRevenue, setYesterdayRevenue] = useState(0);
  const [expenseToday, setExpenseToday] = useState({ total_expenses: 0, count: 0 });
  const [purchaseCostToday, setPurchaseCostToday] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [productServiceError, setProductServiceError] = useState(false);
  const [countdown, setCountdown]     = useState(REFRESH_INTERVAL);
  const [now, setNow]                 = useState(new Date());

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  function applyCache(c: DashCache) {
    setStats(c.stats); setCountsReady(true);
    setStockAlerts(c.stockAlerts);
    setDailyData(c.dailyData);
    setRecentSales(c.recentSales);
    setYesterdayRevenue(c.yesterdayRevenue);
    setExpenseToday(c.expenseToday);
    setPurchaseCostToday(c.purchaseCostToday);
    setShops(c.shops);
  }

  const loadAll = async (soft = false) => {
    if (soft) setRefreshing(true);
    const today = toDateStr(new Date());
    // Figures cover the last 7 days (today included), like the lists' "7 days" preset.
    const weekFrom = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return toDateStr(d); })();

    // ── Phase 1: critical KPIs — unblocks UI fast ──────────────────────────
    try {
      const [salesRes, stockRes, recentRes] = await Promise.allSettled([
        saleRequest(`/sales/summary?from_date=${weekFrom}&to_date=${today}`),
        itemRequest(`/products/stock-alerts?threshold=${lowStockRef.current}`),
        saleRequest("/sales?page=1&limit=8"),
      ]);

      const saleCount = salesRes.status === "fulfilled" ? (salesRes.value?.data?.sales_count ?? 0) : 0;
      const revenue   = salesRes.status === "fulfilled" ? (salesRes.value?.data?.revenue ?? 0) : 0;
      const alertItems: StockAlert[] = stockRes.status === "fulfilled" ? (stockRes.value?.data ?? []) : [];
      const recent: RecentSale[]    = recentRes.status === "fulfilled" ? (recentRes.value?.data?.items ?? []) : [];

      setStats((prev) => ({
        ...prev, sales: saleCount, revenue,
        lowStock:   alertItems.filter((a) => a.quantity > 0).length,
        outOfStock: alertItems.filter((a) => a.quantity === 0).length,
      }));
      // Emptiest first, so the circles show what needs restocking most; the rest show as +N.
      setStockAlerts([...alertItems].sort((x, y) => x.quantity - y.quantity).slice(0, 8));
      setRecentSales(recent);
      setProductServiceError(stockRes.status === "rejected");
    } catch { /* non-fatal */ }

    setDataLoading(false); // unblock render after phase 1

    // ── Phase 2: secondary data — loads in background ──────────────────────
    try {
      const [productsRes, partnersRes, shopsRes, dailyRes, expenseRes, purchaseRes] = await Promise.allSettled([
        itemRequest("/products?page=1&limit=1"),
        partnerRequest("/suppliers?limit=50"),
        listShops({ limit: 20 }),
        reportRequest("/reports/daily?days=14"),
        expenseRequest(`/expenses/summary?from_date=${weekFrom}&to_date=${today}`),
        purchaseRequest(`/purchases/summary?from_date=${weekFrom}&to_date=${today}`),
      ]);

      const productCount = productsRes.status === "fulfilled" ? (productsRes.value?.data?.total ?? 0) : 0;
      const partnerCount = partnersRes.status === "fulfilled"
        ? (Array.isArray(partnersRes.value?.data) ? partnersRes.value.data.length
            : (partnersRes.value?.data?.total ?? 0)) : 0;
      // Suppliers are partners with a TIN; car companies don't count them.
      const partnerRows: { address?: string | null }[] = partnersRes.status === "fulfilled"
        ? (Array.isArray(partnersRes.value?.data) ? partnersRes.value.data : (partnersRes.value?.data?.items ?? [])) : [];
      const supplierCount = partnerRows.filter((p) => p.address?.startsWith("TIN:")).length;
      const newShops: ShopInfo[] = shopsRes.status === "fulfilled" ? (shopsRes.value?.items ?? []) : [];
      const daily: DailyRecord[] = dailyRes.status === "fulfilled" ? (dailyRes.value?.data ?? []) : [];
      const expData = expenseRes.status === "fulfilled"
        ? (expenseRes.value?.data || { total_expenses: 0, count: 0 })
        : { total_expenses: 0, count: 0 };
      const purchCost = purchaseRes.status === "fulfilled"
        ? (purchaseRes.value?.data?.total_cost ?? purchaseRes.value?.data?.items?.reduce(
            (s: number, p: { total_cost?: number }) => s + (p.total_cost ?? 0), 0) ?? 0)
        : 0;
      // The 7 days before this week, for the revenue comparison.
      const prevWeek = new Set(Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 7 - i); return toDateStr(d); }));
      const yRev = daily.reduce((sum, d) => sum + (d.day && prevWeek.has(d.day) ? (d.revenue ?? 0) : 0), 0);

      setStats((prev) => {
        const next = { ...prev, products: productCount, partners: partnerCount, suppliers: supplierCount };
        // Persist full snapshot for instant next-visit render
        writeDashCache({
          stats: next, stockAlerts: [], dailyData: daily, recentSales: [],
          yesterdayRevenue: yRev, expenseToday: expData,
          purchaseCostToday: purchCost, shops: newShops,
        });
        return next;
      });
      setShops(newShops);
      setDailyData(daily);
      setYesterdayRevenue(yRev);
      setExpenseToday(expData);
      setPurchaseCostToday(purchCost);
      setLastUpdated(new Date());
      setProductServiceError((prev) => prev || productsRes.status === "rejected");
      setCountsReady(true);
    } catch { /* non-fatal */ } finally {
      setRefreshing(false);
    }
  };

  const manualRefresh = () => {
    loadAll(true);
    setCountdown(REFRESH_INTERVAL);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (refreshRef.current)   clearInterval(refreshRef.current);
    countdownRef.current = setInterval(() => setCountdown((c) => (c <= 1 ? REFRESH_INTERVAL : c - 1)), 1000);
    refreshRef.current   = setInterval(() => { loadAll(true); setCountdown(REFRESH_INTERVAL); }, REFRESH_INTERVAL * 1000);
  };

  useEffect(() => {
    if (!user) return;

    // Hydrate from cache immediately — zero-wait first paint
    const cached = readDashCache();
    if (cached) {
      applyCache(cached);
      setDataLoading(false);   // skip skeleton entirely on cache hit
    }

    loadAll();
    clockRef.current     = setInterval(() => setNow(new Date()), 1000);
    countdownRef.current = setInterval(() => setCountdown((c) => (c <= 1 ? REFRESH_INTERVAL : c - 1)), 1000);
    refreshRef.current   = setInterval(() => { loadAll(true); setCountdown(REFRESH_INTERVAL); }, REFRESH_INTERVAL * 1000);
    return () => {
      [clockRef, countdownRef, refreshRef].forEach((r) => { if (r.current) clearInterval(r.current); });
    };
  }, [user?.shop_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch stock alerts once the shop's own low-stock threshold is known/changed.
  useEffect(() => {
    if (user && settingsLoaded) loadAll(true);
  }, [lowStock, settingsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const chartData = useMemo(() => {
    const byDay: Record<string, DailyRecord> = {};
    dailyData.forEach((d) => { if (d.day) byDay[d.day] = d; });
    const result = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = toDateStr(d);
      const row = byDay[key] ?? { day: key, revenue: 0, profit: 0, sales_count: 0 };
      result.push({ day: shortDay(key), revenue: row.revenue, profit: row.profit });
    }
    return result;
  }, [dailyData]);

  // Wait for the business too: what the home shows depends on its type.
  if (!user || dataLoading || shopLoading) return <HomeSkeleton />;

  const currentShop = shops.find((s) => s.id === user.shop_id);
  const onlineCount = shops.filter((s) => shopPresence(s.last_seen_at, now).online).length;
  const revDeltaPct = yesterdayRevenue > 0
    ? Math.round(((stats.revenue - yesterdayRevenue) / yesterdayRevenue) * 100)
    : null;
  const netProfit = stats.revenue - purchaseCostToday - expenseToday.total_expenses;
  const totalCosts = purchaseCostToday + expenseToday.total_expenses;
  const purchasePct = stats.revenue > 0 ? Math.min(100, Math.round((purchaseCostToday / stats.revenue) * 100)) : 0;
  const expensePct  = stats.revenue > 0 ? Math.min(100 - purchasePct, Math.round((expenseToday.total_expenses / stats.revenue) * 100)) : 0;
  const netPct      = Math.max(0, 100 - purchasePct - expensePct);

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-3 sm:px-5 py-2.5 sm:py-3 space-y-4">

        {/* ── PRODUCT SERVICE ERROR BANNER ───────────────────────────────────── */}
        {productServiceError && (
          <div className="flex items-center gap-2 bg-accent-soft border border-accent/30 rounded-press px-3 py-1.5">
            <AlertTriangle size={11} className="text-accent-dark shrink-0" />
            <p className="text-[11px] text-accent-dark flex-1 min-w-0">
              {t("dash.service_error")}
            </p>
            <button
              onClick={manualRefresh}
              className="text-[11px] font-bold text-accent-dark bg-white hover:bg-accent-soft px-2 py-0.5 rounded-press shrink-0 transition-colors duration-200"
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        {/* ── HERO — business badge, greeting, three key figures, time ────────── */}
        {(() => {
          const name = shop?.name || currentShop?.name || user.name || t("dash.my_shop");
          const initials = name.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w[0] ?? "")).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "H";
          const hour = now.getHours();
          const greeting = t(hour < 12 ? "dash.good_morning" : hour < 18 ? "dash.good_afternoon" : "dash.good_evening");
          const firstName = (user.name || "").split(" ")[0];
          const restock = stats.lowStock + stats.outOfStock;
          const figures = [
            { href: "/sales", icon: <ShoppingCart size={15} />, tint: "bg-ink/10 text-ink", short: t("dash.chart_sales"), long: t("dash.sales_week"), value: String(stats.sales), tone: "text-text" },
            ...(fin ? [{ href: "/reports", icon: <TrendingUp size={15} />, tint: "bg-success/10 text-success", short: t("dash.revenue_label"), long: t("dash.revenue_week"), value: stats.revenue > 0 ? `${currency} ${fmtShort(stats.revenue)}` : "-", tone: "text-success" }] : []),
            ...(restock > 0 ? [{ href: "/items?stock=low", icon: <AlertTriangle size={15} />, tint: "bg-accent/10 text-accent", short: t("dash.restock_short"), long: t("dash.needs_restock"), value: String(restock), tone: "text-accent-dark" }] : []),
          ];
          return (
            <section className="relative overflow-hidden rounded-data border border-border bg-white shadow-[0_1px_2px_rgb(0_0_0_/_0.04)]">
              <div className="relative flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5 sm:px-5">
                {/* Business */}
                <div className="order-1 flex min-w-0 flex-1 basis-[220px] items-center gap-3 sm:order-none">
                  {currentShop?.logo_url ? (
                    <img src={currentShop.logo_url} alt="" className="h-11 w-11 shrink-0 rounded-full border border-border object-cover" />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold tracking-wide text-white">{initials}</span>
                  )}
                  <div className="min-w-0">
                    <h1 className="truncate font-display text-[17px] font-bold leading-tight text-text" title={name}>{name}</h1>
                    <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
                      <span className="truncate">{greeting}{firstName ? `, ${firstName}` : ""} · {user.role || t("dash.owner_role")}</span>
                    </p>
                  </div>
                </div>

                {/* Key figures */}
                <div className="order-3 flex w-full items-stretch gap-1 border-t border-border pt-2.5 sm:order-none sm:w-auto sm:border-0 sm:pt-0">
                  {figures.map((f) => (
                    <Link key={f.long} href={f.href}
                      className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-press px-2 py-1.5 transition-colors duration-200 hover:bg-paper sm:flex-none sm:px-3">
                      <span className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-full sm:flex ${f.tint}`}>{f.icon}</span>
                      <span className="min-w-0">
                        <span className="block whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                          <span className="sm:hidden">{f.short}</span><span className="hidden sm:inline">{f.long}</span>
                        </span>
                        <span className={`hgv-figure block whitespace-nowrap text-base font-bold leading-tight ${f.tone}`}>{f.value}</span>
                      </span>
                    </Link>
                  ))}
                </div>

                {/* Time + refresh */}
                <div className="order-2 ml-auto flex shrink-0 items-center gap-3 sm:order-none">
                  <div className="hidden text-right xl:block">
                    <p className="hgv-figure text-sm font-bold leading-tight text-text">{fmtTime(now)}</p>
                    <p className="text-[11px] text-text-muted">{fmtDate(now)}</p>
                  </div>
                  <button
                    onClick={manualRefresh} disabled={refreshing}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-text-muted transition-colors duration-200 hover:border-ink hover:text-ink disabled:opacity-50"
                    title={t("common.refresh")} aria-label={t("common.refresh")}
                  >
                    <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>
            </section>
          );
        })()}

        {/* ── TODAY (car companies): new cars, new fines, new pending — like status ── */}
        {isCar && <TodayStatus />}

        {/* ── KEY FIGURES — one compact row ─────────────────────────────────── */}
        <section className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${fin ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
          {fin && <StatCard size="sm"
            label={t("dash.revenue_week")}
            value={fmtCurrency(stats.revenue)}
            icon={<TrendingUp size={15} strokeWidth={2} />}
            tone="green"
            href="/reports"
            delta={revDeltaPct !== null ? { value: `${Math.abs(revDeltaPct)}%`, direction: revDeltaPct >= 0 ? "up" : "down" } : undefined}
            subtitle={yesterdayRevenue > 0 ? `${t("dash.prev_week")}: ${fmtCurrency(yesterdayRevenue)}` : undefined}
          />}
          <StatCard size="sm" label={t("dash.products")} value={countsReady ? stats.products.toLocaleString() : "-"}
            icon={<Package size={15} strokeWidth={2} />} tone="blue" href="/items" />
          <StatCard size="sm" label={t("dash.partners")} value={countsReady ? partnersShown.toLocaleString() : "-"}
            icon={<Users size={15} strokeWidth={2} />} tone="blue" href="/partners" />
          <StatCard size="sm" label={t("dash.sales_week")} value={stats.sales.toLocaleString()}
            icon={<ShoppingCart size={15} strokeWidth={2} />} tone="blue" href="/sales" />
          <StatCard size="sm" label={t("items.low_stock")} value={stats.lowStock.toLocaleString()}
            icon={<AlertTriangle size={15} strokeWidth={2} />}
            tone={stats.lowStock > 0 ? "amber" : "slate"} href="/items" />
          <StatCard size="sm" label={t("items.out_stock")} value={stats.outOfStock.toLocaleString()}
            icon={<Package size={15} strokeWidth={2} />}
            tone={stats.outOfStock > 0 ? "red" : "slate"} href="/items" />
        </section>

        {/* ── CAR WATCH — pending transfers, fines, missing details ─────────── */}
        {isCar && <VehicleWatch />}

        <div className="hgv-notch-divider" aria-hidden="true" />

        {/* ── TODAY'S SHOP STATUS — one ruled panel, not four colored tiles ──── */}
        {fin && (<>
        <section className="bg-white border border-border rounded-data p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-text text-base flex items-center gap-2">
              <DollarSign size={14} className="text-ink" />
              {t("dash.shop_status_week")}
            </h2>
            <Link href="/reports" className="text-[11px] font-semibold text-ink hover:text-ink-dark flex items-center gap-0.5 transition-colors duration-200">
              {t("dash.full_report")} <ChevronRight size={12} />
            </Link>
          </div>

          <div className={`grid grid-cols-2 ${isCar ? "sm:grid-cols-2" : "sm:grid-cols-4"} divide-y sm:divide-y-0 sm:divide-x divide-border border border-border rounded-data overflow-hidden`}>
            <div className="p-3">
              <p className="text-[11px] text-text-faint uppercase tracking-wide font-medium">{t("dash.revenue_week")}</p>
              <p className="hgv-figure text-lg font-semibold text-success mt-0.5">{stats.revenue > 0 ? fmtCurrency(stats.revenue) : "-"}</p>
              <p className="text-[11px] text-text-faint mt-0.5">{stats.sales} {t("dash.sales_week")}</p>
            </div>
            {!isCar && <div className="p-3">
              <p className="text-[11px] text-text-faint uppercase tracking-wide font-medium">{t("nav.purchases")}</p>
              <p className="hgv-figure text-lg font-semibold text-text mt-0.5">{purchaseCostToday > 0 ? fmtCurrency(purchaseCostToday) : "-"}</p>
              <p className="text-[11px] text-text-faint mt-0.5">{t("dash.stock_cost")}</p>
            </div>}
            <div className="p-3">
              <p className="text-[11px] text-text-faint uppercase tracking-wide font-medium">{t("nav.expenses")}</p>
              <p className="hgv-figure text-lg font-semibold text-warning mt-0.5">{expenseToday.total_expenses > 0 ? fmtCurrency(expenseToday.total_expenses) : "-"}</p>
              <p className="text-[11px] text-text-faint mt-0.5">{expenseToday.count} {t("expenses.records")}</p>
            </div>
            {prof && <div className="p-3">
              <p className="text-[11px] text-text-faint uppercase tracking-wide font-medium">{t("dash.net_profit")}</p>
              <p className={`hgv-figure text-lg font-semibold mt-0.5 ${netProfit >= 0 ? "text-ink" : "text-accent-dark"}`}>
                {totalCosts > 0 || stats.revenue > 0 ? fmtCurrency(netProfit) : "-"}
              </p>
              <p className="text-[11px] text-text-faint mt-0.5">
                {netProfit >= 0 ? t("dash.profitable") : t("dash.at_loss")}
              </p>
            </div>}
          </div>

          {stats.revenue > 0 && (
            <div className="mt-3">
              <div className="flex h-1.5 overflow-hidden gap-px rounded-full">
                {purchasePct > 0 && <div className="bg-border-strong" style={{ width: `${purchasePct}%` }} />}
                {expensePct  > 0 && <div className="bg-warning"       style={{ width: `${expensePct}%` }} />}
                {prof && netPct > 0 && <div className="bg-success flex-1" />}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                {!isCar && <span className="flex items-center gap-1 text-[11px] text-text-muted">
                  <span className="w-2 h-1.5 rounded-sm bg-border-strong inline-block" /> {t("nav.purchases")} {purchasePct}%
                </span>}
                <span className="flex items-center gap-1 text-[11px] text-text-muted">
                  <span className="w-2 h-1.5 rounded-sm bg-warning inline-block" /> {t("nav.expenses")} {expensePct}%
                </span>
                {prof && <span className="flex items-center gap-1 text-[11px] text-text-muted">
                  <span className="w-2 h-1.5 rounded-sm bg-success inline-block" /> {t("dash.profit_label")} {netPct}%
                </span>}
                <Link href="/expenses" className="ml-auto text-[11px] font-semibold text-paper bg-ink hover:bg-ink-dark px-2.5 py-1 rounded-press flex items-center gap-1 transition-colors duration-200">
                  <Receipt size={10} /> {t("expenses.add")}
                </Link>
              </div>
            </div>
          )}
        </section>
        </>)}

        {/* ── BUSINESS PROGRESS ───────────────────────────────────────────────── */}
        <section className={`grid grid-cols-1 gap-3 ${prof ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {/* Stock health */}
          {(() => {
            const total = stats.products;
            const healthy = total - stats.lowStock - stats.outOfStock;
            const healthPct = total > 0 ? Math.round((healthy / total) * 100) : 100;
            const lowPct    = total > 0 ? Math.round((stats.lowStock   / total) * 100) : 0;
            const outPct    = total > 0 ? Math.round((stats.outOfStock / total) * 100) : 0;
            return (
              <div className="bg-white border border-border rounded-data p-3.5">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted flex items-center gap-1.5">
                    <Package size={11} className="text-ink" /> {t("dash.stock_health")}
                  </p>
                  <span className={`hgv-figure text-[11px] font-bold ${
                    healthPct >= 80 ? "text-success" : healthPct >= 50 ? "text-warning" : "text-accent-dark"
                  }`}>{healthPct}%</span>
                </div>
                <div className="flex h-1.5 rounded-full overflow-hidden gap-px mb-2.5">
                  {healthy    > 0 && <div className="bg-success" style={{ width: `${healthPct}%` }} />}
                  {stats.lowStock > 0 && <div className="bg-warning" style={{ width: `${lowPct}%` }} />}
                  {stats.outOfStock > 0 && <div className="bg-accent" style={{ width: `${outPct}%` }} />}
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <span className="flex items-center gap-1 text-[11px] text-text-muted"><span className="w-2 h-1.5 rounded-sm bg-success inline-block" /> {healthy} {t("dash.healthy")}</span>
                  {stats.lowStock   > 0 && <span className="flex items-center gap-1 text-[11px] text-text-muted"><span className="w-2 h-1.5 rounded-sm bg-warning inline-block" /> {stats.lowStock} {t("items.low_stock")}</span>}
                  {stats.outOfStock > 0 && <span className="flex items-center gap-1 text-[11px] text-text-muted"><span className="w-2 h-1.5 rounded-sm bg-accent inline-block" /> {stats.outOfStock} {t("items.out_stock")}</span>}
                </div>
              </div>
            );
          })()}

          {/* Net margin */}
          {prof && (() => {
            const margin = stats.revenue > 0 ? Math.round((netProfit / stats.revenue) * 100) : 0;
            const capped  = Math.min(100, Math.max(0, margin));
            const isGood  = margin >= 20;
            const barColor = margin < 0 ? "var(--color-accent)" : margin < 15 ? "var(--color-warning)" : "var(--color-success)";
            const textColor = margin < 0 ? "text-accent-dark" : margin < 15 ? "text-warning" : "text-success";
            return (
              <div className="bg-white border border-border rounded-data p-3.5">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted flex items-center gap-1.5">
                    <TrendingUp size={11} className="text-ink" /> {t("dash.profit_margin")}
                  </p>
                  <span className={`hgv-figure text-[11px] font-bold ${textColor}`}>{margin}%</span>
                </div>
                <div className="relative h-1.5 bg-paper-dim rounded-full overflow-hidden mb-2.5">
                  <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700" style={{ width: `${capped}%`, backgroundColor: barColor }} />
                </div>
                <div className="flex items-center justify-between text-[11px] text-text-faint">
                  <span>{t("dash.revenue_week")}: {fmtCurrency(stats.revenue)}</span>
                  <span className={isGood ? "text-success font-semibold" : ""}>{isGood ? t("dash.margin_healthy") : margin < 0 ? t("dash.margin_loss") : t("dash.margin_fair")}</span>
                </div>
              </div>
            );
          })()}

          {/* Shops online */}
          {(() => {
            const pct = shops.length > 0 ? Math.round((onlineCount / shops.length) * 100) : 0;
            return (
              <div className="bg-white border border-border rounded-data p-3.5">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted flex items-center gap-1.5">
                    <Globe size={11} className="text-ink" /> {t("dash.shops_live")}
                  </p>
                  <span className="hgv-figure flex items-center gap-1 text-[11px] font-bold text-success">
                    <span className="w-1.5 h-1.5 rounded-full bg-success" />{onlineCount}/{shops.length}
                  </span>
                </div>
                <div className="relative h-1.5 bg-paper-dim rounded-full overflow-hidden mb-2.5">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-success transition-all duration-700" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between text-[11px] text-text-faint">
                  <span>{onlineCount} {t("dash.online_now")}</span>
                  <span>{pct}% {t("common.active")}</span>
                </div>
              </div>
            );
          })()}
        </section>

        {/* ── 7-DAY CHART + RECENT SALES — asymmetric 3/2 split on desktop ──── */}
        <div className="grid md:grid-cols-5 gap-3">
          {fin && (
          <section className="md:col-span-3 bg-white border border-border rounded-data p-3.5">
            {/* Car companies: sales, expenses, fines and pending — no profit line. */}
            {isCar ? <CarPerformanceChart daily={dailyData} fmtCurrency={fmtCurrency} /> : (<>
            <div className="flex items-center justify-between mb-1">
              <div>
                <h2 className="font-display font-semibold text-text text-base flex items-center gap-2">
                  <Activity size={13} className="text-ink" />
                  {t("dash.revenue_7d")}
                </h2>
                <p className="text-[11px] text-text-faint mt-0.5">
                  {t("common.total")}: <span className="hgv-figure">{fmtCurrency(chartData.reduce((s, d) => s + d.revenue, 0))}</span>
                </p>
              </div>
              <Link href="/reports" className="text-[11px] font-semibold text-ink hover:text-ink-dark flex items-center gap-0.5 transition-colors duration-200">
                {t("dash.full_report")} <ChevronRight size={12} />
              </Link>
            </div>

            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={chartData} margin={{ top: 6, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#0a66c2" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#0a66c2" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#057642" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#057642" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#767676" }} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ fontSize: 10, borderRadius: 2, border: "1px solid #e0dfdc", boxShadow: "0 2px 8px rgba(0,0,0,.1)" }}
                  formatter={(v: unknown, name: unknown) => [
                    fmtCurrency(typeof v === "number" ? v : 0),
                    name === "revenue" ? t("dash.revenue_label") : t("dash.profit_label"),
                  ]}
                />
                <Area type="monotone" dataKey="revenue" stroke="#0a66c2" fill="url(#revFill)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="profit"  stroke="#057642" fill="url(#profFill)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="flex items-center gap-1 text-[11px] text-text-muted">
                <span className="w-2.5 h-0.5 rounded bg-ink inline-block" /> {t("dash.revenue_label")}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-text-muted">
                <span className="w-2.5 h-0.5 rounded bg-success inline-block" /> {t("dash.profit_label")}
              </span>
            </div>
            </>)}
          </section>
          )}

          <section className={`${fin ? "md:col-span-2" : "md:col-span-5"} bg-white border border-border rounded-data overflow-hidden`}>
            <div className="flex items-center justify-between px-3.5 pt-3.5 pb-2">
              <h2 className="font-display font-semibold text-text text-base flex items-center gap-2">
                <Receipt size={13} className="text-ink" />
                {t("dash.recent_sales")}
              </h2>
              <Link href="/sales" className="text-[11px] font-semibold text-ink hover:text-ink-dark flex items-center gap-0.5 transition-colors duration-200">
                {t("dash.all_sales")} <ChevronRight size={12} />
              </Link>
            </div>

            {recentSales.length === 0 ? (
              <div className="px-3.5 pb-3.5 text-text-faint text-xs flex items-center gap-2 py-4">
                <ShoppingCart size={13} /> {t("dash.no_sales_today")}
              </div>
            ) : (
              <div>
                {recentSales.map((sale) => (
                  <div key={sale.id} className="hgv-ledger-row flex items-center gap-2.5 px-3.5 py-2">
                    <ShoppingCart size={13} className="text-text-faint shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-text truncate">{sale.product_name || t("nav.sales")}</p>
                      <p className="text-[11px] text-text-faint">
                        {sale.quantity} {sale.quantity !== 1 ? t("dash.unit_plural") : t("dash.unit_singular")}
                        {sale.created_at ? ` · ${timeAgo(parseUTC(sale.created_at), t)}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="hgv-figure text-xs font-semibold text-text">{fmtCurrency(sale.total_amount)}</p>
                      {prof && sale.profit != null && sale.profit > 0 && (
                        <p className="hgv-figure text-[11px] text-success">+{fmtCurrency(sale.profit)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="px-3.5 py-2.5 border-t border-border">
              <Link href="/sales"
                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-paper bg-ink hover:bg-ink-dark py-1.5 rounded-press transition-colors duration-200">
                <Plus size={11} /> {t("dash.record_new_sale")}
              </Link>
            </div>
          </section>
        </div>

        {/* ── STOCK ALERTS + QUICK ACTIONS ────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-3">

          <section className="bg-white border border-border rounded-data overflow-hidden">
            <div className="flex items-center justify-between px-3.5 pt-3.5 pb-2">
              <h2 className="font-display font-semibold text-text text-base flex items-center gap-2">
                <AlertTriangle size={13} className="text-accent" />
                {t("reports.stock_alerts")}
                {stats.lowStock + stats.outOfStock > 0 && (
                  <span className="hgv-stamp text-[11px] text-accent-dark border-accent/50">
                    {stats.lowStock + stats.outOfStock}
                  </span>
                )}
              </h2>
              <Link href="/items" className="text-[11px] font-semibold text-ink hover:text-ink-dark flex items-center gap-0.5 transition-colors duration-200">
                {t("dash.view_all")} <ChevronRight size={12} />
              </Link>
            </div>

            {stockAlerts.length === 0 ? (
              <div className="px-3.5 pb-3.5 flex items-center gap-2.5 py-4">
                <CheckCircle size={16} className="text-success" />
                <div>
                  <p className="font-semibold text-text text-xs">{t("dash.all_stock_healthy")}</p>
                  <p className="text-text-faint text-[11px]">{t("dash.no_restock_needed")}</p>
                </div>
              </div>
            ) : (
              <StockAlertCircles items={stockAlerts} total={Math.max(stockAlerts.length, stats.lowStock + stats.outOfStock)}
                threshold={lowStock} isCar={isCar} allHref={isCar ? "/items" : "/items?stock=low"} fmtMoney={fmtCurrency} />
            )}

            {stockAlerts.length > 0 && (
              <div className="px-3.5 py-2.5 border-t border-border">
                <Link href={restockHref}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-ink bg-ink-soft hover:bg-[#d0e8ff] py-1.5 rounded-press transition-colors duration-200">
                  <Truck size={11} /> {t("items.go_purchases")}
                </Link>
              </div>
            )}
          </section>

          {/* Quick actions — one primary CTA + a plain list, not four identical tiles */}
          <section className="bg-white border border-border rounded-data p-3.5">
            <h2 className="font-display font-semibold text-text text-base mb-2.5">{t("dash.quick_actions")}</h2>

            <Link href="/sales"
              className="flex items-center gap-3 p-3 rounded-press bg-accent text-paper mb-2 transition-colors duration-200 hover:bg-accent-dark">
              <Plus size={18} strokeWidth={2.25} className="shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">{t("dash.new_sale")}</p>
                <p className="text-[11px] text-paper/75 mt-0.5 truncate">{t("dash.new_sale_desc")}</p>
              </div>
            </Link>

            <div className="border border-border rounded-data overflow-hidden">
              {[
                ...(isCar ? [] : [{ href: "/purchases", icon: Truck, label: t("dash.new_purchase"), desc: t("dash.new_purchase_desc") }]),
                { href: "/expenses",  icon: Wallet,    label: t("nav.expenses"),       desc: t("dash.expenses_desc") },
                { href: "/reports",            icon: BarChart3, label: t("dash.view_reports"),  desc: t("dash.charts_analytics") },
              ].map((a) => (
                <Link key={a.href} href={a.href}
                  className="hgv-ledger-row flex items-center gap-3 px-3 py-2.5 last:border-b-0">
                  <a.icon size={15} className="text-text-muted shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-text leading-tight">{a.label}</p>
                    <p className="text-[11px] text-text-faint mt-0.5 truncate">{a.desc}</p>
                  </div>
                  <ChevronRight size={13} className="text-text-faint shrink-0" />
                </Link>
              ))}
            </div>

            {stats.sales > 0 && (
              <div className="mt-2.5 p-2.5 bg-paper-dim rounded-data flex items-center gap-2.5">
                <TrendingUp size={14} className="text-success shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-text">
                    <span className="hgv-figure">{stats.sales}</span> {stats.sales !== 1 ? t("dash.sale_plural") : t("dash.sale_singular")} · <span className="hgv-figure">{fmtCurrency(stats.revenue)}</span>
                  </p>
                  {revDeltaPct !== null && (
                    <p className={`text-[11px] font-medium mt-0.5 flex items-center gap-1 ${revDeltaPct >= 0 ? "text-success" : "text-accent-dark"}`}>
                      {revDeltaPct >= 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                      <span className="hgv-figure">{Math.abs(revDeltaPct)}%</span> {t("dash.vs_yesterday")}
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ── BUSINESS SERVICES — a plain index list, not eight identical tiles ── */}
        <section className="bg-white border border-border rounded-data overflow-hidden">
          <h2 className="font-display font-semibold text-text text-base px-3.5 pt-3.5 pb-2">{t("dash.services")}</h2>
          <div className="grid sm:grid-cols-2">
            {SERVICES.map((svc) => {
              const Icon = svc.icon;
              return (
                <Link key={svc.href} href={svc.href}
                  className="hgv-ledger-row flex items-center gap-3 px-3.5 py-2.5 group"
                >
                  <Icon size={16} className="text-text-muted shrink-0" />
                  <p className="text-[12.5px] font-medium text-text flex-1">{svc.title}</p>
                  <ChevronRight size={13} className="text-text-faint shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>
        </section>

        <div className="hgv-notch-divider" aria-hidden="true" />

        {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
        <footer className="pb-6 pt-1">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">

            {/* Brand */}
            <div className="flex items-center gap-2">
              <img src="/higoverse-logo.png" alt="Higoverse" className="w-7 h-7 rounded-press object-cover" />
              <div>
                <p className="font-display text-xs font-semibold text-text">Higoverse</p>
                <p className="text-[11px] text-text-faint">{t("dash.footer_tagline")}</p>
              </div>
            </div>

            {/* Live business snapshot — plain text, separated by middots */}
            <div className="flex items-center gap-2.5 flex-wrap justify-center text-[11px] text-text-muted">
              <span className="flex items-center gap-1 font-medium">
                <Package size={11} className="text-text-faint" /> {stats.products} {t("dash.products")}
              </span>
              <span className="text-border-strong">·</span>
              <span className="flex items-center gap-1 font-medium">
                <Users size={11} className="text-text-faint" /> {partnersShown} {t("dash.partners")}
              </span>
              <span className="text-border-strong">·</span>
              <span className="flex items-center gap-1 font-medium">
                <ShoppingCart size={11} className="text-text-faint" /> {stats.sales} {t("dash.sales_week")}
              </span>
              {fin && stats.revenue > 0 && (
                <>
                  <span className="text-border-strong">·</span>
                  <span className="hgv-figure flex items-center gap-1 font-medium text-success">
                    <TrendingUp size={11} /> {fmtCurrency(stats.revenue)}
                  </span>
                </>
              )}
              {onlineCount > 0 && (
                <>
                  <span className="text-border-strong">·</span>
                  <span className="flex items-center gap-1 font-medium text-success">
                    <span className="w-1 h-1 rounded-full bg-success" />
                    {onlineCount} {t("dash.shops_live")}
                  </span>
                </>
              )}
              {stats.lowStock > 0 && (
                <>
                  <span className="text-border-strong">·</span>
                  <span className="flex items-center gap-1 font-medium text-warning">
                    <AlertTriangle size={11} /> {stats.lowStock} {t("dash.low_stock_label")}
                  </span>
                </>
              )}
            </div>

            {/* Copyright + sync */}
            <div className="text-center sm:text-right">
              <p className="text-[11px] text-text-faint font-medium">© {new Date().getFullYear()} Higoverse</p>
              {lastUpdated && (
                <p className="text-[11px] text-text-faint/70 mt-0.5">{t("dash.synced")} {fmtTime(lastUpdated)}</p>
              )}
            </div>

          </div>
        </footer>

      </main>
    </div>
  );
}

// ─── Home Skeleton ────────────────────────────────────────────────────────────
function HomeSkeleton() {
  return (
    <>
      <style>{`
        @keyframes home-sh {
          0%   { background-position: -700px 0; }
          100% { background-position:  700px 0; }
        }
        .home-sh {
          background: linear-gradient(90deg, #ebe9e5 25%, #e0dfdc 50%, #ebe9e5 75%);
          background-size: 700px 100%;
          animation: home-sh 1.4s infinite linear;
          border-radius: 2px;
        }
        .home-sh-w { background: linear-gradient(90deg, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1) 75%); background-size: 700px 100%; animation: home-sh 1.4s infinite linear; border-radius: 2px; }
      `}</style>
      <div className="min-h-screen">
        <main className="max-w-7xl mx-auto px-3 sm:px-5 py-2.5 sm:py-3 space-y-3">

          {/* Hero */}
          <div className="hgv-surface rounded-data overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-data home-sh-w shrink-0" />
                <div className="space-y-1.5">
                  <div className="home-sh-w" style={{ width: 60, height: 8 }} />
                  <div className="home-sh-w" style={{ width: 140, height: 18 }} />
                  <div className="home-sh-w" style={{ width: 90, height: 8 }} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                {[80, 90, 70].map((w, i) => (
                  <div key={i} className="rounded-press px-3 py-2 space-y-1" style={{ background: "rgba(255,255,255,0.08)", minWidth: 72 }}>
                    <div className="home-sh-w" style={{ width: w, height: 7 }} />
                    <div className="home-sh-w" style={{ width: 48, height: 16 }} />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2.5">
                <div className="space-y-1 text-right">
                  <div className="home-sh-w ml-auto" style={{ width: 90, height: 18 }} />
                  <div className="home-sh-w ml-auto" style={{ width: 130, height: 8 }} />
                </div>
                <div className="w-9 h-9 rounded-press home-sh-w" />
              </div>
            </div>
            <div className="border-t px-4 py-1.5" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
              <div className="home-sh-w" style={{ width: 160, height: 8 }} />
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-3 xl:grid-cols-6 gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white border border-border rounded-data p-3 relative overflow-hidden">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="home-sh" style={{ width: 50, height: 7 }} />
                    <div className="w-4 h-4 home-sh" />
                  </div>
                  <div className="home-sh" style={{ width: 64, height: 18 }} />
                  <div className="home-sh" style={{ width: 80, height: 7 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Today's status */}
          <div className="bg-white border border-border rounded-data p-4">
            <div className="flex justify-between items-center mb-3">
              <div className="home-sh" style={{ width: 160, height: 11 }} />
              <div className="home-sh rounded-press" style={{ width: 80, height: 24 }} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="p-2.5 rounded-data border border-border space-y-1.5">
                  <div className="home-sh" style={{ width: 60, height: 7 }} />
                  <div className="home-sh" style={{ width: 90, height: 16 }} />
                  <div className="home-sh" style={{ width: 50, height: 7 }} />
                </div>
              ))}
            </div>
            <div className="mt-3 home-sh rounded-full" style={{ height: 6 }} />
          </div>

          {/* Progress bars */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white border border-border rounded-data p-3.5 space-y-2.5">
                <div className="flex justify-between">
                  <div className="home-sh" style={{ width: 80, height: 8 }} />
                  <div className="home-sh" style={{ width: 30, height: 8 }} />
                </div>
                <div className="home-sh rounded-full" style={{ height: 6 }} />
                <div className="flex justify-between">
                  <div className="home-sh" style={{ width: 70, height: 7 }} />
                  <div className="home-sh" style={{ width: 40, height: 7 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Chart + Recent sales */}
          <div className="grid md:grid-cols-5 gap-3">
            <div className="md:col-span-3 bg-white border border-border rounded-data p-4">
              <div className="flex justify-between items-center mb-4">
                <div className="home-sh" style={{ width: 120, height: 11 }} />
                <div className="home-sh rounded-press" style={{ width: 70, height: 24 }} />
              </div>
              <div className="home-sh rounded-data" style={{ height: 110 }} />
            </div>
            <div className="md:col-span-2 bg-white border border-border rounded-data overflow-hidden">
              <div className="flex justify-between items-center px-4 pt-4 pb-2.5">
                <div className="home-sh" style={{ width: 100, height: 11 }} />
                <div className="home-sh rounded-press" style={{ width: 70, height: 24 }} />
              </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5 px-4 py-2.5 border-t border-border">
                  <div className="w-4 h-4 home-sh shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="home-sh" style={{ width: "70%", height: 9 }} />
                    <div className="home-sh" style={{ width: "40%", height: 7 }} />
                  </div>
                  <div className="home-sh" style={{ width: 50, height: 9 }} />
                </div>
              ))}
            </div>
          </div>

          {/* Stock alerts + Quick actions */}
          <div className="grid md:grid-cols-2 gap-3">
            <div className="bg-white border border-border rounded-data overflow-hidden">
              <div className="flex justify-between items-center px-4 pt-4 pb-2.5">
                <div className="home-sh" style={{ width: 110, height: 11 }} />
                <div className="home-sh rounded-press" style={{ width: 60, height: 24 }} />
              </div>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5 px-4 py-2.5 border-t border-border">
                  <div className="w-2 h-2 rounded-full home-sh shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="home-sh" style={{ width: "60%", height: 9 }} />
                    <div className="home-sh" style={{ width: "45%", height: 7 }} />
                  </div>
                  <div className="home-sh rounded-press" style={{ width: 60, height: 22 }} />
                </div>
              ))}
            </div>
            <div className="bg-white border border-border rounded-data p-4">
              <div className="home-sh mb-3" style={{ width: 100, height: 11 }} />
              <div className="home-sh rounded-press mb-2" style={{ height: 56 }} />
              <div className="border border-border rounded-data divide-y divide-border">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-3 py-2.5">
                    <div className="w-4 h-4 home-sh shrink-0" />
                    <div className="home-sh flex-1" style={{ height: 9 }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Services */}
          <div className="bg-white border border-border rounded-data p-4">
            <div className="home-sh mb-3" style={{ width: 90, height: 11 }} />
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="w-4 h-4 home-sh shrink-0" />
                  <div className="home-sh flex-1" style={{ height: 9 }} />
                </div>
              ))}
            </div>
          </div>

        </main>
      </div>
    </>
  );
}
