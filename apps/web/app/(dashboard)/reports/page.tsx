"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { reportRequest } from "@/lib/report-api";
import { itemRequest } from "@/lib/product-api";
import { purchaseRequest } from "@/lib/purchase-api";
import { expenseRequest } from "@/lib/expense-api";
import { useLanguage } from "@/lib/language-context";
import PageSkeleton from "@/app/components/dashboard/PageSkeleton";
import DateRangeFilter from "@/app/components/ui/DateRangeFilter";
import {
  BarChart3, TrendingUp, DollarSign, Package,
  ShoppingCart, AlertCircle, RefreshCw, Download, ArrowUpRight,
  Wifi, AlertTriangle, CheckCircle, Activity, Truck, Receipt,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Summary {
  revenue: number; profit: number; items_sold: number;
  sales_count: number; unique_customers: number; total_spent: number;
  stock_value: number; potential_profit: number;
  total_products: number; out_of_stock: number; low_stock: number;
}
interface DayRow { day: string; revenue: number; profit: number; sales_count: number; }
interface TopItem { product_id: string; product_name: string; qty_sold: number; revenue: number; profit: number; }
interface StockAlert { id: string; name: string; quantity: number; cost_price: number; selling_price: number; supplier_id?: string; }
interface Product { id: string; name: string; cost_price: number; selling_price: number; quantity: number; supplier_id?: string | null; }
interface PurchaseRecord { id: string; product_name: string; quantity_added: number; cost_price: number; total_cost: number; created_at?: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtNum(n: number) { return new Intl.NumberFormat().format(Math.round(n)); }
function fmtRWF(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
}
function timeAgo(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const REFRESH_INTERVAL = 30; // seconds

// ─── Custom Tooltip for Revenue Chart ─────────────────────────────────────────
function RevenueTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 text-white text-xs rounded-xl px-3 py-2.5 shadow-xl border border-slate-700">
      <p className="font-semibold mb-1.5 text-slate-300">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="capitalize text-slate-300">{p.name}:</span>
          <span className="font-bold">{fmtNum(p.value)} RWF</span>
        </div>
      ))}
    </div>
  );
}

// ─── Custom Tooltip for Top Items Chart ───────────────────────────────────────
function ItemTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TopItem; value: number; name: string }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-slate-900 text-white text-xs rounded-xl px-3 py-2.5 shadow-xl border border-slate-700">
      <p className="font-semibold mb-1 text-slate-200">{d.product_name}</p>
      <p>Revenue: <span className="font-bold">{fmtNum(d.revenue)} RWF</span></p>
      <p>Profit: <span className="font-bold text-emerald-400">{fmtNum(d.profit)} RWF</span></p>
      <p>Qty sold: <span className="font-bold">{d.qty_sold}</span></p>
    </div>
  );
}

