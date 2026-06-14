"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { itemRequest } from "@/lib/product-api";
import { partnerRequest } from "@/lib/supplier-api";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, Package, Users,
  ShoppingCart, Truck, AlertCircle, RefreshCw, Download,
  ArrowUpRight, Calendar,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────── */
interface Product {
  id: string;
  name: string;
  cost_price: number;
  selling_price: number;
  quantity: number;
  supplier_id?: string | null;
  profit_status?: "profit" | "loss";
  profit_money?: number;
}

interface Partner {
  id: string;
  name: string;
  phone?: string;
  address?: string;
}

interface Sale {
  id: string;
  product_id: string;
  customer_id?: string;
  quantity: number;
  unit_price: number;
  notes?: string;
  created_at?: string;
}

type Range = "today" | "week" | "month" | "all";

/* ── Helpers ────────────────────────────────────────────── */
function loadSales(): Sale[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("higoverse_sales") || "[]"); } catch { return []; }
}

function inRange(sale: Sale, range: Range): boolean {
  if (range === "all" || !sale.created_at) return true;
  const d = new Date(sale.created_at);
  const now = new Date();
  if (range === "today") return d.toDateString() === now.toDateString();
  if (range === "week") {
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    return d >= weekAgo;
  }
  if (range === "month") {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }
  return true;
}

function decodePartner(p: Partner) {
  const addr = p.address ?? "";
  const isSupplier = addr.startsWith("TIN:");
  let tin = "";
  if (isSupplier) tin = addr.slice(4).split("|")[0];
  return { ...p, isSupplier, tin };
}

