"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { itemRequest } from "@/lib/product-api";
import { partnerRequest } from "@/lib/supplier-api";
import { useDebounce } from "@/lib/hooks";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import Pagination from "@/app/components/ui/Pagination";
import {
  Package, AlertCircle, Search, Filter, Plus, Trash2, Pencil, X,
  Boxes, DollarSign, TrendingUp, TrendingDown, ShoppingBag, RefreshCw, BarChart3,
} from "lucide-react";

interface Product {
  id: string;
  name: string;
  description?: string;
  cost_price: number;
  selling_price: number;
  quantity: number;
  supplier_id?: string | null;
  profit_status?: "profit" | "loss";
  profit_money?: number;
}

interface Supplier { id: string; name: string; phone?: string; address?: string; }
type ModalMode = "create" | "edit";

const EMPTY_FORM = {
  name: "", description: "", cost_price: "", selling_price: "", quantity: "", supplier_id: "",
};

const PAGE_SIZES = [25, 50, 100, 250];

export default function ItemManagementPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  const debouncedSearch = useDebounce(search, 350);

  useEffect(() => { loadData(); }, []);

  async function loadData(soft = false) {
    try {
      if (!soft) setLoading(true); else setRefreshing(true);
      const [productsRes, suppliersRes] = await Promise.all([
        itemRequest("/products?limit=1000"),
        partnerRequest("/suppliers"),
      ]);
      setProducts(productsRes?.data?.items || []);
      const allPartners: Supplier[] = suppliersRes?.data?.items || suppliersRes?.data || [];
      setSuppliers(allPartners.filter((p) => p.address?.startsWith("TIN:")));
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function openCreateModal() {
    setForm(EMPTY_FORM); setEditingId(null); setModalMode("create"); setShowModal(true);
  }

  function openEditModal(p: Product) {
    setForm({
      name: p.name, description: p.description || "",
      cost_price: String(p.cost_price), selling_price: String(p.selling_price),
      quantity: String(p.quantity), supplier_id: p.supplier_id || "",
    });
    setEditingId(p.id); setModalMode("edit"); setShowModal(true);
  }

  function closeModal() { setShowModal(false); setForm(EMPTY_FORM); setEditingId(null); }

  async function submitForm() {
    if (!form.name.trim() || !form.cost_price || !form.selling_price || !form.quantity) {
      alert("Name, cost price, selling price and quantity are required."); return;
    }
    const payload = {
      name: form.name.trim(), description: form.description.trim() || null,
      cost_price: Number(form.cost_price), selling_price: Number(form.selling_price),
      quantity: Number(form.quantity), supplier_id: form.supplier_id || null,
    };
    try {
      setSubmitting(true);
      if (modalMode === "edit" && editingId) {
        await itemRequest(`/products/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await itemRequest("/products", { method: "POST", body: JSON.stringify(payload) });
      }
      closeModal(); await loadData(true);
    } catch (err) {
      console.error(err); alert(`Failed to ${modalMode === "edit" ? "update" : "add"} item.`);
    } finally { setSubmitting(false); }
  }

  async function deleteProduct(id: string) {
    if (!confirm("Delete this item? This cannot be undone.")) return;
    try {
      setDeletingId(id);
      await itemRequest(`/products/${id}`, { method: "DELETE" });
      await loadData(true);
    } catch (err) { console.error(err); alert("Failed to delete item."); }
    finally { setDeletingId(""); }
  }

  const supplierMap = useMemo(() => {
    const m: Record<string, Supplier> = {};
    suppliers.forEach((s) => { m[s.id] = s; });
    return m;
  }, [suppliers]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return products
      .filter((p) => p.name?.toLowerCase().includes(q) || p.id?.toLowerCase().includes(q))
      .filter((p) => {
        if (filter === "in_stock") return p.quantity > 10;
        if (filter === "low_stock") return p.quantity > 0 && p.quantity <= 10;
        if (filter === "out_stock") return p.quantity === 0;
        return true;
      });
  }, [products, debouncedSearch, filter]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);


  const stats = useMemo(() => {
    const inStock = products.filter((p) => p.quantity > 10).length;
    const lowStock = products.filter((p) => p.quantity > 0 && p.quantity <= 10).length;
    const outStock = products.filter((p) => p.quantity === 0).length;
    const stockValue = products.reduce((s, p) => s + (p.cost_price || 0) * (p.quantity || 0), 0);
    const potentialProfit = products.reduce((s, p) => {
      const m = (p.selling_price || 0) - (p.cost_price || 0);
      return s + (m > 0 ? m * (p.quantity || 0) : 0);
    }, 0);
    return { total: products.length, inStock, lowStock, outStock, stockValue, potentialProfit };
  }, [products]);

  const alertItems = products.filter((p) => p.quantity <= 10);

  const inputCls =
    "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition";

  if (loading) return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <div className="rounded-2xl bg-linear-to-r from-[#1372e6] to-[#0d5cc4] p-5 mb-6 animate-pulse">
          <div className="flex justify-between"><div className="h-4 w-40 bg-white/20 rounded-lg" /><div className="h-8 w-24 bg-white/20 rounded-lg" /></div>
          <div className="h-9 bg-white/10 rounded-lg mt-4" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {[...Array(6)].map((_, i) => <div key={i} className="bg-white rounded-xl border p-4 animate-pulse"><div className="h-2.5 w-14 bg-slate-200 rounded mb-3" /><div className="h-5 w-10 bg-slate-200 rounded" /></div>)}
        </div>
        <div className="bg-white rounded-xl border overflow-hidden">
          {[...Array(8)].map((_, i) => <div key={i} className="border-b grid grid-cols-6 px-4 py-3 gap-6 animate-pulse"><div className="h-2.5 bg-slate-100 rounded" /><div className="h-2.5 bg-slate-100 rounded" /><div className="h-2.5 bg-slate-100 rounded" /><div className="h-2.5 bg-slate-100 rounded" /><div className="h-5 w-12 bg-slate-100 rounded-full" /><div className="flex gap-1.5"><div className="h-7 w-7 bg-slate-100 rounded-lg" /><div className="h-7 w-7 bg-slate-100 rounded-lg" /></div></div>)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">

        {/* HEADER BANNER */}
        <div className="bg-linear-to-r from-[#1372e6] to-[#0d5cc4] text-white rounded-2xl p-5 mb-6">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <div className="flex items-center gap-2.5">
              <Package size={20} />
              <div>
                <h1 className="text-base font-semibold">Item Management</h1>
                <p className="text-blue-200 text-xs mt-0.5">
                  {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "—"} · {products.length.toLocaleString()} items total
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => loadData(true)} disabled={refreshing}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition disabled:opacity-50" title="Refresh">
                <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              </button>
              <button onClick={openCreateModal}
                className="bg-white text-[#1372e6] px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-semibold hover:bg-[#EBF2FD] transition">
                <Plus size={15} /> Add Item
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-col md:flex-row gap-2.5">
            <div className="flex-1 flex items-center bg-white/10 rounded-lg px-3 py-2 gap-2">
              <Search size={15} className="shrink-0 text-blue-200" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search items by name or ID..."
                className="bg-transparent outline-none w-full text-sm placeholder:text-blue-200" />
              {search && <button onClick={() => setSearch("")} className="text-blue-200 hover:text-white"><X size={13} /></button>}
            </div>
            <div className="flex items-center bg-white/10 rounded-lg px-3 py-2 gap-2">
              <Filter size={15} className="shrink-0 text-blue-200" />
              <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} className="bg-transparent outline-none text-sm">
                <option value="all" className="text-gray-700">All Items</option>
                <option value="in_stock" className="text-gray-700">In Stock (&gt;10)</option>
                <option value="low_stock" className="text-gray-700">Low Stock (1–10)</option>
                <option value="out_stock" className="text-gray-700">Out of Stock</option>
              </select>
            </div>
          </div>
        </div>

        {/* LOW STOCK ALERT */}
        {alertItems.length > 0 && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
            <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">{alertItems.length} item{alertItems.length > 1 ? "s" : ""} need restocking</p>
              <p className="text-xs text-amber-600 mt-0.5">{alertItems.slice(0, 4).map((i) => i.name).join(", ")}{alertItems.length > 4 ? ` +${alertItems.length - 4} more` : ""}</p>
            </div>
            <Link href="/PurchaseManagement" className="text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg shrink-0 transition">
              Go to Purchases
            </Link>
          </div>
        )}

        {/* STAT CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {[
            { label: "Total Items",  value: stats.total,                            color: "text-[#1372e6]",    bg: "bg-[#EBF2FD]",    icon: <Boxes size={17} /> },
            { label: "In Stock",     value: stats.inStock,                          color: "text-green-600",   bg: "bg-green-50",   icon: <Package size={17} /> },
            { label: "Low Stock",    value: stats.lowStock,                         color: "text-amber-500",   bg: "bg-amber-50",   icon: <AlertCircle size={17} /> },
            { label: "Out of Stock", value: stats.outStock,                         color: "text-red-600",     bg: "bg-red-50",     icon: <ShoppingBag size={17} /> },
            { label: "Stock Value",  value: stats.stockValue.toLocaleString(),      color: "text-indigo-600",  bg: "bg-indigo-50",  icon: <DollarSign size={17} /> },
            { label: "Pot. Profit",  value: stats.potentialProfit.toLocaleString(), color: "text-emerald-600", bg: "bg-emerald-50", icon: <BarChart3 size={17} /> },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap justify-between items-start gap-2">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide leading-none">{card.label}</p>
                  <p className={`text-xl font-bold mt-1.5 ${card.color}`}>{card.value}</p>
                </div>
                <div className={`${card.bg} ${card.color} p-1.5 rounded-lg`}>{card.icon}</div>
              </div>
            </div>
          ))}
        </div>

        {/* TABLE */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          {(debouncedSearch || filter !== "all") && (
            <div className="px-4 py-2.5 border-b border-slate-100 text-xs text-slate-500 bg-slate-50">
              <span className="font-semibold text-slate-700">{filtered.length.toLocaleString()}</span> results
              {debouncedSearch && <> for &ldquo;<span className="font-medium">{debouncedSearch}</span>&rdquo;</>}
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Product", "Supplier", "Cost", "Selling", "Margin %", "Qty", "Status", "Unit Profit", "Total Profit", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.map((p) => {
                const supplier = supplierMap[p.supplier_id ?? ""];
                const totalProfit = Number(p.profit_money || 0) * Number(p.quantity || 0);
                const isProfit = p.profit_status === "profit";
                const margin = p.cost_price > 0 ? ((p.selling_price - p.cost_price) / p.cost_price) * 100 : 0;
                const needsRestock = p.quantity <= 10;
                const restockUrl = `/PurchaseManagement?name=${encodeURIComponent(p.name)}&cost=${p.cost_price}&selling=${p.selling_price}&supplierId=${p.supplier_id || ""}`;
                return (
                  <tr key={p.id} className={`hover:bg-slate-50/60 transition-colors ${needsRestock ? "bg-amber-50/30" : ""}`}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{p.id?.slice(0, 8)}</p>
                    </td>
                    <td className="px-4 py-3">
                      {supplier ? <div><p className="font-medium text-slate-700">{supplier.name}</p>{supplier.phone && <p className="text-xs text-slate-400">{supplier.phone}</p>}</div>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium tabular-nums">{Number(p.cost_price || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 font-semibold text-green-600 tabular-nums">{Number(p.selling_price || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold ${margin >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {margin >= 0 ? "+" : ""}{margin.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        p.quantity === 0 ? "bg-red-100 text-red-700" : p.quantity <= 10 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                        {p.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${isProfit ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                        {isProfit ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {isProfit ? "Profit" : "Loss"}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-semibold tabular-nums ${isProfit ? "text-green-600" : "text-red-500"}`}>
                      {isProfit ? "+" : ""}{Number(p.profit_money || 0).toLocaleString()}
                    </td>
                    <td className={`px-4 py-3 font-semibold tabular-nums ${isProfit ? "text-green-600" : "text-red-500"}`}>
                      {isProfit ? "+" : ""}{totalProfit.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {needsRestock && (
                          <Link href={restockUrl} title="Restock" className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 transition">
                            <RefreshCw size={14} />
                          </Link>
                        )}
                        <button onClick={() => openEditModal(p)} title="Edit" className="p-1.5 rounded-lg bg-[#EBF2FD] hover:bg-[#D5E8FB] text-[#1372e6] transition"><Pencil size={14} /></button>
                        <button onClick={() => deleteProduct(p.id)} disabled={deletingId === p.id} title="Delete" className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition disabled:opacity-40"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {paginated.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <div className="p-4 bg-slate-100 rounded-2xl mb-3"><Package size={32} className="opacity-40" /></div>
              <p className="font-medium text-slate-500 text-sm">No items found</p>
              <p className="text-xs mt-1 text-slate-400">{search || filter !== "all" ? "Try adjusting filters or search." : "Add your first item to get started."}</p>
              {!search && filter === "all" && (
                <button onClick={openCreateModal} className="mt-4 flex items-center gap-1.5 bg-[#1372e6] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#1372e6] transition">
                  <Plus size={14} /> Add Item
                </button>
              )}
            </div>
          )}

          <Pagination page={page} totalPages={totalPages} total={filtered.length}
            pageSize={pageSize} pageSizes={PAGE_SIZES} onPage={setPage} onPageSize={setPageSize} />
        </div>

        {/* MODAL */}
        {showModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-center px-4 sm:px-6 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{modalMode === "edit" ? "Edit Item" : "Add New Item"}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{modalMode === "edit" ? "Update item details" : "Register a new item in inventory"}</p>
                </div>
                <button onClick={closeModal} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={17} /></button>
              </div>
              <div className="px-4 sm:px-6 py-4 sm:py-5 grid md:grid-cols-2 gap-4 overflow-y-auto flex-1">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Item Name <span className="text-red-400">*</span></label>
                  <input className={inputCls} placeholder="e.g. Sugar 1kg" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                  <input className={inputCls} placeholder="Optional description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cost Price <span className="text-red-400">*</span></label>
                  <input type="number" min="0" className={inputCls} placeholder="0" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Selling Price <span className="text-red-400">*</span></label>
                  <input type="number" min="0" className={inputCls} placeholder="0" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} />
                </div>
                {form.cost_price && form.selling_price && (
                  <div className="md:col-span-2 bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500">
                    Margin: <span className={`font-bold ${Number(form.selling_price) >= Number(form.cost_price) ? "text-green-600" : "text-red-500"}`}>
                      {Number(form.cost_price) > 0 ? (((Number(form.selling_price) - Number(form.cost_price)) / Number(form.cost_price)) * 100).toFixed(1) : 0}%
                    </span>{" · "}Unit profit: <span className="font-bold text-slate-700">{(Number(form.selling_price) - Number(form.cost_price)).toLocaleString()}</span>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Quantity <span className="text-red-400">*</span></label>
                  <input type="number" min="0" className={inputCls} placeholder="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Supplier</label>
                  <select className={inputCls} value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                    <option value="">No supplier</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2.5 px-4 sm:px-6 py-4 border-t border-slate-100 shrink-0">
                <button onClick={closeModal} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">Cancel</button>
                <button onClick={submitForm} disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-[#1372e6] text-white text-sm font-semibold hover:bg-[#1372e6] transition disabled:opacity-60">
                  {submitting ? (modalMode === "edit" ? "Saving..." : "Adding...") : (modalMode === "edit" ? "Save Changes" : "Add Item")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
