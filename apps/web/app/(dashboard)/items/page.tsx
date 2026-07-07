"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { itemRequest } from "@/lib/product-api";
import { partnerRequest } from "@/lib/supplier-api";
import { useDebounce } from "@/lib/hooks";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { useShop } from "@/lib/shop-context";
import { updateMyShop } from "@/lib/shop-api";
import Pagination from "@/app/components/ui/Pagination";
import dynamic from "next/dynamic";
import {
  Package, AlertCircle, Search, Filter, Plus, Trash2, Pencil, X,
  Boxes, DollarSign, TrendingUp, TrendingDown, ShoppingBag, RefreshCw, BarChart3, ChevronDown,
  FileSpreadsheet, FileText, Upload, Download, CheckCircle, XCircle,
  ImagePlus, Store, Globe, Eye, MapPin,
} from "lucide-react";

const HigoMapPicker = dynamic(() => import("@/app/components/ui/HigoMapPicker"), { ssr: false });
import {
  getProductMeta, setProductMeta, deleteProductMeta, compressImage,
  upsertCatalogEntry, removeCatalogEntry, type ProductMeta,
  type ShopCatalogEntry, encodeDescriptionWithCatalog, catFromText,
} from "@/lib/product-meta";

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
  category?: string;
  images?: string;    // JSON-encoded string[] saved in DB
  listed?: boolean;
}

interface Supplier { id: string; name: string; phone?: string; address?: string; }
type ModalMode = "create" | "edit";

const EMPTY_FORM = {
  name: "", description: "", cost_price: "", selling_price: "", quantity: "", supplier_id: "",
};

const MAX_IMAGES = 5;

const PAGE_SIZES = [25, 50, 100, 250];

