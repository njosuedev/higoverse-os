"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { itemRequest } from "@/lib/product-api";
import { partnerRequest } from "@/lib/supplier-api";
import { saleRequest } from "@/lib/sale-api";
import { reportRequest } from "@/lib/report-api";
import { expenseRequest } from "@/lib/expense-api";
import { purchaseRequest } from "@/lib/purchase-api";
import { listShops, type Shop as ShopInfo } from "@/lib/shop-api";
import StatCard from "@/app/components/dashboard/StatCard";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Package, Truck, BarChart3, ShoppingCart, Users, Settings,
  RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Globe,
  CheckCircle, FileText, Plus,
  Activity, Receipt, Wallet, DollarSign, MapPin, Phone,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface StockAlert { id: string; name: string; quantity: number; selling_price: number; }
interface Stats { products: number; partners: number; sales: number; revenue: number; lowStock: number; outOfStock: number; }
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
  return d.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 }).format(n);
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
  if (!lastSeenAt) return { online: false, label: "never_seen", color: "bg-slate-300" };
  const d = parseUTC(lastSeenAt);
  const secs = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (secs < 300)   return { online: true,  label: "online_now",                         color: "bg-green-500" };
  if (secs < 3600)  return { online: false, label: `${Math.floor(secs / 60)}m ago`,      color: "bg-amber-400" };
  if (secs < 86400) return { online: false, label: `${Math.floor(secs / 3600)}h ago`,    color: "bg-orange-400" };
  const days = Math.floor(secs / 86400);
  if (days < 7)     return { online: false, label: `${days}d ago`,                       color: "bg-slate-300" };
  return { online: false, label: d.toLocaleDateString([], { month: "short", day: "numeric" }), color: "bg-slate-300" };
}


const SVC_COLORS: Record<string, { bg: string; text: string }> = {
  blue:   { bg: "bg-[#eff6ff]", text: "text-[#2563eb]" },
  indigo: { bg: "bg-[#eff6ff]", text: "text-[#2563eb]" },
  teal:   { bg: "bg-[#eff6ff]", text: "text-[#2563eb]" },
  orange: { bg: "bg-[#eff6ff]", text: "text-[#2563eb]" },
  violet: { bg: "bg-[#eff6ff]", text: "text-[#2563eb]" },
  pink:   { bg: "bg-[#eff6ff]", text: "text-[#2563eb]" },
  slate:  { bg: "bg-slate-100",  text: "text-slate-600" },
};

const REFRESH_INTERVAL = 60;

