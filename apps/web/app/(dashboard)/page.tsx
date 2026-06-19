"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { itemRequest } from "@/lib/product-api";
import { partnerRequest } from "@/lib/supplier-api";
import { saleRequest } from "@/lib/sale-api";
import { reportRequest } from "@/lib/report-api";
import { listShops, type Shop as ShopInfo } from "@/lib/shop-api";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import LoadingSkeleton from "@/app/components/dashboard/LoadingSkeleton";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Package, Truck, ArrowRight, BarChart3, ShoppingCart, Users, Settings,
  RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Clock, Globe,
  CheckCircle, FileText, Store, Mail, User, ShieldCheck, Plus,
  Activity, Receipt,
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
// Backend stores UTC timestamps; if the 'Z' suffix is missing JS treats them
// as local time, shifting all time-ago calculations by the timezone offset.
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
  if (!lastSeenAt) return { online: false, label: "Never seen", color: "bg-slate-300" };
  const d = parseUTC(lastSeenAt);
  const secs = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (secs < 300)   return { online: true,  label: "Online now",                      color: "bg-green-500" };
  if (secs < 3600)  return { online: false, label: `${Math.floor(secs / 60)}m ago`,   color: "bg-amber-400" };
  if (secs < 86400) return { online: false, label: `${Math.floor(secs / 3600)}h ago`, color: "bg-orange-400" };
  const days = Math.floor(secs / 86400);
  if (days < 7)     return { online: false, label: `${days}d ago`,                    color: "bg-slate-300" };
  return { online: false, label: d.toLocaleDateString([], { month: "short", day: "numeric" }), color: "bg-slate-300" };
}

// ─── Constants ────────────────────────────────────────────────────────────────
const REFRESH_INTERVAL = 30;

const SERVICES = [
  { title: "Items / Inventory", description: "Products, stock levels and pricing.",   icon: Package,     href: "/ItemManagement",     color: "blue" },
  { title: "Partners",          description: "Suppliers and customer contacts.",        icon: Users,       href: "/PartnerManagement",  color: "indigo" },
  { title: "Purchases",         description: "Record restocks and new purchases.",      icon: Truck,       href: "/PurchaseManagement", color: "teal" },
  { title: "Sales",             description: "Transactions and revenue tracking.",      icon: ShoppingCart,href: "/SaleManagement",     color: "orange" },
  { title: "Reports",           description: "Insights, charts and analytics.",         icon: BarChart3,   href: "/reports",            color: "violet" },
  { title: "Proforma",          description: "Generate proforma invoices.",             icon: FileText,    href: "/proforma",           color: "pink" },
  { title: "Settings",          description: "Shop preferences and configuration.",     icon: Settings,    href: "/Settings",           color: "slate" },
];

