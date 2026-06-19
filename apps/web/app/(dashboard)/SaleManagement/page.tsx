"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { itemRequest } from "@/lib/product-api";
import { partnerRequest } from "@/lib/supplier-api";
import { saleRequest } from "@/lib/sale-api";
import { settingsRequest } from "@/lib/settings-api";
import { useDebounce } from "@/lib/hooks";
import { useLanguage } from "@/lib/language-context";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import Pagination from "@/app/components/ui/Pagination";
import DateRangeFilter from "@/app/components/ui/DateRangeFilter";
import {
  ShoppingBag, Search, Filter, Plus, Trash2, Pencil, X,
  TrendingUp, DollarSign, Users, ReceiptText, Package, RefreshCw, Calendar, Printer,
} from "lucide-react";

interface Sale {
  id: string; product_id: string; product_name?: string;
  customer_id?: string; quantity: number; unit_price: number;
  total_amount: number; profit?: number; notes?: string; created_at?: string;
}
interface Product { id: string; name: string; selling_price: number; cost_price: number; quantity: number; }
interface Partner { id: string; name: string; phone?: string; address?: string; }
interface LineItem { id: string; product_id: string; quantity: number; unit_price: number; }

type ModalMode = "create" | "edit";

const EMPTY_FORM = { product_id: "", customer_id: "", quantity: "", unit_price: "", notes: "" };
const PAGE_SIZES = [25, 50, 100, 250];