function fmtNum(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/* ── Bar chart component ────────────────────────────────── */
function HBar({ label, value, max, color, sub }: { label: string; value: number; max: number; color: string; sub?: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 2;
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-32 shrink-0 text-xs text-slate-600 font-medium truncate">{label}</div>
      <div className="flex-1 bg-slate-100 rounded-full h-2">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-24 text-right shrink-0">
        <span className="text-sm font-bold text-slate-700 tabular-nums">{fmtNum(value)}</span>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────── */
export default function ReportsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [partners, setPartners] = useState<ReturnType<typeof decodePartner>[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("month");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [productsRes, partnersRes] = await Promise.all([
        itemRequest("/products"),
        partnerRequest("/suppliers"),
      ]);
      setProducts(productsRes?.data?.items || []);
      const raw: Partner[] = partnersRes?.data?.items || partnersRes?.data || [];
      setPartners(raw.map(decodePartner));
      setSales(loadSales());
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  /* ── Derived data ─────────────────────────────────────── */
  const filteredSales = useMemo(() => sales.filter((s) => inRange(s, range)), [sales, range]);

  const productMap = useMemo(() => {
    const m: Record<string, Product> = {};
    products.forEach((p) => { m[p.id] = p; });
    return m;
  }, [products]);

  const partnerMap = useMemo(() => {
    const m: Record<string, ReturnType<typeof decodePartner>> = {};
    partners.forEach((p) => { m[p.id] = p; });
    return m;
  }, [partners]);

  const supplierItemCount = useMemo(() => {
    const c: Record<string, number> = {};
    products.forEach((p) => { if (p.supplier_id) c[p.supplier_id] = (c[p.supplier_id] || 0) + 1; });
    return c;
  }, [products]);

  /* inventory */
  const inventory = useMemo(() => {
    const inStock = products.filter((p) => p.quantity > 10);
    const lowStock = products.filter((p) => p.quantity > 0 && p.quantity <= 10);
    const outStock = products.filter((p) => p.quantity === 0);
    const stockValue = products.reduce((s, p) => s + p.cost_price * p.quantity, 0);
    const retailValue = products.reduce((s, p) => s + p.selling_price * p.quantity, 0);
    const potentialProfit = retailValue - stockValue;
    return { inStock, lowStock, outStock, stockValue, retailValue, potentialProfit, total: products.length };
  }, [products]);

  /* sales summary */
  const salesSummary = useMemo(() => {
    let revenue = 0;
    let profit = 0;
    let itemsSold = 0;
    const custSet = new Set<string>();
    filteredSales.forEach((s) => {
      const total = s.quantity * s.unit_price;
      const prod = productMap[s.product_id];
      const saleProfit = prod ? (s.unit_price - prod.cost_price) * s.quantity : 0;
      revenue += total;
      profit += saleProfit;
      itemsSold += s.quantity;
      if (s.customer_id) custSet.add(s.customer_id);
    });
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, profit, itemsSold, customers: custSet.size, margin, count: filteredSales.length };
  }, [filteredSales, productMap]);

  /* top items by revenue */
  const topItems = useMemo(() => {
    const agg: Record<string, { name: string; revenue: number; qty: number; profit: number }> = {};
    filteredSales.forEach((s) => {
      const prod = productMap[s.product_id];
      const key = s.product_id;
      if (!agg[key]) agg[key] = { name: prod?.name || "Unknown", revenue: 0, qty: 0, profit: 0 };
      agg[key].revenue += s.quantity * s.unit_price;
      agg[key].qty += s.quantity;
      agg[key].profit += prod ? (s.unit_price - prod.cost_price) * s.quantity : 0;
    });
    return Object.values(agg).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [filteredSales, productMap]);

  /* top customers by spend */
  const topCustomers = useMemo(() => {
    const agg: Record<string, { name: string; spend: number; count: number }> = {};
    filteredSales.forEach((s) => {
      const key = s.customer_id || "__walkin__";
      const name = s.customer_id ? (partnerMap[s.customer_id]?.name || "Unknown") : "Walk-in";
      if (!agg[key]) agg[key] = { name, spend: 0, count: 0 };
      agg[key].spend += s.quantity * s.unit_price;
      agg[key].count += 1;
    });
    return Object.values(agg).sort((a, b) => b.spend - a.spend).slice(0, 6);
  }, [filteredSales, partnerMap]);

  /* sales by day (last 14 days for chart) */
  const dailySales = useMemo(() => {
    const days: Record<string, number> = {};
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      days[d.toDateString()] = 0;
    }
    sales.forEach((s) => {
      if (!s.created_at) return;
      const key = new Date(s.created_at).toDateString();
      if (key in days) days[key] = (days[key] || 0) + s.quantity * s.unit_price;
    });
    return Object.entries(days).map(([date, revenue]) => ({
      date,
      label: new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      revenue,
    }));
  }, [sales]);

  const maxDailyRevenue = Math.max(...dailySales.map((d) => d.revenue), 1);

  /* suppliers */
  const supplierRows = useMemo(() => {
    return partners
      .filter((p) => p.isSupplier)
      .map((p) => ({ ...p, itemCount: supplierItemCount[p.id] || 0 }))
      .sort((a, b) => b.itemCount - a.itemCount);
  }, [partners, supplierItemCount]);

  const rangeLabels: Record<Range, string> = {
    today: "Today", week: "Last 7 days", month: "This month", all: "All time",
  };

  /* ── Skeleton ─────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <DashboardHeader />
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="rounded-2xl bg-linear-to-r from-slate-700 to-slate-900 p-5 mb-6 animate-pulse">
            <div className="flex justify-between items-center">
              <div className="h-4 w-32 bg-white/20 rounded-lg" />
              <div className="h-8 w-36 bg-white/20 rounded-lg" />
            </div>
            <div className="h-3 w-40 bg-white/20 rounded mt-3" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border p-4 animate-pulse">
                <div className="h-2.5 w-16 bg-slate-200 rounded mb-3" />
                <div className="h-5 w-12 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border p-5 animate-pulse">
                <div className="h-3 w-28 bg-slate-200 rounded mb-4" />
                {[...Array(4)].map((__, j) => (
                  <div key={j} className="flex items-center gap-3 py-2">
                    <div className="h-2 w-24 bg-slate-100 rounded" />
                    <div className="flex-1 h-2 bg-slate-100 rounded-full" />
                    <div className="h-2 w-16 bg-slate-100 rounded" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* HEADER BANNER */}
        <div className="bg-linear-to-r from-slate-700 to-slate-900 text-white rounded-2xl p-5 mb-6">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <BarChart3 size={20} />
              <div>
                <h1 className="text-base font-semibold">Business Reports</h1>
                <p className="text-slate-400 text-xs mt-0.5">
                  {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Loading..."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(["today", "week", "month", "all"] as Range[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    range === r ? "bg-white text-slate-800" : "bg-white/10 text-slate-300 hover:bg-white/20"
                  }`}
                >
                  {rangeLabels[r]}
                </button>
              ))}
              <button
                onClick={loadData}
                className="ml-1 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 transition"
                title="Refresh"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            {
              label: "Revenue", value: fmtNum(salesSummary.revenue), sub: `${salesSummary.count} sales`,
              color: "text-green-600", bg: "bg-green-50", icon: <DollarSign size={17} />,
            },
            {
              label: "Profit", value: fmtNum(salesSummary.profit), sub: `${salesSummary.margin.toFixed(1)}% margin`,
              color: salesSummary.profit >= 0 ? "text-emerald-600" : "text-red-500",
              bg: salesSummary.profit >= 0 ? "bg-emerald-50" : "bg-red-50",
              icon: salesSummary.profit >= 0 ? <TrendingUp size={17} /> : <TrendingDown size={17} />,
            },
            {
              label: "Items Sold", value: fmtNum(salesSummary.itemsSold), sub: `${salesSummary.customers} customers`,
              color: "text-blue-600", bg: "bg-blue-50", icon: <ShoppingCart size={17} />,
            },
            {
              label: "Stock Value", value: fmtNum(inventory.stockValue), sub: `${inventory.total} items`,
              color: "text-indigo-600", bg: "bg-indigo-50", icon: <Package size={17} />,
            },
            {
              label: "Partners", value: partners.length,
              sub: `${partners.filter((p) => p.isSupplier).length} suppliers`,
              color: "text-violet-600", bg: "bg-violet-50", icon: <Users size={17} />,
            },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide leading-none">{card.label}</p>
                  <p className={`text-xl font-bold mt-1.5 ${card.color}`}>{card.value}</p>
                  {card.sub && <p className="text-xs text-slate-400 mt-0.5">{card.sub}</p>}
                </div>
                <div className={`${card.bg} ${card.color} p-1.5 rounded-lg shrink-0`}>{card.icon}</div>
              </div>
            </div>
          ))}
        </div>

        {/* REVENUE CHART — last 14 days */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">Daily Revenue — Last 14 Days</h2>
              <p className="text-xs text-slate-400 mt-0.5">Based on recorded sales</p>
            </div>
            <Calendar size={16} className="text-slate-400" />
          </div>
          <div className="flex items-end gap-1 h-28">
            {dailySales.map((d) => {
              const h = maxDailyRevenue > 0 ? Math.max(4, (d.revenue / maxDailyRevenue) * 96) : 4;
              const isToday = d.date === new Date().toDateString();
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div
                    className={`w-full rounded-t-sm transition-all ${isToday ? "bg-slate-700" : "bg-slate-200 group-hover:bg-slate-400"}`}
                    style={{ height: `${h}px` }}
                  />
                  {/* tooltip */}
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition z-10">
                    {d.label}: {fmtNum(d.revenue)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-xs text-slate-400">{dailySales[0]?.label}</span>
            <span className="text-xs font-medium text-slate-600">Today</span>
          </div>
        </div>

        {/* TWO COLUMN GRID */}
        <div className="grid md:grid-cols-2 gap-4 mb-4">

          {/* TOP ITEMS BY REVENUE */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-slate-700">Top Items by Revenue</h2>
              <span className="text-xs text-slate-400">{rangeLabels[range]}</span>
            </div>
            {topItems.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">No sales recorded yet</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {topItems.map((item, i) => (
                  <HBar
                    key={item.name + i}
                    label={item.name}
                    value={item.revenue}
                    max={topItems[0].revenue}
                    color="bg-slate-700"
                    sub={`${item.qty} sold · profit ${fmtNum(item.profit)}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* TOP CUSTOMERS */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-slate-700">Top Customers</h2>
              <span className="text-xs text-slate-400">{rangeLabels[range]}</span>
            </div>
            {topCustomers.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">No sales recorded yet</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {topCustomers.map((c, i) => (
                  <HBar
                    key={c.name + i}
                    label={c.name}
                    value={c.spend}
                    max={topCustomers[0].spend}
                    color="bg-violet-500"
                    sub={`${c.count} order${c.count !== 1 ? "s" : ""}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* SECOND TWO COLUMN GRID */}
        <div className="grid md:grid-cols-2 gap-4 mb-4">

          {/* INVENTORY HEALTH */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-slate-700">Inventory Health</h2>
              <Link href="/ItemManagement" className="flex items-center gap-1 text-xs text-blue-500 hover:underline">
                Manage <ArrowUpRight size={12} />
              </Link>
            </div>
            <div className="space-y-2 mb-4">
              {[
                { label: "In Stock", count: inventory.inStock.length, color: "bg-green-500", text: "text-green-600" },
                { label: "Low Stock", count: inventory.lowStock.length, color: "bg-amber-400", text: "text-amber-600" },
                { label: "Out of Stock", count: inventory.outStock.length, color: "bg-red-400", text: "text-red-600" },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-500 w-24">{row.label}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${row.color}`}
                      style={{ width: inventory.total > 0 ? `${(row.count / inventory.total) * 100}%` : "0%" }}
                    />
                  </div>
                  <span className={`text-xs font-bold w-6 text-right tabular-nums ${row.text}`}>{row.count}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Stock Value</p>
                <p className="text-sm font-bold text-slate-700 tabular-nums">{fmtNum(inventory.stockValue)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Retail Value</p>
                <p className="text-sm font-bold text-green-600 tabular-nums">{fmtNum(inventory.retailValue)}</p>
              </div>
              <div className="col-span-2 bg-emerald-50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Potential Profit (if all sold)</p>
                <p className="text-sm font-bold text-emerald-600 tabular-nums">+{fmtNum(inventory.potentialProfit)}</p>
              </div>
            </div>
          </div>

          {/* SUPPLIER PERFORMANCE */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-slate-700">Supplier Performance</h2>
              <Link href="/PartnerManagement" className="flex items-center gap-1 text-xs text-green-500 hover:underline">
                Manage <ArrowUpRight size={12} />
              </Link>
            </div>
            {supplierRows.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No suppliers yet —{" "}
                <Link href="/PartnerManagement" className="text-green-500 hover:underline">Add one</Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {supplierRows.map((s) => (
                  <HBar
                    key={s.id}
                    label={s.name}
                    value={s.itemCount}
                    max={Math.max(...supplierRows.map((r) => r.itemCount), 1)}
                    color="bg-blue-500"
                    sub={s.itemCount === 0 ? "No items" : `${s.itemCount} item${s.itemCount !== 1 ? "s" : ""}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* LOW STOCK / RESTOCK ALERT */}
        {(inventory.lowStock.length > 0 || inventory.outStock.length > 0) && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-amber-500" />
                <h2 className="text-sm font-semibold text-slate-700">Restock Alerts</h2>
              </div>
              <Link href="/PurchaseManagement" className="flex items-center gap-1 text-xs text-violet-500 hover:underline">
                Go to Purchases <ArrowUpRight size={12} />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["Item", "Stock", "Status", "Stock Value", "Action"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {[...inventory.outStock, ...inventory.lowStock].map((p) => {
                    const restockUrl = `/PurchaseManagement?name=${encodeURIComponent(p.name)}&cost=${p.cost_price}&selling=${p.selling_price}&supplierId=${p.supplier_id || ""}`;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2.5 font-medium text-slate-800">{p.name}</td>
                        <td className="px-3 py-2.5 tabular-nums font-semibold">
                          <span className={p.quantity === 0 ? "text-red-600" : "text-amber-600"}>{p.quantity}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                            p.quantity === 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                          }`}>
                            {p.quantity === 0 ? "Out of Stock" : "Low Stock"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 tabular-nums">{fmtNum(p.cost_price * p.quantity)}</td>
                        <td className="px-3 py-2.5">
                          <Link
                            href={restockUrl}
                            className="inline-flex items-center gap-1 text-xs font-semibold bg-violet-50 hover:bg-violet-100 text-violet-600 px-2.5 py-1 rounded-lg transition"
                          >
                            <RefreshCw size={11} /> Restock
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div className="mt-6 flex items-center justify-between text-xs text-slate-400">
          <span>Data from: Items · Partners · Local Sales Records</span>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 hover:text-slate-600 transition"
          >
            <Download size={13} /> Print / Export
          </button>
        </div>

      </div>
    </div>
  );
}
