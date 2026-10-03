"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { reportRequest } from "@/lib/report-api";
import WeeklyPerformance from "@/app/components/reports/WeeklyPerformance";
import { useAutoRefresh } from "@/lib/hooks";
import { itemRequest } from "@/lib/product-api";
import { purchaseRequest } from "@/lib/purchase-api";
import { expenseRequest } from "@/lib/expense-api";
import { useLanguage } from "@/lib/language-context";
import { useShopSettings } from "@/lib/shop-settings-context";
import DateRangeFilter from "@/app/components/ui/DateRangeFilter";
import { BarChart3, AlertCircle, Download, CheckCircle, RefreshCw } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Summary {
  revenue: number; profit: number; items_sold: number;
  sales_count: number; unique_customers: number; total_spent: number;
  stock_value: number; potential_profit: number;
  total_products: number; out_of_stock: number; low_stock: number;
}
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

const REFRESH_INTERVAL = 120; // seconds

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { t, layout } = useLanguage();
  // Car companies restock from Vehicles (stock in) — no Purchases page.
  const isCar = layout === "car";
  // Settings → currency and low stock threshold.
  const { currency, lowStock } = useShopSettings();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [recentPurchases, setRecentPurchases] = useState<PurchaseRecord[]>([]);
  const [purchaseTotalSpent, setPurchaseTotalSpent] = useState(0);
  const [expenseTotalPeriod, setExpenseTotalPeriod] = useState(0);
  const [expenseCount, setExpenseCount] = useState(0);
  const [stockRetail, setStockRetail] = useState(0); // selling_price × qty (retail value)
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Opens on the last 7 days, like the other pages.
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 6); return toDateStr(d);
  });
  const [dateTo, setDateTo] = useState(() => toDateStr(new Date()));

  const loadData = useCallback(async (soft = false) => {
    try {
      if (!soft) setLoading(true); else setRefreshing(true);
      setError(null);
      const dateParams = new URLSearchParams({
        ...(dateFrom && { from_date: dateFrom }),
        ...(dateTo   && { to_date: dateTo }),
        threshold: String(lowStock),
      });
      const purchaseParams = new URLSearchParams({
        limit: "500",
        ...(dateFrom && { from_date: dateFrom }),
        ...(dateTo   && { to_date: dateTo }),
      });

      // Fetch from reports service, products service, purchases service, and expenses in parallel
      const [sumRes, topRes, alertRes, productsRes, purchasesRes, expenseRes] = await Promise.allSettled([
        reportRequest(`/reports/summary?${dateParams}`),
        reportRequest(`/reports/top-items?limit=10&${dateParams}`),
        reportRequest(`/reports/stock-alerts?threshold=${lowStock}`),
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
      const lowCount    = products.filter((p) => p.quantity > 0 && p.quantity <= lowStock).length;
      const totalProducts = products.length;
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
          low_stock:        lowCount,
          total_products:   totalProducts,
        });
      } else {
        // Reports service failed but we still have stock data — show partial summary
        if (totalProducts > 0) {
          setSummary({
            revenue: 0, profit: 0, items_sold: 0, sales_count: 0,
            unique_customers: 0, total_spent: totalSpentFromPurchases,
            stock_value: costValue, potential_profit: potentialProfit,
            out_of_stock: outOfStock, low_stock: lowCount, total_products: totalProducts,
          });
        }
        setError(String(sumRes.reason?.message ?? t("reports.could_not_load_sales_summary")));
      }

      setTopItems(topRes.status === "fulfilled" ? topRes.value?.data    ?? [] : []);

      // Use stock alerts from products service (more reliable), fall back to reports service
      const alertsFromProducts: StockAlert[] = products
        .filter((p) => p.quantity <= lowStock)
        .map((p) => ({ id: p.id, name: p.name, quantity: p.quantity, cost_price: p.cost_price, selling_price: p.selling_price, supplier_id: p.supplier_id ?? undefined }));
      const alertsFromReports: StockAlert[] = alertRes.status === "fulfilled" ? (alertRes.value?.data ?? []) : [];
      setStockAlerts(alertsFromProducts.length > 0 ? alertsFromProducts : alertsFromReports);

      setLastUpdated(new Date());
    } catch (err) { setError(t("reports.failed_to_load")); console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  }, [dateFrom, dateTo, lowStock]);

  // Initial load
  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload on date change (skip first render)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    loadData(true);
  }, [dateFrom, dateTo, lowStock]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reports are heavier than other pages — refresh less often, never in a hidden tab.
  useAutoRefresh(() => loadData(true), REFRESH_INTERVAL * 1000);

  const manualRefresh = () => loadData(true);

  // ── Derived values ──────────────────────────────────────────────────────────
  const topMax = Math.max(1, ...topItems.map((i) => i.revenue || 0));
  const restockHref = (item: StockAlert) => isCar ? "/items"
    : `/PurchaseManagement?name=${encodeURIComponent(item.name)}&cost=${item.cost_price}&selling=${item.selling_price}&supplierId=${item.supplier_id ?? ""}`;

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
                  {timeAgo(lastUpdated)}
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
                const d = new Date(); d.setDate(d.getDate() - 6);
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

        {/* ── KEY FIGURES — one plain row, no profit ───────────────────────── */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Figure label={t("dash.chart_sales")} value={`${currency} ${fmtNum(summary.revenue)}`}
              detail={`${fmtNum(summary.sales_count)} ${t("reports.sales_word")}`} />
            <Figure label={t("reports.items_sold")} value={fmtNum(summary.items_sold)}
              detail={`${t("reports.to_word")} ${summary.unique_customers} ${t("reports.customers_word")}`} />
            <Figure label={t("dash.chart_expenses")} value={`${currency} ${fmtNum(expenseTotalPeriod)}`}
              detail={`${expenseCount} ${t("reports.records_this_period")}`} />
            <Figure label={t("reports.stock_value")} value={`${currency} ${fmtNum(stockRetail)}`}
              detail={`${fmtNum(summary.total_products)} ${t("reports.products_word")} · ${summary.low_stock + summary.out_of_stock} ${t("reports.need_restock_word")}`} />
          </div>
        )}

        {/* ── WEEKLY PERFORMANCE — 8 weeks, this week vs last ─────────────────── */}
        <WeeklyPerformance isCar={isCar} currency={currency} fmt={fmtRWF} />

        {/* ── TOP SELLERS + STOCK ALERTS ─────────────────────────────────────── */}
        {summary && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Panel title={t("reports.top_sellers")} sub={`${dateFrom || "…"} → ${dateTo || "…"}`}>
              {topItems.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500">{t("common.no_data")}</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {topItems.slice(0, 8).map((item, i) => (
                    <li key={item.product_id} className="px-4 py-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 truncate text-sm font-semibold text-slate-800">
                          <span className="mr-2 text-slate-400 tabular-nums">{i + 1}.</span>{item.product_name || "—"}
                        </p>
                        <p className="shrink-0 text-sm font-semibold text-slate-900 tabular-nums">{currency} {fmtNum(item.revenue)}</p>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-[#0a66c2]" style={{ width: `${Math.max(2, (item.revenue / topMax) * 100)}%` }} />
                        </div>
                        <span className="w-20 shrink-0 text-right text-xs text-slate-500 tabular-nums">{fmtNum(item.qty_sold)} {t("reports.sold_word")}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title={t("reports.stock_alerts")} sub={stockAlerts.length > 0 ? `${stockAlerts.length} ${t("nav.items").toLowerCase()}` : undefined}
              action={<Link href={isCar ? "/items" : "/PurchaseManagement"} className="text-xs font-semibold text-[#0a66c2] hover:underline">{t("dash.view_all")}</Link>}>
              {stockAlerts.length === 0 ? (
                <p className="flex items-center gap-2 px-4 py-6 text-sm font-medium text-emerald-700"><CheckCircle size={16} /> {t("reports.stock_healthy_full")}</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {[...stockAlerts].sort((x, y) => x.quantity - y.quantity).slice(0, 8).map((item) => (
                    <li key={item.id} className="flex items-center gap-3 px-4 py-2">
                      <span className={`inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums ${item.quantity === 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
                        {item.quantity}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                        <p className="text-xs text-slate-500 tabular-nums">{currency} {fmtNum(item.selling_price)}</p>
                      </div>
                      <Link href={restockHref(item)} className="shrink-0 text-xs font-semibold text-[#0a66c2] hover:underline">{t("reports.restock")}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        )}

        {/* ── RECENT PURCHASES (shops; car companies stock in from Vehicles) ── */}
        {!isCar && recentPurchases.length > 0 && (
          <Panel title={t("reports.recent_purchases")} sub={`${currency} ${fmtNum(purchaseTotalSpent)} ${t("reports.spent_word")}`}
            action={<Link href="/PurchaseManagement" className="text-xs font-semibold text-[#0a66c2] hover:underline">{t("dash.view_all")}</Link>}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {[t("purchases.col_date"), t("purchases.col_product"), t("purchases.col_qty"), t("purchases.col_unit"), t("purchases.col_total")].map((h) => (
                      <th key={h} className="whitespace-nowrap px-4 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentPurchases.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap px-4 py-1.5 text-xs text-slate-500">{p.created_at ? toDateStr(new Date(p.created_at)) : "—"}</td>
                      <td className="px-4 py-1.5 font-medium text-slate-800">{p.product_name}</td>
                      <td className="px-4 py-1.5 tabular-nums text-slate-600">{p.quantity_added}</td>
                      <td className="px-4 py-1.5 tabular-nums text-slate-600">{(p.cost_price || 0).toLocaleString()}</td>
                      <td className="px-4 py-1.5 font-semibold tabular-nums text-slate-800">{(p.total_cost || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
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

/** One key figure: label, value, one line of context. */
function Figure({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xl font-bold text-slate-900 tabular-nums">{value}</p>
      <p className="mt-0.5 truncate text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function Panel({ title, sub, action, children }: { title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-800">{title}</h2>
          {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
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
