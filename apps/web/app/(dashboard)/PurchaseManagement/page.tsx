"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { itemRequest } from "@/lib/product-api";
import { partnerRequest } from "@/lib/supplier-api";
import { purchaseRequest } from "@/lib/purchase-api";
import { useDebounce } from "@/lib/hooks";
import { useLanguage } from "@/lib/language-context";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import Pagination from "@/app/components/ui/Pagination";
import DateRangeFilter from "@/app/components/ui/DateRangeFilter";
import {
  ShoppingCart, AlertCircle, Search, Filter, Plus, Trash2, X,
  Truck, DollarSign, TrendingUp, Package, Users, RefreshCw,
  History, LayoutGrid, Calendar,
} from "lucide-react";

interface Product {
  id: string; name: string; description?: string;
  cost_price: number; selling_price: number; quantity: number; supplier_id?: string | null;
}
interface PurchaseRecord {
  id: string; product_id?: string; product_name: string;
  supplier_id?: string; quantity_added: number;
  cost_price: number; selling_price?: number; total_cost: number;
  notes?: string; created_at?: string;
}
interface Supplier { id: string; name: string; phone?: string; address?: string; }
type Tab = "inventory" | "history";

const EMPTY_FORM = { product_id: "", product_name: "", description: "", cost_price: "", selling_price: "", quantity: "", supplier_id: "" };
const PAGE_SIZES = [25, 50, 100, 250];

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PurchaseManagementPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>("inventory");

  const [products, setProducts] = useState<Product[]>([]);
  const [productsTotal, setProductsTotal] = useState(0);
  const [invSearch, setInvSearch] = useState("");
  const [invFilter, setInvFilter] = useState("all");
  const [invPage, setInvPage] = useState(1);
  const [invPageSize, setInvPageSize] = useState(25);

  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [purchasesTotal, setPurchasesTotal] = useState(0);
  const [histPage, setHistPage] = useState(1);
  const [histPageSize, setHistPageSize] = useState(25);
  const [dateFrom, setDateFrom] = useState(() => toDateStr(new Date()));
  const [dateTo, setDateTo] = useState(() => toDateStr(new Date()));

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [isRestocking, setIsRestocking] = useState(false);

  const debouncedInvSearch = useDebounce(invSearch, 350);

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loading) loadHistory(true); }, [dateFrom, dateTo, histPage, histPageSize]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const name = params.get("name");
    if (name) {
      const product = products.find((p) => p.name === decodeURIComponent(name));
      setForm({
        product_id: product?.id || "", product_name: decodeURIComponent(name), description: "",
        cost_price: params.get("cost") || "", selling_price: params.get("selling") || "",
        quantity: "", supplier_id: params.get("supplierId") || "",
      });
      setIsRestocking(!!product?.id); setShowModal(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [products]);

  async function loadAll(soft = false) {
    try {
      if (!soft) setLoading(true); else setRefreshing(true);
      await Promise.all([loadInventory(soft), loadHistory(soft), loadSuppliers()]);
      setLastUpdated(new Date());
    } finally { setLoading(false); setRefreshing(false); }
  }

  async function loadInventory(soft = false) {
    try {
      const res = await itemRequest("/products?limit=500");
      setProducts(res?.data?.items || []);
      setProductsTotal(res?.data?.total || res?.data?.items?.length || 0);
    } catch (err) { if (!soft) console.error(err); }
  }

  async function loadHistory(soft = false) {
    try {
      const params = new URLSearchParams({
        page: String(histPage), limit: String(histPageSize),
        ...(dateFrom && { from_date: dateFrom }),
        ...(dateTo && { to_date: dateTo }),
      });
      const res = await purchaseRequest(`/purchases?${params}`);
      setPurchases(res?.data?.items || []);
      setPurchasesTotal(res?.data?.total || 0);
    } catch (err) { if (!soft) console.error(err); }
  }

  async function loadSuppliers() {
    try {
      const res = await partnerRequest("/suppliers");
      const all: Supplier[] = res?.data?.items || res?.data || [];
      setSuppliers(all.filter((s) => s.address?.startsWith("TIN:")));
    } catch { /* ignore */ }
  }

  function openCreateModal() { setForm(EMPTY_FORM); setIsRestocking(false); setShowModal(true); }

  function handleSelectExisting(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    const item = products.find((p) => p.id === id);
    if (item) {
      setIsRestocking(true);
      setForm((f) => ({ ...f, product_id: item.id, product_name: item.name, description: item.description || "", cost_price: String(item.cost_price), selling_price: String(item.selling_price), supplier_id: item.supplier_id || "" }));
    } else {
      setIsRestocking(false);
      setForm((f) => ({ ...f, product_id: "" }));
    }
  }

  async function submitForm() {
    const qty = Number(form.quantity);
    const cost = Number(form.cost_price);
    if ((!isRestocking && !form.product_name.trim()) || !form.quantity || !form.cost_price) {
      alert(t("purchases.product_name") + ", " + t("purchases.qty_added") + " & " + t("purchases.cost_price") + " required."); return;
    }
    if (qty <= 0 || cost <= 0) { alert("Qty and cost must be > 0."); return; }

    const payload: Record<string, unknown> = {
      cost_price: cost, selling_price: form.selling_price ? Number(form.selling_price) : undefined,
      quantity_added: qty, supplier_id: form.supplier_id || undefined, notes: undefined,
    };
    if (isRestocking && form.product_id) payload.product_id = form.product_id;
    else { payload.product_name = form.product_name.trim(); payload.description = form.description.trim() || undefined; }

    try {
      setSubmitting(true);
      await purchaseRequest("/purchases", { method: "POST", body: JSON.stringify(payload) });
      setShowModal(false); setForm(EMPTY_FORM); setIsRestocking(false);
      await loadAll(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error");
    } finally { setSubmitting(false); }
  }

  async function deleteHistoryRecord(id: string) {
    if (!confirm(t("common.confirm_delete"))) return;
    try {
      setDeletingId(id);
      await purchaseRequest(`/purchases/${id}`, { method: "DELETE" });
      await loadHistory(true);
    } catch { alert("Delete failed."); }
    finally { setDeletingId(""); }
  }

  const supplierMap = useMemo(() => {
    const m: Record<string, Supplier> = {};
    suppliers.forEach((s) => { m[s.id] = s; });
    return m;
  }, [suppliers]);

  const filteredProducts = useMemo(() => {
    const q = debouncedInvSearch.toLowerCase();
    return products
      .filter((p) => p.name?.toLowerCase().includes(q) || supplierMap[p.supplier_id ?? ""]?.name?.toLowerCase().includes(q))
      .filter((p) => {
        if (invFilter === "in_stock") return p.quantity > 10;
        if (invFilter === "low_stock") return p.quantity > 0 && p.quantity <= 10;
        if (invFilter === "out_stock") return p.quantity === 0;
        return true;
      });
  }, [products, debouncedInvSearch, invFilter, supplierMap]);

  const invTotalPages = Math.ceil(filteredProducts.length / invPageSize);
  const paginatedProducts = filteredProducts.slice((invPage - 1) * invPageSize, invPage * invPageSize);
  const histTotalPages = Math.ceil(purchasesTotal / histPageSize);

  const invStats = useMemo(() => {
    const totalSpent  = purchases.reduce((s, p) => s + p.total_cost, 0);
    // Accounting: inventory at cost = what was paid (GAAP book value)
    const costValue   = products.reduce((s, p) => s + (p.cost_price  || 0) * (p.quantity || 0), 0);
    // Accounting: inventory at retail = expected revenue if all stock is sold
    const retailValue = products.reduce((s, p) => s + (p.selling_price || 0) * (p.quantity || 0), 0);
    // Accounting: gross profit on stock = unrealized margin locked in inventory
    const grossProfit = retailValue - costValue;
    const lowStock    = products.filter((p) => p.quantity > 0 && p.quantity <= 10).length;
    const outStock    = products.filter((p) => p.quantity === 0).length;
    return { costValue, retailValue, grossProfit, lowStock, outStock, totalSpent };
  }, [products, purchases]);

  const selectedProduct = isRestocking ? products.find((p) => p.id === form.product_id) : null;
  const hasDateFilter = dateFrom || dateTo;
  const margin = form.cost_price && form.selling_price && Number(form.cost_price) > 0
    ? (((Number(form.selling_price) - Number(form.cost_price)) / Number(form.cost_price)) * 100).toFixed(1) : null;

  const inputCls = "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition";

  if (loading) return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="rounded-2xl bg-linear-to-r from-violet-600 to-purple-600 p-5 mb-6 animate-pulse">
          <div className="flex justify-between"><div className="h-4 w-44 bg-white/20 rounded-lg" /><div className="h-8 w-28 bg-white/20 rounded-lg" /></div>
          <div className="h-9 bg-white/10 rounded-lg mt-4" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
          {[...Array(6)].map((_, i) => <div key={i} className="bg-white rounded-xl border p-4 animate-pulse"><div className="h-2.5 w-16 bg-slate-200 rounded mb-3" /><div className="h-5 w-10 bg-slate-200 rounded" /></div>)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* HEADER */}
        <div className="bg-linear-to-r from-violet-600 to-purple-600 text-white rounded-2xl p-5 mb-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              <ShoppingCart size={20} />
              <div>
                <h1 className="text-base font-semibold">{t("purchases.title")}</h1>
                <p className="text-violet-200 text-xs mt-0.5">
                  {lastUpdated ? `${t("common.updated")} ${lastUpdated.toLocaleTimeString()}` : "—"} · {t("purchases.inventory")}: {productsTotal.toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => loadAll(true)} disabled={refreshing}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition disabled:opacity-50">
                <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              </button>
              <button onClick={openCreateModal}
                className="bg-white text-violet-700 px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-semibold hover:bg-violet-50 transition">
                <Plus size={15} /> {t("purchases.add")}
              </button>
            </div>
          </div>

          {/* TABS */}
          <div className="mt-4 flex gap-2">
            <button onClick={() => setTab("inventory")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${tab === "inventory" ? "bg-white text-violet-700" : "bg-white/10 text-white hover:bg-white/20"}`}>
              <LayoutGrid size={14} /> {t("purchases.inventory")}
            </button>
            <button onClick={() => setTab("history")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${tab === "history" ? "bg-white text-violet-700" : "bg-white/10 text-white hover:bg-white/20"}`}>
              <History size={14} /> {t("purchases.history")} ({purchasesTotal.toLocaleString()})
            </button>
          </div>

          {tab === "history" && (
            <DateRangeFilter
              from={dateFrom} to={dateTo}
              onFrom={(v) => { setDateFrom(v); setHistPage(1); }}
              onTo={(v) => { setDateTo(v); setHistPage(1); }}
              onClear={() => { setDateFrom(""); setDateTo(""); setHistPage(1); }}
              accentClass="focus:ring-violet-300/40 focus:border-violet-300"
            />
          )}

          {tab === "inventory" && (
            <div className="mt-3 flex flex-col md:flex-row gap-2.5">
              <div className="flex-1 flex items-center bg-white/10 rounded-lg px-3 py-2 gap-2">
                <Search size={15} className="shrink-0 text-violet-200" />
                <input value={invSearch} onChange={(e) => { setInvSearch(e.target.value); setInvPage(1); }}
                  placeholder={t("items.search")}
                  className="bg-transparent outline-none w-full text-sm placeholder:text-violet-200" />
                {invSearch && <button onClick={() => setInvSearch("")} className="text-violet-200 hover:text-white"><X size={13} /></button>}
              </div>
              <div className="flex items-center bg-white/10 rounded-lg px-3 py-2 gap-2">
                <Filter size={15} className="shrink-0 text-violet-200" />
                <select value={invFilter} onChange={(e) => { setInvFilter(e.target.value); setInvPage(1); }} className="bg-transparent outline-none text-sm">
                  <option value="all" className="text-gray-700">{t("items.all")}</option>
                  <option value="in_stock" className="text-gray-700">{t("items.in_stock")}</option>
                  <option value="low_stock" className="text-gray-700">{t("items.low_stock")}</option>
                  <option value="out_stock" className="text-gray-700">{t("items.out_stock")}</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* STOCK ALERT */}
        {(invStats.lowStock > 0 || invStats.outStock > 0) && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
            <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">
                {invStats.outStock > 0 && `${invStats.outStock} ${t("items.out_stock")}`}
                {invStats.outStock > 0 && invStats.lowStock > 0 && " · "}
                {invStats.lowStock > 0 && `${invStats.lowStock} ${t("items.low_stock")}`}
              </p>
            </div>
            <Link href="/PartnerManagement" className="text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg shrink-0 transition">
              <span className="flex items-center gap-1"><Users size={12} /> {t("partners.suppliers")}</span>
            </Link>
          </div>
        )}

        {/* STAT CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
          {[
            { label: "Total Products",        value: productsTotal,                        sub: "items in your shop",              color: "text-violet-600", bg: "bg-violet-50",  icon: <Package size={17} /> },
            { label: "What You Paid",         value: invStats.costValue.toLocaleString(),   sub: "total cost of all stock",         color: "text-indigo-600", bg: "bg-indigo-50",  icon: <DollarSign size={17} /> },
            { label: "If You Sell All",       value: invStats.retailValue.toLocaleString(), sub: "money you'd earn selling everything", color: "text-blue-600",   bg: "bg-blue-50",    icon: <TrendingUp size={17} /> },
            { label: "Profit to Make",        value: invStats.grossProfit.toLocaleString(), sub: "extra money once all stock is sold",   color: "text-green-600",  bg: "bg-green-50",   icon: <TrendingUp size={17} /> },
            { label: "Almost Finished",       value: invStats.lowStock,                    sub: "10 units or less — restock soon",  color: "text-amber-500",  bg: "bg-amber-50",   icon: <AlertCircle size={17} /> },
            { label: "Finished / Empty",      value: invStats.outStock,                    sub: "zero units — buy more now",        color: "text-red-600",    bg: "bg-red-50",     icon: <AlertCircle size={17} /> },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide leading-none">{card.label}</p>
                  <p className={`text-xl font-bold mt-1.5 ${card.color}`}>{card.value}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{card.sub}</p>
                </div>
                <div className={`${card.bg} ${card.color} p-1.5 rounded-lg shrink-0`}>{card.icon}</div>
              </div>
            </div>
          ))}
        </div>

        {/* INVENTORY TABLE */}
        {tab === "inventory" && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {[t("items.col_product"), t("items.col_supplier"), t("items.cost_price"), t("items.selling_price"), t("items.col_margin"), t("items.col_qty"), t("common.status"), ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedProducts.map((p) => {
                  const supplier = supplierMap[p.supplier_id ?? ""];
                  const margin2 = p.cost_price > 0 ? ((p.selling_price - p.cost_price) / p.cost_price) * 100 : 0;
                  const needsRestock = p.quantity <= 10;
                  return (
                    <tr key={p.id} className={`hover:bg-slate-50/60 transition-colors ${p.quantity === 0 ? "bg-red-50/20" : needsRestock ? "bg-amber-50/20" : ""}`}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{p.name}</p>
                        <p className="text-xs text-slate-400 font-mono">{p.id?.slice(0, 8)}</p>
                      </td>
                      <td className="px-4 py-3">
                        {supplier
                          ? <div><p className="font-medium text-slate-700">{supplier.name}</p>{supplier.phone && <p className="text-xs text-slate-400">{supplier.phone}</p>}</div>
                          : <Link href="/PartnerManagement" className="text-xs text-violet-400 hover:underline flex items-center gap-0.5"><Truck size={11} /> {t("common.add")}</Link>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-medium tabular-nums">{Number(p.cost_price).toLocaleString()}</td>
                      <td className="px-4 py-3 font-semibold text-green-600 tabular-nums">{Number(p.selling_price).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold ${margin2 >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {margin2 >= 0 ? "+" : ""}{margin2.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${p.quantity === 0 ? "bg-red-100 text-red-700" : p.quantity <= 10 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                          {p.quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${p.quantity === 0 ? "bg-red-100 text-red-700" : p.quantity <= 10 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                          {p.quantity === 0 ? t("items.out_stock") : p.quantity <= 10 ? t("items.low_stock") : t("items.in_stock")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { setForm({ product_id: p.id, product_name: p.name, description: p.description || "", cost_price: String(p.cost_price), selling_price: String(p.selling_price), quantity: "", supplier_id: p.supplier_id || "" }); setIsRestocking(true); setShowModal(true); }}
                          className="px-2.5 py-1 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-600 text-xs font-medium transition">
                          + {t("purchases.restock")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {paginatedProducts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <div className="p-4 bg-slate-100 rounded-2xl mb-3"><Package size={32} className="opacity-40" /></div>
                <p className="font-medium text-slate-500 text-sm">{t("items.no_items")}</p>
                {!invSearch && invFilter === "all" && (
                  <button onClick={openCreateModal} className="mt-4 flex items-center gap-1.5 bg-violet-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-violet-700 transition">
                    <Plus size={14} /> {t("purchases.add")}
                  </button>
                )}
              </div>
            )}
            <Pagination page={invPage} totalPages={invTotalPages} total={filteredProducts.length}
              pageSize={invPageSize} pageSizes={PAGE_SIZES} onPage={setInvPage} onPageSize={setInvPageSize} />
          </div>
        )}

        {/* HISTORY TABLE */}
        {tab === "history" && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            {hasDateFilter && (
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 text-xs text-violet-700 bg-violet-50">
                <Calendar size={13} />
                <span>
                  {dateFrom && <> {t("common.date")}: <span className="font-semibold">{dateFrom}</span></>}
                  {dateTo && <> → <span className="font-semibold">{dateTo}</span></>}
                  {" "}· <span className="font-semibold">{purchasesTotal.toLocaleString()}</span>
                </span>
                <button onClick={() => { setDateFrom(""); setDateTo(""); setHistPage(1); }} className="ml-auto text-violet-500 hover:text-violet-700"><X size={13} /></button>
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {[t("purchases.col_date"), t("purchases.col_product"), t("purchases.col_supplier"), t("purchases.col_qty"), t("purchases.col_unit"), t("purchases.col_total"), ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchases.map((p) => {
                  const supplier = supplierMap[p.supplier_id ?? ""];
                  const d = p.created_at ? new Date(p.created_at) : null;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {d ? (
                          <div>
                            <p className="text-xs font-medium text-slate-700">{toDateStr(d)}</p>
                            <p className="text-xs text-slate-400">{d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{p.product_name}</p>
                        {p.product_id && <p className="text-xs text-slate-400 font-mono">{p.product_id.slice(0, 8)}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {supplier
                          ? <div><p className="font-medium text-slate-700">{supplier.name}</p>{supplier.phone && <p className="text-xs text-slate-400">{supplier.phone}</p>}</div>
                          : <span className="text-slate-300 text-xs italic">—</span>}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700 tabular-nums">{p.quantity_added}</td>
                      <td className="px-4 py-3 text-slate-600 tabular-nums">{p.cost_price.toLocaleString()}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800 tabular-nums">{p.total_cost.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => deleteHistoryRecord(p.id)} disabled={deletingId === p.id}
                          className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition disabled:opacity-40">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {purchases.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <div className="p-4 bg-slate-100 rounded-2xl mb-3"><History size={32} className="opacity-40" /></div>
                <p className="font-medium text-slate-500 text-sm">{t("purchases.no_history")}</p>
              </div>
            )}
            <Pagination page={histPage} totalPages={histTotalPages} total={purchasesTotal}
              pageSize={histPageSize} pageSizes={PAGE_SIZES} onPage={setHistPage} onPageSize={setHistPageSize} />
          </div>
        )}

        {/* MODAL */}
        {showModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl">
              <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">
                    {isRestocking ? t("purchases.restock_title") : t("purchases.new_title")}
                  </h2>
                </div>
                <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setIsRestocking(false); }}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={17} /></button>
              </div>
              <div className="px-6 py-5 grid md:grid-cols-2 gap-4">
                {!isRestocking && products.length > 0 && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("purchases.select_existing")}</label>
                    <select className={inputCls} defaultValue="" onChange={handleSelectExisting}>
                      <option value="">— {t("common.search")} —</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({t("items.col_qty")}: {p.quantity})</option>)}
                    </select>
                  </div>
                )}
                {isRestocking && selectedProduct && (
                  <div className="md:col-span-2 bg-violet-50 rounded-lg px-3 py-2 text-xs text-violet-700">
                    {t("purchases.restock")}: <span className="font-semibold">{selectedProduct.name}</span>
                    {" "}· {t("items.col_qty")}: <span className="font-bold">{selectedProduct.quantity}</span>
                  </div>
                )}
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t("purchases.product_name")} {!isRestocking && <span className="text-red-400">*</span>}
                  </label>
                  <input className={inputCls} placeholder="e.g. Sugar 1kg"
                    value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                    disabled={isRestocking} />
                </div>
                {!isRestocking && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("items.description")}</label>
                    <input className={inputCls} placeholder="Optional"
                      value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("purchases.cost_price")} <span className="text-red-400">*</span></label>
                  <input type="number" min="0" className={inputCls} placeholder="0"
                    value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("purchases.selling_price")}</label>
                  <input type="number" min="0" className={inputCls} placeholder="0"
                    value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} />
                </div>
                {margin !== null && (
                  <div className="md:col-span-2 bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500">
                    Margin: <span className={`font-bold ${Number(margin) >= 0 ? "text-green-600" : "text-red-500"}`}>{Number(margin) >= 0 ? "+" : ""}{margin}%</span>
                    {" · "}Unit profit: <span className="font-bold text-slate-700">{(Number(form.selling_price) - Number(form.cost_price)).toLocaleString()}</span>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {isRestocking ? t("purchases.qty_added") : t("items.quantity")} <span className="text-red-400">*</span>
                  </label>
                  <input type="number" min="1" className={inputCls} placeholder="0"
                    value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                  {isRestocking && selectedProduct && form.quantity && (
                    <p className="text-xs mt-1 text-violet-600">
                      {selectedProduct.quantity} + {form.quantity} = <span className="font-bold">{selectedProduct.quantity + Number(form.quantity)}</span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("items.supplier")}</label>
                  <select className={inputCls} value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                    <option value="">{t("items.no_supplier")}</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {suppliers.length === 0 && (
                    <p className="text-xs text-violet-500 mt-1">
                      <Link href="/PartnerManagement" className="hover:underline">{t("common.add")} supplier →</Link>
                    </p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-slate-100">
                <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setIsRestocking(false); }}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">
                  {t("common.cancel")}
                </button>
                <button onClick={submitForm} disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition disabled:opacity-60">
                  {submitting ? t("common.saving") : isRestocking ? t("purchases.restock") : t("purchases.new_product")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