// ─── Dashboard cache (localStorage) ──────────────────────────────────────────
const DASH_CACHE_KEY = "hgv_dash_v3";
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
  const { t } = useLanguage();

  const SERVICES = [
    { title: t("dash.items_inventory"), description: t("dash.items_inventory_desc"), icon: Package,      href: "/items",     color: "blue" },
    { title: t("nav.partners"),         description: t("dash.partners_desc"),         icon: Users,        href: "/partners",  color: "indigo" },
    { title: t("nav.purchases"),        description: t("dash.purchases_desc"),        icon: Truck,        href: "/purchases", color: "teal" },
    { title: t("nav.sales"),            description: t("dash.sales_desc"),            icon: ShoppingCart, href: "/sales",     color: "orange" },
    { title: t("nav.expenses"),          description: t("dash.expenses_desc"),         icon: Wallet,       href: "/expenses",  color: "orange" },
    { title: t("nav.reports"),          description: t("dash.reports_desc"),          icon: BarChart3,    href: "/reports",   color: "violet" },
    { title: t("nav.proforma"),         description: t("dash.proforma_desc"),         icon: FileText,     href: "/proforma",  color: "pink" },
    { title: t("nav.settings"),         description: t("dash.settings_desc"),         icon: Settings,     href: "/settings",    color: "slate" },
  ];

  const [stats, setStats]             = useState<Stats>({ products: 0, partners: 0, sales: 0, revenue: 0, lowStock: 0, outOfStock: 0 });
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
    setStats(c.stats);
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

    // ── Phase 1: critical KPIs — unblocks UI fast ──────────────────────────
    try {
      const [salesRes, stockRes, recentRes] = await Promise.allSettled([
        saleRequest(`/sales/summary?from_date=${today}&to_date=${today}`),
        itemRequest("/products/stock-alerts?threshold=10"),
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
      setStockAlerts(alertItems.slice(0, 6));
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
        reportRequest("/reports/daily?days=8"),
        expenseRequest(`/expenses/summary?from_date=${today}&to_date=${today}`),
        purchaseRequest(`/purchases/summary?from_date=${today}&to_date=${today}`),
      ]);

      const productCount = productsRes.status === "fulfilled" ? (productsRes.value?.data?.total ?? 0) : 0;
      const partnerCount = partnersRes.status === "fulfilled"
        ? (Array.isArray(partnersRes.value?.data) ? partnersRes.value.data.length
            : (partnersRes.value?.data?.total ?? 0)) : 0;
      const newShops: ShopInfo[] = shopsRes.status === "fulfilled" ? (shopsRes.value?.items ?? []) : [];
      const daily: DailyRecord[] = dailyRes.status === "fulfilled" ? (dailyRes.value?.data ?? []) : [];
      const expData = expenseRes.status === "fulfilled"
        ? (expenseRes.value?.data || { total_expenses: 0, count: 0 })
        : { total_expenses: 0, count: 0 };
      const purchCost = purchaseRes.status === "fulfilled"
        ? (purchaseRes.value?.data?.total_cost ?? purchaseRes.value?.data?.items?.reduce(
            (s: number, p: { total_cost?: number }) => s + (p.total_cost ?? 0), 0) ?? 0)
        : 0;
      const yRev = daily.length >= 2 ? (daily[daily.length - 2]?.revenue ?? 0) : 0;

      setStats((prev) => {
        const next = { ...prev, products: productCount, partners: partnerCount };
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

  if (!user || dataLoading) return <HomeSkeleton />;

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
      <main className="max-w-7xl mx-auto px-3 sm:px-5 py-2.5 sm:py-3 space-y-3">

        {/* ── PRODUCT SERVICE ERROR BANNER ───────────────────────────────────── */}
        {productServiceError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
            <AlertTriangle size={11} className="text-red-500 shrink-0" />
            <p className="text-[10px] text-red-700 flex-1 min-w-0">
              {t("dash.service_error")}
            </p>
            <button
              onClick={manualRefresh}
              className="text-[10px] font-bold text-red-700 bg-red-100 hover:bg-red-200 px-2 py-0.5 rounded-md shrink-0 transition"
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        {/* ── HERO ────────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-2xl text-white shadow-md" style={{ backgroundColor: "#2563eb" }}>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-4 py-3.5">
            <div className="flex items-center gap-3">
              {currentShop?.logo_url && (
                <img
                  src={currentShop.logo_url}
                  alt={currentShop.name}
                  className="w-11 h-11 rounded-2xl object-cover border-2 border-white/20 shadow shrink-0"
                />
              )}
              <div>
                <p className="text-blue-200 text-[10px] font-medium uppercase tracking-widest">{t("dash.welcome")}</p>
                <h1 className="text-lg md:text-xl font-bold mt-0.5">{currentShop?.name || user.name || t("dash.my_shop")}</h1>
                <p className="text-blue-200 text-[11px] mt-0.5">{user.name} · {user.role || t("dash.owner_role")}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="bg-white/10 px-2.5 py-1.5 rounded-xl text-center">
                <p className="text-blue-200 text-[9px] uppercase tracking-wider">{t("dash.sales_today")}</p>
                <p className="text-sm font-bold">{stats.sales}</p>
              </div>
              <div className="bg-white/10 px-2.5 py-1.5 rounded-xl text-center">
                <p className="text-blue-200 text-[9px] uppercase tracking-wider">{t("dash.revenue_today")}</p>
                <p className="text-sm font-bold text-green-300">
                  {stats.revenue > 0 ? `RWF ${fmtShort(stats.revenue)}` : "—"}
                </p>
              </div>
              {(stats.lowStock > 0 || stats.outOfStock > 0) && (
                <div className="bg-red-500/20 border border-red-400/30 px-2.5 py-1.5 rounded-xl text-center">
                  <p className="text-red-200 text-[9px] uppercase tracking-wider">{t("dash.needs_restock")}</p>
                  <p className="text-sm font-bold text-red-200">{stats.lowStock + stats.outOfStock}</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right">
                <p className="text-sm font-mono font-bold tabular-nums">{fmtTime(now)}</p>
                <p className="text-blue-300 text-[10px]">{fmtDate(now)}</p>
              </div>
              <button
                onClick={manualRefresh} disabled={refreshing}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition disabled:opacity-50"
                title={t("common.refresh")}
              >
                <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          <div className="relative z-10 border-t border-white/10 px-4 py-1.5 flex items-center gap-3 text-[10px] text-blue-200">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              {t("dash.live_refresh")} {countdown}s
            </span>
            {lastUpdated && <span>{t("dash.last_updated")} {timeAgo(lastUpdated, t)}</span>}
          </div>
        </section>

        {/* ── KPI CARDS — Revenue is the hero metric, everything else balanced ── */}
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <StatCard
            label={t("dash.revenue_today")}
            value={stats.revenue > 0 ? fmtCurrency(stats.revenue) : t("common.no_data")}
            icon={<TrendingUp size={20} strokeWidth={2.5} />}
            tone="green"
            size="lg"
            href="/reports"
            delta={revDeltaPct !== null ? { value: `${Math.abs(revDeltaPct)}%`, direction: revDeltaPct >= 0 ? "up" : "down" } : undefined}
            subtitle={yesterdayRevenue > 0 ? `${t("dash.yesterday")}: ${fmtCurrency(yesterdayRevenue)}` : t("dash.first_day_data")}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-5">
            <StatCard label={t("dash.products")} value={stats.products.toLocaleString()}
              icon={<Package size={16} strokeWidth={2.5} />} tone="blue" href="/items" subtitle={t("dash.in_your_shop")} />
            <StatCard label={t("dash.partners")} value={stats.partners.toLocaleString()}
              icon={<Users size={16} strokeWidth={2.5} />} tone="blue" href="/partners" subtitle={t("dash.suppliers_customers")} />
            <StatCard label={t("dash.sales_today")} value={stats.sales.toLocaleString()}
              icon={<ShoppingCart size={16} strokeWidth={2.5} />} tone="blue" href="/sales" subtitle={t("dash.transactions")} />
            <StatCard label={t("items.low_stock")} value={stats.lowStock.toLocaleString()}
              icon={<AlertTriangle size={16} strokeWidth={2.5} />}
              tone={stats.lowStock > 0 ? "amber" : "slate"} href="/items" subtitle={t("dash.le_10_units")} />
            <StatCard label={t("items.out_stock")} value={stats.outOfStock.toLocaleString()}
              icon={<Package size={16} strokeWidth={2.5} />}
              tone={stats.outOfStock > 0 ? "red" : "slate"} href="/items" subtitle={t("dash.zero_units")} />
          </div>
        </section>

        {/* ── TODAY'S SHOP STATUS ──────────────────────────────────────────────── */}
        <section className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <DollarSign size={13} className="text-[#2563eb]" />
              {t("dash.shop_status_today") || "Today's Shop Status"}
            </h2>
            <Link href="/reports" className="text-[11px] font-semibold text-white px-2.5 py-0.5 rounded-lg transition hover:opacity-90" style={{ backgroundColor: "#2563eb" }}>
              {t("dash.full_report")} →
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2 bg-green-50 rounded-xl">
              <p className="text-[9px] text-slate-400 uppercase tracking-wide font-medium">{t("dash.revenue_today") || "Revenue"}</p>
              <p className="text-sm font-bold text-green-700 mt-0.5">{stats.revenue > 0 ? fmtCurrency(stats.revenue) : "—"}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{stats.sales} {t("dash.sales_today") || "sales"}</p>
            </div>
            <div className="p-2 bg-slate-100 rounded-xl">
              <p className="text-[9px] text-slate-400 uppercase tracking-wide font-medium">{t("nav.purchases") || "Purchases"}</p>
              <p className="text-sm font-bold text-slate-700 mt-0.5">{purchaseCostToday > 0 ? fmtCurrency(purchaseCostToday) : "—"}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{t("dash.stock_cost") || "Stock cost"}</p>
            </div>
            <div className="p-2 bg-orange-50 rounded-xl">
              <p className="text-[9px] text-slate-400 uppercase tracking-wide font-medium">{t("nav.expenses") || "Expenses"}</p>
              <p className="text-sm font-bold text-orange-700 mt-0.5">{expenseToday.total_expenses > 0 ? fmtCurrency(expenseToday.total_expenses) : "—"}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{expenseToday.count} {t("expenses.records") || "records"}</p>
            </div>
            <div className={`p-2 rounded-xl ${netProfit >= 0 ? "bg-[#eff6ff]" : "bg-red-50"}`}>
              <p className="text-[9px] text-slate-400 uppercase tracking-wide font-medium">{t("dash.net_profit") || "Net Profit"}</p>
              <p className={`text-sm font-bold mt-0.5 ${netProfit >= 0 ? "text-[#2563eb]" : "text-red-600"}`}>
                {totalCosts > 0 || stats.revenue > 0 ? fmtCurrency(netProfit) : "—"}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {netProfit >= 0 ? (t("dash.profitable") || "Profitable ✓") : (t("dash.at_loss") || "At a loss")}
              </p>
            </div>
          </div>

          {stats.revenue > 0 && (
            <div className="mt-2">
              <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
                {purchasePct > 0 && <div className="bg-slate-400 rounded-l-full" style={{ width: `${purchasePct}%` }} />}
                {expensePct  > 0 && <div className="bg-amber-400"               style={{ width: `${expensePct}%` }} />}
                {netPct      > 0 && <div className="bg-green-500 rounded-r-full flex-1" />}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1.5">
                <span className="flex items-center gap-1 text-[10px] text-slate-500">
                  <span className="w-2 h-1.5 rounded-sm bg-slate-400 inline-block" /> {t("nav.purchases") || "Purchases"} {purchasePct}%
                </span>
                <span className="flex items-center gap-1 text-[10px] text-slate-500">
                  <span className="w-2 h-1.5 rounded-sm bg-amber-400 inline-block" /> {t("nav.expenses") || "Expenses"} {expensePct}%
                </span>
                <span className="flex items-center gap-1 text-[10px] text-slate-500">
                  <span className="w-2 h-1.5 rounded-sm bg-green-500 inline-block" /> {t("dash.profit_label") || "Profit"} {netPct}%
                </span>
                <Link href="/ExpenseManagement" className="ml-auto text-[10px] font-semibold text-white px-2.5 py-1 rounded-lg flex items-center gap-1 transition hover:opacity-90" style={{ backgroundColor: "#2563eb" }}>
                  <Receipt size={10} strokeWidth={2.5} /> {t("expenses.add") || "Record Expense"}
                </Link>
              </div>
            </div>
          )}
        </section>

        {/* ── BUSINESS PROGRESS ───────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Stock health */}
          {(() => {
            const total = stats.products;
            const healthy = total - stats.lowStock - stats.outOfStock;
            const healthPct = total > 0 ? Math.round((healthy / total) * 100) : 100;
            const lowPct    = total > 0 ? Math.round((stats.lowStock   / total) * 100) : 0;
            const outPct    = total > 0 ? Math.round((stats.outOfStock / total) * 100) : 0;
            return (
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1">
                    <Package size={10} className="text-[#2563eb]" /> {t("dash.stock_health") || "Stock Health"}
                  </p>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    healthPct >= 80 ? "bg-green-50 text-green-700" : healthPct >= 50 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600"
                  }`}>{healthPct}%</span>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden gap-px mb-2">
                  {healthy    > 0 && <div className="bg-green-500 rounded-l-full" style={{ width: `${healthPct}%` }} />}
                  {stats.lowStock > 0 && <div className="bg-amber-400" style={{ width: `${lowPct}%` }} />}
                  {stats.outOfStock > 0 && <div className="bg-red-500 rounded-r-full" style={{ width: `${outPct}%` }} />}
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="flex items-center gap-1 text-[9px] text-slate-500"><span className="w-2 h-1.5 rounded-sm bg-green-500 inline-block" /> {healthy} {t("dash.healthy") || "Healthy"}</span>
                  {stats.lowStock   > 0 && <span className="flex items-center gap-1 text-[9px] text-slate-500"><span className="w-2 h-1.5 rounded-sm bg-amber-400 inline-block" /> {stats.lowStock} {t("items.low_stock")}</span>}
                  {stats.outOfStock > 0 && <span className="flex items-center gap-1 text-[9px] text-slate-500"><span className="w-2 h-1.5 rounded-sm bg-red-500 inline-block" /> {stats.outOfStock} {t("items.out_stock")}</span>}
                </div>
              </div>
            );
          })()}

          {/* Net margin */}
          {(() => {
            const margin = stats.revenue > 0 ? Math.round((netProfit / stats.revenue) * 100) : 0;
            const capped  = Math.min(100, Math.max(0, margin));
            const isGood  = margin >= 20;
            const color   = margin < 0 ? "#ef4444" : margin < 15 ? "#f59e0b" : "#22c55e";
            return (
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1">
                    <TrendingUp size={10} className="text-[#2563eb]" /> {t("dash.profit_margin") || "Net Margin"}
                  </p>
                  <span className="text-[10px] font-bold" style={{ color }}>{margin}%</span>
                </div>
                <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                  <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700" style={{ width: `${capped}%`, backgroundColor: color }} />
                </div>
                <div className="flex items-center justify-between text-[9px] text-slate-400">
                  <span>{t("dash.revenue_today")}: {fmtCurrency(stats.revenue)}</span>
                  <span className={isGood ? "text-green-600 font-semibold" : ""}>{isGood ? t("dash.margin_healthy") : margin < 0 ? t("dash.margin_loss") : t("dash.margin_fair")}</span>
                </div>
              </div>
            );
          })()}

          {/* Shops online */}
          {(() => {
            const pct = shops.length > 0 ? Math.round((onlineCount / shops.length) * 100) : 0;
            return (
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1">
                    <Globe size={10} className="text-[#2563eb]" /> {t("dash.shops_live") || "Shops Live"}
                  </p>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-green-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />{onlineCount}/{shops.length}
                  </span>
                </div>
                <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-green-500 transition-all duration-700" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between text-[9px] text-slate-400">
                  <span>{onlineCount} {t("dash.online_now") || "online now"}</span>
                  <span>{pct}% {t("common.active") || "active"}</span>
                </div>
              </div>
            );
          })()}
        </section>

        {/* ── 7-DAY CHART + RECENT SALES ──────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-2.5">
          <section className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md flex items-center justify-center text-white" style={{ backgroundColor: "#2563eb" }}>
                    <Activity size={11} strokeWidth={2.5} />
                  </span>
                  {t("dash.revenue_7d")}
                </h2>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {t("common.total")}: {fmtCurrency(chartData.reduce((s, d) => s + d.revenue, 0))}
                </p>
              </div>
              <Link href="/reports" className="text-[11px] font-semibold text-white px-2.5 py-0.5 rounded-lg transition hover:opacity-90" style={{ backgroundColor: "#2563eb" }}>
                {t("dash.full_report")} →
              </Link>
            </div>

            <ResponsiveContainer width="100%" height={95}>
              <AreaChart data={chartData} margin={{ top: 6, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ fontSize: 10, borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}
                  formatter={(v: unknown, name: unknown) => [
                    fmtCurrency(typeof v === "number" ? v : 0),
                    name === "revenue" ? t("dash.revenue_label") : t("dash.profit_label"),
                  ]}
                />
                <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="url(#revFill)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="profit"  stroke="#10b981" fill="url(#profFill)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="w-2.5 h-0.5 rounded" style={{ background: "#2563eb" }} /> {t("dash.revenue_label")}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="w-2.5 h-0.5 bg-emerald-500 rounded" /> {t("dash.profit_label")}
              </span>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-3 pt-3 pb-2">
              <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Receipt size={13} className="text-[#2563eb]" />
                {t("dash.recent_sales")}
              </h2>
              <Link href="/sales" className="text-[11px] font-semibold text-white px-2.5 py-0.5 rounded-lg transition hover:opacity-90" style={{ backgroundColor: "#2563eb" }}>
                {t("dash.all_sales")} →
              </Link>
            </div>

            {recentSales.length === 0 ? (
              <div className="px-3 pb-3 text-slate-400 text-xs flex items-center gap-2 py-4">
                <ShoppingCart size={13} /> {t("dash.no_sales_today")}
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {recentSales.map((sale) => (
                  <div key={sale.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition-colors">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-white" style={{ backgroundColor: "#2563eb" }}>
                      <ShoppingCart size={11} strokeWidth={2.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{sale.product_name || t("nav.sales")}</p>
                      <p className="text-[10px] text-slate-400">
                        {sale.quantity} {sale.quantity !== 1 ? t("dash.unit_plural") : t("dash.unit_singular")}
                        {sale.created_at ? ` · ${timeAgo(parseUTC(sale.created_at), t)}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-slate-800">{fmtCurrency(sale.total_amount)}</p>
                      {sale.profit != null && sale.profit > 0 && (
                        <p className="text-[9px] text-green-600">+{fmtCurrency(sale.profit)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="px-3 py-2 border-t border-slate-50">
              <Link href="/sales"
                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-white py-1.5 rounded-xl transition hover:opacity-90" style={{ background: "#2563eb" }}>
                <Plus size={11} /> {t("dash.record_new_sale")}
              </Link>
            </div>
          </section>
        </div>

        {/* ── STOCK ALERTS + QUICK ACTIONS ────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-2.5">

          <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-3 pt-3 pb-2">
              <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <AlertTriangle size={13} className="text-orange-500" />
                {t("reports.stock_alerts")}
                {stockAlerts.length > 0 && (
                  <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                    {stockAlerts.length}
                  </span>
                )}
              </h2>
              <Link href="/items" className="text-[11px] font-semibold text-white px-2.5 py-0.5 rounded-lg transition hover:opacity-90" style={{ backgroundColor: "#2563eb" }}>
                {t("dash.view_all")} →
              </Link>
            </div>

            {stockAlerts.length === 0 ? (
              <div className="px-3 pb-3 flex items-center gap-2.5 py-4">
                <div className="w-7 h-7 rounded-xl bg-green-100 flex items-center justify-center">
                  <CheckCircle size={13} className="text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-700 text-xs">{t("dash.all_stock_healthy")}</p>
                  <p className="text-slate-400 text-[10px]">{t("dash.no_restock_needed")}</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {stockAlerts.map((item) => (
                  <div key={item.id}
                    className={`flex items-center gap-2 px-3 py-2 ${item.quantity === 0 ? "bg-red-50/40" : "bg-amber-50/30"}`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${item.quantity === 0 ? "bg-red-500" : "bg-amber-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{item.name}</p>
                      <p className="text-[10px] text-slate-400">
                        {item.quantity === 0 ? t("dash.empty_stock") : `${item.quantity} ${t("dash.units_left")}`}
                        {" · "}{fmtCurrency(item.selling_price)}
                      </p>
                    </div>
                    <Link
                      href="/PurchaseManagement"
                      className="flex items-center gap-1 text-[10px] font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] px-2 py-0.5 rounded-lg transition"
                    >
                      <Plus size={10} /> {t("reports.restock")}
                    </Link>
                  </div>
                ))}
              </div>
            )}

            {stockAlerts.length > 0 && (
              <div className="px-3 py-2 border-t border-slate-50">
                <Link href="/PurchaseManagement"
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-[#2563eb] bg-[#eff6ff] hover:bg-[#dbeafe] py-1.5 rounded-xl transition">
                  <Truck size={11} /> {t("items.go_purchases")}
                </Link>
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
            <h2 className="font-bold text-slate-900 text-sm mb-2">{t("dash.quick_actions")}</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: "/sales",              icon: Plus,      label: t("dash.new_sale"),     desc: t("dash.new_sale_desc") },
                { href: "/PurchaseManagement", icon: Truck,     label: t("dash.new_purchase"), desc: t("dash.new_purchase_desc") },
                { href: "/ExpenseManagement",  icon: Wallet,    label: t("nav.expenses") || "Add Expense", desc: t("dash.expenses_desc") || "Log a business expense" },
                { href: "/reports",            icon: BarChart3, label: t("dash.view_reports"), desc: t("dash.charts_analytics") },
              ].map((a) => (
                <Link key={a.href} href={a.href}
                  className="flex items-center gap-2 p-2.5 rounded-xl text-white shadow-sm"
                  style={{ backgroundColor: "#2563eb" }}
                >
                  <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    <a.icon size={13} strokeWidth={2.5} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold leading-tight">{a.label}</p>
                    <p className="text-[10px] text-white/70 mt-0.5 truncate">{a.desc}</p>
                  </div>
                </Link>
              ))}
            </div>

            {stats.sales > 0 && (
              <div className="mt-2 p-2 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2">
                <div className="w-6 h-6 rounded-xl bg-green-100 flex items-center justify-center">
                  <TrendingUp size={12} className="text-green-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700">
                    {stats.sales} {stats.sales !== 1 ? t("dash.sale_plural") : t("dash.sale_singular")} · {fmtCurrency(stats.revenue)}
                  </p>
                  {revDeltaPct !== null && (
                    <p className={`text-[10px] font-medium mt-0.5 flex items-center gap-1 ${revDeltaPct >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {revDeltaPct >= 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                      {Math.abs(revDeltaPct)}% {t("dash.vs_yesterday")}
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ── BUSINESS SERVICES ───────────────────────────────────────────────── */}
        <section>
          <h2 className="font-bold text-slate-900 text-sm mb-2">{t("dash.services")}</h2>
          <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-8 gap-1.5">
            {SERVICES.map((svc) => {
              const Icon = svc.icon;
              return (
                <Link key={svc.href} href={svc.href}
                  className="bg-white border border-slate-200 rounded-xl p-2.5 text-center block"
                >
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center mx-auto mb-1.5 text-white" style={{ backgroundColor: "#2563eb" }}>
                    <Icon size={15} strokeWidth={2.5} />
                  </div>
                  <p className="text-[10px] font-bold text-slate-800 leading-tight">{svc.title}</p>
                  <div className="mt-1 flex items-center justify-center gap-0.5 text-[9px] text-green-600">
                    <CheckCircle size={8} /> {t("dash.open")}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
        <footer className="pb-6 border-t border-slate-200 pt-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">

            {/* Brand */}
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Higoverse" className="w-7 h-7 rounded-lg object-cover" />
              <div>
                <p className="text-xs font-bold text-slate-700">Higoverse</p>
                <p className="text-[9px] text-slate-400">{t("dash.footer_tagline")}</p>
              </div>
            </div>

            {/* Live business snapshot pills */}
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              <span className="flex items-center gap-1 text-[9px] font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded-full">
                <Package size={10} className="text-[#2563eb]" /> {stats.products} {t("dash.products")}
              </span>
              <span className="flex items-center gap-1 text-[9px] font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded-full">
                <Users size={10} className="text-[#2563eb]" /> {stats.partners} {t("dash.partners")}
              </span>
              <span className="flex items-center gap-1 text-[9px] font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded-full">
                <ShoppingCart size={10} className="text-[#2563eb]" /> {stats.sales} {t("dash.sales_today")}
              </span>
              {stats.revenue > 0 && (
                <span className="flex items-center gap-1 text-[9px] font-semibold text-green-700 bg-green-50 px-2 py-1 rounded-full">
                  <TrendingUp size={10} /> {fmtCurrency(stats.revenue)}
                </span>
              )}
              {onlineCount > 0 && (
                <span className="flex items-center gap-1 text-[9px] font-semibold text-green-700 bg-green-50 px-2 py-1 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                  {onlineCount} {t("dash.shops_live") || "shops live"}
                </span>
              )}
              {stats.lowStock > 0 && (
                <span className="flex items-center gap-1 text-[9px] font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
                  <AlertTriangle size={10} /> {stats.lowStock} {t("dash.low_stock_label")}
                </span>
              )}
            </div>

            {/* Copyright + sync */}
            <div className="text-center sm:text-right">
              <p className="text-[9px] text-slate-400 font-medium">© {new Date().getFullYear()} Higoverse</p>
              {lastUpdated && (
                <p className="text-[9px] text-slate-300 mt-0.5">{t("dash.synced")} {fmtTime(lastUpdated)}</p>
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
          background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
          background-size: 700px 100%;
          animation: home-sh 1.4s infinite linear;
          border-radius: 6px;
        }
        .home-sh-w { background: linear-gradient(90deg, rgba(255,255,255,0.15) 25%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.15) 75%); background-size: 700px 100%; animation: home-sh 1.4s infinite linear; border-radius: 6px; }
      `}</style>
      <div className="min-h-screen">
        <main className="max-w-7xl mx-auto px-3 sm:px-5 py-2.5 sm:py-3 space-y-3">

          {/* Hero */}
          <div className="rounded-xl overflow-hidden shadow-md" style={{ backgroundColor: "#2563eb" }}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl home-sh-w shrink-0" />
                <div className="space-y-1.5">
                  <div className="home-sh-w" style={{ width: 60, height: 8 }} />
                  <div className="home-sh-w" style={{ width: 140, height: 18 }} />
                  <div className="home-sh-w" style={{ width: 90, height: 8 }} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                {[80, 90, 70].map((w, i) => (
                  <div key={i} className="rounded-xl px-3 py-2 space-y-1" style={{ background: "rgba(255,255,255,0.1)", minWidth: 72 }}>
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
                <div className="w-8 h-8 rounded-xl home-sh-w" />
              </div>
            </div>
            <div className="border-t px-4 py-1.5" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
              <div className="home-sh-w" style={{ width: 160, height: 8 }} />
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-3 xl:grid-cols-6 gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl home-sh" />
                <div className="pl-2.5 space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="home-sh" style={{ width: 50, height: 7 }} />
                    <div className="w-7 h-7 rounded-lg home-sh" />
                  </div>
                  <div className="home-sh" style={{ width: 64, height: 18 }} />
                  <div className="home-sh" style={{ width: 80, height: 7 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Today's status */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <div className="home-sh" style={{ width: 160, height: 11 }} />
              <div className="home-sh rounded-lg" style={{ width: 80, height: 24 }} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {["bg-green-50", "bg-slate-100", "bg-orange-50", "bg-blue-50"].map((bg, i) => (
                <div key={i} className={`p-2.5 ${bg} rounded-xl space-y-1.5`}>
                  <div className="home-sh" style={{ width: 60, height: 7 }} />
                  <div className="home-sh" style={{ width: 90, height: 16 }} />
                  <div className="home-sh" style={{ width: 50, height: 7 }} />
                </div>
              ))}
            </div>
            <div className="mt-3 home-sh rounded-full" style={{ height: 8 }} />
          </div>

          {/* Progress bars */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-2.5">
                <div className="flex justify-between">
                  <div className="home-sh" style={{ width: 80, height: 8 }} />
                  <div className="home-sh" style={{ width: 30, height: 8 }} />
                </div>
                <div className="home-sh rounded-full" style={{ height: 8 }} />
                <div className="flex justify-between">
                  <div className="home-sh" style={{ width: 70, height: 7 }} />
                  <div className="home-sh" style={{ width: 40, height: 7 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Chart + Recent sales */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div className="home-sh" style={{ width: 120, height: 11 }} />
                <div className="home-sh rounded-lg" style={{ width: 70, height: 24 }} />
              </div>
              <div className="home-sh rounded-lg" style={{ height: 110 }} />
            </div>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="flex justify-between items-center px-4 pt-4 pb-2.5">
                <div className="home-sh" style={{ width: 100, height: 11 }} />
                <div className="home-sh rounded-lg" style={{ width: 70, height: 24 }} />
              </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5 px-4 py-2.5 border-t border-slate-50">
                  <div className="w-7 h-7 rounded-lg home-sh shrink-0" />
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
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="flex justify-between items-center px-4 pt-4 pb-2.5">
                <div className="home-sh" style={{ width: 110, height: 11 }} />
                <div className="home-sh rounded-lg" style={{ width: 60, height: 24 }} />
              </div>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5 px-4 py-2.5 border-t border-slate-50">
                  <div className="w-2 h-2 rounded-full home-sh shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="home-sh" style={{ width: "60%", height: 9 }} />
                    <div className="home-sh" style={{ width: "45%", height: 7 }} />
                  </div>
                  <div className="home-sh rounded-lg" style={{ width: 60, height: 22 }} />
                </div>
              ))}
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="home-sh mb-3" style={{ width: 100, height: 11 }} />
              <div className="grid grid-cols-2 gap-2.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="home-sh rounded-xl" style={{ height: 64 }} />
                ))}
              </div>
            </div>
          </div>

          {/* Services */}
          <div>
            <div className="home-sh mb-3" style={{ width: 90, height: 11 }} />
            <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-xl p-3 text-center space-y-2">
                  <div className="w-9 h-9 rounded-xl home-sh mx-auto" />
                  <div className="home-sh mx-auto" style={{ width: 48, height: 8 }} />
                </div>
              ))}
            </div>
          </div>

          {/* Shop cards */}
          <div>
            <div className="flex justify-between mb-3">
              <div className="home-sh" style={{ width: 160, height: 11 }} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="h-16 home-sh rounded-none" />
                  <div className="flex justify-center -mt-7 relative z-10">
                    <div className="w-14 h-14 rounded-full home-sh border-4 border-white" />
                  </div>
                  <div className="px-3 pb-3 pt-1.5 space-y-1.5 text-center">
                    <div className="home-sh mx-auto" style={{ width: "70%", height: 9 }} />
                    <div className="home-sh mx-auto" style={{ width: "50%", height: 7 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </main>
      </div>
    </>
  );
}

