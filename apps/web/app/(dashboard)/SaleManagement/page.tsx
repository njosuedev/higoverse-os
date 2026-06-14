"use client";

import { useEffect, useMemo, useState } from "react";
import { itemRequest } from "@/lib/product-api";
import { partnerRequest } from "@/lib/supplier-api";
import { useDebounce } from "@/lib/hooks";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import Pagination from "@/app/components/ui/Pagination";
import DateRangeFilter from "@/app/components/ui/DateRangeFilter";
import {
  ShoppingBag, Search, Filter, Plus, Trash2, Pencil, X,
  TrendingUp, DollarSign, Users, ReceiptText, Package, RefreshCw, Calendar,
} from "lucide-react";

const SALES_KEY = "higoverse_sales";

function loadSalesFromStorage(): Sale[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(SALES_KEY) || "[]"); } catch { return []; }
}

function saveSalesToStorage(sales: Sale[]) {
  localStorage.setItem(SALES_KEY, JSON.stringify(sales));
}

interface Sale {
  id: string;
  product_id: string;
  customer_id?: string;
  quantity: number;
  unit_price: number;
  total?: number;
  profit?: number;
  notes?: string;
  created_at?: string;
}

interface Product { id: string; name: string; selling_price: number; cost_price: number; quantity: number; }
interface Partner { id: string; name: string; phone?: string; address?: string; }
type ModalMode = "create" | "edit";

