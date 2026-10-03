"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { itemRequest } from "@/lib/product-api";
import { partnerRequest } from "@/lib/supplier-api";
import { purchaseRequest } from "@/lib/purchase-api";
import { useAutoRefresh, useDebounce } from "@/lib/hooks";
import { useLanguage } from "@/lib/language-context";
import { useShopSettings } from "@/lib/shop-settings-context";
import Pagination from "@/app/components/ui/Pagination";
import ProductPicker from "@/app/components/ui/ProductPicker";
import DateRangeFilter from "@/app/components/ui/DateRangeFilter";
import {
  AlertCircle, Plus, Trash2, X, Truck, Package, History, LayoutGrid, Calendar, Download, Upload, FileSpreadsheet, FileText, ShoppingCart, RefreshCw, Search, Filter, ChevronDown,
} from "lucide-react";
import { askConfirm, notify } from "@/lib/dialogs";

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
  const { t, layout } = useLanguage();
  // Car companies don't use Purchases (they stock in from Vehicles); the
  // supplier hiding below still applies if one lands here before the redirect.
  const isCar = layout === "car";
  const { lowStock } = useShopSettings();
  const router = useRouter();
  useEffect(() => { if (isCar) router.replace("/items"); }, [isCar, router]);
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep figures current without polling hidden tabs.
  useAutoRefresh(() => loadAll(true));

  function manualRefresh() {
    loadAll(true);
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["product_name", "description", "cost_price", "selling_price", "quantity_added"],
      ["Sugar 1kg", "White sugar bag", "800", "1000", "50"],
      ["Rice 5kg", "Long grain rice", "3500", "4500", "20"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Purchases");
    XLSX.writeFile(wb, "purchases_template.xlsx");
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws);
      let imported = 0, failed = 0;
      for (const row of rows) {
        try {
          const name = (row.product_name || row["Product Name"] || "").trim();
          const cost = Number(row.cost_price || row["Cost Price"] || 0);
          const qty = Number(row.quantity_added || row["Qty Added"] || 0);
          if (!name || !cost || !qty) { failed++; continue; }
          const payload: Record<string, unknown> = {
            product_name: name,
            cost_price: cost,
            selling_price: row.selling_price ? Number(row.selling_price) : undefined,
            quantity_added: qty,
            description: (row.description || row.Description || "").trim() || undefined,
          };
          await purchaseRequest("/purchases", { method: "POST", body: JSON.stringify(payload) });
          imported++;
        } catch { failed++; }
      }
      e.target.value = "";
      notify(`${t("purchases.import_result_prefix")} ${imported} ${t("common.records")}${failed ? `, ${failed} ${t("purchases.import_result_failed")}` : ""}.`, failed ? "warning" : "success");
      await loadAll(true);
    } catch { notify(t("purchases.import_parse_error")); }
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    let data: Record<string, unknown>[];
    if (tab === "inventory") {
      data = paginatedProducts.map((p) => ({
        Product: p.name,
        Description: p.description || "",
        ...(isCar ? {} : { Supplier: supplierMap[p.supplier_id ?? ""]?.name || "" }),
        "Cost Price": p.cost_price,
        "Selling Price": p.selling_price,
        Quantity: p.quantity,
      }));
    } else {
      data = purchases.map((p) => ({
        Date: p.created_at ? new Date(p.created_at).toLocaleDateString() : "",
        Product: p.product_name,
        ...(isCar ? {} : { Supplier: supplierMap[p.supplier_id ?? ""]?.name || "" }),
        "Qty Added": p.quantity_added,
        "Cost Price": p.cost_price,
        "Total Cost": p.total_cost,
      }));
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tab === "inventory" ? "Inventory" : "History");
    XLSX.writeFile(wb, `purchases_${tab}.xlsx`);
  }

  async function exportPDF() {
    const { jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF();
    doc.setFontSize(14);
    if (tab === "inventory") {
      doc.text("Inventory", 14, 16);
      autoTable(doc, {
        startY: 22,
        head: [isCar ? ["Product", "Cost Price", "Selling Price", "Qty"] : ["Product", "Supplier", "Cost Price", "Selling Price", "Qty"]],
        body: paginatedProducts.map((p) => [
          p.name,
          ...(isCar ? [] : [supplierMap[p.supplier_id ?? ""]?.name || "—"]),
          p.cost_price.toLocaleString(),
          p.selling_price.toLocaleString(),
          String(p.quantity),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [19, 114, 230] },
      });
    } else {
      doc.text("Purchase History", 14, 16);
      autoTable(doc, {
        startY: 22,
        head: [isCar ? ["Date", "Product", "Qty Added", "Cost Price", "Total"] : ["Date", "Product", "Supplier", "Qty Added", "Cost Price", "Total"]],
        body: purchases.map((p) => [
          p.created_at ? new Date(p.created_at).toLocaleDateString() : "—",
          p.product_name,
          ...(isCar ? [] : [supplierMap[p.supplier_id ?? ""]?.name || "—"]),
          String(p.quantity_added),
          p.cost_price.toLocaleString(),
          p.total_cost.toLocaleString(),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [19, 114, 230] },
      });
    }
    doc.save(`purchases_${tab}.pdf`);
  }
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

  function handleSelectExisting(item: Product) {
    // Searched from the whole catalogue — keep it locally for the lookups below.
    setProducts((prev) => prev.some((p) => p.id === item.id) ? prev : [...prev, item]);
    {
      setIsRestocking(true);
      setForm((f) => ({ ...f, product_id: item.id, product_name: item.name, description: item.description || "", cost_price: String(item.cost_price), selling_price: String(item.selling_price), supplier_id: item.supplier_id || "" }));
    }
  }

  async function submitForm() {
    const qty = Number(form.quantity);
    const cost = Number(form.cost_price);
    if ((!isRestocking && !form.product_name.trim()) || !form.quantity || !form.cost_price) {
      notify(t("purchases.product_name") + ", " + t("purchases.qty_added") + " " + t("common.and") + " " + t("purchases.cost_price") + " " + t("common.is_required") + "."); return;
    }
    if (qty <= 0 || cost <= 0) { notify(t("purchases.qty_cost_positive")); return; }

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
      notify(err instanceof Error ? err.message : t("common.error"));
    } finally { setSubmitting(false); }
  }

  async function deleteHistoryRecord(id: string) {
    if (!(await askConfirm({ message: t("common.confirm_delete"), danger: true }))) return;
    try {
      setDeletingId(id);
      await purchaseRequest(`/purchases/${id}`, { method: "DELETE" });
      await loadHistory(true);
    } catch { notify(t("common.delete_failed")); }
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
        if (invFilter === "in_stock") return p.quantity > lowStock;
        if (invFilter === "low_stock") return p.quantity > 0 && p.quantity <= lowStock;
        if (invFilter === "out_stock") return p.quantity === 0;
        return true;
      });
  }, [products, debouncedInvSearch, invFilter, supplierMap, lowStock]);

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
    const lowCount    = products.filter((p) => p.quantity > 0 && p.quantity <= lowStock).length;
    const outStock    = products.filter((p) => p.quantity === 0).length;
    return { costValue, retailValue, grossProfit, lowStock: lowCount, outStock, totalSpent };
  }, [products, purchases, lowStock]);

  const selectedProduct = isRestocking ? products.find((p) => p.id === form.product_id) : null;
  const hasDateFilter = dateFrom || dateTo;
  const margin = form.cost_price && form.selling_price && Number(form.cost_price) > 0
    ? (((Number(form.selling_price) - Number(form.cost_price)) / Number(form.cost_price)) * 100).toFixed(1) : null;

  const inputCls = "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2] transition";

  if (loading) return <PurchasesSkeleton />;

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4">

        {/* HEADER */}
        <div className="hgv-surface relative rounded-2xl mb-2 overflow-hidden"
          style={{ background: "linear-gradient(135deg, #0a66c2 0%, #004182 50%, #00376b 100%)" }}>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "20px 20px" }} />

          {/* Row 1: icon + title + tabs + actions */}
          <div className="relative flex items-center gap-3 px-4 pt-3 pb-2">
            <div className="flex items-center gap-2.5 min-w-0 mr-auto">
              <div className="w-8 h-8 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                <ShoppingCart size={15} className="text-white" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest leading-none">{t("nav.purchases")}</p>
                <h1 className="text-base font-extrabold text-white leading-tight tracking-tight">{t("purchases.title")}</h1>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1">
              <button onClick={() => setTab("inventory")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${tab === "inventory" ? "bg-white text-[#0a66c2]" : "bg-white/10 text-white hover:bg-white/20"}`}>
                <LayoutGrid size={11} /> {t("purchases.inventory")}
              </button>
              <button onClick={() => setTab("history")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${tab === "history" ? "bg-white text-[#0a66c2]" : "bg-white/10 text-white hover:bg-white/20"}`}>
                <History size={11} /> {t("purchases.history")} ({purchasesTotal.toLocaleString()})
              </button>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={manualRefresh} disabled={refreshing}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition-all disabled:opacity-40">
                <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              </button>
              <button onClick={openCreateModal}
                className="flex items-center gap-1.5 bg-white text-[#0a66c2] px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-50 active:scale-95 transition-all shadow-lg shadow-black/20">
                <Plus size={12} strokeWidth={3} /> {t("purchases.add")}
              </button>
            </div>
          </div>

          {/* Row 2: live indicator */}
          <div className="relative flex items-center gap-1.5 px-4 pb-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
            </span>
            <p className="text-[10px] text-blue-100/70 flex-1">
              {t("common.live")} · <span className="font-semibold text-white/80">{productsTotal.toLocaleString()} {t("purchases.items_unit")}</span>
              {lastUpdated && <span className="ml-1 text-blue-200/50">· {t("common.updated")} {lastUpdated.toLocaleTimeString()}</span>}
            </p>
          </div>

          {/* Row 3: mobile tabs + search/filter */}
          <div className="relative px-4 pb-3 space-y-2">
            <div className="flex sm:hidden gap-1">
              <button onClick={() => setTab("inventory")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${tab === "inventory" ? "bg-white text-[#0a66c2]" : "bg-white/10 text-white"}`}>
                <LayoutGrid size={11} /> {t("purchases.inventory")}
              </button>
              <button onClick={() => setTab("history")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${tab === "history" ? "bg-white text-[#0a66c2]" : "bg-white/10 text-white"}`}>
                <History size={11} /> {t("purchases.history")}
              </button>
            </div>
            {tab === "history" && (
              <DateRangeFilter from={dateFrom} to={dateTo}
                onFrom={(v) => { setDateFrom(v); setHistPage(1); }}
                onTo={(v) => { setDateTo(v); setHistPage(1); }}
                onClear={() => { setDateFrom(""); setDateTo(""); setHistPage(1); }}
                accentClass="focus:ring-[#0a66c2]/30 focus:border-[#0a66c2]" />
            )}
            {tab === "inventory" && (
              <div className="flex gap-2">
                <div className="hgv-search">
                  <Search size={16} className="hgv-search-icon" />
                  <input value={invSearch} onChange={(e) => { setInvSearch(e.target.value); setInvPage(1); }}
                    placeholder={t("items.search")} className="hgv-search-input" />
                  {invSearch && <button onClick={() => setInvSearch("")} className="hgv-search-clear"><X size={14} /></button>}
                </div>
                <div className="hgv-filter">
                  <Filter size={14} className="shrink-0" />
                  <select value={invFilter} onChange={(e) => { setInvFilter(e.target.value); setInvPage(1); }} >
                    <option value="all" className="text-gray-800">{t("items.all")}</option>
                    <option value="in_stock" className="text-gray-800">{t("items.in_stock")}</option>
                    <option value="low_stock" className="text-gray-800">{t("items.low_stock")}</option>
                    <option value="out_stock" className="text-gray-800">{t("items.out_stock")}</option>
                  </select>
                  <ChevronDown size={14} className="shrink-0" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* STOCK ALERT */}
        {(invStats.lowStock > 0 || invStats.outStock > 0) && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-2">
            <AlertCircle size={11} className="text-amber-500 shrink-0" />
            <p className="text-[10px] text-amber-700 flex-1">
              {invStats.outStock > 0 && <><span className="font-bold">{invStats.outStock}</span> {t("items.out_stock")}</>}
              {invStats.outStock > 0 && invStats.lowStock > 0 && " · "}
              {invStats.lowStock > 0 && <><span className="font-bold">{invStats.lowStock}</span> {t("items.low_stock")}</>}
            </p>
            {!isCar && <Link href="/PartnerManagement" className="text-[10px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded-md shrink-0 transition">
              {t("partners.suppliers")}
            </Link>}
          </div>
        )}

        {/* STAT CARDS */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-2">
          {[
            { label: t("purchases.stat_total_products"),   value: productsTotal,                         color: "text-[#0a66c2]", dot: "bg-[#0a66c2]" },
            { label: t("purchases.stat_what_you_paid"),    value: invStats.costValue.toLocaleString(),    color: "text-[#0a66c2]", dot: "bg-blue-500" },
            { label: t("purchases.stat_if_sell_all"),      value: invStats.retailValue.toLocaleString(),  color: "text-[#0a66c2]", dot: "bg-indigo-500" },
            { label: t("purchases.stat_profit_to_make"),   value: invStats.grossProfit.toLocaleString(),  color: "text-green-600", dot: "bg-green-500" },
            { label: t("purchases.stat_almost_finished"),  value: invStats.lowStock,                      color: "text-amber-500", dot: "bg-amber-400" },
            { label: t("purchases.stat_finished_empty"),   value: invStats.outStock,                      color: "text-red-600",   dot: "bg-red-500" },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-lg border border-slate-200 px-2.5 py-2">
              <div className="flex items-center gap-1 mb-1">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${card.dot}`} />
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider leading-none truncate">{card.label}</p>
              </div>
              <p className={`text-xl font-bold leading-none tabular-nums ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* INVENTORY TABLE */}
        {tab === "inventory" && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 bg-slate-50/60">
              <p className="text-[10px] text-slate-500">
                <span className="font-semibold text-slate-700">{paginatedProducts.length}</span> {t("common.of")} <span className="font-semibold text-slate-700">{filteredProducts.length}</span> {t("purchases.products_word")}
              </p>
              <div className="flex items-center gap-1.5">
                <button onClick={downloadTemplate} title={t("common.download_template_title")}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-violet-200 text-violet-600 bg-white hover:bg-violet-50 transition">
                  <Download size={10} /> {t("common.template")}
                </button>
                <button onClick={() => fileInputRef.current?.click()} title={t("common.import_title")}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-violet-200 text-violet-600 bg-white hover:bg-violet-50 transition">
                  <Upload size={10} /> {t("common.import")}
                </button>
                <button onClick={exportExcel} title={t("common.export_excel_title")}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-green-200 text-green-600 bg-white hover:bg-green-50 transition">
                  <FileSpreadsheet size={10} /> {t("common.excel")}
                </button>
                <button onClick={exportPDF} title={t("common.export_pdf_title")}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-red-200 text-red-600 bg-white hover:bg-red-50 transition">
                  <FileText size={10} /> {t("common.pdf")}
                </button>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {[t("items.col_product"), ...(isCar ? [] : [t("items.col_supplier")]), t("items.cost_price"), t("items.selling_price"), t("items.col_margin"), t("items.col_qty"), t("common.status"), ""].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedProducts.map((p) => {
                  const supplier = supplierMap[p.supplier_id ?? ""];
                  const margin2 = p.cost_price > 0 ? ((p.selling_price - p.cost_price) / p.cost_price) * 100 : 0;
                  const needsRestock = p.quantity <= lowStock;
                  return (
                    <tr key={p.id} className={`hover:bg-slate-50/60 transition-colors ${p.quantity === 0 ? "bg-red-50/20" : needsRestock ? "bg-amber-50/20" : ""}`}>
                      <td className="px-3 py-1.5">
                        <p className="font-semibold text-slate-800 text-xs">{p.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{p.id?.slice(0, 8)}</p>
                      </td>
                      {!isCar && <td className="px-3 py-1.5">
                        {supplier
                          ? <div><p className="font-medium text-slate-700 text-xs">{supplier.name}</p>{supplier.phone && <p className="text-[10px] text-slate-400">{supplier.phone}</p>}</div>
                          : <Link href="/PartnerManagement" className="text-[10px] text-[#0a66c2] hover:underline flex items-center gap-0.5"><Truck size={10} /> {t("common.add")}</Link>}
                      </td>}
                      <td className="px-3 py-1.5 text-slate-600 font-medium tabular-nums text-xs">{Number(p.cost_price).toLocaleString()}</td>
                      <td className="px-3 py-1.5 font-semibold text-green-600 tabular-nums text-xs">{Number(p.selling_price).toLocaleString()}</td>
                      <td className="px-3 py-1.5">
                        <span className={`text-[10px] font-bold ${margin2 >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {margin2 >= 0 ? "+" : ""}{margin2.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${p.quantity === 0 ? "bg-red-100 text-red-700" : p.quantity <= lowStock ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                          {p.quantity}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${p.quantity === 0 ? "bg-red-100 text-red-700" : p.quantity <= lowStock ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                          {p.quantity === 0 ? t("items.out_stock") : p.quantity <= lowStock ? t("items.low_stock") : t("items.in_stock")}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <button
                          onClick={() => { setForm({ product_id: p.id, product_name: p.name, description: p.description || "", cost_price: String(p.cost_price), selling_price: String(p.selling_price), quantity: "", supplier_id: p.supplier_id || "" }); setIsRestocking(true); setShowModal(true); }}
                          className="px-2 py-0.5 rounded bg-[#EBF2FD] hover:bg-[#D5E8FB] text-[#0a66c2] text-[10px] font-semibold transition">
                          + {t("purchases.restock")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            {paginatedProducts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <div className="p-4 bg-slate-100 rounded-2xl mb-3"><Package size={28} className="opacity-40" /></div>
                <p className="font-medium text-slate-500 text-sm">{t("items.no_items")}</p>
                {!invSearch && invFilter === "all" && (
                  <button onClick={openCreateModal} className="mt-4 flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 rounded-lg transition hover:opacity-90" style={{ background: "#0a66c2" }}>
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
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 bg-slate-50/60">
              <p className="text-[10px] text-slate-500">
                <span className="font-semibold text-slate-700">{purchases.length}</span> {t("common.of")} <span className="font-semibold text-slate-700">{purchasesTotal}</span> {t("common.records")}
              </p>
              <div className="flex items-center gap-1.5">
                <button onClick={downloadTemplate} title={t("common.download_template_title")}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-violet-200 text-violet-600 bg-white hover:bg-violet-50 transition">
                  <Download size={10} /> {t("common.template")}
                </button>
                <button onClick={() => fileInputRef.current?.click()} title={t("common.import_title")}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-violet-200 text-violet-600 bg-white hover:bg-violet-50 transition">
                  <Upload size={10} /> {t("common.import")}
                </button>
                <button onClick={exportExcel} title={t("common.export_excel_title")}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-green-200 text-green-600 bg-white hover:bg-green-50 transition">
                  <FileSpreadsheet size={10} /> {t("common.excel")}
                </button>
                <button onClick={exportPDF} title={t("common.export_pdf_title")}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-red-200 text-red-600 bg-white hover:bg-red-50 transition">
                  <FileText size={10} /> {t("common.pdf")}
                </button>
              </div>
            </div>
            {hasDateFilter && (
              <div className="flex items-center gap-2 px-4 py-1.5 border-b border-slate-100 text-[10px] text-[#0a66c2] bg-[#EBF2FD]">
                <Calendar size={12} />
                <span>
                  {dateFrom && <> {t("common.date")}: <span className="font-semibold">{dateFrom}</span></>}
                  {dateTo && <> → <span className="font-semibold">{dateTo}</span></>}
                  {" "}· <span className="font-semibold">{purchasesTotal.toLocaleString()}</span>
                </span>
                <button onClick={() => { setDateFrom(""); setDateTo(""); setHistPage(1); }} className="ml-auto hover:opacity-70" style={{ color: "#0a66c2" }}><X size={12} /></button>
              </div>
            )}
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {[t("purchases.col_date"), t("purchases.col_product"), ...(isCar ? [] : [t("purchases.col_supplier")]), t("purchases.col_qty"), t("purchases.col_unit"), t("purchases.col_total"), ""].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchases.map((p) => {
                  const supplier = supplierMap[p.supplier_id ?? ""];
                  const d = p.created_at ? new Date(p.created_at) : null;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {d ? (
                          <div>
                            <p className="text-[10px] font-medium text-slate-700">{toDateStr(d)}</p>
                            <p className="text-[9px] text-slate-400">{d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        <p className="font-semibold text-slate-800 text-xs">{p.product_name}</p>
                        {p.product_id && <p className="text-[10px] text-slate-400 font-mono">{p.product_id.slice(0, 8)}</p>}
                      </td>
                      {!isCar && <td className="px-3 py-1.5">
                        {supplier
                          ? <div><p className="font-medium text-slate-700 text-xs">{supplier.name}</p>{supplier.phone && <p className="text-[10px] text-slate-400">{supplier.phone}</p>}</div>
                          : <span className="text-slate-300 text-xs italic">—</span>}
                      </td>}
                      <td className="px-3 py-1.5 font-medium text-slate-700 tabular-nums text-xs">{p.quantity_added}</td>
                      <td className="px-3 py-1.5 text-slate-600 tabular-nums text-xs">{p.cost_price.toLocaleString()}</td>
                      <td className="px-3 py-1.5 font-semibold text-slate-800 tabular-nums text-xs">{p.total_cost.toLocaleString()}</td>
                      <td className="px-3 py-1.5">
                        <button onClick={() => deleteHistoryRecord(p.id)} disabled={deletingId === p.id}
                          className="p-1 rounded bg-red-50 hover:bg-red-100 text-red-500 transition disabled:opacity-40">
                          <Trash2 size={11} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            {purchases.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <div className="p-4 bg-slate-100 rounded-2xl mb-3"><History size={28} className="opacity-40" /></div>
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
            <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-center px-4 sm:px-6 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">
                    {isRestocking ? t("purchases.restock_title") : t("purchases.new_title")}
                  </h2>
                </div>
                <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setIsRestocking(false); }}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={17} /></button>
              </div>
              <div className="px-4 sm:px-6 py-4 sm:py-5 grid md:grid-cols-2 gap-4 overflow-y-auto flex-1">
                {!isRestocking && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("purchases.select_existing")}</label>
                    <ProductPicker<Product> onSelect={handleSelectExisting} placeholder={`— ${t("common.search")} —`} />
                  </div>
                )}
                {isRestocking && selectedProduct && (
                  <div className="md:col-span-2 bg-[#EBF2FD] rounded-lg px-3 py-2 text-xs text-[#0a66c2]">
                    {t("purchases.restock")}: <span className="font-semibold">{selectedProduct.name}</span>
                    {" "}· {t("items.col_qty")}: <span className="font-bold">{selectedProduct.quantity}</span>
                  </div>
                )}
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t("purchases.product_name")} {!isRestocking && <span className="text-red-400">*</span>}
                  </label>
                  <input className={inputCls} placeholder={t("purchases.placeholder_product_name")}
                    value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                    disabled={isRestocking} />
                </div>
                {!isRestocking && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("items.description")}</label>
                    <input className={inputCls} placeholder={t("common.optional")}
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
                    {t("purchases.margin_label")}: <span className={`font-bold ${Number(margin) >= 0 ? "text-green-600" : "text-red-500"}`}>{Number(margin) >= 0 ? "+" : ""}{margin}%</span>
                    {" · "}{t("purchases.unit_profit_label")}: <span className="font-bold text-slate-700">{(Number(form.selling_price) - Number(form.cost_price)).toLocaleString()}</span>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {isRestocking ? t("purchases.qty_added") : t("items.quantity")} <span className="text-red-400">*</span>
                  </label>
                  <input type="number" min="1" className={inputCls} placeholder="0"
                    value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                  {isRestocking && selectedProduct && form.quantity && (
                    <p className="text-xs mt-1 text-[#0a66c2]">
                      {selectedProduct.quantity} + {form.quantity} = <span className="font-bold">{selectedProduct.quantity + Number(form.quantity)}</span>
                    </p>
                  )}
                </div>
                {!isCar && <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("items.supplier")}</label>
                  <select className={inputCls} value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                    <option value="">{t("items.no_supplier")}</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {suppliers.length === 0 && (
                    <p className="text-xs text-[#0a66c2] mt-1">
                      <Link href="/PartnerManagement" className="hover:underline">{t("purchases.add_supplier_link")}</Link>
                    </p>
                  )}
                </div>}
              </div>
              <div className="flex justify-end gap-2.5 px-4 sm:px-6 py-4 border-t border-slate-100 shrink-0">
                <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setIsRestocking(false); }}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">
                  {t("common.cancel")}
                </button>
                <button onClick={submitForm} disabled={submitting}
                  className="px-5 py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-60 hover:opacity-90" style={{ background: "#0a66c2" }}>
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

function PurchasesSkeleton() {
  return (
    <div className="min-h-screen">
      <style>{`@keyframes pur-sh{0%{background-position:-200% 0}100%{background-position:200% 0}}.pur-sh{background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:pur-sh 1.4s infinite;border-radius:5px}.pur-sh-w{background:linear-gradient(90deg,rgba(255,255,255,.1) 25%,rgba(255,255,255,.22) 50%,rgba(255,255,255,.1) 75%);background-size:200% 100%;animation:pur-sh 1.4s infinite;border-radius:5px}`}</style>
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4">
        <div className="hgv-surface relative rounded-2xl mb-2 overflow-hidden" style={{background:"linear-gradient(135deg,#0a66c2 0%,#004182 50%,#00376b 100%)"}}>
          <div className="relative flex items-center gap-3 px-4 pt-3 pb-2">
            <div className="w-8 h-8 rounded-xl pur-sh-w shrink-0" />
            <div><div className="pur-sh-w h-2 w-14 mb-1 rounded" /><div className="pur-sh-w h-4 w-32 rounded" /></div>
            <div className="hidden sm:flex gap-1 ml-2">{[72,72].map((_,i)=><div key={i} className="pur-sh-w h-7 w-20 rounded-lg" />)}</div>
            <div className="ml-auto flex gap-1.5"><div className="pur-sh-w w-7 h-7 rounded-lg" /><div className="pur-sh-w h-7 w-24 rounded-lg" /></div>
          </div>
          <div className="px-4 pb-2 flex gap-1.5"><div className="pur-sh-w h-2 w-4 rounded-full" /><div className="pur-sh-w h-2 w-40 rounded" /></div>
          <div className="px-4 pb-3 flex gap-2"><div className="pur-sh-w flex-1 h-9 rounded-xl" /><div className="pur-sh-w h-9 w-28 rounded-xl" /></div>
        </div>
        <div className="pur-sh h-7 rounded-lg mb-2" />
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-2">
          {Array.from({length:6}).map((_,i)=>(
            <div key={i} className="bg-white rounded-lg border border-slate-200 px-2.5 py-2">
              <div className="pur-sh h-2 w-14 mb-2 rounded" /><div className="pur-sh h-6 w-10 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <div className="pur-sh h-2.5 w-28 rounded" />
            <div className="flex gap-1.5">{[56,52,50,46].map((w,i)=><div key={i} className="pur-sh h-5 rounded" style={{width:w}} />)}</div>
          </div>
          <div className="flex gap-3 px-3 py-2 bg-slate-50 border-b border-slate-200">
            {[120,80,70,70,55,50,60,64].map((w,i)=><div key={i} className="pur-sh h-2 rounded" style={{width:w}} />)}
          </div>
          {Array.from({length:7}).map((_,i)=>(
            <div key={i} className="flex items-center gap-3 px-3 border-b border-slate-50" style={{padding:"6px 12px"}}>
              <div><div className="pur-sh h-2.5 w-24 rounded mb-1" /><div className="pur-sh h-2 w-14 rounded" /></div>
              {[72,56,56,48,52,64,60].map((w,j)=><div key={j} className="pur-sh h-2.5 rounded shrink-0" style={{width:w}} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
