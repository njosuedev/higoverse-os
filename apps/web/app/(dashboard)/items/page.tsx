"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { itemRequest } from "@/lib/product-api";
import { partnerRequest } from "@/lib/supplier-api";
import { useDebounce } from "@/lib/hooks";
import { useLanguage } from "@/lib/language-context";
import Pagination from "@/app/components/ui/Pagination";
import {
  Package, AlertCircle, Search, Filter, Plus, Trash2, Pencil, X,
  Boxes, DollarSign, TrendingUp, TrendingDown, ShoppingBag, RefreshCw, BarChart3, ChevronDown,
  FileSpreadsheet, FileText, Upload, Download, CheckCircle, XCircle,
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
  created_at?: string;
}

interface Supplier { id: string; name: string; phone?: string; address?: string; }
type ModalMode = "create" | "edit";

const EMPTY_FORM = {
  name: "", description: "", cost_price: "", selling_price: "", quantity: "", supplier_id: "",
};

const PAGE_SIZES = [25, 50, 100, 250];

export default function ItemManagementPage() {
  const { t } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(30);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadDataRef = useRef<(soft?: boolean) => Promise<void>>(async () => {});

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  const [importLoading, setImportLoading] = useState(false);
  const [importResults, setImportResults] = useState<{
    success: number;
    failed: { row: number; name: string; reason: string }[];
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useDebounce(search, 350);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { loadDataRef.current = loadData; });
  useEffect(() => {
    countdownRef.current = setInterval(() => setCountdown((c) => (c <= 1 ? 30 : c - 1)), 1000);
    refreshRef.current = setInterval(() => { loadDataRef.current(true); setCountdown(30); }, 30_000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, []);

  function manualRefresh() {
    loadData(true); setCountdown(30);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (refreshRef.current) clearInterval(refreshRef.current);
    countdownRef.current = setInterval(() => setCountdown((c) => (c <= 1 ? 30 : c - 1)), 1000);
    refreshRef.current = setInterval(() => { loadDataRef.current(true); setCountdown(30); }, 30_000);
  }

  async function loadData(soft = false) {
    try {
      if (!soft) setLoading(true); else setRefreshing(true);
      const [productsRes, suppliersRes] = await Promise.all([
        itemRequest("/products?limit=1000"),
        partnerRequest("/suppliers"),
      ]);
      setProducts([...(productsRes?.data?.items || [])].reverse());
      const allPartners: Supplier[] = suppliersRes?.data?.items || suppliersRes?.data || [];
      setSuppliers(allPartners.filter((p) => p.address?.startsWith("TIN:")));
      setLastUpdated(new Date());
      setLoadError(false);
    } catch (err) {
      // Already surfaced to the user via the banner below — console.warn
      // (not .error) so it doesn't retrigger Next's dev-overlay redbox.
      console.warn(err);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function openCreateModal() {
    setForm(EMPTY_FORM); setEditingId(null); setModalMode("create");
    setShowModal(true);
  }

  function openEditModal(p: Product) {
    setForm({
      name: p.name, description: p.description || "",
      cost_price: String(p.cost_price), selling_price: String(p.selling_price),
      quantity: String(p.quantity), supplier_id: p.supplier_id || "",
    });
    setEditingId(p.id); setModalMode("edit"); setShowModal(true);
  }

  function closeModal() {
    setShowModal(false); setForm(EMPTY_FORM); setEditingId(null);
  }

  async function submitForm() {
    if (!form.name.trim() || !form.cost_price || !form.selling_price || !form.quantity) {
      alert(t("items.validation_required")); return;
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
      console.error(err); alert(modalMode === "edit" ? t("items.update_failed") : t("items.add_failed"));
    } finally { setSubmitting(false); }
  }

  async function deleteProduct(id: string) {
    if (!confirm(t("items.confirm_delete"))) return;
    try {
      setDeletingId(id);
      await itemRequest(`/products/${id}`, { method: "DELETE" });
      await loadData(true);
    } catch (err) { console.error(err); alert(t("items.delete_failed")); }
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

  function buildExportRows() {
    return filtered.map((p, i) => {
      const supplier = p.supplier_id ? supplierMap[p.supplier_id] : null;
      const cost = Number(p.cost_price || 0);
      const sell = Number(p.selling_price || 0);
      const margin = cost > 0 ? ((sell - cost) / cost) * 100 : 0;
      const totalProfit = (sell - cost) * (p.quantity || 0);
      const status = p.quantity === 0 ? "Out of Stock" : p.quantity <= 10 ? "Low Stock" : "In Stock";
      return {
        "#": i + 1,
        "Product Name": p.name,
        "Description": p.description || "",
        "Supplier": supplier?.name || "",
        "Cost Price": cost,
        "Selling Price": sell,
        "Margin (%)": parseFloat(margin.toFixed(2)),
        "Quantity": p.quantity,
        "Status": status,
        "Unit Profit": parseFloat((sell - cost).toFixed(2)),
        "Total Profit": parseFloat(totalProfit.toFixed(2)),
        "Date Added": p.created_at ? new Date(p.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "",
      };
    });
  }

  function exportExcel() {
    import("xlsx").then(({ utils, writeFile }) => {
      const rows = buildExportRows();
      const ws = utils.json_to_sheet(rows);
      ws["!cols"] = [4, 28, 24, 20, 14, 14, 12, 10, 14, 14, 14, 22].map((w) => ({ wch: w }));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Inventory");
      writeFile(wb, `inventory_${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  }

  async function exportPDF() {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const rows = buildExportRows();

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Inventory Report", 40, 40);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(`Exported on ${new Date().toLocaleString()} · ${rows.length} items`, 40, 56);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 68,
      head: [["#", "Product", "Supplier", "Cost", "Sell", "Margin%", "Qty", "Status", "Unit Profit", "Total Profit", "Date Added"]],
      body: rows.map((r) => [
        r["#"], r["Product Name"], r["Supplier"],
        r["Cost Price"].toLocaleString(), r["Selling Price"].toLocaleString(),
        `${r["Margin (%)"] >= 0 ? "+" : ""}${r["Margin (%)"]}%`,
        r["Quantity"], r["Status"],
        r["Unit Profit"].toLocaleString(), r["Total Profit"].toLocaleString(),
        r["Date Added"],
      ]),
      styles: { fontSize: 7, cellPadding: 4 },
      headStyles: { fillColor: [19, 114, 230], textColor: 255, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: {
        0: { cellWidth: 20, halign: "center" },
        3: { halign: "right" }, 4: { halign: "right" },
        5: { halign: "right" }, 6: { halign: "center" },
        8: { halign: "right" }, 9: { halign: "right" },
        10: { cellWidth: 54 },
      },
    });

    doc.save(`inventory_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  function downloadTemplate() {
    import("xlsx").then(({ utils, writeFile }) => {
      const ws = utils.aoa_to_sheet([["Name *", "Description", "Cost Price *", "Selling Price *", "Quantity *", "Supplier Name"]]);
      ws["!cols"] = [22, 26, 14, 16, 12, 22].map((w) => ({ wch: w }));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Products");
      writeFile(wb, "products_import_template.xlsx");
    });
  }

  async function handleImport(file: File) {
    if (!file) return;
    setImportLoading(true);
    setImportResults(null);
    try {
      const { read, utils } = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = read(buffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][];

      if (rows.length < 2) { alert(t("items.import_no_rows")); return; }

      const supplierByName: Record<string, string> = {};
      suppliers.forEach((s) => { supplierByName[s.name.toLowerCase()] = s.id; });

      const dataRows = rows.slice(1).filter((r) => (r as unknown[]).some(Boolean));

      const results = await Promise.allSettled(
        dataRows.map(async (row, i) => {
          const [name, description, costPrice, sellingPrice, quantity, supplierName] = row as unknown[];
          const rowNum = i + 2;
          const nameStr = typeof name === "string" ? name.trim() : String(name ?? "").trim();
          if (!nameStr) throw Object.assign(new Error(t("items.err_name_required")), { rowNum, nameStr: nameStr || "(empty)" });
          if (costPrice == null || costPrice === "") throw Object.assign(new Error(t("items.err_cost_required")), { rowNum, nameStr });
          if (sellingPrice == null || sellingPrice === "") throw Object.assign(new Error(t("items.err_selling_required")), { rowNum, nameStr });
          if (quantity == null || quantity === "") throw Object.assign(new Error(t("items.err_qty_required")), { rowNum, nameStr });

          const payload = {
            name: nameStr,
            description: description ? String(description).trim() || null : null,
            cost_price: Number(costPrice),
            selling_price: Number(sellingPrice),
            quantity: Number(quantity),
            supplier_id: supplierName ? (supplierByName[String(supplierName).toLowerCase()] ?? null) : null,
          };
          await itemRequest("/products", { method: "POST", body: JSON.stringify(payload) });
          return nameStr;
        })
      );

      const failed: { row: number; name: string; reason: string }[] = [];
      let success = 0;
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          success++;
        } else {
          const err = r.reason as Error & { rowNum?: number; nameStr?: string };
          failed.push({ row: err.rowNum ?? i + 2, name: err.nameStr ?? `Row ${i + 2}`, reason: err.message });
        }
      });

      setImportResults({ success, failed });
      if (success > 0) await loadData(true);
    } catch (err) {
      console.error(err);
      alert(t("items.import_parse_failed"));
    } finally {
      setImportLoading(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  const inputCls =
    "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition";

  if (loading) return <ItemsSkeleton />;

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4">

        {/* HEADER BANNER */}
        <div
          className="relative rounded-2xl mb-2 overflow-hidden"
          style={{ background: "linear-gradient(135deg, #1372e6 0%, #1168d6 50%, #0a47a0 100%)" }}
        >
          {/* Dot-grid texture */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }} />

          {/* ── Row 1: title · stat chips · actions ── */}
          <div className="relative flex items-center gap-3 px-4 pt-3 pb-2">

            {/* Title */}
            <div className="flex items-center gap-2.5 min-w-0 mr-auto">
              <div className="w-8 h-8 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                <Package size={15} className="text-white" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest leading-none">{t("nav.inventory")}</p>
                <h1 className="text-base font-extrabold text-white leading-tight tracking-tight">{t("items.title")}</h1>
              </div>
            </div>

            {/* Stat chips — like the reference screenshot */}
            <div className="hidden md:flex items-center gap-2">
              {[
                { label: t("items.in_stock"),  value: stats.inStock,  accent: "text-green-300",  highlight: false },
                { label: t("items.low_stock"),  value: stats.lowStock, accent: "text-amber-300",  highlight: stats.lowStock > 0 },
                { label: t("items.out_stock"),  value: stats.outStock, accent: "text-red-300",    highlight: stats.outStock > 0 },
              ].map((s) => (
                <div
                  key={s.label}
                  className={`flex flex-col items-center px-3 py-1.5 rounded-xl border min-w-[68px] transition-all
                    ${s.highlight
                      ? "bg-white/20 border-white/30"
                      : "bg-white/10 border-white/15"}`}
                >
                  <p className="text-[9px] font-bold text-white/60 uppercase tracking-wider leading-none">{s.label}</p>
                  <p className={`text-lg font-extrabold leading-tight tabular-nums mt-0.5 ${s.accent}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={manualRefresh}
                disabled={refreshing}
                title={t("common.refresh")}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition-all disabled:opacity-40"
              >
                <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              </button>
              <button
                onClick={openCreateModal}
                className="flex items-center gap-1.5 bg-white text-[#1372e6] px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-50 active:scale-95 transition-all shadow-lg shadow-black/20"
              >
                <Plus size={12} strokeWidth={3} /> {t("items.add")}
              </button>
            </div>
          </div>

          {/* ── Row 2: live indicator ── */}
          <div className="relative flex items-center gap-1.5 px-4 pb-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
            </span>
            <p className="text-[10px] text-blue-100/70 flex-1">
              {t("items.live_label")} · <span className="font-semibold text-white/80">{products.length.toLocaleString()} {t("items.count_suffix")}</span>
              {lastUpdated && <span className="ml-1 text-blue-200/50">· {t("common.updated")} {lastUpdated.toLocaleTimeString()}</span>}
            </p>
            <span className="text-[10px] text-blue-200/50">↻ {countdown}s</span>
          </div>

          {/* ── Row 3: search + filter ── */}
          <div className="relative flex gap-2 px-4 pb-3">
            {/* Search */}
            <div className="flex-1 flex items-center gap-2 bg-white/10 hover:bg-white/15 focus-within:bg-white/20 border border-white/10 focus-within:border-white/30 rounded-xl px-3 py-2 transition-all group shadow-inner">
              <Search size={13} className="shrink-0 text-white/40 group-focus-within:text-white/80 transition-colors" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder={t("items.search")}
                className="bg-transparent outline-none w-full text-sm text-white placeholder:text-white/35 font-medium"
              />
              {search ? (
                <button
                  onClick={() => setSearch("")}
                  className="w-4 h-4 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center text-white/70 hover:text-white transition-all shrink-0"
                >
                  <X size={9} />
                </button>
              ) : (
                <kbd className="hidden sm:flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/8 text-white/30 border border-white/12 shrink-0 select-none">
                  ⌘K
                </kbd>
              )}
            </div>

            {/* Filter */}
            <div className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl px-2.5 py-2 transition-all">
              <Filter size={11} className="shrink-0 text-white/50" />
              <select
                value={filter}
                onChange={(e) => { setFilter(e.target.value); setPage(1); }}
                className="bg-transparent outline-none text-xs text-white font-semibold appearance-none cursor-pointer"
              >
                <option value="all" className="text-gray-800">{t("items.all")}</option>
                <option value="in_stock" className="text-gray-800">{t("items.in_stock")}</option>
                <option value="low_stock" className="text-gray-800">{t("items.low_stock")}</option>
                <option value="out_stock" className="text-gray-800">{t("items.out_stock")}</option>
              </select>
              <ChevronDown size={10} className="text-white/35 shrink-0" />
            </div>
          </div>
        </div>

        {/* LOAD ERROR BANNER */}
        {loadError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 mb-2">
            <AlertCircle size={11} className="text-red-500 shrink-0" />
            <p className="text-[10px] text-red-700 flex-1 min-w-0">
              {t("items.load_error")}
            </p>
            <button
              onClick={manualRefresh}
              className="text-[10px] font-bold text-red-700 bg-red-100 hover:bg-red-200 px-2 py-0.5 rounded-md shrink-0 transition"
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        {/* LOW STOCK ALERT */}
        {alertItems.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-2">
            <AlertCircle size={11} className="text-amber-500 shrink-0" />
            <p className="text-[10px] text-amber-700 flex-1 min-w-0 truncate">
              <span className="font-bold">{alertItems.length}</span> {t("items.restock_alert")} —{" "}
              <span className="text-amber-600">{alertItems.slice(0, 3).map((i) => i.name).join(", ")}{alertItems.length > 3 ? ` +${alertItems.length - 3} ${t("items.more")}` : ""}</span>
            </p>
            <Link href="/PurchaseManagement"
              className="text-[10px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded-md shrink-0 transition">
              {t("items.purchase_short")}
            </Link>
          </div>
        )}

        {/* STAT CARDS */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-2">
          {[
            { label: t("items.total"),       value: stats.total,                            color: "text-[#1372e6]", dot: "bg-[#1372e6]" },
            { label: t("items.in_stock"),    value: stats.inStock,                          color: "text-green-600", dot: "bg-green-500" },
            { label: t("items.low_stock"),   value: stats.lowStock,                         color: "text-amber-500", dot: "bg-amber-400" },
            { label: t("items.out_stock"),   value: stats.outStock,                         color: "text-red-600",   dot: "bg-red-500"   },
            { label: t("items.stock_value"), value: stats.stockValue.toLocaleString(),      color: "text-slate-700", dot: "bg-slate-400" },
            { label: t("items.pot_profit"),  value: stats.potentialProfit.toLocaleString(), color: "text-green-700", dot: "bg-green-600" },
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

        {/* hidden import file input */}
        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); }}
        />

        {/* TABLE */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Table toolbar */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 bg-slate-50/60">
            <p className="text-[10px] text-slate-500">
              {t("common.showing")}{" "}
              <span className="font-semibold text-slate-700">{paginated.length.toLocaleString()}</span>{" "}
              {t("common.of")}{" "}
              <span className="font-semibold text-slate-700">{filtered.length.toLocaleString()}</span>{" "}
              {t("items.count_suffix")}
              {debouncedSearch && (
                <> {t("common.for")} &ldquo;<span className="font-semibold text-[#1372e6]">{debouncedSearch}</span>&rdquo;</>
              )}
            </p>
            <div className="flex items-center gap-2">
              {(debouncedSearch || filter !== "all") && (
                <button
                  onClick={() => { setSearch(""); setFilter("all"); setPage(1); }}
                  className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition"
                >
                  <X size={10} /> {t("common.clear_filters")}
                </button>
              )}
              {/* Divider */}
              {(debouncedSearch || filter !== "all") && <span className="w-px h-3 bg-slate-200" />}
              {/* Import buttons */}
              <button
                onClick={downloadTemplate}
                title={t("common.download_template")}
                className="flex items-center gap-1 text-[10px] font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-2 py-0.5 rounded transition"
              >
                <Download size={11} /> {t("common.template")}
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                disabled={importLoading}
                title={t("items.import_title_hint")}
                className="flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded transition disabled:opacity-50"
              >
                {importLoading ? <RefreshCw size={11} className="animate-spin" /> : <Upload size={11} />}
                {importLoading ? t("common.importing") : t("common.import")}
              </button>
              <span className="w-px h-3 bg-slate-200" />
              {/* Export buttons */}
              <button
                onClick={exportExcel}
                title={t("common.export_excel_hint")}
                className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded transition"
              >
                <FileSpreadsheet size={11} /> Excel
              </button>
              <button
                onClick={exportPDF}
                title={t("common.export_pdf_hint")}
                className="flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-2 py-0.5 rounded transition"
              >
                <FileText size={11} /> PDF
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="w-8 px-3 py-2 text-left text-[10px] font-semibold text-slate-400">#</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("items.col_product")}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("items.col_supplier")}</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("items.col_cost")}</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("items.col_selling")}</th>
                  <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("items.col_margin")}</th>
                  <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("items.col_qty")}</th>
                  <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("common.status")}</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("items.col_unit_profit")}</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("items.col_total_profit")}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("items.col_added")}</th>
                  <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((p, idx) => {
                  const supplier    = supplierMap[p.supplier_id ?? ""];
                  const totalProfit = Number(p.profit_money || 0) * Number(p.quantity || 0);
                  const isProfit    = p.profit_status === "profit";
                  const margin      = p.cost_price > 0 ? ((p.selling_price - p.cost_price) / p.cost_price) * 100 : 0;
                  const needsRestock = p.quantity <= 10;
                  const isOutOfStock = p.quantity === 0;
                  const restockUrl  = `/PurchaseManagement?name=${encodeURIComponent(p.name)}&cost=${p.cost_price}&selling=${p.selling_price}&supplierId=${p.supplier_id || ""}`;
                  const rowNum      = (page - 1) * pageSize + idx + 1;

                  return (
                    <tr
                      key={p.id}
                      className={`group border-b border-slate-50 transition-colors last:border-0
                        ${isOutOfStock ? "bg-red-50/30" : needsRestock ? "bg-amber-50/20" : "hover:bg-slate-50/70"}`}
                    >
                      {/* Row number */}
                      <td className="px-3 py-1.5 text-[10px] text-slate-300 tabular-nums">{rowNum}</td>

                      {/* Product */}
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <Package size={12} className="text-slate-300" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-semibold text-slate-800 text-xs leading-tight">{p.name}</p>
                            </div>
                            {p.description && (
                              <p className="text-[10px] text-slate-400 max-w-[160px] truncate">{p.description}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Supplier */}
                      <td className="px-3 py-1.5">
                        {supplier
                          ? <p className="text-xs font-medium text-slate-600 leading-tight">{supplier.name}</p>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>

                      {/* Cost price */}
                      <td className="px-3 py-1.5 text-right">
                        <span className="text-xs font-medium text-slate-600 tabular-nums">
                          {Number(p.cost_price || 0).toLocaleString()}
                        </span>
                      </td>

                      {/* Selling price */}
                      <td className="px-3 py-1.5 text-right">
                        <span className="text-xs font-semibold text-slate-800 tabular-nums">
                          {Number(p.selling_price || 0).toLocaleString()}
                        </span>
                      </td>

                      {/* Margin */}
                      <td className="px-3 py-1.5 text-center">
                        <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums
                          ${margin >= 20 ? "bg-green-100 text-green-700"
                          : margin >= 0  ? "bg-blue-50 text-[#1372e6]"
                          :               "bg-red-100 text-red-600"}`}>
                          {margin >= 0 ? "+" : ""}{margin.toFixed(1)}%
                        </span>
                      </td>

                      {/* Quantity */}
                      <td className="px-3 py-1.5 text-center">
                        <span className={`inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums
                          ${isOutOfStock  ? "bg-red-100 text-red-700"
                          : needsRestock  ? "bg-amber-100 text-amber-700"
                          :                "bg-green-100 text-green-700"}`}>
                          {p.quantity}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-1.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold
                          ${isProfit ? "bg-green-50 text-green-700 border border-green-200"
                          :           "bg-red-50 text-red-600 border border-red-200"}`}>
                          {isProfit
                            ? <TrendingUp size={9} strokeWidth={2.5} />
                            : <TrendingDown size={9} strokeWidth={2.5} />}
                          {isProfit ? t("dash.profit_label") : t("common.loss")}
                        </span>
                      </td>

                      {/* Unit profit */}
                      <td className="px-3 py-1.5 text-right">
                        <span className={`text-xs font-semibold tabular-nums ${isProfit ? "text-green-600" : "text-red-500"}`}>
                          {isProfit ? "+" : ""}{Number(p.profit_money || 0).toLocaleString()}
                        </span>
                      </td>

                      {/* Total profit */}
                      <td className="px-3 py-1.5 text-right">
                        <span className={`text-xs font-bold tabular-nums ${isProfit ? "text-green-600" : "text-red-500"}`}>
                          {isProfit ? "+" : ""}{totalProfit.toLocaleString()}
                        </span>
                      </td>

                      {/* Date added */}
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {p.created_at ? (
                          <div>
                            <p className="text-[10px] font-medium text-slate-600">
                              {new Date(p.created_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                            </p>
                            <p className="text-[9px] text-slate-400">
                              {new Date(p.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                          {needsRestock && (
                            <Link href={restockUrl} title={t("purchases.restock")}
                              className="p-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-600 transition">
                              <RefreshCw size={11} />
                            </Link>
                          )}
                          <button onClick={() => openEditModal(p)} title={t("common.edit")}
                            className="p-1 rounded bg-[#EBF2FD] hover:bg-[#D5E8FB] text-[#1372e6] transition">
                            <Pencil size={11} />
                          </button>
                          <button onClick={() => deleteProduct(p.id)} disabled={deletingId === p.id} title={t("common.delete")}
                            className="p-1 rounded bg-red-50 hover:bg-red-100 text-red-500 transition disabled:opacity-40">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {paginated.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <Package size={28} className="opacity-40" />
              </div>
              <p className="font-semibold text-slate-500 text-sm">{t("items.no_items")}</p>
              <p className="text-xs mt-1.5 text-slate-400">
                {search || filter !== "all" ? t("common.try_adjust_filters") : t("items.add_first")}
              </p>
              {!search && filter === "all" && (
                <button onClick={openCreateModal}
                  className="mt-5 flex items-center gap-1.5 bg-[#1372e6] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition">
                  <Plus size={14} /> {t("items.add")}
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
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col">
              <div className="flex justify-between items-center px-4 sm:px-6 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{modalMode === "edit" ? t("items.edit_title") : t("items.add_title")}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{modalMode === "edit" ? t("common.edit") + " " + t("items.name").toLowerCase() : t("items.add_title")}</p>
                </div>
                <button onClick={closeModal} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={17} /></button>
              </div>
              <div className="px-4 sm:px-6 py-4 sm:py-5 grid md:grid-cols-2 gap-4 overflow-y-auto flex-1">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("items.name")} <span className="text-red-400">*</span></label>
                  <input className={inputCls} placeholder={t("items.name_placeholder")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("items.description")}</label>
                  <input className={inputCls} placeholder={t("items.description_placeholder")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("items.cost_price")} <span className="text-red-400">*</span></label>
                  <input type="number" min="0" className={inputCls} placeholder="0" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("items.selling_price")} <span className="text-red-400">*</span></label>
                  <input type="number" min="0" className={inputCls} placeholder="0" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} />
                </div>
                {form.cost_price && form.selling_price && (
                  <div className="md:col-span-2 bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500">
                    {t("items.margin_label")}: <span className={`font-bold ${Number(form.selling_price) >= Number(form.cost_price) ? "text-green-600" : "text-red-500"}`}>
                      {Number(form.cost_price) > 0 ? (((Number(form.selling_price) - Number(form.cost_price)) / Number(form.cost_price)) * 100).toFixed(1) : 0}%
                    </span>{" · "}{t("items.col_unit_profit")}: <span className="font-bold text-slate-700">{(Number(form.selling_price) - Number(form.cost_price)).toLocaleString()}</span>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("items.quantity")} <span className="text-red-400">*</span></label>
                  <input type="number" min="0" className={inputCls} placeholder="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("items.supplier")}</label>
                  <select className={inputCls} value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                    <option value="">{t("items.no_supplier")}</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

              </div>
              <div className="flex justify-end gap-2.5 px-4 sm:px-6 py-4 border-t border-slate-100 shrink-0">
                <button onClick={closeModal} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">{t("common.cancel")}</button><button onClick={submitForm} disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-[#1372e6] text-white text-sm font-semibold hover:bg-[#1372e6] transition disabled:opacity-60">
                  {submitting ? (modalMode === "edit" ? t("common.saving") : t("common.adding")) : (modalMode === "edit" ? t("common.save") : t("items.add"))}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* IMPORT RESULTS MODAL */}
      {importResults && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-slate-800">{t("items.import_results")}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {importResults.success} {t("items.added_successfully")} · {importResults.failed.length} {t("common.failed")}
                </p>
              </div>
              <button onClick={() => setImportResults(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition">
                <X size={17} />
              </button>
            </div>

            <div className="px-5 py-4 overflow-y-auto flex-1 space-y-3">
              {importResults.success > 0 && (
                <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                  <CheckCircle size={16} className="text-green-500 shrink-0" />
                  <p className="text-sm font-semibold text-green-700">
                    {importResults.success} {t("items.import_success")}
                  </p>
                </div>
              )}

              {importResults.failed.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle size={14} className="text-red-500 shrink-0" />
                    <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">
                      {importResults.failed.length} {t("items.rows_failed")}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {importResults.failed.map((f) => (
                      <div key={`${f.row}-${f.name}`} className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                        <span className="text-[10px] font-bold text-red-400 tabular-nums mt-0.5 shrink-0">{t("common.row")} {f.row}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-700 truncate">{f.name}</p>
                          <p className="text-[10px] text-red-500">{f.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {importResults.success === 0 && importResults.failed.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">{t("items.no_rows_processed")}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 shrink-0">
              {importResults.failed.length > 0 && (
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-50 transition"
                >
                  {t("items.reimport")}
                </button>
              )}
              <button
                onClick={() => setImportResults(null)}
                className="px-4 py-1.5 rounded-lg bg-[#1372e6] text-white text-xs font-semibold hover:opacity-90 transition"
              >
                {t("common.done")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemsSkeleton() {
  return (
    <div className="min-h-screen">
      <style>{`@keyframes itm-sh{0%{background-position:-200% 0}100%{background-position:200% 0}}.itm-sh{background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:itm-sh 1.4s infinite;border-radius:5px}.itm-sh-w{background:linear-gradient(90deg,rgba(255,255,255,.1) 25%,rgba(255,255,255,.22) 50%,rgba(255,255,255,.1) 75%);background-size:200% 100%;animation:itm-sh 1.4s infinite;border-radius:5px}`}</style>
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4">
        <div className="relative rounded-2xl mb-2 overflow-hidden" style={{background:"linear-gradient(135deg,#1372e6 0%,#1168d6 50%,#0a47a0 100%)"}}>
          <div className="relative flex items-center gap-3 px-4 pt-3 pb-2">
            <div className="w-8 h-8 rounded-xl itm-sh-w shrink-0" />
            <div><div className="itm-sh-w h-2 w-14 mb-1 rounded" /><div className="itm-sh-w h-4 w-28 rounded" /></div>
            <div className="hidden md:flex items-center gap-2 ml-auto">
              {[68,68,68].map((_,i)=><div key={i} className="itm-sh-w rounded-xl" style={{width:68,height:44}} />)}
            </div>
            <div className="ml-auto md:ml-0 flex gap-1.5"><div className="itm-sh-w w-7 h-7 rounded-lg" /><div className="itm-sh-w h-7 w-20 rounded-lg" /></div>
          </div>
          <div className="px-4 pb-2 flex gap-1.5"><div className="itm-sh-w h-2 w-4 rounded-full" /><div className="itm-sh-w h-2 w-40 rounded" /></div>
          <div className="px-4 pb-3 flex gap-2"><div className="itm-sh-w flex-1 h-9 rounded-xl" /><div className="itm-sh-w h-9 w-28 rounded-xl" /></div>
        </div>
        <div className="itm-sh h-7 rounded-lg mb-2" />
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-2">
          {Array.from({length:6}).map((_,i)=>(
            <div key={i} className="bg-white rounded-lg border border-slate-200 px-2.5 py-2">
              <div className="itm-sh h-2 w-14 mb-2 rounded" /><div className="itm-sh h-6 w-10 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <div className="itm-sh h-2.5 w-28 rounded" />
            <div className="flex gap-1.5">{[56,52,50,46].map((w,i)=><div key={i} className="itm-sh h-5 rounded" style={{width:w}} />)}</div>
          </div>
          <div className="flex gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
            {[16,100,70,55,65,50,44,64,72,72,64,44].map((w,i)=><div key={i} className="itm-sh h-2 rounded" style={{width:w}} />)}
          </div>
          {Array.from({length:8}).map((_,i)=>(
            <div key={i} className="flex items-center gap-2 px-3 border-b border-slate-50" style={{padding:"6px 12px"}}>
              <div className="itm-sh h-2 w-4 rounded" />
              <div className="flex items-center gap-2 w-28 shrink-0">
                <div className="itm-sh w-8 h-8 rounded-lg shrink-0" />
                <div><div className="itm-sh h-2.5 w-16 rounded mb-1" /><div className="itm-sh h-2 w-10 rounded" /></div>
              </div>
              {[52,40,44,48,40,52,60,52,52,50,48].map((w,j)=><div key={j} className="itm-sh h-2.5 rounded shrink-0" style={{width:w}} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