function genId() { return Math.random().toString(36).slice(2, 9); }
function emptyLine(): LineItem { return { id: genId(), product_id: "", quantity: 1, unit_price: 0 }; }
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function SaleManagementPage() {
  const { t } = useLanguage();

  const [sales, setSales] = useState<Sale[]>([]);
  const [salesTotal, setSalesTotal] = useState(0);
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

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState("");

  // Edit mode uses single form
  const [form, setForm] = useState(EMPTY_FORM);

  // Create mode uses line items
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);
  const [saleCustomer, setSaleCustomer] = useState("");
  const [saleNotes, setSaleNotes] = useState("");

  // Shop settings (for receipt)
  const [shopName, setShopName] = useState("");
  const [currency, setCurrency] = useState("RWF");

  // Receipts for last sale batch
  const [receipts, setReceipts] = useState<Sale[]>([]);

  const loadDataRef = useRef<(soft?: boolean) => Promise<void>>(async () => {});
  useEffect(() => { loadDataRef.current = loadData; });

  // Auto-refresh every 30 s
  useEffect(() => {
    const timer = setInterval(() => loadDataRef.current(true), 30_000);
    return () => clearInterval(timer);
  }, []);

  const debouncedSearch = useDebounce(search, 350);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loading) loadData(true); }, [dateFrom, dateTo, page, pageSize]);

  async function loadData(soft = false) {
    try {
      if (!soft) setLoading(true); else setRefreshing(true);
      const params = new URLSearchParams({
        page: String(page), limit: String(pageSize),
        ...(dateFrom && { from_date: dateFrom }),
        ...(dateTo && { to_date: dateTo }),
      });
      const [salesRes, productsRes, partnersRes, settingsRes] = await Promise.all([
        saleRequest(`/sales?${params}`),
        itemRequest("/products?limit=500"),
        partnerRequest("/suppliers"),
        settingsRequest("/settings").catch(() => null),
      ]);
      setSales(salesRes?.data?.items || []);
      setSalesTotal(salesRes?.data?.total || 0);
      setProducts(productsRes?.data?.items || []);
      const all: Partner[] = partnersRes?.data?.items || partnersRes?.data || [];
      setCustomers(all.filter((p) => !p.address?.startsWith("TIN:")));
      if (settingsRes?.data) {
        if (settingsRes.data.shop_name) setShopName(settingsRes.data.shop_name);
        if (settingsRes.data.currency) setCurrency(settingsRes.data.currency);
      }
      setLastUpdated(new Date());
    } catch (err) { console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  }

  function openCreateModal() {
    setLineItems([emptyLine()]); setSaleCustomer(""); setSaleNotes("");
    setEditingId(null); setModalMode("create"); setShowModal(true);
  }
  function openEditModal(s: Sale) {
    setForm({ product_id: s.product_id, customer_id: s.customer_id || "", quantity: String(s.quantity), unit_price: String(s.unit_price), notes: s.notes || "" });
    setEditingId(s.id); setModalMode("edit"); setShowModal(true);
  }
  function closeModal() {
    setShowModal(false); setForm(EMPTY_FORM); setEditingId(null);
    setLineItems([emptyLine()]); setSaleCustomer(""); setSaleNotes("");
  }

  // Line item helpers
  function addLine() { setLineItems((prev) => [...prev, emptyLine()]); }
  function removeLine(id: string) { setLineItems((prev) => prev.filter((l) => l.id !== id)); }
  function setLineProduct(id: string, productId: string) {
    const p = products.find((x) => x.id === productId);
    setLineItems((prev) => prev.map((l) => l.id === id ? { ...l, product_id: productId, unit_price: p ? p.selling_price : l.unit_price } : l));
  }
  function setLineQty(id: string, qty: number) {
    setLineItems((prev) => prev.map((l) => l.id === id ? { ...l, quantity: Math.max(1, qty) } : l));
  }
  function setLinePrice(id: string, price: number) {
    setLineItems((prev) => prev.map((l) => l.id === id ? { ...l, unit_price: Math.max(0, price) } : l));
  }

  // Edit mode: single product change
  function onProductChange(productId: string) {
    const product = products.find((p) => p.id === productId);
    setForm((f) => ({ ...f, product_id: productId, unit_price: product ? String(product.selling_price) : f.unit_price }));
  }

  async function submitForm() {
    if (modalMode === "edit" && editingId) {
      if (!form.product_id || !form.quantity || !form.unit_price) {
        alert(t("sales.product") + ", " + t("sales.quantity") + " & " + t("sales.unit_price") + " required."); return;
      }
      const payload = {
        product_id: form.product_id, customer_id: form.customer_id || undefined,
        quantity: Number(form.quantity), unit_price: Number(form.unit_price),
        notes: form.notes.trim() || undefined,
      };
      try {
        setSubmitting(true);
        await saleRequest(`/sales/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
        closeModal(); await loadData(true);
      } catch (err: unknown) { alert(err instanceof Error ? err.message : "Error"); }
      finally { setSubmitting(false); }
      return;
    }

    // CREATE — multi-item
    const validLines = lineItems.filter((l) => l.product_id && l.quantity > 0 && l.unit_price >= 0);
    if (validLines.length === 0) { alert("Add at least one item with a product selected."); return; }

    try {
      setSubmitting(true);
      const created: Sale[] = [];
      const errors: string[] = [];

      for (const line of validLines) {
        try {
          const res = await saleRequest("/sales", {
            method: "POST",
            body: JSON.stringify({
              product_id: line.product_id,
              customer_id: saleCustomer || undefined,
              quantity: line.quantity,
              unit_price: line.unit_price,
              notes: saleNotes.trim() || undefined,
            }),
          });
          if (res?.data?.id) created.push(res.data);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : "Unknown error");
        }
      }

      closeModal();
      if (created.length > 0) setReceipts(created);
      if (errors.length > 0) alert(`Some items failed:\n${errors.join("\n")}`);
      await loadData(true);
    } finally { setSubmitting(false); }
  }

  async function deleteSale(id: string) {
    if (!confirm(t("common.confirm_delete"))) return;
    try {
      setDeletingId(id);
      await saleRequest(`/sales/${id}`, { method: "DELETE" });
      await loadData(true);
    } catch { alert("Delete failed."); }
    finally { setDeletingId(""); }
  }

  function printReceiptPopup(salesToPrint: Sale[]) {
    const grandTotal = salesToPrint.reduce((s, x) => s + x.total_amount, 0);
    const receiptNo = salesToPrint[0]?.id?.slice(0, 8)?.toUpperCase() || "SALE";
    const dateStr = salesToPrint[0]?.created_at
      ? new Date(salesToPrint[0].created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
      : new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    const customerName = salesToPrint[0]?.customer_id ? customerMap[salesToPrint[0].customer_id]?.name : "";

    const itemsHtml = salesToPrint.map((s) =>
      `<tr>
        <td style="padding:6px 4px 6px 0;border-bottom:1px dotted #ddd;word-break:break-word;">${s.product_name || "Item"}</td>
        <td style="padding:6px 4px;border-bottom:1px dotted #ddd;text-align:center;white-space:nowrap;">${s.quantity}</td>
        <td style="padding:6px 4px;border-bottom:1px dotted #ddd;text-align:right;white-space:nowrap;">${s.unit_price.toLocaleString()}</td>
        <td style="padding:6px 0 6px 4px;border-bottom:1px dotted #ddd;text-align:right;font-weight:600;white-space:nowrap;">${s.total_amount.toLocaleString()}</td>
      </tr>`
    ).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Receipt #${receiptNo}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',Courier,monospace;background:#fff;padding:16px;max-width:320px;margin:0 auto;font-size:12px;color:#111}
  .center{text-align:center}
  .shop-name{font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px}
  .dashed{border:none;border-top:1px dashed #888;margin:8px 0}
  .solid{border:none;border-top:1px solid #222;margin:8px 0}
  .row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;font-size:11px}
  .label{color:#666}
  table{width:100%;border-collapse:collapse;margin:4px 0}
  thead th{font-size:10px;text-transform:uppercase;color:#666;padding:4px 0;border-bottom:2px solid #222;text-align:right}
  thead th:first-child{text-align:left}
  .total-line{font-size:14px;font-weight:700}
  .footer-text{color:#888;font-size:10px;text-align:center;margin-top:4px}
  @media print{
    html,body{width:80mm;max-width:80mm;padding:4mm;margin:0}
    @page{size:80mm auto;margin:0}
  }
</style>
</head>
<body>
<div class="center" style="margin-bottom:10px">
  <div class="shop-name">${shopName || "HIGOVERSE SHOP"}</div>
  <div style="color:#666;font-size:10px;margin-top:2px;text-transform:uppercase;letter-spacing:1px">Sales Receipt</div>
</div>
<hr class="dashed">
<div class="row"><span class="label">Receipt #</span><span style="font-weight:700">${receiptNo}</span></div>
<div class="row"><span class="label">Date</span><span>${dateStr}</span></div>
${customerName ? `<div class="row"><span class="label">Customer</span><span style="font-weight:600">${customerName}</span></div>` : ""}
<hr class="dashed">
<table>
  <thead><tr>
    <th style="text-align:left">Item</th>
    <th style="text-align:center">Qty</th>
    <th>Unit Price</th>
    <th>Total</th>
  </tr></thead>
  <tbody>${itemsHtml}</tbody>
</table>
<hr class="solid">
<div class="row total-line">
  <span>GRAND TOTAL</span>
  <span>${grandTotal.toLocaleString()} ${currency}</span>
</div>
<hr class="dashed">
<div class="footer-text" style="margin-top:12px">Thank you for your business!</div>
<div class="footer-text">Powered by Higoverse</div>
<script>
  window.onload=function(){setTimeout(function(){window.print();},400);};
  window.onafterprint=function(){window.close();};
</script>
</body>
</html>`;

    const w = window.open("", "_blank", "width=400,height=700,toolbar=no,menubar=no,scrollbars=yes,resizable=yes");
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
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

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return sales.filter((s) => {
      const name = (s.product_name || productMap[s.product_id]?.name || "").toLowerCase();
      const cust = customerMap[s.customer_id || ""]?.name?.toLowerCase() || "";
      if (q && !name.includes(q) && !cust.includes(q) && !(s.notes || "").toLowerCase().includes(q)) return false;
      if (filter === "profit") return (s.profit || 0) > 0;
      if (filter === "loss") return (s.profit || 0) <= 0;
      return true;
    });
  }, [sales, debouncedSearch, filter, productMap, customerMap]);

  const stats = useMemo(() => {
    const revenue = sales.reduce((s, x) => s + x.total_amount, 0);
    const profit = sales.reduce((s, x) => s + (x.profit || 0), 0);
    const itemsSold = sales.reduce((s, x) => s + x.quantity, 0);
    const uniqueCustomers = new Set(sales.map((x) => x.customer_id).filter(Boolean)).size;
    return { total: salesTotal, revenue, profit, itemsSold, uniqueCustomers };
  }, [sales, salesTotal]);

  // Create modal: grand total and profit preview
  const createGrandTotal = lineItems.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const createGrandProfit = lineItems.reduce((s, l) => {
    const p = productMap[l.product_id];
    return s + (p ? (l.unit_price - p.cost_price) * l.quantity : 0);
  }, 0);

  const totalPages = Math.ceil(salesTotal / pageSize);
  const selectedProduct = products.find((p) => p.id === form.product_id);
  const hasDateFilter = dateFrom || dateTo;

  const inputCls = "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition";

  if (loading) return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <div className="rounded-2xl bg-linear-to-r from-green-600 to-emerald-600 p-5 mb-6 animate-pulse">
          <div className="flex justify-between"><div className="h-4 w-40 bg-white/20 rounded-lg" /><div className="h-8 w-28 bg-white/20 rounded-lg" /></div>
          <div className="h-9 bg-white/10 rounded-lg mt-4" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {[...Array(5)].map((_, i) => <div key={i} className="bg-white rounded-xl border p-4 animate-pulse"><div className="h-2.5 w-16 bg-slate-200 rounded mb-3" /><div className="h-5 w-10 bg-slate-200 rounded" /></div>)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">

        {/* HEADER */}
        <div className="bg-linear-to-r from-green-600 to-emerald-600 text-white rounded-2xl p-5 mb-6">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <div className="flex items-center gap-2.5">
              <ShoppingBag size={20} />
              <div>
                <h1 className="text-base font-semibold">{t("sales.title")}</h1>
                <p className="text-orange-100 text-xs mt-0.5">
                  {lastUpdated ? `${t("common.updated")} ${lastUpdated.toLocaleTimeString()}` : "—"} · {t("common.total")}: {salesTotal.toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => loadData(true)} disabled={refreshing}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition disabled:opacity-50">
                <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              </button>
              <button onClick={openCreateModal}
                className="bg-white text-orange-600 px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-semibold hover:bg-green-50 transition">
                <Plus size={15} /> {t("sales.add")}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col md:flex-row gap-2.5">
            <div className="flex-1 flex items-center bg-white/10 rounded-lg px-3 py-2 gap-2">
              <Search size={15} className="shrink-0 text-orange-100" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder={t("items.search")}
                className="bg-transparent outline-none w-full text-sm placeholder:text-orange-100" />
              {search && <button onClick={() => setSearch("")} className="text-green-200 hover:text-white"><X size={13} /></button>}
            </div>
            <div className="flex items-center bg-white/10 rounded-lg px-3 py-2 gap-2">
              <Filter size={15} className="shrink-0 text-orange-100" />
              <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} className="bg-transparent outline-none text-sm">
                <option value="all" className="text-gray-700">{t("sales.all")}</option>
                <option value="profit" className="text-gray-700">{t("sales.profit")}</option>
                <option value="loss" className="text-gray-700">Loss</option>
              </select>
            </div>
          </div>

          <DateRangeFilter
            from={dateFrom} to={dateTo}
            onFrom={(v) => { setDateFrom(v); setPage(1); }}
            onTo={(v) => { setDateTo(v); setPage(1); }}
            onClear={() => { setDateFrom(""); setDateTo(""); setPage(1); }}
            accentClass="focus:ring-orange-300/40 focus:border-orange-300"
          />
        </div>

        {hasDateFilter && (
          <div className="flex items-center gap-2 mb-4 text-xs text-green-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
            <Calendar size={13} />
            <span>
              {t("sales.filter_date")}:
              {dateFrom && <> <span className="font-semibold">{dateFrom}</span></>}
              {dateTo && <> → <span className="font-semibold">{dateTo}</span></>}
              {" "}· <span className="font-semibold">{salesTotal.toLocaleString()}</span> {t("sales.count").toLowerCase()}
            </span>
            <button onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }} className="ml-auto text-orange-500 hover:text-green-700">
              <X size={13} />
            </button>
          </div>
        )}

        {/* STAT CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {[
            { label: t("sales.count"),       value: stats.total,                    color: "text-orange-600",  bg: "bg-orange-50",  icon: <ReceiptText size={17} /> },
            { label: t("sales.revenue"),      value: stats.revenue.toLocaleString(), color: "text-green-600",   bg: "bg-green-50",   icon: <DollarSign size={17} /> },
            { label: t("sales.profit"),       value: stats.profit.toLocaleString(),  color: "text-emerald-600", bg: "bg-emerald-50", icon: <TrendingUp size={17} /> },
            { label: t("reports.items_sold"), value: stats.itemsSold,                color: "text-blue-600",    bg: "bg-blue-50",    icon: <Package size={17} /> },
            { label: t("reports.customers"),  value: stats.uniqueCustomers,          color: "text-violet-600",  bg: "bg-violet-50",  icon: <Users size={17} /> },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap justify-between items-start gap-2">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide leading-none">{card.label}</p>
                  <p className={`text-xl font-bold mt-1.5 ${card.color}`}>{card.value}</p>
                  {hasDateFilter && <p className="text-xs text-slate-400 mt-0.5">{t("sales.today")}</p>}
                </div>
                <div className={`${card.bg} ${card.color} p-1.5 rounded-lg shrink-0`}>{card.icon}</div>
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
                {[t("sales.col_date"), t("sales.col_product"), t("sales.col_customer"), t("sales.col_qty"), t("sales.col_price"), t("sales.col_total"), t("sales.col_profit"), t("common.notes"), ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((s) => {
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
                      {(() => {
                        const name = s.product_name || product?.name;
                        return name
                          ? <div><p className="font-semibold text-slate-800">{name}</p><p className="text-xs text-slate-400 font-mono">{s.product_id.slice(0, 8)}</p></div>
                          : <span className="text-slate-400 text-xs font-mono">{s.product_id.slice(0, 8)}</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      {customer
                        ? <div><p className="font-medium text-slate-700">{customer.name}</p>{customer.phone && <p className="text-xs text-slate-400">{customer.phone}</p>}</div>
                        : <span className="text-slate-400 text-xs italic">—</span>}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700 tabular-nums">{s.quantity}</td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums">{s.unit_price.toLocaleString()}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800 tabular-nums">{s.total_amount.toLocaleString()}</td>
                    <td className={`px-4 py-3 font-semibold tabular-nums ${isProfit ? "text-green-600" : "text-red-500"}`}>
                      {isProfit ? "+" : ""}{(s.profit || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-28 truncate">{s.notes || <span className="text-slate-200">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => printReceiptPopup([s])} title="Print receipt"
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 transition">
                          <Printer size={14} />
                        </button>
                        <button onClick={() => openEditModal(s)}
                          className="p-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-600 transition">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => deleteSale(s.id)} disabled={deletingId === s.id}
                          className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition disabled:opacity-40">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <div className="p-4 bg-slate-100 rounded-2xl mb-3"><ShoppingBag size={32} className="opacity-40" /></div>
              <p className="font-medium text-slate-500 text-sm">{t("sales.no_sales")}</p>
              {!search && filter === "all" && !hasDateFilter && (
                <button onClick={openCreateModal} className="mt-4 flex items-center gap-1.5 bg-orange-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-orange-600 transition">
                  <Plus size={14} /> {t("sales.add")}
                </button>
              )}
            </div>
          )}

          <Pagination page={page} totalPages={totalPages} total={salesTotal}
            pageSize={pageSize} pageSizes={PAGE_SIZES} onPage={setPage} onPageSize={setPageSize} />
        </div>

        {/* CREATE MODAL — multi-item */}
        {showModal && modalMode === "create" && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{t("sales.add_title")}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Add one or more items to this sale</p>
                </div>
                <button onClick={closeModal} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={17} /></button>
              </div>

              <div className="px-6 py-4 overflow-y-auto flex-1">

                {/* Customer + Notes row */}
                <div className="grid md:grid-cols-2 gap-4 mb-5">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">{t("sales.customer")}</label>
                    <select className={inputCls} value={saleCustomer} onChange={(e) => setSaleCustomer(e.target.value)}>
                      <option value="">— Walk-in customer —</option>
                      {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">{t("common.notes")}</label>
                    <input className={inputCls} placeholder="Optional note for this sale..."
                      value={saleNotes} onChange={(e) => setSaleNotes(e.target.value)} />
                  </div>
                </div>

                {/* Line items */}
                <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Items</span>
                    <button onClick={addLine}
                      className="flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-green-700 bg-orange-50 hover:bg-orange-100 px-2.5 py-1 rounded-lg transition">
                      <Plus size={12} /> Add Item
                    </button>
                  </div>

                  {/* Header row */}
                  <div className="grid grid-cols-[2fr_80px_100px_90px_32px] gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100 text-[10px] font-semibold uppercase text-slate-400 tracking-wide">
                    <span>Product</span><span className="text-center">Qty</span><span className="text-center">Unit Price</span><span className="text-right">Subtotal</span><span />
                  </div>

                  <div className="divide-y divide-slate-100">
                    {lineItems.map((line) => {
                      const p = productMap[line.product_id];
                      const subtotal = line.quantity * line.unit_price;
                      const profit = p ? (line.unit_price - p.cost_price) * line.quantity : 0;
                      return (
                        <div key={line.id} className="px-4 py-3">
                          <div className="grid grid-cols-[2fr_80px_100px_90px_32px] gap-2 items-center">
                            <select
                              className="border border-slate-200 text-gray-800 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition"
                              value={line.product_id}
                              onChange={(e) => setLineProduct(line.id, e.target.value)}
                            >
                              <option value="">Select product…</option>
                              {products.map((prod) => (
                                <option key={prod.id} value={prod.id} disabled={prod.quantity === 0}>
                                  {prod.name} ({prod.quantity} left)
                                </option>
                              ))}
                            </select>
                            <input
                              type="number" min="1"
                              max={p?.quantity}
                              value={line.quantity}
                              onChange={(e) => setLineQty(line.id, Number(e.target.value))}
                              className="border border-slate-200 text-gray-800 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition w-full"
                            />
                            <input
                              type="number" min="0"
                              value={line.unit_price}
                              onChange={(e) => setLinePrice(line.id, Number(e.target.value))}
                              className="border border-slate-200 text-gray-800 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition w-full"
                            />
                            <div className="text-right">
                              <p className="font-semibold text-slate-800 text-sm tabular-nums">{subtotal.toLocaleString()}</p>
                              {p && <p className={`text-[10px] tabular-nums ${profit >= 0 ? "text-green-500" : "text-red-400"}`}>
                                {profit >= 0 ? "+" : ""}{profit.toLocaleString()}
                              </p>}
                            </div>
                            <button
                              onClick={() => removeLine(line.id)}
                              disabled={lineItems.length === 1}
                              className="p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition disabled:opacity-20"
                            >
                              <X size={14} />
                            </button>
                          </div>
                          {p && (
                            <div className="flex gap-3 mt-1.5 text-[10px] text-slate-400">
                              <span>Cost: <span className="font-medium">{p.cost_price.toLocaleString()}</span></span>
                              <span>Sell: <span className="font-medium text-green-600">{p.selling_price.toLocaleString()}</span></span>
                              <span className={p.quantity <= 10 ? "text-amber-500 font-medium" : ""}>Stock: {p.quantity}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Totals row */}
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-6">
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Grand Total</p>
                      <p className="font-bold text-lg text-slate-800 tabular-nums">{createGrandTotal.toLocaleString()} <span className="text-xs font-normal text-slate-400">{currency}</span></p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Est. Profit</p>
                      <p className={`font-bold text-lg tabular-nums ${createGrandProfit >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {createGrandProfit >= 0 ? "+" : ""}{createGrandProfit.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center gap-2.5 px-6 py-4 border-t border-slate-100 shrink-0">
                <span className="text-xs text-slate-400">
                  {lineItems.filter((l) => l.product_id).length} of {lineItems.length} item{lineItems.length !== 1 ? "s" : ""} selected
                </span>
                <div className="flex gap-2.5">
                  <button onClick={closeModal} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">{t("common.cancel")}</button>
                  <button onClick={submitForm} disabled={submitting}
                    className="px-5 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition disabled:opacity-60">
                    {submitting ? t("common.saving") : `Record Sale${lineItems.filter((l) => l.product_id).length > 1 ? ` (${lineItems.filter((l) => l.product_id).length} items)` : ""}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* EDIT MODAL — single item */}
        {showModal && modalMode === "edit" && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-center px-4 sm:px-6 py-4 border-b border-slate-100 shrink-0">
                <h2 className="text-base font-semibold text-slate-800">{t("sales.edit_title")}</h2>
                <button onClick={closeModal} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={17} /></button>
              </div>
              <div className="px-4 sm:px-6 py-4 sm:py-5 grid md:grid-cols-2 gap-4 overflow-y-auto flex-1">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("sales.product")} <span className="text-red-400">*</span></label>
                  <select className={inputCls} value={form.product_id} onChange={(e) => onProductChange(e.target.value)}>
                    <option value="">{t("common.search")}...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id} disabled={p.quantity === 0}>
                        {p.name} — {t("items.col_qty")}: {p.quantity}
                      </option>
                    ))}
                  </select>
                  {selectedProduct && (
                    <div className="mt-1.5 flex gap-3 text-xs text-slate-500">
                      <span>{t("items.cost_price")}: <span className="font-medium text-slate-700">{selectedProduct.cost_price.toLocaleString()}</span></span>
                      <span>{t("items.selling_price")}: <span className="font-medium text-green-600">{selectedProduct.selling_price.toLocaleString()}</span></span>
                      <span className={`font-medium ${selectedProduct.quantity <= 10 ? "text-amber-600" : "text-slate-700"}`}>{t("items.col_qty")}: {selectedProduct.quantity}</span>
                    </div>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("sales.customer")}</label>
                  <select className={inputCls} value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
                    <option value="">—</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("sales.quantity")} <span className="text-red-400">*</span></label>
                  <input type="number" min="1" max={selectedProduct?.quantity} className={inputCls} placeholder="0"
                    value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("sales.unit_price")} <span className="text-red-400">*</span></label>
                  <input type="number" min="0" className={inputCls} placeholder="0"
                    value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
                </div>
                {form.product_id && form.quantity && form.unit_price && (
                  <div className="md:col-span-2 bg-slate-50 rounded-lg px-4 py-3 flex gap-6 text-sm">
                    <div><p className="text-xs text-gray-400">{t("common.total")}</p><p className="font-bold text-slate-800">{(Number(form.quantity) * Number(form.unit_price)).toLocaleString()}</p></div>
                    {selectedProduct && (
                      <div><p className="text-xs text-gray-400">{t("sales.col_profit")}</p>
                        <p className={`font-bold ${(Number(form.unit_price) - selectedProduct.cost_price) * Number(form.quantity) >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {((Number(form.unit_price) - selectedProduct.cost_price) * Number(form.quantity)).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("common.notes")}</label>
                  <input className={inputCls} placeholder="..."
                    value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-2.5 px-4 sm:px-6 py-4 border-t border-slate-100 shrink-0">
                <button onClick={closeModal} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">{t("common.cancel")}</button>
                <button onClick={submitForm} disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition disabled:opacity-60">
                  {submitting ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* RECEIPT PREVIEW MODAL */}
        {receipts.length > 0 && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
              <div className="flex justify-between items-center px-5 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-slate-700">
                  <ReceiptText size={15} />
                  <span className="font-semibold text-sm">Sale Complete — Receipt Preview</span>
                </div>
                <button onClick={() => setReceipts([])} className="text-slate-400 hover:text-slate-600 transition"><X size={16} /></button>
              </div>

              {/* Receipt preview body */}
              <div className="px-6 py-5 font-mono text-sm bg-white max-h-96 overflow-y-auto">
                <div className="text-center mb-4">
                  <p className="font-bold text-base text-slate-900 uppercase tracking-widest">{shopName || "HIGOVERSE SHOP"}</p>
                  <p className="text-xs text-slate-400 mt-0.5 uppercase tracking-wider">Sales Receipt</p>
                </div>
                <div className="border-t border-dashed border-slate-300 my-3" />
                <div className="space-y-1.5 text-xs text-slate-600 mb-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Receipt #</span>
                    <span className="font-semibold">{receipts[0]?.id?.slice(0, 8)?.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Date</span>
                    <span>{receipts[0]?.created_at ? new Date(receipts[0].created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
                  </div>
                  {receipts[0]?.customer_id && customerMap[receipts[0].customer_id] && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Customer</span>
                      <span className="font-medium">{customerMap[receipts[0].customer_id].name}</span>
                    </div>
                  )}
                </div>
                <div className="border-t border-dashed border-slate-300 my-3" />
                {/* Items */}
                <div className="space-y-2 mb-3">
                  {receipts.map((s) => (
                    <div key={s.id}>
                      <p className="font-bold text-slate-800 text-xs">{s.product_name || "Item"}</p>
                      <div className="flex justify-between text-xs text-slate-600 mt-0.5">
                        <span>{s.quantity} × {s.unit_price.toLocaleString()} {currency}</span>
                        <span className="font-semibold">{s.total_amount.toLocaleString()} {currency}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-300 my-3" />
                <div className="flex justify-between font-bold text-base text-slate-900">
                  <span>TOTAL</span>
                  <span>{receipts.reduce((s, x) => s + x.total_amount, 0).toLocaleString()} {currency}</span>
                </div>
                <div className="border-t border-dashed border-slate-300 my-3" />
                <p className="text-center text-xs text-slate-400">Thank you for your business!</p>
              </div>

              <div className="flex gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50">
                <button onClick={() => { setReceipts([]); openCreateModal(); }}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-100 transition">
                  New Sale
                </button>
                <button onClick={() => setReceipts([])}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-100 transition">
                  Close
                </button>
                <button onClick={() => printReceiptPopup(receipts)}
                  className="flex-1 px-3 py-2 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 transition flex items-center justify-center gap-1.5">
                  <Printer size={13} /> Print
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