const SVC_COLORS: Record<string, { bg: string; text: string; hover: string }> = {
  blue:   { bg: "bg-[#EBF2FD]",   text: "text-[#1372e6]",   hover: "hover:bg-[#1372e6]" },
  indigo: { bg: "bg-indigo-100", text: "text-indigo-600", hover: "hover:bg-indigo-600" },
  teal:   { bg: "bg-teal-100",   text: "text-teal-600",   hover: "hover:bg-teal-600" },
  orange: { bg: "bg-orange-100", text: "text-orange-600", hover: "hover:bg-orange-600" },
  violet: { bg: "bg-violet-100", text: "text-violet-600", hover: "hover:bg-violet-600" },
  pink:   { bg: "bg-pink-100",   text: "text-pink-600",   hover: "hover:bg-pink-600" },
  slate:  { bg: "bg-slate-100",  text: "text-slate-600",  hover: "hover:bg-slate-600" },
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();

  const [stats, setStats]           = useState<Stats>({ products: 0, partners: 0, sales: 0, revenue: 0, lowStock: 0, outOfStock: 0 });
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [shops, setShops]           = useState<ShopInfo[]>([]);
  const [dailyData, setDailyData]   = useState<DailyRecord[]>([]);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [yesterdayRevenue, setYesterdayRevenue] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown]   = useState(REFRESH_INTERVAL);
  const [now, setNow]               = useState(new Date());

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAll = async (soft = false) => {
    if (soft) setRefreshing(true);
    try {
      const today = toDateStr(new Date());
      const [productsRes, partnersRes, salesRes, stockRes, shopsRes, dailyRes, recentRes] = await Promise.allSettled([
        itemRequest("/products?page=1&limit=1"),
        partnerRequest("/suppliers"),
        saleRequest(`/sales/summary?from_date=${today}&to_date=${today}`),
        itemRequest("/products/stock-alerts?threshold=10"),
        listShops({ limit: 100 }),
        reportRequest("/reports/daily?days=8"),   // 8 days → yesterday + today + 6 prior
        saleRequest("/sales?page=1&limit=8"),     // recent sales feed
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

      // Daily chart data — oldest first array, last entry = today, second-to-last = yesterday
      const daily: DailyRecord[] = dailyRes.status === "fulfilled" ? (dailyRes.value?.data ?? []) : [];
      setDailyData(daily);
      if (daily.length >= 2) setYesterdayRevenue(daily[daily.length - 2]?.revenue ?? 0);

      // Recent sales
      const recent: RecentSale[] = recentRes.status === "fulfilled"
        ? (recentRes.value?.data?.items ?? []) : [];
      setRecentSales(recent);

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

  if (!user || dataLoading) return <LoadingSkeleton />;

  const currentShop   = shops.find((s) => s.id === user.shop_id);
  const onlineCount   = shops.filter((s) => shopPresence(s.last_seen_at, now).online).length;
  const chartData     = dailyData.filter((d) => d.day).map((d) => ({ day: shortDay(d.day), revenue: d.revenue, profit: d.profit }));
  const revDeltaPct   = yesterdayRevenue > 0
    ? Math.round(((stats.revenue - yesterdayRevenue) / yesterdayRevenue) * 100)
    : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── HERO ────────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-2xl text-white shadow-lg" style={{ background: "#1372e6" }}>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-6 py-5">
            {/* Left */}
            <div>
              <p className="text-blue-200 text-xs font-medium uppercase tracking-widest">Welcome back</p>
              <h1 className="text-2xl md:text-3xl font-bold mt-0.5">{currentShop?.name || user.name || "My Shop"}</h1>
              <p className="text-blue-200 text-sm mt-0.5">{user.name} · {user.role || "Owner"}</p>
            </div>

            {/* Center — live stats */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="bg-white/10 px-4 py-2.5 rounded-xl text-center">
                <p className="text-blue-200 text-[10px] uppercase tracking-wider">Sales Today</p>
                <p className="text-xl font-bold">{stats.sales}</p>
              </div>
              <div className="bg-white/10 px-4 py-2.5 rounded-xl text-center">
                <p className="text-blue-200 text-[10px] uppercase tracking-wider">Revenue Today</p>
                <p className="text-xl font-bold text-green-300">
                  {stats.revenue > 0 ? `RWF ${fmtShort(stats.revenue)}` : "—"}
                </p>
              </div>
              {(stats.lowStock > 0 || stats.outOfStock > 0) && (
                <div className="bg-red-500/20 border border-red-400/30 px-4 py-2.5 rounded-xl text-center">
                  <p className="text-red-200 text-[10px] uppercase tracking-wider">Needs Restock</p>
                  <p className="text-xl font-bold text-red-200">{stats.lowStock + stats.outOfStock}</p>
                </div>
              )}
            </div>

            {/* Right — clock + refresh */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <p className="text-2xl font-mono font-bold tabular-nums">{fmtTime(now)}</p>
                <p className="text-blue-300 text-xs">{fmtDate(now)}</p>
              </div>
              <button
                onClick={manualRefresh} disabled={refreshing}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition disabled:opacity-50"
                title="Refresh now"
              >
                <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* Status bar */}
          <div className="relative z-10 border-t border-white/10 px-6 py-2 flex items-center gap-3 text-xs text-blue-200">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live · auto-refresh in {countdown}s
            </span>
            {lastUpdated && <span>Last updated {timeAgo(lastUpdated)}</span>}
          </div>
        </section>

        {/* ── KPI CARDS (all clickable) ────────────────────────────────────────── */}
        <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard
            label="Products" value={stats.products.toLocaleString()}
            icon={<Package size={18} />} color="blue" href="/ItemManagement"
            sub="in your shop"
          />
          <KpiCard
            label="Partners" value={stats.partners.toLocaleString()}
            icon={<Users size={18} />} color="indigo" href="/PartnerManagement"
            sub="suppliers & customers"
          />
          <KpiCard
            label="Sales Today" value={stats.sales.toLocaleString()}
            icon={<ShoppingCart size={18} />} color="teal" href="/SaleManagement"
            sub="transactions"
          />
          <KpiCard
            label="Revenue Today"
            value={stats.revenue > 0 ? fmtCurrency(stats.revenue) : "No sales"}
            icon={<TrendingUp size={18} />} color="green" href="/reports" small
            delta={revDeltaPct}
            sub={yesterdayRevenue > 0 ? `Yesterday: ${fmtCurrency(yesterdayRevenue)}` : "first day data"}
          />
          <KpiCard
            label="Low Stock" value={stats.lowStock.toLocaleString()}
            icon={<AlertTriangle size={18} />}
            color={stats.lowStock > 0 ? "orange" : "slate"}
            href="/ItemManagement"
            sub="10 units or less"
            warn={stats.lowStock > 0}
          />
          <KpiCard
            label="Out of Stock" value={stats.outOfStock.toLocaleString()}
            icon={<Package size={18} />}
            color={stats.outOfStock > 0 ? "red" : "slate"}
            href="/ItemManagement"
            sub="zero units left"
            warn={stats.outOfStock > 0}
          />
        </section>

        {/* ── 7-DAY CHART + RECENT SALES ──────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-6">

          {/* 7-Day Revenue Chart */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h2 className="font-bold text-slate-900 flex items-center gap-2">
                  <Activity size={16} className="text-[#1372e6]" />
                  Revenue — Last 7 Days
                </h2>
                {chartData.length > 0 && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Total: {fmtCurrency(chartData.reduce((s, d) => s + d.revenue, 0))}
                  </p>
                )}
              </div>
              <Link href="/reports" className="text-xs font-semibold text-[#1372e6] hover:underline">
                Full report →
              </Link>
            </div>

            {chartData.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-slate-400 text-sm">
                No data yet
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={130}>
                  <AreaChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
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
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}
                      formatter={(v: unknown, name: unknown) => [
                        fmtCurrency(typeof v === "number" ? v : 0),
                        name === "revenue" ? "Revenue" : "Profit",
                      ]}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#1372e6" fill="url(#revFill)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="profit"  stroke="#10b981" fill="url(#profFill)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-2">
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="w-3 h-0.5 rounded" style={{ background: "#1372e6" }} /> Revenue
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="w-3 h-0.5 bg-emerald-500 rounded border-dashed border-t border-emerald-500" /> Profit
                  </span>
                </div>
              </>
            )}
          </section>

          {/* Recent Sales Feed */}
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="font-bold text-slate-900 flex items-center gap-2">
                <Receipt size={16} className="text-orange-500" />
                Recent Sales
              </h2>
              <Link href="/SaleManagement" className="text-xs font-semibold text-[#1372e6] hover:underline">
                All sales →
              </Link>
            </div>

            {recentSales.length === 0 ? (
              <div className="px-5 pb-5 text-slate-400 text-sm flex items-center gap-2 py-6">
                <ShoppingCart size={16} />
                No sales recorded yet today
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {recentSales.map((sale) => (
                  <div key={sale.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                    <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                      <ShoppingCart size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {sale.product_name || "Sale"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {sale.quantity} unit{sale.quantity !== 1 ? "s" : ""}
                        {sale.created_at ? ` · ${timeAgo(parseUTC(sale.created_at))}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-slate-800">{fmtCurrency(sale.total_amount)}</p>
                      {sale.profit != null && sale.profit > 0 && (
                        <p className="text-[11px] text-green-600">+{fmtCurrency(sale.profit)} profit</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="px-5 py-3 border-t border-slate-50">
              <Link href="/SaleManagement"
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 py-2 rounded-xl transition">
                <Plus size={15} />
                Record New Sale
              </Link>
            </div>
          </section>
        </div>

        {/* ── STOCK ALERTS + QUICK ACTIONS ────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-6">

          {/* Stock Alerts */}
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle size={16} className="text-orange-500" />
                Stock Alerts
                {stockAlerts.length > 0 && (
                  <span className="text-[11px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                    {stockAlerts.length}
                  </span>
                )}
              </h2>
              <Link href="/ItemManagement" className="text-xs font-semibold text-[#1372e6] hover:underline">
                View all →
              </Link>
            </div>

            {stockAlerts.length === 0 ? (
              <div className="px-5 pb-5 flex items-center gap-3 py-6">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                  <CheckCircle size={18} className="text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-700 text-sm">All stock healthy</p>
                  <p className="text-slate-400 text-xs">No items need restocking</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {stockAlerts.map((item) => (
                  <div key={item.id}
                    className={`flex items-center gap-3 px-5 py-3 ${
                      item.quantity === 0 ? "bg-red-50/40" : "bg-amber-50/30"
                    }`}>
                    {/* Severity dot */}
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      item.quantity === 0 ? "bg-red-500" : "bg-amber-500"
                    }`} />

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                      <p className="text-xs text-slate-400">
                        {item.quantity === 0 ? "0 units — completely empty" : `${item.quantity} units left`}
                        {" · "}{fmtCurrency(item.selling_price)}
                      </p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Link
                        href="/PurchaseManagement"
                        className="flex items-center gap-1 text-[11px] font-semibold text-white bg-[#1372e6] hover:bg-[#0d5cc4] px-2.5 py-1 rounded-lg transition"
                      >
                        <Plus size={11} />
                        Restock
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {stockAlerts.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-50">
                <Link href="/PurchaseManagement"
                  className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-[#1372e6] bg-[#EBF2FD] hover:bg-[#D5E8FB] py-2 rounded-xl transition">
                  <Truck size={15} />
                  Go to Purchases
                </Link>
              </div>
            )}
          </section>

          {/* Quick Actions */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h2 className="font-bold text-slate-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { href: "/SaleManagement",     icon: Plus,         label: "New Sale",      desc: "Record a transaction",  bg: "bg-orange-500", hover: "hover:bg-orange-600" },
                { href: "/PurchaseManagement", icon: Truck,        label: "New Purchase",  desc: "Restock products",      bg: "bg-teal-600",   hover: "hover:bg-teal-700" },
                { href: "/ItemManagement",     icon: Package,      label: "Manage Stock",  desc: "Items & inventory",     bg: "bg-[#1372e6]",  hover: "hover:bg-[#0d5cc4]" },
                { href: "/reports",            icon: BarChart3,    label: "View Reports",  desc: "Charts & analytics",    bg: "bg-violet-600", hover: "hover:bg-violet-700" },
              ].map((a) => (
                <Link key={a.href} href={a.href}
                  className={`group flex items-center gap-3 p-3.5 rounded-xl text-white ${a.bg} ${a.hover} transition-all shadow-sm hover:shadow-md`}
                >
                  <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <a.icon size={17} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-tight">{a.label}</p>
                    <p className="text-[11px] text-white/70 mt-0.5">{a.desc}</p>
                  </div>
                </Link>
              ))}
            </div>

            {/* Daily progress hint */}
            {stats.sales > 0 && (
              <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-green-100 flex items-center justify-center">
                  <TrendingUp size={15} className="text-green-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700">
                    {stats.sales} sale{stats.sales !== 1 ? "s" : ""} today · {fmtCurrency(stats.revenue)} earned
                  </p>
                  {revDeltaPct !== null && (
                    <p className={`text-[11px] font-medium mt-0.5 flex items-center gap-1 ${
                      revDeltaPct >= 0 ? "text-green-600" : "text-red-500"
                    }`}>
                      {revDeltaPct >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {Math.abs(revDeltaPct)}% vs yesterday
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ── BUSINESS SERVICES ───────────────────────────────────────────────── */}
        <section>
          <h2 className="font-bold text-slate-900 text-lg mb-4">Business Services</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-3">
            {SERVICES.map((svc) => {
              const Icon = svc.icon;
              const c = SVC_COLORS[svc.color] ?? SVC_COLORS.slate;
              return (
                <Link key={svc.title} href={svc.href}
                  className={`group bg-white border border-slate-200 rounded-2xl p-4 hover:shadow-md transition-all text-center hover:border-slate-300`}
                >
                  <div className={`w-11 h-11 rounded-xl ${c.bg} ${c.text} flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform`}>
                    <Icon size={20} />
                  </div>
                  <p className="text-xs font-bold text-slate-800 leading-tight">{svc.title}</p>
                  <p className="text-[10px] text-slate-400 mt-1 leading-snug hidden sm:block">{svc.description}</p>
                  <div className="mt-2 flex items-center justify-center gap-1 text-[10px] text-green-600">
                    <CheckCircle size={10} />
                    Open
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── SHOPS ON HIGOVERSE ──────────────────────────────────────────────── */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-50">
            <div className="flex items-center gap-2.5">
              <Globe size={16} className="text-[#1372e6]" />
              <h2 className="font-bold text-slate-900">
                Shops on Higoverse
                <span className="ml-2 text-xs bg-[#EBF2FD] text-[#1372e6] font-semibold px-2 py-0.5 rounded-full align-middle">
                  {shops.length}
                </span>
              </h2>
            </div>
            {onlineCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                {onlineCount} online
              </span>
            )}
          </div>

          <div className="p-5">
            {shops.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">No shops found</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {shops.map((shop) => {
                  const isMine   = shop.id === user.shop_id;
                  const presence = shopPresence(shop.last_seen_at, now);
                  const initial  = (shop.name || "?")[0].toUpperCase();
                  return (
                    <div key={shop.id}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all ${
                        isMine
                          ? "border-[#A8C8F8] bg-[#EBF2FD]"
                          : presence.online
                            ? "border-green-200 bg-green-50/50"
                            : "border-slate-100 bg-slate-50/50 hover:bg-slate-50"
                      }`}>

                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                        isMine ? "bg-[#1372e6]" : presence.online ? "bg-green-500" : "bg-slate-300"
                      }`}>
                        {initial}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-800 text-sm truncate">{shop.name}</p>
                          {isMine && (
                            <span className="text-[10px] font-bold bg-[#1372e6] text-white px-2 py-0.5 rounded-full shrink-0">You</span>
                          )}
                        </div>
                        {shop.phone && <p className="text-xs text-slate-400 mt-0.5">{shop.phone}</p>}
                        <p className={`text-xs mt-1 font-medium flex items-center gap-1.5 ${
                          isMine ? "text-[#1372e6]" : presence.online ? "text-green-600" : "text-slate-400"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${presence.color} ${presence.online || isMine ? "animate-pulse" : ""}`} />
                          {isMine ? "You are online" : presence.online ? "Online now" : `Last seen ${presence.label}`}
                        </p>
                      </div>

                      {/* Status badge */}
                      {!isMine && (
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${
                          presence.online ? "bg-green-500 text-white" : "bg-slate-200 text-slate-500"
                        }`}>
                          {presence.online ? "LIVE" : "OFF"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ── ACCOUNT INFO ────────────────────────────────────────────────────── */}
        <section className="pb-10">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-50">
              <div className="w-10 h-10 rounded-xl bg-[#D5E8FB] text-[#1372e6] flex items-center justify-center font-bold">
                {(user.name || "U")[0].toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-slate-900">{user.name || "Owner"}</p>
                <p className="text-slate-400 text-xs">{user.email}</p>
              </div>
              <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Active
              </span>
            </div>
            <div className="grid sm:grid-cols-2 md:grid-cols-4">
              {[
                { icon: <Mail size={14} />,        label: "Email",    value: user.email },
                { icon: <Store size={14} />,       label: "Shop",     value: currentShop?.name || user.shop_id.slice(0, 8) + "…" },
                { icon: <User size={14} />,        label: "Role",     value: user.role || "Owner" },
                { icon: <ShieldCheck size={14} />, label: "Security", value: "Protected" },
              ].map((info, i) => (
                <div key={info.label} className={`flex items-center gap-3 px-5 py-4 ${i < 3 ? "border-b md:border-b-0 md:border-r" : ""} border-slate-50`}>
                  <span className="text-[#1372e6] shrink-0">{info.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{info.label}</p>
                    <p className="text-sm font-bold text-slate-800 truncate mt-0.5">{info.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string; value: string; icon: React.ReactNode; color: string;
  href: string; sub?: string; small?: boolean; delta?: number | null; warn?: boolean;
}

const KPI_COLORS: Record<string, { icon: string; border: string }> = {
  blue:   { icon: "bg-[#D5E8FB] text-[#1372e6]",   border: "border-[#D5E8FB]" },
  indigo: { icon: "bg-indigo-100 text-indigo-600", border: "border-indigo-100" },
  teal:   { icon: "bg-teal-100 text-teal-600",   border: "border-teal-100" },
  green:  { icon: "bg-green-100 text-green-600", border: "border-green-100" },
  orange: { icon: "bg-orange-100 text-orange-600", border: "border-orange-100" },
  red:    { icon: "bg-red-100 text-red-600",     border: "border-red-200" },
  slate:  { icon: "bg-slate-100 text-slate-500", border: "border-slate-100" },
};

function KpiCard({ label, value, icon, color, href, sub, small, delta, warn }: KpiCardProps) {
  const c = KPI_COLORS[color] ?? KPI_COLORS.slate;
  return (
    <Link href={href}
      className={`group bg-white border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 block ${
        warn ? "border-red-200" : c.border
      }`}>
      <div className={`w-9 h-9 rounded-xl ${c.icon} flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <p className="text-xs text-slate-400 font-medium">{label}</p>
      <p className={`font-extrabold text-slate-900 mt-0.5 leading-tight truncate ${small ? "text-sm" : "text-xl"}`}>
        {value}
      </p>
      {delta !== null && delta !== undefined && (
        <p className={`text-[11px] font-semibold mt-0.5 flex items-center gap-0.5 ${
          delta >= 0 ? "text-green-600" : "text-red-500"
        }`}>
          {delta >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {Math.abs(delta)}% vs yesterday
        </p>
      )}
      {sub && !delta && (
        <p className="text-[10px] text-slate-300 mt-0.5 truncate">{sub}</p>
      )}
      <div className="mt-2 flex items-center gap-1 text-[10px] text-[#1372e6] opacity-0 group-hover:opacity-100 transition-opacity font-medium">
        Open <ArrowRight size={9} />
      </div>
    </Link>
  );
}