// ─── Custom Pie label ─────────────────────────────────────────────────────────
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: {
  cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number; name: string;
}) {
  if (percent < 0.04) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
      {"\n"}{name}
    </text>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { t } = useLanguage();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily]     = useState<DayRow[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [recentPurchases, setRecentPurchases] = useState<PurchaseRecord[]>([]);
  const [purchaseTotalSpent, setPurchaseTotalSpent] = useState(0);
  const [expenseTotalPeriod, setExpenseTotalPeriod] = useState(0);
  const [expenseCount, setExpenseCount] = useState(0);
  const [stockCost, setStockCost]     = useState(0); // cost_price × qty  (book value)
  const [stockRetail, setStockRetail] = useState(0); // selling_price × qty (retail value)
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 29); return toDateStr(d);
  });
  const [dateTo, setDateTo] = useState(() => toDateStr(new Date()));

  const loadData = useCallback(async (soft = false) => {
    try {
      if (!soft) setLoading(true); else setRefreshing(true);
      setError(null);
      const dateParams = new URLSearchParams({
        ...(dateFrom && { from_date: dateFrom }),
        ...(dateTo   && { to_date: dateTo }),
      });
      const purchaseParams = new URLSearchParams({
        limit: "500",
        ...(dateFrom && { from_date: dateFrom }),
        ...(dateTo   && { to_date: dateTo }),
      });

      // Fetch from reports service, products service, purchases service, and expenses in parallel
      const [sumRes, dayRes, topRes, alertRes, productsRes, purchasesRes, expenseRes] = await Promise.allSettled([
        reportRequest(`/reports/summary?${dateParams}`),
        reportRequest("/reports/daily?days=30"),
        reportRequest(`/reports/top-items?limit=10&${dateParams}`),
        reportRequest("/reports/stock-alerts"),
        itemRequest("/products?limit=1000"),
        purchaseRequest(`/purchases?${purchaseParams}`),
        expenseRequest(`/expenses/summary?${dateParams}`),
      ]);

      // Products from inventory service — compute stock metrics locally
      const products: Product[] = productsRes.status === "fulfilled"
        ? (productsRes.value?.data?.items ?? productsRes.value?.data ?? [])
        : [];
      // Accounting: inventory at cost = GAAP book value (what was paid)
      const costValue   = products.reduce((s, p) => s + (p.cost_price   || 0) * (p.quantity || 0), 0);
      // Accounting: inventory at retail = expected revenue if all stock sold
      const retailValue = products.reduce((s, p) => s + (p.selling_price || 0) * (p.quantity || 0), 0);
      // Accounting: gross profit on stock = retail − cost (all items, not just positive margin)
      const potentialProfit = retailValue - costValue;
      const outOfStock  = products.filter((p) => p.quantity === 0).length;
      const lowStock    = products.filter((p) => p.quantity > 0 && p.quantity <= 10).length;
      const totalProducts = products.length;
      setStockCost(costValue);
      setStockRetail(retailValue);

      // Purchases from purchase service
      const purchases: PurchaseRecord[] = purchasesRes.status === "fulfilled"
        ? (purchasesRes.value?.data?.items ?? [])
        : [];
      const totalSpentFromPurchases = purchases.reduce((s, p) => s + (p.total_cost || 0), 0);
      setRecentPurchases(purchases.slice(0, 10));
      setPurchaseTotalSpent(totalSpentFromPurchases);

      if (expenseRes.status === "fulfilled") {
        const expData = expenseRes.value?.data ?? {};
        setExpenseTotalPeriod(expData.total_expenses ?? 0);
        setExpenseCount(expData.count ?? 0);
      }

      // Build summary — override stock fields with values computed from the products service
      if (sumRes.status === "fulfilled") {
        const base = sumRes.value?.data ?? {};
        setSummary({
          revenue:          base.revenue          ?? 0,
          profit:           base.profit           ?? 0,
          items_sold:       base.items_sold        ?? 0,
          sales_count:      base.sales_count       ?? 0,
          unique_customers: base.unique_customers  ?? 0,
          total_spent:      totalSpentFromPurchases || base.total_spent || 0,
          // Always use live values from products service:
          stock_value:      costValue,
          potential_profit: potentialProfit,
          out_of_stock:     outOfStock,
          low_stock:        lowStock,
          total_products:   totalProducts,
        });
      } else {
        // Reports service failed but we still have stock data — show partial summary
        if (totalProducts > 0) {
          setSummary({
            revenue: 0, profit: 0, items_sold: 0, sales_count: 0,
            unique_customers: 0, total_spent: totalSpentFromPurchases,
            stock_value: costValue, potential_profit: potentialProfit,
            out_of_stock: outOfStock, low_stock: lowStock, total_products: totalProducts,
          });
        }
        setError(String(sumRes.reason?.message ?? "Could not load sales summary."));
      }

      setDaily(dayRes.status    === "fulfilled" ? dayRes.value?.data    ?? [] : []);
      setTopItems(topRes.status === "fulfilled" ? topRes.value?.data    ?? [] : []);

      // Use stock alerts from products service (more reliable), fall back to reports service
      const alertsFromProducts: StockAlert[] = products
        .filter((p) => p.quantity <= 10)
        .map((p) => ({ id: p.id, name: p.name, quantity: p.quantity, cost_price: p.cost_price, selling_price: p.selling_price, supplier_id: p.supplier_id ?? undefined }));
      const alertsFromReports: StockAlert[] = alertRes.status === "fulfilled" ? (alertRes.value?.data ?? []) : [];
      setStockAlerts(alertsFromProducts.length > 0 ? alertsFromProducts : alertsFromReports);

      setLastUpdated(new Date());
    } catch (err) { setError("Failed to load reports."); console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  }, [dateFrom, dateTo]);

  // Initial load
  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload on date change (skip first render)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    loadData(true);
  }, [dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh + countdown
  useEffect(() => {
    countdownRef.current = setInterval(() => setCountdown((c) => (c <= 1 ? REFRESH_INTERVAL : c - 1)), 1000);
    refreshRef.current   = setInterval(() => { loadData(true); setCountdown(REFRESH_INTERVAL); }, REFRESH_INTERVAL * 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (refreshRef.current)   clearInterval(refreshRef.current);
    };
  }, [loadData]);

  const manualRefresh = () => {
    loadData(true);
    setCountdown(REFRESH_INTERVAL);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (refreshRef.current)   clearInterval(refreshRef.current);
    countdownRef.current = setInterval(() => setCountdown((c) => (c <= 1 ? REFRESH_INTERVAL : c - 1)), 1000);
    refreshRef.current   = setInterval(() => { loadData(true); setCountdown(REFRESH_INTERVAL); }, REFRESH_INTERVAL * 1000);
  };

  // ── Derived values ──────────────────────────────────────────────────────────
  const margin = summary && summary.revenue > 0
    ? ((summary.profit / summary.revenue) * 100).toFixed(1) : "0.0";

  const dailyChartData = useMemo(() => {
    // Build a full 30-day scaffold so the line chart always has a complete range.
    // The API only returns days that have sales; empty days get zero values.
    const byDay: Record<string, DayRow> = {};
    daily.forEach((d) => { byDay[d.day] = d; });

    const result = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = toDateStr(d);
      result.push(byDay[key] ?? { day: key, revenue: 0, profit: 0, sales_count: 0 });
    }
    return result.map((d) => ({ ...d, label: d.day.slice(5) }));
  }, [daily]);

  const maxDailyRevenue = useMemo(() =>
    Math.max(...daily.map((d) => d.revenue), 1), [daily]);

  const topItemsChart = useMemo(() =>
    topItems.slice(0, 8).map((i) => ({
      ...i,
      name: i.product_name?.length > 14 ? i.product_name.slice(0, 13) + "…" : (i.product_name || "—"),
    })), [topItems]);

  const stockPieData = useMemo(() => {
    if (!summary) return [];
    const healthy = Math.max(0, summary.total_products - summary.out_of_stock - summary.low_stock);
    return [
      { name: "Healthy",      value: healthy,                  color: "#22c55e" },
      { name: "Low Stock",    value: summary.low_stock,        color: "#f59e0b" },
      { name: "Out of Stock", value: summary.out_of_stock,     color: "#ef4444" },
    ].filter((d) => d.value > 0);
  }, [summary]);

  const avgDailyRevenue = useMemo(() =>
    daily.length ? daily.reduce((s, d) => s + d.revenue, 0) / daily.length : 0, [daily]);

  const revenueThisWeek = useMemo(() =>
    daily.slice(-7).reduce((s, d) => s + d.revenue, 0), [daily]);

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (loading) return <PageSkeleton cards={8} showTable={false} showChart />;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4 space-y-4">

        {/* ── HEADER ─────────────────────────────────────────────────────────── */}
        <div className="bg-linear-to-r from-slate-800 to-slate-900 text-white rounded-2xl p-5">
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <BarChart3 size={20} />
              </div>
              <div>
                <h1 className="text-base font-semibold">{t("reports.title")}</h1>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Wifi size={11} className="text-green-400" />
                    <span className="text-green-400 font-medium">Live</span>
                  </span>
                  {lastUpdated && (
                    <span className="text-slate-400 text-xs">
                      {timeAgo(lastUpdated)} · refresh in {countdown}s
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={manualRefresh} disabled={refreshing}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition disabled:opacity-50">
                <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              </button>
              <button onClick={() => window.print()}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-sm px-3 py-2 rounded-lg transition">
                <Download size={14} /> {t("reports.export")}
              </button>
            </div>
          </div>

          <div className="mt-4">
            <DateRangeFilter
              from={dateFrom} to={dateTo}
              onFrom={setDateFrom} onTo={setDateTo}
              onClear={() => {
                const d = new Date(); d.setDate(d.getDate() - 29);
                setDateFrom(toDateStr(d)); setDateTo(toDateStr(new Date()));
              }}
              accentClass="focus:ring-slate-400/40 focus:border-slate-400"
            />
          </div>
        </div>

        {/* ── ERROR BANNER ───────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Could not load report data</p>
              <p className="text-xs mt-0.5 text-red-600 font-mono">{error}</p>
              <button onClick={() => loadData(true)} className="mt-2 text-xs font-semibold underline hover:no-underline">Retry</button>
            </div>
          </div>
        )}

        {/* ── KPI CARDS ──────────────────────────────────────────────────────── */}
        {summary && (
          <>
            {/* Row 1: Stock money summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiCard
                label="Stock Value"
                value={`RWF ${fmtRWF(stockCost)}`}
                detail={`How much you paid for all ${fmtNum(summary.total_products)} items in stock`}
                icon={<Package size={18} />}
                color="indigo"
                pulse
              />
              <KpiCard
                label="If You Sell Everything"
                value={`RWF ${fmtRWF(stockRetail)}`}
                detail="Total money you'd receive selling all your stock right now"
                icon={<DollarSign size={18} />}
                color="blue"
                pulse
              />
              <KpiCard
                label="Profit You Can Make"
                value={`RWF ${fmtRWF(summary.potential_profit)}`}
                detail={`Extra money from selling all stock · ${stockCost > 0 ? ((summary.potential_profit / stockCost) * 100).toFixed(1) : 0}% return on what you paid`}
                icon={<TrendingUp size={18} />}
                color="violet"
                pulse
              />
            </div>
            {/* Row 2: Stock health + sales + expenses + net profit */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
              <KpiCard
                label="Out of Stock"
                value={String(summary.out_of_stock)}
                detail={`Items with zero units left — buy more`}
                icon={<AlertCircle size={18} />}
                color={summary.out_of_stock > 0 ? "red" : "green"}
                badge={summary.out_of_stock > 0 ? "BUY NOW" : "ALL GOOD"}
              />
              <KpiCard
                label="Almost Finished"
                value={String(summary.low_stock)}
                detail="Items with 10 or fewer units — restock soon"
                icon={<AlertTriangle size={18} />}
                color={summary.low_stock > 0 ? "amber" : "green"}
                badge={summary.low_stock > 0 ? "RESTOCK SOON" : "OK"}
              />
              <KpiCard
                label="Revenue Earned"
                value={`RWF ${fmtRWF(summary.revenue)}`}
                detail={`Total from ${summary.sales_count} sales · ${summary.unique_customers} customers`}
                icon={<ShoppingCart size={18} />}
                color="teal"
              />
              <KpiCard
                label="Gross Profit (Sales)"
                value={`RWF ${fmtRWF(summary.profit)}`}
                detail={`${margin}% margin · after cost of goods sold only`}
                icon={<TrendingUp size={18} />}
                color="emerald"
              />
              <KpiCard
                label="Business Expenses"
                value={expenseTotalPeriod > 0 ? `RWF ${fmtRWF(expenseTotalPeriod)}` : "—"}
                detail={`${expenseCount} expense records in this period`}
                icon={<Receipt size={18} />}
                color="orange"
              />
              <KpiCard
                label="Net Profit (Real)"
                value={`RWF ${fmtRWF(summary.profit - expenseTotalPeriod)}`}
                detail={`After expenses · ${summary.profit - expenseTotalPeriod >= 0 ? "Profitable" : "At a loss"}`}
                icon={<DollarSign size={18} />}
                color={summary.profit - expenseTotalPeriod >= 0 ? "blue" : "red"}
              />
            </div>
          </>
        )}

        {/* ── REVENUE + PROFIT AREA CHART ────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex flex-wrap justify-between items-start gap-2 mb-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Activity size={15} className="text-[#1372e6]" />
                Daily Revenue &amp; Profit — Last 30 Days
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Avg daily revenue: <span className="font-semibold text-slate-600">RWF {fmtRWF(avgDailyRevenue)}</span>
                &nbsp;·&nbsp;This week: <span className="font-semibold text-slate-600">RWF {fmtRWF(revenueThisWeek)}</span>
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#1372e6] inline-block" /> Revenue</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> Profit</span>
            </div>
          </div>

          {dailyChartData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-slate-400 text-sm">{t("common.no_data")}</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#1372e6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#1372e6" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tickFormatter={fmtRWF} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={44} />
                <Tooltip content={<RevenueTooltip />} />
                <Area type="monotone" dataKey="revenue" name="revenue" stroke="#1372e6" strokeWidth={2} fill="url(#gradRevenue)" dot={false} activeDot={{ r: 4, fill: "#1372e6" }} />
                <Area type="monotone" dataKey="profit"  name="profit"  stroke="#10b981" strokeWidth={2} fill="url(#gradProfit)"  dot={false} activeDot={{ r: 4, fill: "#10b981" }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── STOCK HEALTH PIE + STOCK VALUE vs POTENTIAL ────────────────────── */}
        {summary && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Stock Health Pie */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800 mb-1">How Is Your Stock?</h2>
              <p className="text-xs text-slate-400 mb-4">
                {summary.total_products} products total &mdash;&nbsp;
                <span className="text-red-500 font-medium">{summary.out_of_stock} finished</span>,&nbsp;
                <span className="text-amber-500 font-medium">{summary.low_stock} almost finished</span>
              </p>

              {stockPieData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No stock data</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={stockPieData}
                      cx="50%" cy="50%"
                      innerRadius={50} outerRadius={88}
                      paddingAngle={2}
                      dataKey="value"
                      labelLine={false}
                      label={PieLabel as React.ComponentProps<typeof Pie>["label"]}
                    >
                      {stockPieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, name) => {
                        const n = typeof v === "number" ? v : 0;
                        return [`${n} items (${((n / summary.total_products) * 100).toFixed(0)}%)`, name as string];
                      }}
                      contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                    />
                    <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}

              {/* Legend pills */}
              <div className="grid grid-cols-3 gap-2 mt-2">
                {[
                  { label: "Good",             count: Math.max(0, summary.total_products - summary.out_of_stock - summary.low_stock), color: "bg-green-500", text: "text-green-700", bg: "bg-green-50" },
                  { label: "Almost Finished", count: summary.low_stock,   color: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50" },
                  { label: "Finished",         count: summary.out_of_stock, color: "bg-red-500",  text: "text-red-700",  bg: "bg-red-50" },
                ].map((s) => (
                  <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
                    <p className={`text-xl font-bold ${s.text}`}>{s.count}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Money Breakdown */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800 mb-0.5">Where Your Money Is</h2>
              <p className="text-xs text-slate-400 mb-4">
                Each bar shows how big that number is compared to the others
              </p>

              <div className="space-y-5 mb-5">
                <ValueBar
                  label="What you paid for your stock"
                  sublabel="The total cost of all items sitting in your shop right now"
                  value={stockCost}
                  max={Math.max(stockCost, stockRetail, summary.revenue, 1)}
                  color="bg-indigo-500"
                  textColor="text-indigo-700"
                />
                <ValueBar
                  label="What you'd earn selling everything"
                  sublabel="Total if every item in stock is sold at your selling price"
                  value={stockRetail}
                  max={Math.max(stockCost, stockRetail, summary.revenue, 1)}
                  color="bg-[#1372e6]"
                  textColor="text-[#1372e6]"
                />
                <ValueBar
                  label="Profit waiting in your stock"
                  sublabel="Extra money you'll make once all stock is sold"
                  value={summary.potential_profit}
                  max={Math.max(stockCost, stockRetail, summary.revenue, 1)}
                  color="bg-violet-500"
                  textColor="text-violet-700"
                />
                <ValueBar
                  label={`Money earned from sales (${dateFrom} → ${dateTo})`}
                  sublabel="Total payments received from customers in this period"
                  value={summary.revenue}
                  max={Math.max(stockCost, stockRetail, summary.revenue, 1)}
                  color="bg-teal-500"
                  textColor="text-teal-700"
                />
                <ValueBar
                  label={`Gross profit from sales (${dateFrom} → ${dateTo})`}
                  sublabel="After cost of goods sold — before business expenses"
                  value={summary.profit}
                  max={Math.max(stockCost, stockRetail, summary.revenue, 1)}
                  color="bg-emerald-500"
                  textColor="text-emerald-700"
                />
                {expenseTotalPeriod > 0 && (
                  <ValueBar
                    label={`Business expenses (${dateFrom} → ${dateTo})`}
                    sublabel={`${expenseCount} records — rent, salaries, utilities, etc.`}
                    value={expenseTotalPeriod}
                    max={Math.max(stockCost, stockRetail, summary.revenue, 1)}
                    color="bg-orange-400"
                    textColor="text-orange-600"
                  />
                )}
                <ValueBar
                  label={`Net profit — real money kept (${dateFrom} → ${dateTo})`}
                  sublabel="Gross profit minus all business expenses"
                  value={Math.max(0, summary.profit - expenseTotalPeriod)}
                  max={Math.max(stockCost, stockRetail, summary.revenue, 1)}
                  color={summary.profit - expenseTotalPeriod >= 0 ? "bg-[#1372e6]" : "bg-red-400"}
                  textColor={summary.profit - expenseTotalPeriod >= 0 ? "text-[#1372e6]" : "text-red-600"}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {stockCost > 0 && (
                  <div className="bg-violet-50 rounded-xl p-3">
                    <p className="text-xs text-slate-500">Profit rate on stock</p>
                    <p className="text-xl font-bold text-violet-700 mt-0.5">
                      {((summary.potential_profit / stockCost) * 100).toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">For every 100 RWF you spent, you earn this extra</p>
                  </div>
                )}
                {summary.revenue > 0 && (
                  <div className="bg-emerald-50 rounded-xl p-3">
                    <p className="text-xs text-slate-500">Profit rate on sales</p>
                    <p className="text-xl font-bold text-emerald-700 mt-0.5">{margin}%</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">For every 100 RWF sold, this is your profit</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TOP ITEMS HORIZONTAL BAR ───────────────────────────────────────── */}
        {topItemsChart.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">{t("reports.top_items")}</h2>
                <p className="text-xs text-slate-400 mt-0.5">Revenue &amp; profit by product</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-600 inline-block" /> Revenue</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> Profit</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={Math.max(200, topItemsChart.length * 40)}>
              <BarChart data={topItemsChart} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tickFormatter={fmtRWF} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#475569" }} tickLine={false} axisLine={false} width={100} />
                <Tooltip content={<ItemTooltip />} cursor={{ fill: "#f8fafc" }} />
                <Bar dataKey="revenue" name="Revenue" fill="#475569" radius={[0, 4, 4, 0]} maxBarSize={14} />
                <Bar dataKey="profit"  name="Profit"  fill="#10b981" radius={[0, 4, 4, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── STOCK ALERTS TABLE ─────────────────────────────────────────────── */}
        {stockAlerts.length > 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-amber-500" />
                <h2 className="text-sm font-semibold text-slate-700">
                  {t("reports.stock_alerts")} — {stockAlerts.length} {t("nav.items").toLowerCase()}
                </h2>
              </div>
              <Link href="/PurchaseManagement"
                className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition">
                <ArrowUpRight size={12} /> {t("purchases.add")}
              </Link>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {[t("items.name"), "Qty Left", "You Paid", "You Sell For", "Profit %", "Action"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {stockAlerts.map((item) => {
                  const marginPct = item.cost_price > 0
                    ? (((item.selling_price - item.cost_price) / item.cost_price) * 100).toFixed(0) : "—";
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold
                          ${item.quantity === 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                          {item.quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 tabular-nums">{item.cost_price.toLocaleString()}</td>
                      <td className="px-4 py-3 font-semibold text-green-600 tabular-nums">{item.selling_price.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs font-medium">{marginPct !== "—" ? `+${marginPct}%` : "—"}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/PurchaseManagement?name=${encodeURIComponent(item.name)}&cost=${item.cost_price}&selling=${item.selling_price}&supplierId=${item.supplier_id ?? ""}`}
                          className="text-xs font-semibold text-violet-600 hover:underline flex items-center gap-0.5">
                          <ArrowUpRight size={11} /> {t("reports.restock")}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          summary && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-5 py-4 text-green-700 text-sm font-medium">
              <CheckCircle size={16} />
              All stock is healthy — no alerts at this time.
            </div>
          )
        )}

        {/* ── RECENT PURCHASES ───────────────────────────────────────────────── */}
        {recentPurchases.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Truck size={16} className="text-violet-500" />
                <h2 className="text-sm font-semibold text-slate-700">
                  Recent Purchases — <span className="text-violet-600">RWF {fmtRWF(purchaseTotalSpent)} spent</span>
                </h2>
              </div>
              <Link href="/PurchaseManagement"
                className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition">
                <ArrowUpRight size={12} /> View All
              </Link>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["Date", "Product", "Qty Added", "Unit Cost", "Total Cost"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentPurchases.map((p) => {
                  const d = p.created_at ? new Date(p.created_at) : null;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                        {d ? toDateStr(d) : "—"}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{p.product_name}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-600">{p.quantity_added}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-600">{(p.cost_price || 0).toLocaleString()}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-800 tabular-nums">{(p.total_cost || 0).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── SECONDARY STATS ROW ────────────────────────────────────────────── */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-10">
            <StatMini label="Items Sold"         value={fmtNum(summary.items_sold)}               sub={`to ${summary.unique_customers} customers`} color="text-indigo-600" icon={<ShoppingCart size={14} />} />
            <StatMini label="Spent on Restocking" value={`RWF ${fmtRWF(summary.total_spent)}`}   sub={`${recentPurchases.length} purchase records`} color="text-teal-600" icon={<Truck size={14} />} />
            <StatMini label="Business Expenses"  value={expenseTotalPeriod > 0 ? `RWF ${fmtRWF(expenseTotalPeriod)}` : "—"} sub={`${expenseCount} records this period`} color="text-orange-600" icon={<Receipt size={14} />} />
            <StatMini
              label="Net Profit (Real)"
              value={`RWF ${fmtRWF(summary.profit - expenseTotalPeriod)}`}
              sub={summary.profit - expenseTotalPeriod >= 0 ? "Profitable after all costs" : "Spending more than earning"}
              color={summary.profit - expenseTotalPeriod >= 0 ? "text-[#1372e6]" : "text-red-600"}
              icon={<DollarSign size={14} />}
            />
          </div>
        )}

        {/* EMPTY STATE */}
        {!summary && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="p-5 bg-slate-100 rounded-2xl mb-4"><BarChart3 size={36} className="opacity-40" /></div>
            <p className="font-medium text-slate-500">{t("reports.no_reports")}</p>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const kpiColors: Record<string, { bg: string; text: string; badge: string }> = {
  indigo:  { bg: "bg-indigo-50",   text: "text-indigo-600",   badge: "bg-indigo-100 text-indigo-700"   },
  blue:    { bg: "bg-[#EBF2FD]",   text: "text-[#1372e6]",   badge: "bg-[#D5E8FB] text-[#1372e6]"     },
  violet:  { bg: "bg-violet-50",   text: "text-violet-600",   badge: "bg-violet-100 text-violet-700"   },
  teal:    { bg: "bg-teal-50",     text: "text-teal-600",     badge: "bg-teal-100 text-teal-700"       },
  emerald: { bg: "bg-emerald-50",  text: "text-emerald-600",  badge: "bg-emerald-100 text-emerald-700" },
  red:     { bg: "bg-red-50",      text: "text-red-600",      badge: "bg-red-100 text-red-700"         },
  amber:   { bg: "bg-amber-50",    text: "text-amber-600",    badge: "bg-amber-100 text-amber-700"     },
  green:   { bg: "bg-green-50",    text: "text-green-600",    badge: "bg-green-100 text-green-700"     },
  orange:  { bg: "bg-orange-50",   text: "text-orange-600",   badge: "bg-orange-100 text-orange-700"   },
};

function KpiCard({ label, value, detail, icon, color, pulse, badge }: {
  label: string; value: string; detail: string; icon: React.ReactNode;
  color: string; pulse?: boolean; badge?: string;
}) {
  const c = kpiColors[color] ?? kpiColors.indigo;
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-all ${pulse ? "relative" : ""}`}>
      {pulse && (
        <span className="absolute top-3 right-3 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1372e6]" />
        </span>
      )}
      <div className={`w-9 h-9 rounded-xl ${c.bg} ${c.text} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-extrabold mt-1 ${c.text} leading-none`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1.5">{detail}</p>
      {badge && (
        <span className={`inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${c.badge}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

function ValueBar({ label, sublabel, value, max, color, textColor }: {
  label: string; sublabel?: string; value: number; max: number; color: string; textColor: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div>
      <div className="flex justify-between items-start mb-1.5 gap-2">
        <div className="min-w-0">
          <span className="text-xs font-medium text-slate-700 block">{label}</span>
          {sublabel && <span className="text-[10px] text-slate-400 leading-tight">{sublabel}</span>}
        </div>
        <span className={`text-sm font-bold ${textColor} shrink-0`}>RWF {fmtRWF(value)}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatMini({ label, value, sub, color, icon }: {
  label: string; value: string; sub: string; color: string; icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-slate-400 mb-2">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
    </div>
  );
}
