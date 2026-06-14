"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { reportRequest } from "@/lib/report-api";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import DateRangeFilter from "@/app/components/ui/DateRangeFilter";
import {
  BarChart3, TrendingUp, DollarSign, Package, Users,
  ShoppingCart, AlertCircle, RefreshCw, Download, ArrowUpRight,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────── */
interface Summary {
  revenue: number; profit: number; items_sold: number;
  sales_count: number; unique_customers: number; total_spent: number;
  stock_value: number; potential_profit: number;
  total_products: number; out_of_stock: number; low_stock: number;
}
interface DayRow { day: string; revenue: number; profit: number; sales_count: number; }
interface TopItem { product_id: string; product_name: string; qty_sold: number; revenue: number; profit: number; }
interface StockAlert { id: string; name: string; quantity: number; cost_price: number; selling_price: number; supplier_id?: string; }

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ReportsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<DayRow[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 29); return toDateStr(d);
  });
  const [dateTo, setDateTo] = useState(() => toDateStr(new Date()));

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loading) loadData(true); }, [dateFrom, dateTo]);

  async function loadData(soft = false) {
    try {
      if (!soft) setLoading(true); else setRefreshing(true);

      const dateParams = new URLSearchParams({
        ...(dateFrom && { from_date: dateFrom }),
        ...(dateTo && { to_date: dateTo }),
      });

      const [sumRes, dayRes, topRes, alertRes] = await Promise.all([
        reportRequest(`/reports/summary?${dateParams}`),
        reportRequest("/reports/daily?days=30"),
        reportRequest(`/reports/top-items?limit=10&${dateParams}`),
        reportRequest("/reports/stock-alerts"),
      ]);

      setSummary(sumRes?.data || null);
      setDaily(dayRes?.data || []);
      setTopItems(topRes?.data || []);
      setStockAlerts(alertRes?.data || []);
      setLastUpdated(new Date());
    } catch (err) { console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  }

  const maxRevenue = useMemo(() => Math.max(...daily.map((d) => d.revenue), 1), [daily]);

  const margin = summary && summary.revenue > 0
    ? ((summary.profit / summary.revenue) * 100).toFixed(1) : "0.0";

  if (loading) return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="rounded-2xl bg-linear-to-r from-slate-700 to-slate-900 p-5 mb-6 animate-pulse">
          <div className="flex justify-between"><div className="h-4 w-40 bg-white/20 rounded-lg" /><div className="h-8 w-28 bg-white/20 rounded-lg" /></div>
          <div className="h-9 bg-white/10 rounded-lg mt-4" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[...Array(8)].map((_, i) => <div key={i} className="bg-white rounded-xl border p-4 animate-pulse"><div className="h-2.5 w-16 bg-slate-200 rounded mb-3" /><div className="h-6 w-12 bg-slate-200 rounded" /></div>)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* HEADER */}
        <div className="bg-linear-to-r from-slate-700 to-slate-900 text-white rounded-2xl p-5 mb-6">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2.5">
              <BarChart3 size={20} />
              <div>
                <h1 className="text-base font-semibold">Raporo — Reports</h1>
                <p className="text-slate-300 text-xs mt-0.5">
                  {lastUpdated ? `Ivuguruwemo saa ${lastUpdated.toLocaleTimeString()}` : "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => loadData(true)} disabled={refreshing}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition disabled:opacity-50">
                <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              </button>
              <button onClick={() => window.print()}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-sm px-3 py-1.5 rounded-lg transition">
                <Download size={14} /> Sohora
              </button>
            </div>
          </div>

          <DateRangeFilter
            from={dateFrom} to={dateTo}
            onFrom={setDateFrom} onTo={setDateTo}
            onClear={() => { const d = new Date(); d.setDate(d.getDate() - 29); setDateFrom(toDateStr(d)); setDateTo(toDateStr(new Date())); }}
            accentClass="focus:ring-slate-400/40 focus:border-slate-400"
          />
        </div>

        {/* SUMMARY CARDS */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Amafaranga Yinjiye", value: summary.revenue.toLocaleString(), sub: `${margin}% inyungu`, color: "text-green-600", bg: "bg-green-50", icon: <DollarSign size={17} /> },
              { label: "Inyungu Yose", value: summary.profit.toLocaleString(), sub: `${summary.sales_count} amagurishwa`, color: "text-emerald-600", bg: "bg-emerald-50", icon: <TrendingUp size={17} /> },
              { label: "Ibintu Bigurishijwe", value: summary.items_sold.toLocaleString(), sub: `Abakiriya ${summary.unique_customers}`, color: "text-blue-600", bg: "bg-blue-50", icon: <ShoppingCart size={17} /> },
              { label: "Amafaranga Yaguriyemo", value: summary.total_spent.toLocaleString(), sub: "Ibigurishwa byose", color: "text-red-500", bg: "bg-red-50", icon: <Package size={17} /> },
              { label: "Agaciro k'Ububiko", value: summary.stock_value.toLocaleString(), sub: `${summary.total_products} ibicuruzwa`, color: "text-indigo-600", bg: "bg-indigo-50", icon: <Package size={17} /> },
              { label: "Inyungu y'Intego", value: summary.potential_profit.toLocaleString(), sub: "Niba byose byagurishijwe", color: "text-violet-600", bg: "bg-violet-50", icon: <TrendingUp size={17} /> },
              { label: "Nta Bubiko", value: summary.out_of_stock, sub: "Igicuruzwa", color: "text-red-600", bg: "bg-red-50", icon: <AlertCircle size={17} /> },
              { label: "Ububiko Bugarije", value: summary.low_stock, sub: "Igicuruzwa ≤ 10", color: "text-amber-500", bg: "bg-amber-50", icon: <AlertCircle size={17} /> },
            ].map((c) => (
              <div key={c.label} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide leading-none">{c.label}</p>
                    <p className={`text-xl font-bold mt-1.5 ${c.color}`}>{c.value}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{c.sub}</p>
                  </div>
                  <div className={`${c.bg} ${c.color} p-1.5 rounded-lg shrink-0`}>{c.icon}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* DAILY CHART */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-slate-700">Amafaranga y&apos;Iminsi 30</h2>
              <span className="text-xs text-slate-400">Revenue ya buri munsi</span>
            </div>
            {daily.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Nta makuru abonetse</div>
            ) : (
              <div className="flex items-end gap-1 h-40">
                {daily.map((d) => {
                  const h = Math.round((d.revenue / maxRevenue) * 100);
                  const date = d.day.slice(5);
                  return (
                    <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div
                        className="w-full bg-slate-600 rounded-t-sm hover:bg-slate-500 transition-all cursor-default"
                        style={{ height: `${Math.max(h, 2)}%` }}
                      />
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                        {d.day}<br />{d.revenue.toLocaleString()} RWF<br />{d.sales_count} igurisha
                      </div>
                      <span className="text-slate-400 text-[9px] rotate-45 origin-left hidden md:block">{date}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* TOP ITEMS */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-slate-700">Ibicuruzwa Bikunzwe</h2>
              <span className="text-xs text-slate-400">Revenue nziza</span>
            </div>
            {topItems.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">Nta makuru</p>
            ) : (
              <div className="space-y-3">
                {topItems.slice(0, 7).map((item, i) => {
                  const maxRev = topItems[0]?.revenue || 1;
                  const pct = Math.round((item.revenue / maxRev) * 100);
                  return (
                    <div key={item.product_id || i}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-slate-700 truncate max-w-36">{item.product_name || "—"}</span>
                        <span className="text-slate-500 shrink-0 ml-2">{item.revenue.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full">
                        <div className="h-full bg-slate-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{item.qty_sold} bigurishijwe · inyungu {item.profit.toLocaleString()}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* STOCK ALERTS TABLE */}
        {stockAlerts.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-amber-500" />
                <h2 className="text-sm font-semibold text-slate-700">
                  Imenyesha y&apos;Ububiko — {stockAlerts.length} ibicuruzwa
                </h2>
              </div>
              <Link href="/PurchaseManagement"
                className="flex items-center gap-1 text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition">
                <ArrowUpRight size={12} /> Injiza Ibigurwa
              </Link>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["Igicuruzwa", "Ububiko", "Igiciro cy'Igurishwa", "Igiciro cy'Igurisha", "Imimerere"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {stockAlerts.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        item.quantity === 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                        {item.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums">{item.cost_price.toLocaleString()}</td>
                    <td className="px-4 py-3 font-semibold text-green-600 tabular-nums">{item.selling_price.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/PurchaseManagement?name=${encodeURIComponent(item.name)}&cost=${item.cost_price}&selling=${item.selling_price}&supplierId=${item.supplier_id || ""}`}
                        className="text-xs font-semibold text-violet-600 hover:underline flex items-center gap-0.5">
                        <ArrowUpRight size={11} /> Zuzuza
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* EMPTY STATE */}
        {!summary && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="p-5 bg-slate-100 rounded-2xl mb-4"><BarChart3 size={36} className="opacity-40" /></div>
            <p className="font-medium text-slate-500">Nta raporo ibonetse</p>
            <p className="text-xs mt-1">Injiza ibicuruzwa n&apos;amagurishwa mbere.</p>
            <div className="flex gap-3 mt-5">
              <Link href="/PurchaseManagement" className="flex items-center gap-1.5 bg-violet-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-violet-700 transition">
                <Package size={14} /> Injiza Ibigurwa
              </Link>
              <Link href="/SaleManagement" className="flex items-center gap-1.5 bg-orange-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-orange-600 transition">
                <Users size={14} /> Injiza Amagurishwa
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