const EMPTY_FORM = { product_id: "", customer_id: "", quantity: "", unit_price: "", notes: "" };
const PAGE_SIZES = [25, 50, 100, 250];

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function SaleManagementPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState(() => toDateStr(new Date()));
  const [dateTo, setDateTo] = useState(() => toDateStr(new Date()));
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
      const [productsRes, partnersRes] = await Promise.all([
        itemRequest("/products"),
        partnerRequest("/suppliers"),
      ]);
      setSales(loadSalesFromStorage());
      setProducts(productsRes?.data?.items || []);
      const allPartners: Partner[] = partnersRes?.data?.items || partnersRes?.data || [];
      setCustomers(allPartners.filter((p) => !p.address?.startsWith("TIN:")));
      setLastUpdated(new Date());
    } catch (err) { console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  }

  function openCreateModal() { setForm(EMPTY_FORM); setEditingId(null); setModalMode("create"); setShowModal(true); }
  function openEditModal(s: Sale) {
    setForm({ product_id: s.product_id, customer_id: s.customer_id || "", quantity: String(s.quantity), unit_price: String(s.unit_price), notes: s.notes || "" });
    setEditingId(s.id); setModalMode("edit"); setShowModal(true);
  }
  function closeModal() { setShowModal(false); setForm(EMPTY_FORM); setEditingId(null); }

  function onProductChange(productId: string) {
    const product = products.find((p) => p.id === productId);
    setForm((f) => ({ ...f, product_id: productId, unit_price: product ? String(product.selling_price) : f.unit_price }));
  }

  async function adjustProductStock(productId: string, delta: number) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    await itemRequest(`/products/${product.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: product.name,
        cost_price: product.cost_price,
        selling_price: product.selling_price,
        quantity: Math.max(0, product.quantity + delta),
      }),
    });
  }

  async function submitForm() {
    if (!form.product_id || !form.quantity || !form.unit_price) {
      alert("Item, quantity and unit price are required."); return;
    }
    const newQty = Number(form.quantity);
    const selectedProduct = products.find((p) => p.id === form.product_id);
    if (selectedProduct && newQty > selectedProduct.quantity) {
      alert(`Only ${selectedProduct.quantity} units in stock.`); return;
    }
    const payload: Omit<Sale, "id"> = {
      product_id: form.product_id,
      customer_id: form.customer_id || undefined,
      quantity: newQty,
      unit_price: Number(form.unit_price),
      notes: form.notes.trim() || undefined,
    };
    try {
      setSubmitting(true);
      const all = loadSalesFromStorage();
      if (modalMode === "edit" && editingId) {
        const oldSale = all.find((s) => s.id === editingId);
        const oldQty = oldSale?.quantity || 0;
        saveSalesToStorage(all.map((s) => s.id === editingId ? { ...s, ...payload } : s));
        // Adjust stock by the difference: restore old qty, deduct new qty
        if (oldSale?.product_id === form.product_id) {
          await adjustProductStock(form.product_id, oldQty - newQty);
        } else {
          // Product changed — restore old product, deduct from new product
          if (oldSale) await adjustProductStock(oldSale.product_id, oldQty);
          await adjustProductStock(form.product_id, -newQty);
        }
      } else {
        saveSalesToStorage([...all, { ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() }]);
        await adjustProductStock(form.product_id, -newQty);
      }
      closeModal(); await loadData(true);
    } catch (err) {
      console.error(err); alert(`Failed to ${modalMode === "edit" ? "update" : "record"} sale.`);
    } finally { setSubmitting(false); }
  }

  async function deleteSale(id: string) {
    if (!confirm("Delete this sale record? This cannot be undone.")) return;
    try {
      setDeletingId(id);
      const all = loadSalesFromStorage();
      const saleToDelete = all.find((s) => s.id === id);
      saveSalesToStorage(all.filter((s) => s.id !== id));
      // Restore stock when a sale is deleted
      if (saleToDelete) {
        await adjustProductStock(saleToDelete.product_id, saleToDelete.quantity);
      }
      await loadData(true);
    } catch (err) { console.error(err); alert("Failed to delete sale."); }
    finally { setDeletingId(""); }
  }

  const productMap = useMemo(() => {
    const m: Record<string, Product> = {};
    products.forEach((p) => { m[p.id] = p; });
    return m;
  }, [products]);

  const customerMap = useMemo(() => {
    const m: Record<string, Partner> = {};
    customers.forEach((c) => { m[c.id] = c; });
    return m;
  }, [customers]);

  const enrichedSales = useMemo(() =>
    sales.map((s) => {
      const product = productMap[s.product_id];
      const total = s.total ?? s.quantity * s.unit_price;
      const profit = s.profit ?? (product ? (s.unit_price - product.cost_price) * s.quantity : 0);
      return { ...s, total, profit };
    }), [sales, productMap]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return [...enrichedSales]
      .sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      })
      .filter((s) => {
        const name = productMap[s.product_id]?.name?.toLowerCase() || "";
        const cust = customerMap[s.customer_id || ""]?.name?.toLowerCase() || "";
        return name.includes(q) || cust.includes(q) || (s.notes || "").toLowerCase().includes(q);
      })
      .filter((s) => {
        if (filter === "profit") return (s.profit || 0) > 0;
        if (filter === "loss") return (s.profit || 0) <= 0;
        return true;
      })
      .filter((s) => {
        if (!dateFrom && !dateTo) return true;
        if (!s.created_at) return !dateFrom; // no date: only include if no from-filter
        const d = new Date(s.created_at);
        if (dateFrom && d < new Date(dateFrom + "T00:00:00")) return false;
        if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
        return true;
      });
  }, [enrichedSales, debouncedSearch, filter, dateFrom, dateTo, productMap, customerMap]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);


  const stats = useMemo(() => {
    // Stats always reflect the date-filtered set so numbers match what you're looking at
    const revenue = filtered.reduce((s, x) => s + x.total, 0);
    const profit = filtered.reduce((s, x) => s + x.profit, 0);
    const itemsSold = filtered.reduce((s, x) => s + x.quantity, 0);
    const uniqueCustomers = new Set(filtered.map((x) => x.customer_id).filter(Boolean)).size;
    return { total: filtered.length, revenue, profit, itemsSold, uniqueCustomers };
  }, [filtered]);

  const selectedProduct = products.find((p) => p.id === form.product_id);
  const hasDateFilter = dateFrom || dateTo;

  const inputCls =
    "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition";

  if (loading) return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="rounded-2xl bg-linear-to-r from-orange-500 to-amber-500 p-5 mb-6 animate-pulse">
          <div className="flex justify-between"><div className="h-4 w-40 bg-white/20 rounded-lg" /><div className="h-8 w-28 bg-white/20 rounded-lg" /></div>
          <div className="h-9 bg-white/10 rounded-lg mt-4" />
          <div className="h-8 bg-white/10 rounded-lg mt-3" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[...Array(5)].map((_, i) => <div key={i} className="bg-white rounded-xl border p-4 animate-pulse"><div className="h-2.5 w-16 bg-slate-200 rounded mb-3" /><div className="h-5 w-10 bg-slate-200 rounded" /></div>)}
        </div>
        <div className="bg-white rounded-xl border overflow-hidden">
          {[...Array(6)].map((_, i) => <div key={i} className="border-b grid grid-cols-6 px-4 py-3 gap-6 animate-pulse"><div className="h-2.5 bg-slate-100 rounded" /><div className="h-2.5 bg-slate-100 rounded" /><div className="h-2.5 bg-slate-100 rounded" /><div className="h-2.5 bg-slate-100 rounded" /><div className="h-5 w-14 bg-slate-100 rounded-full" /><div className="flex gap-1.5"><div className="h-7 w-7 bg-slate-100 rounded-lg" /><div className="h-7 w-7 bg-slate-100 rounded-lg" /></div></div>)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* HEADER BANNER */}
        <div className="bg-linear-to-r from-orange-500 to-amber-500 text-white rounded-2xl p-5 mb-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              <ShoppingBag size={20} />
              <div>
                <h1 className="text-base font-semibold">Sales — Ibicuruzwa</h1>
                <p className="text-orange-100 text-xs mt-0.5">
                  {lastUpdated ? `Ivuguruwemo saa ${lastUpdated.toLocaleTimeString()}` : "—"} · Ibicuruzwa byose: {sales.length.toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => loadData(true)} disabled={refreshing}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition disabled:opacity-50">
                <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              </button>
              <button onClick={openCreateModal}
                className="bg-white text-orange-600 px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-semibold hover:bg-orange-50 transition">
                <Plus size={15} /> Injira Kugurisha
              </button>
            </div>
          </div>

          {/* SEARCH + STATUS FILTER */}
          <div className="mt-4 flex flex-col md:flex-row gap-2.5">
            <div className="flex-1 flex items-center bg-white/10 rounded-lg px-3 py-2 gap-2">
              <Search size={15} className="shrink-0 text-orange-100" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Shakisha: izina ry'igicuruzwa, umukiriya..."
                className="bg-transparent outline-none w-full text-sm placeholder:text-orange-100" />
              {search && <button onClick={() => setSearch("")} className="text-orange-200 hover:text-white"><X size={13} /></button>}
            </div>
            <div className="flex items-center bg-white/10 rounded-lg px-3 py-2 gap-2">
              <Filter size={15} className="shrink-0 text-orange-100" />
              <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} className="bg-transparent outline-none text-sm">
                <option value="all" className="text-gray-700">Ibicuruzwa byose</option>
                <option value="profit" className="text-gray-700">Yabyaye inyungu</option>
                <option value="loss" className="text-gray-700">Yabyaye igihombo</option>
              </select>
            </div>
          </div>

          {/* DATE RANGE FILTER */}
          <DateRangeFilter
            from={dateFrom} to={dateTo}
            onFrom={(v) => { setDateFrom(v); setPage(1); }}
            onTo={(v) => { setDateTo(v); setPage(1); }}
            onClear={() => { setDateFrom(""); setDateTo(""); setPage(1); }}
            accentClass="focus:ring-orange-300/40 focus:border-orange-300"
          />
        </div>

        {/* ACTIVE DATE FILTER BADGE */}
        {hasDateFilter && (
          <div className="flex items-center gap-2 mb-4 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
            <Calendar size={13} />
            <span>
              Showing sales
              {dateFrom && <> from <span className="font-semibold">{dateFrom}</span></>}
              {dateTo && <> to <span className="font-semibold">{dateTo}</span></>}
              {" "}— <span className="font-semibold">{filtered.length.toLocaleString()}</span> records
            </span>
            <button onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }} className="ml-auto text-orange-500 hover:text-orange-700">
              <X size={13} />
            </button>
          </div>
        )}

        {/* STAT CARDS — reflect the active date filter */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Ibicuruzwa",   value: stats.total,                    color: "text-orange-600",  bg: "bg-orange-50",  icon: <ReceiptText size={17} /> },
            { label: "Amafaranga",   value: stats.revenue.toLocaleString(), color: "text-green-600",   bg: "bg-green-50",   icon: <DollarSign size={17} /> },
            { label: "Inyungu",      value: stats.profit.toLocaleString(),  color: "text-emerald-600", bg: "bg-emerald-50", icon: <TrendingUp size={17} /> },
            { label: "Ibintu bigurishijwe", value: stats.itemsSold,         color: "text-blue-600",    bg: "bg-blue-50",    icon: <Package size={17} /> },
            { label: "Abakiriya",    value: stats.uniqueCustomers,          color: "text-violet-600",  bg: "bg-violet-50",  icon: <Users size={17} /> },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide leading-none">{card.label}</p>
                  <p className={`text-xl font-bold mt-1.5 ${card.color}`}>{card.value}</p>
                  {hasDateFilter && <p className="text-xs text-slate-400 mt-0.5">muri iyi minsi</p>}
                </div>
                <div className={`${card.bg} ${card.color} p-1.5 rounded-lg shrink-0`}>{card.icon}</div>
              </div>
            </div>
          ))}
        </div>

        {/* TABLE */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          {(debouncedSearch || filter !== "all" || hasDateFilter) && (
            <div className="px-4 py-2.5 border-b border-slate-100 text-xs text-slate-500 bg-slate-50">
              <span className="font-semibold text-slate-700">{filtered.length.toLocaleString()}</span> results
              {debouncedSearch && <> for &ldquo;<span className="font-medium">{debouncedSearch}</span>&rdquo;</>}
              {hasDateFilter && <> · date filtered</>}
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Date", "Item", "Customer", "Qty", "Unit Price", "Total", "Profit", "Notes", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.map((s) => {
                const product = productMap[s.product_id];
                const customer = customerMap[s.customer_id || ""];
                const isProfit = (s.profit || 0) > 0;
                const saleDate = s.created_at ? new Date(s.created_at) : null;
                return (
                  <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {saleDate ? (
                        <div>
                          <p className="text-xs font-medium text-slate-700">{toDateStr(saleDate)}</p>
                          <p className="text-xs text-slate-400">{saleDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {product ? <div><p className="font-semibold text-slate-800">{product.name}</p><p className="text-xs text-slate-400 font-mono">{s.product_id.slice(0, 8)}</p></div>
                        : <span className="text-slate-400 text-xs font-mono">{s.product_id.slice(0, 8)}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {customer ? <div><p className="font-medium text-slate-700">{customer.name}</p>{customer.phone && <p className="text-xs text-slate-400">{customer.phone}</p>}</div>
                        : <span className="text-slate-300 text-xs">Walk-in</span>}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700 tabular-nums">{s.quantity}</td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums">{s.unit_price.toLocaleString()}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800 tabular-nums">{s.total.toLocaleString()}</td>
                    <td className={`px-4 py-3 font-semibold tabular-nums ${isProfit ? "text-green-600" : "text-red-500"}`}>
                      {isProfit ? "+" : ""}{s.profit.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-28 truncate">{s.notes || <span className="text-slate-200">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => openEditModal(s)} title="Edit" className="p-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-600 transition"><Pencil size={14} /></button>
                        <button onClick={() => deleteSale(s.id)} disabled={deletingId === s.id} title="Delete" className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition disabled:opacity-40"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {paginated.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <div className="p-4 bg-slate-100 rounded-2xl mb-3"><ShoppingBag size={32} className="opacity-40" /></div>
              <p className="font-medium text-slate-500 text-sm">No sales found</p>
              <p className="text-xs mt-1 text-slate-400">
                {search || filter !== "all" || hasDateFilter ? "Try adjusting filters or date range." : "Record your first sale to start tracking revenue."}
              </p>
              {!search && filter === "all" && !hasDateFilter && (
                <button onClick={openCreateModal} className="mt-4 flex items-center gap-1.5 bg-orange-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-orange-600 transition">
                  <Plus size={14} /> Record Sale
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
            <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl">
              <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{modalMode === "edit" ? "Edit Sale" : "Record New Sale"}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{modalMode === "edit" ? "Update sale details" : "Select the item sold and fill in the details"}</p>
                </div>
                <button onClick={closeModal} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={17} /></button>
              </div>
              <div className="px-6 py-5 grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Item Sold <span className="text-red-400">*</span></label>
                  <select className={inputCls} value={form.product_id} onChange={(e) => onProductChange(e.target.value)}>
                    <option value="">Select item...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id} disabled={p.quantity === 0}>
                        {p.name} — Stock: {p.quantity}
                      </option>
                    ))}
                  </select>
                  {selectedProduct && (
                    <div className="mt-1.5 flex gap-3 text-xs text-slate-500">
                      <span>Cost: <span className="font-medium text-slate-700">{selectedProduct.cost_price.toLocaleString()}</span></span>
                      <span>Selling: <span className="font-medium text-green-600">{selectedProduct.selling_price.toLocaleString()}</span></span>
                      <span>Stock: <span className={`font-medium ${selectedProduct.quantity <= 10 ? "text-amber-600" : "text-slate-700"}`}>{selectedProduct.quantity}</span></span>
                    </div>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Customer <span className="text-slate-400 font-normal">(optional)</span></label>
                  <select className={inputCls} value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
                    <option value="">Walk-in customer</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Quantity <span className="text-red-400">*</span></label>
                  <input type="number" min="1" max={selectedProduct?.quantity} className={inputCls} placeholder="0"
                    value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Unit Price <span className="text-red-400">*</span></label>
                  <input type="number" min="0" className={inputCls} placeholder="0"
                    value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
                </div>
                {form.product_id && form.quantity && form.unit_price && (
                  <div className="md:col-span-2 bg-slate-50 rounded-lg px-4 py-3 flex gap-6 text-sm">
                    <div>
                      <p className="text-xs text-gray-400">Total Revenue</p>
                      <p className="font-bold text-slate-800">{(Number(form.quantity) * Number(form.unit_price)).toLocaleString()}</p>
                    </div>
                    {selectedProduct && (
                      <div>
                        <p className="text-xs text-gray-400">Estimated Profit</p>
                        <p className={`font-bold ${(Number(form.unit_price) - selectedProduct.cost_price) * Number(form.quantity) >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {((Number(form.unit_price) - selectedProduct.cost_price) * Number(form.quantity)).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                  <input className={inputCls} placeholder="Optional notes about this sale"
                    value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-slate-100">
                <button onClick={closeModal} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">Cancel</button>
                <button onClick={submitForm} disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition disabled:opacity-60">
                  {submitting ? (modalMode === "edit" ? "Saving..." : "Recording...") : (modalMode === "edit" ? "Save Changes" : "Record Sale")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