export default function ItemManagementPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { shop } = useShop();
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

  // product images & marketplace meta (stored in localStorage, separate from API payload)
  const [formImages, setFormImages]     = useState<string[]>([]);
  const [formListed, setFormListed]     = useState(false);
  const [formCategory, setFormCategory] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // local cache: productId → meta (loaded once on mount)
  const [productMeta, setProductMetaCache] = useState<Record<string, ProductMeta>>({});

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

  // keep local meta cache in sync whenever products list changes
  useEffect(() => {
    if (products.length === 0) return;
    const cache: Record<string, ProductMeta> = {};
    products.forEach((p) => { cache[p.id] = getProductMeta(p.id); });
    setProductMetaCache(cache);
  }, [products]);

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
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function openCreateModal() {
    setForm(EMPTY_FORM); setEditingId(null); setModalMode("create");
    setFormImages([]); setFormListed(false); setFormCategory(""); setFormLocation("");
    setShowModal(true);
  }

  function openEditModal(p: Product) {
    setForm({
      name: p.name, description: p.description || "",
      cost_price: String(p.cost_price), selling_price: String(p.selling_price),
      quantity: String(p.quantity), supplier_id: p.supplier_id || "",
    });
    const meta = getProductMeta(p.id);
    // Prefer DB data; fall back to localStorage meta
    const rawDbImgs = p.images;
    const dbImages: string[] = rawDbImgs ? (() => { try { return JSON.parse(rawDbImgs) as string[]; } catch { return []; } })() : [];
    setFormImages(dbImages.length > 0 ? dbImages : meta.images);
    setFormListed(p.listed !== undefined ? p.listed : meta.listed);
    setFormCategory(p.category || (meta as ProductMeta & { category?: string }).category || "");
    setFormLocation(meta.location || "");
    setEditingId(p.id); setModalMode("edit"); setShowModal(true);
  }

  function closeModal() {
    setShowModal(false); setForm(EMPTY_FORM); setEditingId(null);
    setFormImages([]); setFormListed(false); setFormCategory(""); setFormLocation("");
  }

  async function submitForm() {
    if (!form.name.trim() || !form.cost_price || !form.selling_price || !form.quantity) {
      alert("Name, cost price, selling price and quantity are required."); return;
    }
    if (formListed && formImages.length < 3) {
      alert("You need at least 3 product images to share on Marketplace."); return;
    }
    if (formListed && !formCategory) {
      alert("Please select a category to share this product on Marketplace."); return;
    }
    const payload = {
      name: form.name.trim(), description: form.description.trim() || null,
      cost_price: Number(form.cost_price), selling_price: Number(form.selling_price),
      quantity: Number(form.quantity), supplier_id: form.supplier_id || null,
      category: formCategory || null,
      images: formImages.length > 0 ? JSON.stringify(formImages) : null,
      listed: formListed,
    };
    try {
      setSubmitting(true);
      if (modalMode === "edit" && editingId) {
        await itemRequest(`/products/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
        setProductMeta(editingId, { images: formImages, listed: formListed, category: formCategory, location: formLocation || undefined });
        setProductMetaCache((prev) => ({ ...prev, [editingId]: { images: formImages, listed: formListed, category: formCategory, location: formLocation || undefined } }));
        syncCatalog(editingId, payload, formImages, formListed, formCategory, formLocation);
      } else {
        const res = await itemRequest("/products", { method: "POST", body: JSON.stringify(payload) });
        const newId: string | undefined = res?.data?.id;
        if (newId) {
          setProductMeta(newId, { images: formImages, listed: formListed, category: formCategory, location: formLocation || undefined });
          setProductMetaCache((prev) => ({ ...prev, [newId]: { images: formImages, listed: formListed, category: formCategory, location: formLocation || undefined } }));
          syncCatalog(newId, payload, formImages, formListed, formCategory, formLocation);
        }
      }
      closeModal(); await loadData(true);
      syncServerCatalog(); // fire-and-forget: sync server catalog
    } catch (err) {
      console.error(err); alert(`Failed to ${modalMode === "edit" ? "update" : "add"} item.`);
    } finally { setSubmitting(false); }
  }

  async function syncServerCatalog() {
    if (!user?.shop_id) return;
    try {
      const res = await itemRequest("/products?limit=1000");
      const all: Array<{ id: string; name: string; description?: string; selling_price: number; quantity: number }> = res?.data?.items ?? res?.data ?? [];
      const entries: ShopCatalogEntry[] = [];
      for (const p of all) {
        const meta = getProductMeta(p.id);
        if (!meta.listed) continue;
        entries.push({
          pid: p.id,
          n: p.name,
          d: p.description ? p.description.slice(0, 200) : undefined,
          cat: (meta as ProductMeta & { category?: string }).category || catFromText(p.name, p.description),
          price: p.selling_price,
          qty: p.quantity,
          at: new Date().toISOString(),
        });
      }
      await updateMyShop({ description: encodeDescriptionWithCatalog(shop?.description, entries) });
    } catch { /* best-effort — silent */ }
  }

  async function deleteProduct(id: string) {
    if (!confirm("Delete this item? This cannot be undone.")) return;
    try {
      setDeletingId(id);
      await itemRequest(`/products/${id}`, { method: "DELETE" });
      deleteProductMeta(id);
      removeCatalogEntry(id);
      setProductMetaCache((prev) => { const n = { ...prev }; delete n[id]; return n; });
      await loadData(true);
      syncServerCatalog(); // fire-and-forget: sync server catalog
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

      if (rows.length < 2) { alert("No data rows found in the file."); return; }

      const supplierByName: Record<string, string> = {};
      suppliers.forEach((s) => { supplierByName[s.name.toLowerCase()] = s.id; });

      const dataRows = rows.slice(1).filter((r) => (r as unknown[]).some(Boolean));

      const results = await Promise.allSettled(
        dataRows.map(async (row, i) => {
          const [name, description, costPrice, sellingPrice, quantity, supplierName] = row as unknown[];
          const rowNum = i + 2;
          const nameStr = typeof name === "string" ? name.trim() : String(name ?? "").trim();
          if (!nameStr) throw Object.assign(new Error("Name is required"), { rowNum, nameStr: nameStr || "(empty)" });
          if (costPrice == null || costPrice === "") throw Object.assign(new Error("Cost price is required"), { rowNum, nameStr });
          if (sellingPrice == null || sellingPrice === "") throw Object.assign(new Error("Selling price is required"), { rowNum, nameStr });
          if (quantity == null || quantity === "") throw Object.assign(new Error("Quantity is required"), { rowNum, nameStr });

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
      alert("Failed to parse file. Make sure it's a valid .xlsx file.");
    } finally {
      setImportLoading(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  function syncCatalog(
    productId: string,
    payload: { name: string; description?: string | null; cost_price: number; selling_price: number; quantity: number },
    images: string[],
    listed: boolean,
    category: string,
    location?: string,
  ) {
    if (!user) return;
    if (listed) {
      upsertCatalogEntry({
        productId,
        shopId: user.shop_id ?? user.id ?? productId,
        shopName: user.name ?? "My Shop",
        shopLogoUrl: undefined,
        shopPhone: undefined,
        name: payload.name,
        description: payload.description ?? undefined,
        category: category || undefined,
        location: location || undefined,
        sellingPrice: payload.selling_price,
        costPrice: payload.cost_price,
        quantity: payload.quantity,
        images,
        listedAt: new Date().toISOString(),
      });
    } else {
      removeCatalogEntry(productId);
    }
  }

  async function handleImageFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setImageUploading(true);
    try {
      const remaining = MAX_IMAGES - formImages.length;
      const toProcess = Array.from(files).slice(0, remaining);
      const compressed = await Promise.all(toProcess.map((f) => compressImage(f)));
      setFormImages((prev) => [...prev, ...compressed]);
    } catch { /* ignore individual failures */ }
    finally { setImageUploading(false); }
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
                <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest leading-none">Inventory</p>
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
                title="Refresh"
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition-all disabled:opacity-40"
              >
                <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              </button>
              <button
                onClick={openCreateModal}
                className="flex items-center gap-1.5 bg-white text-[#1372e6] px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-50 active:scale-95 transition-all shadow-lg shadow-black/20"
              >
                <Plus size={12} strokeWidth={3} /> Add Item
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
              Live · <span className="font-semibold text-white/80">{products.length.toLocaleString()} items</span>
              {lastUpdated && <span className="ml-1 text-blue-200/50">· Updated {lastUpdated.toLocaleTimeString()}</span>}
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
              Couldn&apos;t load inventory — the product service may be temporarily unavailable.
            </p>
            <button
              onClick={manualRefresh}
              className="text-[10px] font-bold text-red-700 bg-red-100 hover:bg-red-200 px-2 py-0.5 rounded-md shrink-0 transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* LOW STOCK ALERT */}
        {alertItems.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-2">
            <AlertCircle size={11} className="text-amber-500 shrink-0" />
            <p className="text-[10px] text-amber-700 flex-1 min-w-0 truncate">
              <span className="font-bold">{alertItems.length}</span> item{alertItems.length > 1 ? "s" : ""} need restock —{" "}
              <span className="text-amber-600">{alertItems.slice(0, 3).map((i) => i.name).join(", ")}{alertItems.length > 3 ? ` +${alertItems.length - 3} more` : ""}</span>
            </p>
            <Link href="/PurchaseManagement"
              className="text-[10px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded-md shrink-0 transition">
              Purchase
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
              Showing{" "}
              <span className="font-semibold text-slate-700">{paginated.length.toLocaleString()}</span>{" "}
              of{" "}
              <span className="font-semibold text-slate-700">{filtered.length.toLocaleString()}</span>{" "}
              items
              {debouncedSearch && (
                <> for &ldquo;<span className="font-semibold text-[#1372e6]">{debouncedSearch}</span>&rdquo;</>
              )}
            </p>
            <div className="flex items-center gap-2">
              {(debouncedSearch || filter !== "all") && (
                <button
                  onClick={() => { setSearch(""); setFilter("all"); setPage(1); }}
                  className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition"
                >
                  <X size={10} /> Clear filters
                </button>
              )}
              {/* Divider */}
              {(debouncedSearch || filter !== "all") && <span className="w-px h-3 bg-slate-200" />}
              {/* Import buttons */}
              <button
                onClick={downloadTemplate}
                title="Download Excel template"
                className="flex items-center gap-1 text-[10px] font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-2 py-0.5 rounded transition"
              >
                <Download size={11} /> Template
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                disabled={importLoading}
                title="Import products from Excel"
                className="flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded transition disabled:opacity-50"
              >
                {importLoading ? <RefreshCw size={11} className="animate-spin" /> : <Upload size={11} />}
                {importLoading ? "Importing…" : "Import"}
              </button>
              <span className="w-px h-3 bg-slate-200" />
              {/* Export buttons */}
              <button
                onClick={exportExcel}
                title="Export to Excel"
                className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded transition"
              >
                <FileSpreadsheet size={11} /> Excel
              </button>
              <button
                onClick={exportPDF}
                title="Export to PDF"
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
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Added</th>
                  <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("common.actions") || "Actions"}</th>
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
                          {/* thumbnail — prefer DB images, fall back to localStorage */}
                          {(() => {
                            const rawImgs = p.images;
                            const dbImgs: string[] = rawImgs ? (() => { try { return JSON.parse(rawImgs) as string[]; } catch { return []; } })() : [];
                            const img0 = dbImgs[0] || productMeta[p.id]?.images?.[0];
                            return img0 ? (
                              <img src={img0} alt={p.name} className="w-8 h-8 rounded-lg object-cover border border-slate-200 flex-shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                                <Package size={12} className="text-slate-300" />
                              </div>
                            );
                          })()}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-semibold text-slate-800 text-xs leading-tight">{p.name}</p>
                              {(p.listed || productMeta[p.id]?.listed) && (
                                <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-[#1372e6] bg-[#EBF2FD] border border-[#A8C8F8] px-1 py-0.5 rounded-full leading-none">
                                  <Globe size={7} /> Listed
                                </span>
                              )}
                              {(() => {
                                const rawImgs2 = p.images;
                                const dbCnt = rawImgs2 ? (() => { try { return (JSON.parse(rawImgs2) as string[]).length; } catch { return 0; } })() : 0;
                                const cnt = dbCnt || productMeta[p.id]?.images?.length || 0;
                                return cnt > 0 ? (
                                  <span className="inline-flex items-center gap-0.5 text-[8px] font-semibold text-slate-500 bg-slate-100 px-1 py-0.5 rounded-full leading-none">
                                    <Eye size={7} /> {cnt}
                                  </span>
                                ) : null;
                              })()}
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
                          {isProfit ? t("dash.profit_label") : "Loss"}
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
                            <Link href={restockUrl} title="Restock"
                              className="p-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-600 transition">
                              <RefreshCw size={11} />
                            </Link>
                          )}
                          <button onClick={() => openEditModal(p)} title="Edit"
                            className="p-1 rounded bg-[#EBF2FD] hover:bg-[#D5E8FB] text-[#1372e6] transition">
                            <Pencil size={11} />
                          </button>
                          <button onClick={() => deleteProduct(p.id)} disabled={deletingId === p.id} title="Delete"
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
                {search || filter !== "all" ? "Try adjusting your filters or search term." : t("items.add_first")}
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
                  <input className={inputCls} placeholder="e.g. Sugar 1kg" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("items.description")}</label>
                  <input className={inputCls} placeholder="Optional description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
                    Margin: <span className={`font-bold ${Number(form.selling_price) >= Number(form.cost_price) ? "text-green-600" : "text-red-500"}`}>
                      {Number(form.cost_price) > 0 ? (((Number(form.selling_price) - Number(form.cost_price)) / Number(form.cost_price)) * 100).toFixed(1) : 0}%
                    </span>{" · "}Unit profit: <span className="font-bold text-slate-700">{(Number(form.selling_price) - Number(form.cost_price)).toLocaleString()}</span>
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

                {/* ── CATEGORY ───────────────────────────────────────────── */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Category
                    {formListed
                      ? <span className="text-red-400 ml-1">*</span>
                      : <span className="text-slate-400 ml-1">(optional)</span>}
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition ${
                      formListed && !formCategory ? "border-red-400 bg-red-50" : "border-slate-200 bg-white"
                    }`}
                  >
                    <option value="">-- Select a category --</option>
                    <option value="food">Food &amp; Drinks</option>
                    <option value="electronics">Electronics</option>
                    <option value="fashion">Fashion &amp; Apparel</option>
                    <option value="wholesale">Wholesale &amp; Bulk</option>
                    <option value="agriculture">Agriculture</option>
                    <option value="health">Health &amp; Beauty</option>
                    <option value="furniture">Furniture &amp; Decor</option>
                    <option value="services">Services</option>
                    <option value="other">Other</option>
                  </select>
                  {formListed && !formCategory && (
                    <p className="text-[10px] text-red-600 mt-1 flex items-center gap-1">
                      <AlertCircle size={10} /> Category is required to share on Marketplace
                    </p>
                  )}
                </div>

                {/* ── PRODUCT LOCATION ───────────────────────────────────── */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    <MapPin size={11} className="inline mr-1 text-[#1372e6]" />
                    Custom Location <span className="text-slate-400">(optional — overrides shop address on marketplace)</span>
                  </label>
                  {formLocation ? (
                    <div className="flex items-center gap-2 p-2.5 border border-[#1372e6] bg-[#EBF2FD] rounded-xl">
                      <MapPin size={13} className="text-[#1372e6] shrink-0" />
                      <span className="text-xs text-slate-700 flex-1 min-w-0 truncate">
                        {formLocation.replace(/\|Lat:[^|]+\|Lng:[^|]+$/, "").replace(/\|Lat:[^|]+$/, "")}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowLocationPicker(true)}
                        className="text-[10px] font-bold text-[#1372e6] hover:underline shrink-0"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormLocation("")}
                        className="text-slate-400 hover:text-red-500 transition shrink-0"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowLocationPicker(true)}
                      className="w-full flex items-center gap-2 p-2.5 border border-dashed border-slate-300 rounded-xl text-slate-400 hover:border-[#1372e6] hover:text-[#1372e6] transition text-sm"
                    >
                      <MapPin size={14} /> Pin product pickup / collection location on map
                    </button>
                  )}
                </div>

                {/* ── PRODUCT IMAGES ─────────────────────────────────────── */}
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-gray-600">
                      Product Images
                      {formListed
                        ? <><span className="text-red-400 ml-1">*</span><span className="text-slate-400 ml-1">(min 3 for marketplace)</span></>
                        : <span className="text-slate-400 ml-1">(optional, max {MAX_IMAGES})</span>}
                    </label>
                    {formImages.length > 0 && (
                      <span className="text-[10px] text-slate-400">{formImages.length}/{MAX_IMAGES} uploaded</span>
                    )}
                  </div>

                  {/* image preview grid + upload slot */}
                  <div className="flex flex-wrap gap-2">
                    {formImages.map((src, i) => (
                      <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-slate-200 group flex-shrink-0">
                        <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => setFormImages((prev) => prev.filter((_, idx) => idx !== i))}
                            className="opacity-0 group-hover:opacity-100 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white transition-opacity"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <span className="absolute bottom-1 left-1 text-[8px] font-bold bg-black/50 text-white px-1 py-0.5 rounded">
                          {i === 0 ? "Cover" : `#${i + 1}`}
                        </span>
                      </div>
                    ))}

                    {/* Add more slot */}
                    {formImages.length < MAX_IMAGES && (
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        disabled={imageUploading}
                        className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 hover:border-[#1372e6] flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-[#1372e6] transition flex-shrink-0 disabled:opacity-50"
                      >
                        {imageUploading ? (
                          <RefreshCw size={16} className="animate-spin" />
                        ) : (
                          <>
                            <ImagePlus size={18} />
                            <span className="text-[9px] font-semibold">Add Photo</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleImageFiles(e.target.files)}
                    onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
                  />

                  {formListed && formImages.length < 3 && (
                    <p className="text-[10px] text-red-600 mt-1.5 flex items-center gap-1">
                      <AlertCircle size={10} />
                      Upload at least 3 photos to share on Marketplace
                    </p>
                  )}
                  {!formListed && formImages.length === 0 && (
                    <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                      <ImagePlus size={10} />
                      Add photos if you plan to list this product on the Marketplace later
                    </p>
                  )}
                </div>

                {/* ── MARKETPLACE SHARE ──────────────────────────────────── */}
                <div className="md:col-span-2">
                  <div
                    className={`rounded-xl border p-3.5 flex items-center justify-between gap-4 transition-colors cursor-pointer select-none ${
                      formListed
                        ? "border-[#1372e6] bg-[#EBF2FD]"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                    }`}
                    onClick={() => setFormListed((v) => !v)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${formListed ? "bg-[#1372e6] text-white" : "bg-white text-slate-400 border border-slate-200"}`}>
                        <Store size={16} />
                      </div>
                      <div>
                        <p className={`text-sm font-bold leading-tight ${formListed ? "text-[#1372e6]" : "text-slate-700"}`}>
                          Share on Marketplace
                        </p>
                        <p className={`text-[10px] mt-0.5 leading-snug ${formListed ? "text-[#1372e6]/70" : "text-slate-400"}`}>
                          {formListed
                            ? "This product will be visible to all shops on the marketplace"
                            : "Make this product visible to other shops on the marketplace"}
                        </p>
                      </div>
                    </div>
                    {/* Toggle switch */}
                    <div className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${formListed ? "bg-[#1372e6]" : "bg-slate-300"}`}>
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formListed ? "translate-x-5" : "translate-x-0.5"}`} />
                    </div>
                  </div>
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

      {/* LOCATION PICKER */}
      {showLocationPicker && (
        <HigoMapPicker
          initialLat={(() => { const m = formLocation.match(/\|Lat:([-\d.]+)/); return m ? parseFloat(m[1]) : null; })()}
          initialLng={(() => { const m = formLocation.match(/\|Lng:([-\d.]+)/); return m ? parseFloat(m[1]) : null; })()}
          onConfirm={(pos, label) => {
            setFormLocation(`${label}|Lat:${pos.lat.toFixed(6)}|Lng:${pos.lng.toFixed(6)}`);
            setShowLocationPicker(false);
          }}
          onClose={() => setShowLocationPicker(false)}
        />
      )}

      {/* IMPORT RESULTS MODAL */}
      {importResults && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Import Results</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {importResults.success} added successfully · {importResults.failed.length} failed
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
                    {importResults.success} product{importResults.success !== 1 ? "s" : ""} imported successfully
                  </p>
                </div>
              )}

              {importResults.failed.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle size={14} className="text-red-500 shrink-0" />
                    <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">
                      {importResults.failed.length} row{importResults.failed.length !== 1 ? "s" : ""} failed
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {importResults.failed.map((f) => (
                      <div key={`${f.row}-${f.name}`} className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                        <span className="text-[10px] font-bold text-red-400 tabular-nums mt-0.5 shrink-0">Row {f.row}</span>
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
                <p className="text-sm text-slate-400 text-center py-6">No rows were processed. Check your file has data rows below the header.</p>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 shrink-0">
              {importResults.failed.length > 0 && (
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-50 transition"
                >
                  Re-import Fixed File
                </button>
              )}
              <button
                onClick={() => setImportResults(null)}
                className="px-4 py-1.5 rounded-lg bg-[#1372e6] text-white text-xs font-semibold hover:opacity-90 transition"
              >
                Done
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
