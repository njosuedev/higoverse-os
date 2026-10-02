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
  const { t } = useLanguage();
  if (!active || !payload?.length) return null;
  const seriesLabel = (name: string) => name === "revenue" ? t("sales.revenue") : name === "profit" ? t("sales.profit") : name;
  return (
    <div className="bg-slate-900 text-white text-xs rounded-xl px-3 py-2.5 shadow-xl border border-slate-700">
      <p className="font-semibold mb-1.5 text-slate-300">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300">{seriesLabel(p.name)}:</span>
          <span className="font-bold">{fmtNum(p.value)} RWF</span>
        </div>
      ))}
    </div>
  );
}

// ─── Custom Tooltip for Top Items Chart ───────────────────────────────────────
function ItemTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TopItem; value: number; name: string }> }) {
  const { t } = useLanguage();
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-slate-900 text-white text-xs rounded-xl px-3 py-2.5 shadow-xl border border-slate-700">
      <p className="font-semibold mb-1 text-slate-200">{d.product_name}</p>
      <p>{t("sales.revenue")}: <span className="font-bold">{fmtNum(d.revenue)} RWF</span></p>
      <p>{t("sales.profit")}: <span className="font-bold text-emerald-400">{fmtNum(d.profit)} RWF</span></p>
      <p>{t("reports.qty_sold")}: <span className="font-bold">{d.qty_sold}</span></p>
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
  const { t, layout } = useLanguage();
  // Car companies restock from Vehicles (stock in) — no Purchases page.
  const isCar = layout === "car";
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
        setError(String(sumRes.reason?.message ?? t("reports.could_not_load_sales_summary")));
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
    } catch (err) { setError(t("reports.failed_to_load")); console.error(err); }
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
  if (loading) return <ReportsSkeleton />;

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4 space-y-3">

        {/* ── HEADER ─────────────────────────────────────────────────────────── */}
        <div className="hgv-surface relative rounded-2xl mb-2 overflow-hidden"
          style={{ background: "linear-gradient(135deg, #0a66c2 0%, #004182 50%, #00376b 100%)" }}>
          <div style={{ position:"absolute",inset:0,pointerEvents:"none",
            backgroundImage:"radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize:"20px 20px" }} />

          <div className="relative flex items-center gap-3 px-4 pt-3 pb-2">
            <div className="flex items-center gap-2.5 min-w-0 mr-auto">
              <div className="w-8 h-8 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                <BarChart3 size={15} className="text-white" strokeWidth={2}/>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest leading-none">{t("reports.analytics_label")}</p>
                <h1 className="text-base font-extrabold text-white leading-tight tracking-tight">{t("reports.title")}</h1>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {lastUpdated && (
                <span className="text-[10px] text-blue-200/60 hidden sm:block">
                  {timeAgo(lastUpdated)} · {countdown}s
                </span>
              )}
              <button onClick={manualRefresh} disabled={refreshing}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition-all disabled:opacity-40">
                <RefreshCw size={12} className={refreshing ? "animate-spin" : ""}/>
              </button>
              <button onClick={() => window.print()}
                className="flex items-center gap-1.5 bg-white text-[#0a66c2] px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-50 active:scale-95 transition-all shadow-lg shadow-black/20">
                <Download size={12}/> {t("reports.export")}
              </button>
            </div>
          </div>

          <div className="relative flex items-center gap-1.5 px-4 pb-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"/>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400"/>
            </span>
            <p className="text-[10px] text-blue-100/70">
              <span className="text-green-400 font-semibold">{t("reports.live_word")}</span>
              {lastUpdated && <span className="ml-1 text-blue-200/50">· {t("common.updated")} {lastUpdated.toLocaleTimeString()}</span>}
            </p>
          </div>

          <div className="relative px-4 pb-3">
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
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{t("reports.could_not_load")}</p>
              <p className="text-xs mt-0.5 text-red-600 font-mono">{error}</p>
              <button onClick={() => loadData(true)} className="mt-2 text-xs font-semibold underline hover:no-underline">{t("reports.retry")}</button>
            </div>
          </div>
        )}

        {/* ── KPI CARDS ──────────────────────────────────────────────────────── */}
        {summary && (
          <>
            {/* Row 1: Stock money summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              <KpiCard
                label={t("reports.stock_value")}
                value={`RWF ${fmtRWF(stockCost)}`}
                detail={t("reports.detail_stock_value").replace("{n}", fmtNum(summary.total_products))}
                icon={<Package size={18} />}
                color="blue"
                pulse
              />
              <KpiCard
                label={t("reports.if_sell_everything")}
                value={`RWF ${fmtRWF(stockRetail)}`}
                detail={t("reports.detail_sell_everything")}
                icon={<DollarSign size={18} />}
                color="blue"
                pulse
              />
              <KpiCard
                label={t("reports.profit_you_can_make")}
                value={`RWF ${fmtRWF(summary.potential_profit)}`}
                detail={t("reports.detail_profit_potential").replace("{pct}", String(stockCost > 0 ? ((summary.potential_profit / stockCost) * 100).toFixed(1) : 0))}
                icon={<TrendingUp size={18} />}
                color="blue"
                pulse
              />
            </div>
            {/* Row 2: Stock health + sales + expenses + net profit */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-1.5">
              <KpiCard
                label={t("reports.out_stock")}
                value={String(summary.out_of_stock)}
                detail={t("reports.detail_out_of_stock")}
                icon={<AlertCircle size={18} />}
                color={summary.out_of_stock > 0 ? "red" : "green"}
                badge={summary.out_of_stock > 0 ? t("reports.badge_buy_now") : t("reports.badge_all_good")}
              />
              <KpiCard
                label={t("reports.almost_finished")}
                value={String(summary.low_stock)}
                detail={t("reports.detail_almost_finished")}
                icon={<AlertTriangle size={18} />}
                color={summary.low_stock > 0 ? "amber" : "green"}
                badge={summary.low_stock > 0 ? t("reports.badge_restock_soon") : t("reports.badge_ok")}
              />
              <KpiCard
                label={t("reports.revenue_earned")}
                value={`RWF ${fmtRWF(summary.revenue)}`}
                detail={t("reports.detail_revenue").replace("{sales}", String(summary.sales_count)).replace("{customers}", String(summary.unique_customers))}
                icon={<ShoppingCart size={18} />}
                color="blue"
              />
              <KpiCard
                label={t("reports.gross_profit_sales")}
                value={`RWF ${fmtRWF(summary.profit)}`}
                detail={t("reports.detail_gross_profit").replace("{margin}", margin)}
                icon={<TrendingUp size={18} />}
                color="emerald"
              />
              <KpiCard
                label={t("reports.business_expenses")}
                value={expenseTotalPeriod > 0 ? `RWF ${fmtRWF(expenseTotalPeriod)}` : "—"}
                detail={t("reports.detail_expense_records").replace("{count}", String(expenseCount))}
                icon={<Receipt size={18} />}
                color="orange"
              />
              <KpiCard
                label={t("reports.net_profit_real")}
                value={`RWF ${fmtRWF(summary.profit - expenseTotalPeriod)}`}
                detail={t("reports.detail_net_profit").replace("{status}", summary.profit - expenseTotalPeriod >= 0 ? t("reports.profitable") : t("reports.at_loss"))}
                icon={<DollarSign size={18} />}
                color={summary.profit - expenseTotalPeriod >= 0 ? "blue" : "red"}
              />
            </div>
          </>
        )}

        {/* ── REVENUE + PROFIT AREA CHART ────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-2.5">
          <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Activity size={15} className="text-[#0a66c2]" />
                {t("reports.daily_revenue_profit_30d")}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {t("reports.avg_daily_revenue")}: <span className="font-semibold text-slate-600">RWF {fmtRWF(avgDailyRevenue)}</span>
                &nbsp;·&nbsp;{t("reports.this_week")}: <span className="font-semibold text-slate-600">RWF {fmtRWF(revenueThisWeek)}</span>
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#0a66c2] inline-block" /> {t("sales.revenue")}</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> {t("sales.profit")}</span>
            </div>
          </div>

          {dailyChartData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-slate-400 text-sm">{t("common.no_data")}</div>
          ) : (
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={dailyChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#0a66c2" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#0a66c2" stopOpacity={0.02} />
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
                <Area type="monotone" dataKey="revenue" name="revenue" stroke="#0a66c2" strokeWidth={2} fill="url(#gradRevenue)" dot={false} activeDot={{ r: 4, fill: "#0a66c2" }} />
                <Area type="monotone" dataKey="profit"  name="profit"  stroke="#10b981" strokeWidth={2} fill="url(#gradProfit)"  dot={false} activeDot={{ r: 4, fill: "#10b981" }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── STOCK HEALTH PIE + STOCK VALUE vs POTENTIAL ────────────────────── */}
        {summary && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

            {/* Stock Health Pie */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800 mb-1">{t("reports.how_is_your_stock")}</h2>
              <p className="text-xs text-slate-400 mb-2">
                {summary.total_products} {t("reports.products_total")} &mdash;&nbsp;
                <span className="text-red-500 font-medium">{summary.out_of_stock} {t("reports.finished_word").toLowerCase()}</span>,&nbsp;
                <span className="text-amber-500 font-medium">{summary.low_stock} {t("reports.almost_finished").toLowerCase()}</span>
              </p>

              {stockPieData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-slate-400 text-sm">{t("reports.no_stock_data")}</div>
              ) : (
                <ResponsiveContainer width="100%" height={150}>
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
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {[
                  { label: t("reports.good_word"),      count: Math.max(0, summary.total_products - summary.out_of_stock - summary.low_stock), color: "bg-green-500", text: "text-green-700", bg: "bg-green-50" },
                  { label: t("reports.almost_finished"), count: summary.low_stock,   color: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50" },
                  { label: t("reports.finished_word"),   count: summary.out_of_stock, color: "bg-red-500",  text: "text-red-700",  bg: "bg-red-50" },
                ].map((s) => (
                  <div key={s.label} className={`${s.bg} rounded-lg p-2 text-center`}>
                    <p className={`text-sm font-bold ${s.text}`}>{s.count}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Money Breakdown */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800 mb-0.5">{t("reports.where_your_money_is")}</h2>
              <p className="text-xs text-slate-400 mb-2">
                {t("reports.bar_chart_hint")}
              </p>

              <div className="space-y-2.5 mb-3">
                <ValueBar
                  label={t("reports.vb_paid_label")}
                  sublabel={t("reports.vb_paid_sub")}
                  value={stockCost}
                  max={Math.max(stockCost, stockRetail, summary.revenue, 1)}
                  color="bg-indigo-500"
                  textColor="text-indigo-700"
                />
                <ValueBar
                  label={t("reports.vb_earn_label")}
                  sublabel={t("reports.vb_earn_sub")}
                  value={stockRetail}
                  max={Math.max(stockCost, stockRetail, summary.revenue, 1)}
                  color="bg-[#0a66c2]"
                  textColor="text-[#0a66c2]"
                />
                <ValueBar
                  label={t("reports.vb_profit_label")}
                  sublabel={t("reports.vb_profit_sub")}
                  value={summary.potential_profit}
                  max={Math.max(stockCost, stockRetail, summary.revenue, 1)}
                  color="bg-violet-500"
                  textColor="text-violet-700"
                />
                <ValueBar
                  label={`${t("reports.vb_sales_label")} (${dateFrom} → ${dateTo})`}
                  sublabel={t("reports.vb_sales_sub")}
                  value={summary.revenue}
                  max={Math.max(stockCost, stockRetail, summary.revenue, 1)}
                  color="bg-teal-500"
                  textColor="text-teal-700"
                />
                <ValueBar
                  label={`${t("reports.vb_gross_profit_label")} (${dateFrom} → ${dateTo})`}
                  sublabel={t("reports.vb_gross_profit_sub")}
                  value={summary.profit}
                  max={Math.max(stockCost, stockRetail, summary.revenue, 1)}
                  color="bg-emerald-500"
                  textColor="text-emerald-700"
                />
                {expenseTotalPeriod > 0 && (
                  <ValueBar
                    label={`${t("reports.business_expenses")} (${dateFrom} → ${dateTo})`}
                    sublabel={t("reports.vb_expenses_sub").replace("{count}", String(expenseCount))}
                    value={expenseTotalPeriod}
                    max={Math.max(stockCost, stockRetail, summary.revenue, 1)}
                    color="bg-orange-400"
                    textColor="text-orange-600"
                  />
                )}
                <ValueBar
                  label={`${t("reports.vb_net_profit_label")} (${dateFrom} → ${dateTo})`}
                  sublabel={t("reports.vb_net_profit_sub")}
                  value={Math.max(0, summary.profit - expenseTotalPeriod)}
                  max={Math.max(stockCost, stockRetail, summary.revenue, 1)}
                  color={summary.profit - expenseTotalPeriod >= 0 ? "bg-[#0a66c2]" : "bg-red-400"}
                  textColor={summary.profit - expenseTotalPeriod >= 0 ? "text-[#0a66c2]" : "text-red-600"}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {stockCost > 0 && (
                  <div className="bg-[#EBF2FD] rounded-lg p-2">
                    <p className="text-xs text-slate-500">{t("reports.profit_rate_stock")}</p>
                    <p className="text-sm font-bold text-[#0a66c2] mt-0.5">
                      {((summary.potential_profit / stockCost) * 100).toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{t("reports.profit_rate_stock_hint")}</p>
                  </div>
                )}
                {summary.revenue > 0 && (
                  <div className="bg-emerald-50 rounded-lg p-2">
                    <p className="text-xs text-slate-500">{t("reports.profit_rate_sales")}</p>
                    <p className="text-sm font-bold text-emerald-700 mt-0.5">{margin}%</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{t("reports.profit_rate_sales_hint")}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TOP ITEMS HORIZONTAL BAR ───────────────────────────────────────── */}
        {topItemsChart.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">{t("reports.top_items")}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{t("reports.revenue_profit_by_product")}</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-600 inline-block" /> {t("sales.revenue")}</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> {t("sales.profit")}</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={Math.max(160, topItemsChart.length * 32)}>
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
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="flex justify-between items-center px-4 py-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <AlertCircle size={14} className="text-amber-500" />
                <h2 className="text-sm font-semibold text-slate-700">
                  {t("reports.stock_alerts")} — {stockAlerts.length} {t("nav.items").toLowerCase()}
                </h2>
              </div>
              <Link href={isCar ? "/items" : "/PurchaseManagement"}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#0a66c2] bg-[#EBF2FD] hover:bg-[#D5E8FB] px-3 py-1 rounded-lg transition">
                <ArrowUpRight size={11} /> {t("purchases.add")}
              </Link>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {[t("items.name"), t("reports.col_qty_left"), t("reports.col_you_paid"), t("reports.col_you_sell_for"), t("reports.col_profit_pct"), t("reports.col_action")].map((h) => (
                    <th key={h} className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {stockAlerts.map((item) => {
                  const marginPct = item.cost_price > 0
                    ? (((item.selling_price - item.cost_price) / item.cost_price) * 100).toFixed(0) : "—";
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-1.5 font-medium text-slate-800">{item.name}</td>
                      <td className="px-3 py-1.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold
                          ${item.quantity === 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                          {item.quantity}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-slate-600 tabular-nums">{item.cost_price.toLocaleString()}</td>
                      <td className="px-3 py-1.5 font-semibold text-green-600 tabular-nums">{item.selling_price.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-slate-500 text-xs font-medium">{marginPct !== "—" ? `+${marginPct}%` : "—"}</td>
                      <td className="px-3 py-1.5">
                        <Link
                          href={isCar ? "/items" : `/PurchaseManagement?name=${encodeURIComponent(item.name)}&cost=${item.cost_price}&selling=${item.selling_price}&supplierId=${item.supplier_id ?? ""}`}
                          className="text-xs font-semibold text-[#0a66c2] hover:underline flex items-center gap-0.5">
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
              {t("reports.stock_healthy_full")}
            </div>
          )
        )}

        {/* ── RECENT PURCHASES ───────────────────────────────────────────────── */}
        {!isCar && recentPurchases.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="flex justify-between items-center px-4 py-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Truck size={14} className="text-[#0a66c2]" />
                <h2 className="text-sm font-semibold text-slate-700">
                  {t("reports.recent_purchases")} — <span className="text-[#0a66c2]">RWF {fmtRWF(purchaseTotalSpent)} {t("reports.spent_word")}</span>
                </h2>
              </div>
              <Link href={isCar ? "/items" : "/PurchaseManagement"}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#0a66c2] bg-[#EBF2FD] hover:bg-[#D5E8FB] px-3 py-1 rounded-lg transition">
                <ArrowUpRight size={11} /> {t("dash.view_all")}
              </Link>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {[t("purchases.col_date"), t("purchases.col_product"), t("purchases.col_qty"), t("purchases.col_unit"), t("purchases.col_total")].map((h) => (
                    <th key={h} className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentPurchases.map((p) => {
                  const d = p.created_at ? new Date(p.created_at) : null;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-1.5 text-xs text-slate-500 whitespace-nowrap">
                        {d ? toDateStr(d) : "—"}
                      </td>
                      <td className="px-3 py-1.5 font-medium text-slate-800">{p.product_name}</td>
                      <td className="px-3 py-1.5 tabular-nums text-slate-600">{p.quantity_added}</td>
                      <td className="px-3 py-1.5 tabular-nums text-slate-600">{(p.cost_price || 0).toLocaleString()}</td>
                      <td className="px-3 py-1.5 font-semibold text-slate-800 tabular-nums">{(p.total_cost || 0).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── SECONDARY STATS ROW ────────────────────────────────────────────── */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-1.5 pb-6">
            <StatMini label={t("reports.items_sold")}  value={fmtNum(summary.items_sold)}               sub={`${t("reports.to_word")} ${summary.unique_customers} ${t("reports.customers_word")}`} color="text-indigo-600" icon={<ShoppingCart size={14} />} />
            {!isCar && <StatMini label={t("reports.spent_on_restocking")} value={`RWF ${fmtRWF(summary.total_spent)}`}   sub={`${recentPurchases.length} ${t("reports.purchase_records")}`} color="text-teal-600" icon={<Truck size={14} />} />}
            <StatMini label={t("reports.business_expenses")}  value={expenseTotalPeriod > 0 ? `RWF ${fmtRWF(expenseTotalPeriod)}` : "—"} sub={`${expenseCount} ${t("reports.records_this_period")}`} color="text-orange-600" icon={<Receipt size={14} />} />
            <StatMini
              label={t("reports.net_profit_real")}
              value={`RWF ${fmtRWF(summary.profit - expenseTotalPeriod)}`}
              sub={summary.profit - expenseTotalPeriod >= 0 ? t("reports.profitable_after_costs") : t("reports.spending_more")}
              color={summary.profit - expenseTotalPeriod >= 0 ? "text-[#0a66c2]" : "text-red-600"}
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
  indigo:  { bg: "bg-[#EBF2FD]",   text: "text-[#0a66c2]",   badge: "bg-[#D5E8FB] text-[#0a66c2]"     },
  blue:    { bg: "bg-[#EBF2FD]",   text: "text-[#0a66c2]",   badge: "bg-[#D5E8FB] text-[#0a66c2]"     },
  violet:  { bg: "bg-[#EBF2FD]",   text: "text-[#0a66c2]",   badge: "bg-[#D5E8FB] text-[#0a66c2]"     },
  teal:    { bg: "bg-[#EBF2FD]",   text: "text-[#0a66c2]",   badge: "bg-[#D5E8FB] text-[#0a66c2]"     },
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
    <div className={`bg-white rounded-xl border border-slate-200 p-3 transition-all ${pulse ? "relative" : ""}`}>
      {pulse && (
        <span className="absolute top-3 right-3 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0a66c2]" />
        </span>
      )}
      <div className={`w-7 h-7 rounded-lg ${c.bg} ${c.text} flex items-center justify-center mb-2`}>
        {icon}
      </div>
      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 ${c.text} leading-none`}>{value}</p>
      <p className="text-[10px] text-slate-400 mt-1.5">{detail}</p>
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
    <div className="bg-white rounded-xl border border-slate-200 px-2.5 py-2 shadow-sm">
      <div className="flex items-center gap-1.5 text-slate-400 mb-1.5">
        {icon}
        <span className="text-[9px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-xs font-bold ${color}`}>{value}</p>
      <p className="text-[9px] text-slate-400 mt-0.5">{sub}</p>
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div className="min-h-screen">
      <style>{`@keyframes rep-sh{0%{background-position:-200% 0}100%{background-position:200% 0}}.rep-sh{background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:rep-sh 1.4s infinite;border-radius:5px}.rep-sh-w{background:linear-gradient(90deg,rgba(255,255,255,.1) 25%,rgba(255,255,255,.22) 50%,rgba(255,255,255,.1) 75%);background-size:200% 100%;animation:rep-sh 1.4s infinite;border-radius:5px}`}</style>
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4 space-y-3">
        {/* Header */}
        <div className="hgv-surface relative rounded-2xl overflow-hidden" style={{background:"linear-gradient(135deg,#0a66c2 0%,#004182 50%,#00376b 100%)"}}>
          <div className="relative flex items-center gap-3 px-4 pt-3 pb-2">
            <div className="w-8 h-8 rounded-xl rep-sh-w shrink-0" />
            <div><div className="rep-sh-w h-2 w-16 mb-1 rounded" /><div className="rep-sh-w h-4 w-28 rounded" /></div>
            <div className="ml-auto flex items-center gap-1.5"><div className="rep-sh-w h-3 w-20 rounded" /><div className="rep-sh-w w-7 h-7 rounded-lg" /><div className="rep-sh-w h-7 w-24 rounded-lg" /></div>
          </div>
          <div className="px-4 pb-2 flex gap-1.5"><div className="rep-sh-w h-2 w-4 rounded-full" /><div className="rep-sh-w h-2 w-32 rounded" /></div>
          <div className="px-4 pb-3"><div className="rep-sh-w h-9 w-full rounded-xl" /></div>
        </div>
        {/* KPI row 1 — 3 large cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
          {Array.from({length:3}).map((_,i)=>(
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-3">
              <div className="rep-sh w-7 h-7 rounded-lg mb-2" />
              <div className="rep-sh h-2 w-20 mb-1.5 rounded" />
              <div className="rep-sh h-5 w-24 mb-1.5 rounded" />
              <div className="rep-sh h-2 w-full rounded" />
            </div>
          ))}
        </div>
        {/* KPI row 2 — 6 cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-1.5">
          {Array.from({length:6}).map((_,i)=>(
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-3">
              <div className="rep-sh w-7 h-7 rounded-lg mb-2" />
              <div className="rep-sh h-2 w-16 mb-1.5 rounded" />
              <div className="rep-sh h-5 w-20 mb-1.5 rounded" />
              <div className="rep-sh h-2 w-full rounded" />
            </div>
          ))}
        </div>
        {/* Chart area */}
        <div className="bg-white rounded-xl border border-slate-200 p-2.5">
          <div className="rep-sh h-3 w-48 mb-1 rounded" />
          <div className="rep-sh h-2 w-64 mb-3 rounded" />
          <div className="rep-sh h-44 w-full rounded-lg" />
        </div>
        {/* Two-col: pie + bars */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[0,1].map(i=>(
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-3">
              <div className="rep-sh h-3 w-36 mb-1 rounded" />
              <div className="rep-sh h-2 w-48 mb-3 rounded" />
              <div className="rep-sh h-36 w-full rounded-lg" />
            </div>
          ))}
        </div>
        {/* Stock alerts table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-100 flex justify-between items-center">
            <div className="rep-sh h-3 w-40 rounded" /><div className="rep-sh h-6 w-24 rounded-lg" />
          </div>
          {Array.from({length:5}).map((_,i)=>(
            <div key={i} className="flex items-center gap-3 px-3 border-b border-slate-50" style={{padding:"6px 12px"}}>
              {[120,40,60,70,48,52].map((w,j)=><div key={j} className="rep-sh h-2.5 rounded shrink-0" style={{width:w}} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
