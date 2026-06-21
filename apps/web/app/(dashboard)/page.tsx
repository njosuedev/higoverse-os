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
import LoadingSkeleton from "@/app/components/dashboard/LoadingSkeleton";
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
function timeAgo(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
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
  blue:   { bg: "bg-[#EBF2FD]", text: "text-[#1372e6]" },
  indigo: { bg: "bg-[#EBF2FD]", text: "text-[#1372e6]" },
  teal:   { bg: "bg-[#EBF2FD]", text: "text-[#1372e6]" },
  orange: { bg: "bg-[#EBF2FD]", text: "text-[#1372e6]" },
  violet: { bg: "bg-[#EBF2FD]", text: "text-[#1372e6]" },
  pink:   { bg: "bg-[#EBF2FD]", text: "text-[#1372e6]" },
  slate:  { bg: "bg-slate-100",  text: "text-slate-600" },
};

const REFRESH_INTERVAL = 30;

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
    { title: t("nav.settings"),         description: t("dash.settings_desc"),         icon: Settings,     href: "/settings",  color: "slate" },
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
  const [countdown, setCountdown]     = useState(REFRESH_INTERVAL);
  const [now, setNow]                 = useState(new Date());

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAll = async (soft = false) => {
    if (soft) setRefreshing(true);
    try {
      const today = toDateStr(new Date());
      const [productsRes, partnersRes, salesRes, stockRes, shopsRes, dailyRes, recentRes, expenseRes, purchaseRes] = await Promise.allSettled([
        itemRequest("/products?page=1&limit=1"),
        partnerRequest("/suppliers"),
        saleRequest(`/sales/summary?from_date=${today}&to_date=${today}`),
        itemRequest("/products/stock-alerts?threshold=10"),
        listShops({ limit: 100 }),
        reportRequest("/reports/daily?days=8"),
        saleRequest("/sales?page=1&limit=8"),
        expenseRequest(`/expenses/summary?from_date=${today}&to_date=${today}`),
        purchaseRequest(`/purchases?from_date=${today}&to_date=${today}&page=1&limit=200`),
      ]);

      const productCount = productsRes.status === "fulfilled" ? (productsRes.value?.data?.total ?? 0) : 0;
      const partnerCount = partnersRes.status === "fulfilled"
        ? (Array.isArray(partnersRes.value?.data) ? partnersRes.value.data.length : 0) : 0;
      const saleCount = salesRes.status === "fulfilled" ? (salesRes.value?.data?.sales_count ?? 0) : 0;
      const revenue   = salesRes.status === "fulfilled" ? (salesRes.value?.data?.revenue ?? 0) : 0;
      const alertItems: StockAlert[] = stockRes.status === "fulfilled" ? (stockRes.value?.data ?? []) : [];

      setStats({ products: productCount, partners: partnerCount, sales: saleCount, revenue,
        lowStock:   alertItems.filter((a) => a.quantity > 0).length,
        outOfStock: alertItems.filter((a) => a.quantity === 0).length,
      });
      setStockAlerts(alertItems.slice(0, 6));

      if (shopsRes.status === "fulfilled" && shopsRes.value) setShops(shopsRes.value.items ?? []);

      const daily: DailyRecord[] = dailyRes.status === "fulfilled" ? (dailyRes.value?.data ?? []) : [];
      setDailyData(daily);
      if (daily.length >= 2) setYesterdayRevenue(daily[daily.length - 2]?.revenue ?? 0);

      const recent: RecentSale[] = recentRes.status === "fulfilled"
        ? (recentRes.value?.data?.items ?? []) : [];
      setRecentSales(recent);

      if (expenseRes.status === "fulfilled")
        setExpenseToday(expenseRes.value?.data || { total_expenses: 0, count: 0 });

      if (purchaseRes.status === "fulfilled") {
        const purchaseItems: { total_cost?: number }[] = purchaseRes.value?.data?.items ?? [];
        setPurchaseCostToday(purchaseItems.reduce((s, p) => s + (p.total_cost ?? 0), 0));
      }

      setLastUpdated(new Date());
    } catch { /* informational */ } finally {
      setRefreshing(false);
      setDataLoading(false);
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

  if (!user || dataLoading) return <LoadingSkeleton />;

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
      <main className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4 space-y-4">

        {/* ── HERO ────────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-xl text-white shadow-md bg-[#1372e6]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-4 py-3.5">
            <div className="flex items-center gap-3">
              {currentShop?.logo_url && (
                <img
                  src={currentShop.logo_url}
                  alt={currentShop.name}
                  className="w-11 h-11 rounded-xl object-cover border-2 border-white/20 shadow shrink-0"
                />
              )}
              <div>
                <p className="text-blue-200 text-[10px] font-medium uppercase tracking-widest">{t("dash.welcome")}</p>
                <h1 className="text-xl md:text-2xl font-bold mt-0.5">{currentShop?.name || user.name || "My Shop"}</h1>
                <p className="text-blue-200 text-xs mt-0.5">{user.name} · {user.role || "Owner"}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="bg-white/10 px-3 py-2 rounded-xl text-center">
                <p className="text-blue-200 text-[9px] uppercase tracking-wider">{t("dash.sales_today")}</p>
                <p className="text-lg font-bold">{stats.sales}</p>
              </div>
              <div className="bg-white/10 px-3 py-2 rounded-xl text-center">
                <p className="text-blue-200 text-[9px] uppercase tracking-wider">{t("dash.revenue_today")}</p>
                <p className="text-lg font-bold text-green-300">
                  {stats.revenue > 0 ? `RWF ${fmtShort(stats.revenue)}` : "—"}
                </p>
              </div>
              {(stats.lowStock > 0 || stats.outOfStock > 0) && (
                <div className="bg-red-500/20 border border-red-400/30 px-3 py-2 rounded-xl text-center">
                  <p className="text-red-200 text-[9px] uppercase tracking-wider">{t("dash.needs_restock")}</p>
                  <p className="text-lg font-bold text-red-200">{stats.lowStock + stats.outOfStock}</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <div className="text-right">
                <p className="text-xl font-mono font-bold tabular-nums">{fmtTime(now)}</p>
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
            {lastUpdated && <span>{t("dash.last_updated")} {timeAgo(lastUpdated)}</span>}
          </div>
        </section>

        {/* ── KPI CARDS ────────────────────────────────────────────────────────── */}
        <section className="grid grid-cols-3 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
          <KpiCard label={t("dash.products")}    value={stats.products.toLocaleString()}
            icon={<Package size={15} />} color="blue" href="/items" sub={t("dash.in_your_shop")} t={t} />
          <KpiCard label={t("dash.partners")}    value={stats.partners.toLocaleString()}
            icon={<Users size={15} />} color="indigo" href="/partners" sub={t("dash.suppliers_customers")} t={t} />
          <KpiCard label={t("dash.sales_today")} value={stats.sales.toLocaleString()}
            icon={<ShoppingCart size={15} />} color="teal" href="/sales" sub={t("dash.transactions")} t={t} />
          <KpiCard label={t("dash.revenue_today")}
            value={stats.revenue > 0 ? fmtCurrency(stats.revenue) : t("common.no_data")}
            icon={<TrendingUp size={15} />} color="green" href="/reports" small
            delta={revDeltaPct}
            sub={yesterdayRevenue > 0 ? `Yesterday: ${fmtCurrency(yesterdayRevenue)}` : "first day data"} t={t} />
          <KpiCard label={t("items.low_stock")} value={stats.lowStock.toLocaleString()}
            icon={<AlertTriangle size={15} />}
            color={stats.lowStock > 0 ? "orange" : "slate"}
            href="/items" sub="≤ 10 units" warn={stats.lowStock > 0} t={t} />
          <KpiCard label={t("items.out_stock")} value={stats.outOfStock.toLocaleString()}
            icon={<Package size={15} />}
            color={stats.outOfStock > 0 ? "red" : "slate"}
            href="/items" sub="zero units" warn={stats.outOfStock > 0} t={t} />
        </section>

        {/* ── TODAY'S SHOP STATUS ──────────────────────────────────────────────── */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <DollarSign size={14} className="text-[#1372e6]" />
              {t("dash.shop_status_today") || "Today's Shop Status"}
            </h2>
            <Link href="/reports" className="text-xs font-semibold text-[#1372e6] hover:underline">
              {t("dash.full_report")} →
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-2.5 bg-green-50 rounded-xl">
              <p className="text-[9px] text-slate-400 uppercase tracking-wide font-medium">{t("dash.revenue_today") || "Revenue"}</p>
              <p className="text-base font-bold text-green-700 mt-0.5">{stats.revenue > 0 ? fmtCurrency(stats.revenue) : "—"}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{stats.sales} {t("dash.sales_today") || "sales"}</p>
            </div>
            <div className="p-2.5 bg-slate-100 rounded-xl">
              <p className="text-[9px] text-slate-400 uppercase tracking-wide font-medium">{t("nav.purchases") || "Purchases"}</p>
              <p className="text-base font-bold text-slate-700 mt-0.5">{purchaseCostToday > 0 ? fmtCurrency(purchaseCostToday) : "—"}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{t("dash.stock_cost") || "Stock cost"}</p>
            </div>
            <div className="p-2.5 bg-orange-50 rounded-xl">
              <p className="text-[9px] text-slate-400 uppercase tracking-wide font-medium">{t("nav.expenses") || "Expenses"}</p>
              <p className="text-base font-bold text-orange-700 mt-0.5">{expenseToday.total_expenses > 0 ? fmtCurrency(expenseToday.total_expenses) : "—"}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{expenseToday.count} {t("expenses.records") || "records"}</p>
            </div>
            <div className={`p-2.5 rounded-xl ${netProfit >= 0 ? "bg-[#EBF2FD]" : "bg-red-50"}`}>
              <p className="text-[9px] text-slate-400 uppercase tracking-wide font-medium">{t("dash.net_profit") || "Net Profit"}</p>
              <p className={`text-base font-bold mt-0.5 ${netProfit >= 0 ? "text-[#1372e6]" : "text-red-600"}`}>
                {totalCosts > 0 || stats.revenue > 0 ? fmtCurrency(netProfit) : "—"}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {netProfit >= 0 ? (t("dash.profitable") || "Profitable ✓") : (t("dash.at_loss") || "At a loss")}
              </p>
            </div>
          </div>

          {stats.revenue > 0 && (
            <div className="mt-3">
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
                <Link href="/ExpenseManagement" className="ml-auto text-[10px] font-semibold text-[#1372e6] hover:underline flex items-center gap-1">
                  <Receipt size={10} /> {t("expenses.add") || "Add expense"}
                </Link>
              </div>
            </div>
          )}
        </section>

        {/* ── 7-DAY CHART + RECENT SALES ──────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-4">
          <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Activity size={14} className="text-[#1372e6]" />
                  {t("dash.revenue_7d")}
                </h2>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {t("common.total")}: {fmtCurrency(chartData.reduce((s, d) => s + d.revenue, 0))}
                </p>
              </div>
              <Link href="/reports" className="text-xs font-semibold text-[#1372e6] hover:underline">
                {t("dash.full_report")} →
              </Link>
            </div>

            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={chartData} margin={{ top: 6, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#1372e6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#1372e6" stopOpacity={0} />
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
                <Area type="monotone" dataKey="revenue" stroke="#1372e6" fill="url(#revFill)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="profit"  stroke="#10b981" fill="url(#profFill)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-3 mt-1.5">
              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="w-2.5 h-0.5 rounded" style={{ background: "#1372e6" }} /> {t("dash.revenue_label")}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="w-2.5 h-0.5 bg-emerald-500 rounded" /> {t("dash.profit_label")}
              </span>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2.5">
              <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Receipt size={14} className="text-[#1372e6]" />
                {t("dash.recent_sales")}
              </h2>
              <Link href="/sales" className="text-xs font-semibold text-[#1372e6] hover:underline">
                {t("dash.all_sales")} →
              </Link>
            </div>

            {recentSales.length === 0 ? (
              <div className="px-4 pb-4 text-slate-400 text-xs flex items-center gap-2 py-5">
                <ShoppingCart size={14} /> {t("dash.no_sales_today")}
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {recentSales.map((sale) => (
                  <div key={sale.id} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 transition-colors">
                    <div className="w-7 h-7 rounded-lg bg-[#EBF2FD] text-[#1372e6] flex items-center justify-center shrink-0">
                      <ShoppingCart size={12} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{sale.product_name || t("nav.sales")}</p>
                      <p className="text-[10px] text-slate-400">
                        {sale.quantity} unit{sale.quantity !== 1 ? "s" : ""}
                        {sale.created_at ? ` · ${timeAgo(parseUTC(sale.created_at))}` : ""}
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

            <div className="px-4 py-2.5 border-t border-slate-50">
              <Link href="/sales"
                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-white py-2 rounded-xl transition hover:opacity-90" style={{ background: "#1372e6" }}>
                <Plus size={12} /> {t("dash.record_new_sale")}
              </Link>
            </div>
          </section>
        </div>

        {/* ── STOCK ALERTS + QUICK ACTIONS ────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-4">

          <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2.5">
              <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <AlertTriangle size={14} className="text-orange-500" />
                {t("reports.stock_alerts")}
                {stockAlerts.length > 0 && (
                  <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                    {stockAlerts.length}
                  </span>
                )}
              </h2>
              <Link href="/items" className="text-xs font-semibold text-[#1372e6] hover:underline">
                {t("dash.view_all")} →
              </Link>
            </div>

            {stockAlerts.length === 0 ? (
              <div className="px-4 pb-4 flex items-center gap-3 py-5">
                <div className="w-8 h-8 rounded-xl bg-green-100 flex items-center justify-center">
                  <CheckCircle size={15} className="text-green-600" />
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
                    className={`flex items-center gap-2.5 px-4 py-2.5 ${item.quantity === 0 ? "bg-red-50/40" : "bg-amber-50/30"}`}>
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
                      className="flex items-center gap-1 text-[10px] font-semibold text-white bg-[#1372e6] hover:bg-[#0d5cc4] px-2 py-1 rounded-lg transition"
                    >
                      <Plus size={10} /> {t("reports.restock")}
                    </Link>
                  </div>
                ))}
              </div>
            )}

            {stockAlerts.length > 0 && (
              <div className="px-4 py-2.5 border-t border-slate-50">
                <Link href="/PurchaseManagement"
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-[#1372e6] bg-[#EBF2FD] hover:bg-[#D5E8FB] py-2 rounded-xl transition">
                  <Truck size={12} /> {t("items.go_purchases")}
                </Link>
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h2 className="font-bold text-slate-900 text-sm mb-3">{t("dash.quick_actions")}</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { href: "/sales",              icon: Plus,      label: t("dash.new_sale"),     desc: t("dash.new_sale_desc") },
                { href: "/PurchaseManagement", icon: Truck,     label: t("dash.new_purchase"), desc: t("dash.new_purchase_desc") },
                { href: "/ExpenseManagement",  icon: Wallet,    label: t("nav.expenses") || "Add Expense", desc: t("dash.expenses_desc") || "Log a business expense" },
                { href: "/reports",            icon: BarChart3, label: t("dash.view_reports"), desc: t("dash.charts_analytics") },
              ].map((a) => (
                <Link key={a.href} href={a.href}
                  className="flex items-center gap-2.5 p-3 rounded-xl text-white bg-[#1372e6] shadow-sm"
                >
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    <a.icon size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold leading-tight">{a.label}</p>
                    <p className="text-[10px] text-white/70 mt-0.5 truncate">{a.desc}</p>
                  </div>
                </Link>
              ))}
            </div>

            {stats.sales > 0 && (
              <div className="mt-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-green-100 flex items-center justify-center">
                  <TrendingUp size={13} className="text-green-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700">
                    {stats.sales} sale{stats.sales !== 1 ? "s" : ""} · {fmtCurrency(stats.revenue)}
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
          <h2 className="font-bold text-slate-900 text-sm mb-3">{t("dash.services")}</h2>
          <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-8 gap-2">
            {SERVICES.map((svc) => {
              const Icon = svc.icon;
              const c = SVC_COLORS[svc.color] ?? SVC_COLORS.slate;
              return (
                <Link key={svc.href} href={svc.href}
                  className="bg-white border border-slate-200 rounded-xl p-3 text-center block"
                >
                  <div className={`w-9 h-9 rounded-xl ${c.bg} ${c.text} flex items-center justify-center mx-auto mb-2`}>
                    <Icon size={17} />
                  </div>
                  <p className="text-[10px] font-bold text-slate-800 leading-tight">{svc.title}</p>
                  <div className="mt-1.5 flex items-center justify-center gap-0.5 text-[9px] text-green-600">
                    <CheckCircle size={8} /> {t("dash.open")}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── SHOPS ON HIGOVERSE — Social Media Cards ─────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-[#1372e6]" />
              <h2 className="font-bold text-slate-900 text-sm">
                {t("dash.shops_higoverse")}
                <span className="ml-2 text-[10px] bg-[#EBF2FD] text-[#1372e6] font-semibold px-2 py-0.5 rounded-full align-middle">
                  {shops.length}
                </span>
              </h2>
            </div>
            {onlineCount > 0 && (
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                {onlineCount} {t("common.online")}
              </span>
            )}
          </div>

          {shops.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
              <Globe size={28} className="text-slate-300 mx-auto mb-2" />
              <p className="text-slate-400 text-xs">{t("common.no_data")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {shops.map((shop) => {
                const isMine   = shop.id === user.shop_id;
                const presence = shopPresence(shop.last_seen_at, now);
                const initial  = (shop.name || "?")[0].toUpperCase();
                const presenceLabel = presence.label === "never_seen"
                  ? t("dash.never_seen")
                  : presence.label === "online_now"
                  ? t("dash.online_now")
                  : `${t("dash.last_seen")} ${presence.label}`;

                return (
                  <div key={shop.id}
                    className={`relative rounded-xl border bg-white ${
                      isMine
                        ? "border-[#A8C8F8] ring-2 ring-[#1372e6]/20"
                        : presence.online
                          ? "border-green-200"
                          : "border-slate-200"
                    }`}>

                    {/* Cover band */}
                    <div className="h-16 bg-[#1372e6] rounded-t-xl relative overflow-hidden">
                      {isMine && (
                        <span className="absolute top-1.5 right-1.5 text-[8px] font-black bg-white text-[#1372e6] px-1.5 py-0.5 rounded-full leading-none shadow">
                          YOU
                        </span>
                      )}
                      {presence.online && !isMine && (
                        <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 text-[8px] font-black bg-green-500 text-white px-1.5 py-0.5 rounded-full leading-none shadow">
                          <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                          LIVE
                        </span>
                      )}
                    </div>

                    {/* Circular avatar overlapping cover */}
                    <div className="relative z-10 flex justify-center -mt-7">
                      <div className="w-14 h-14 rounded-full border-4 border-white overflow-hidden bg-slate-100 flex items-center justify-center shadow-sm">
                        {shop.logo_url ? (
                          <img src={shop.logo_url} alt={shop.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-base font-black text-white bg-[#1372e6] w-full h-full flex items-center justify-center">
                            {initial}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="px-3 pb-3 pt-1.5 text-center">
                      <p className="text-xs font-semibold text-slate-900 leading-tight truncate" title={shop.name}>
                        {shop.name}
                      </p>

                      {shop.phone && (
                        <p className="text-[9px] text-slate-400 mt-0.5 truncate">
                          {shop.phone}
                        </p>
                      )}

                      <div className={`mt-1.5 flex items-center justify-center gap-1 text-[9px] font-medium ${
                        isMine ? "text-[#1372e6]" : presence.online ? "text-green-600" : "text-slate-400"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          presence.online ? "bg-green-500" : "bg-slate-300"
                        } ${(presence.online || isMine) ? "animate-pulse" : ""}`} />
                        {isMine ? t("dash.you_online") : presenceLabel}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
        <footer className="pb-6 border-t border-slate-200 pt-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">

            {/* Brand */}
            <div className="flex items-center gap-2">
              <img src="/higoverse.png" alt="Higoverse" className="w-7 h-7 rounded-lg object-cover" />
              <div>
                <p className="text-xs font-bold text-slate-700">Higoverse</p>
                <p className="text-[9px] text-slate-400">Rwanda's Business Platform</p>
              </div>
            </div>

            {/* Live business snapshot pills */}
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              <span className="flex items-center gap-1 text-[9px] font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded-full">
                <Package size={10} className="text-[#1372e6]" /> {stats.products} {t("dash.products")}
              </span>
              <span className="flex items-center gap-1 text-[9px] font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded-full">
                <Users size={10} className="text-indigo-500" /> {stats.partners} {t("dash.partners")}
              </span>
              <span className="flex items-center gap-1 text-[9px] font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded-full">
                <ShoppingCart size={10} className="text-teal-500" /> {stats.sales} {t("dash.sales_today")}
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
                  <AlertTriangle size={10} /> {stats.lowStock} low stock
                </span>
              )}
            </div>

            {/* Copyright + sync */}
            <div className="text-center sm:text-right">
              <p className="text-[9px] text-slate-400 font-medium">© {new Date().getFullYear()} Higoverse</p>
              {lastUpdated && (
                <p className="text-[9px] text-slate-300 mt-0.5">Synced {fmtTime(lastUpdated)}</p>
              )}
            </div>

          </div>
        </footer>

      </main>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string; value: string; icon: React.ReactNode; color: string;
  href: string; sub?: string; small?: boolean; delta?: number | null; warn?: boolean;
  t: (key: string) => string;
}

const KPI_COLORS: Record<string, { icon: string; accent: string; bg: string }> = {
  blue:   { icon: "bg-[#EBF4FF] text-[#1372e6]",  accent: "bg-[#1372e6]",  bg: "" },
  indigo: { icon: "bg-indigo-50 text-indigo-600",  accent: "bg-indigo-500", bg: "" },
  teal:   { icon: "bg-teal-50 text-teal-600",      accent: "bg-teal-500",   bg: "" },
  green:  { icon: "bg-green-50 text-green-600",    accent: "bg-green-500",  bg: "" },
  orange: { icon: "bg-amber-50 text-amber-600",    accent: "bg-amber-500",  bg: "" },
  red:    { icon: "bg-red-50 text-red-600",        accent: "bg-red-500",    bg: "" },
  slate:  { icon: "bg-slate-100 text-slate-400",   accent: "bg-slate-300",  bg: "" },
};

function KpiCard({ label, value, icon, color, href, sub, small, delta, warn, t }: KpiCardProps) {
  const c = KPI_COLORS[color] ?? KPI_COLORS.slate;
  return (
    <Link href={href} className="relative bg-white border border-slate-100 rounded-xl p-3 block overflow-hidden shadow-sm">
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${warn ? "bg-red-500" : c.accent}`} />

      <div className="pl-2.5">
        {/* Top row: label + icon */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-[9px] text-slate-400 uppercase tracking-widest font-semibold">{label}</p>
          <div className={`w-7 h-7 rounded-lg ${c.icon} flex items-center justify-center flex-shrink-0`}>
            {icon}
          </div>
        </div>

        {/* Value */}
        <p className={`font-extrabold text-slate-900 leading-tight truncate ${small ? "text-sm" : "text-lg"}`}>
          {value}
        </p>

        {/* Delta badge or sub text */}
        <div className="mt-1.5 h-4 flex items-center">
          {delta !== null && delta !== undefined ? (
            <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
              delta >= 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"
            }`}>
              {delta >= 0 ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
              {Math.abs(delta)}% {t("dash.vs_yesterday")}
            </span>
          ) : sub ? (
            <p className="text-[9px] text-slate-400 truncate">{sub}</p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
