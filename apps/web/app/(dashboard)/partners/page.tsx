"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { partnerRequest } from "@/lib/supplier-api";
import { itemRequest } from "@/lib/product-api";
import { useDebounce } from "@/lib/hooks";
import { useLanguage } from "@/lib/language-context";
import Pagination from "@/app/components/ui/Pagination";
import {
  Users, Search, Filter, Plus, Trash2, Pencil, X,
  UserCheck, UserCog, Activity, Package, ShoppingCart,
  Building2, Phone, Mail, MapPin, RefreshCw, ChevronDown,
  Download, Upload, FileSpreadsheet, FileText,
} from "lucide-react";

interface RawPartner { id: string; name: string; phone?: string; email?: string; address?: string; }
interface Partner extends RawPartner { tin: string; realAddress: string; partnerType: "supplier" | "customer"; }
interface Product { id: string; supplier_id?: string | null; }
interface FormErrors { name?: string; contact?: string; phone?: string; tin?: string; email?: string; }
type ModalMode = "create" | "edit";

function encodeAddress(tin: string, address: string): string {
  const t = tin.trim(), a = address.trim();
  if (t && a) return `TIN:${t}|${a}`;
  if (t) return `TIN:${t}`;
  return a;
}

function decodePartner(raw: RawPartner): Partner {
  const addr = raw.address ?? "";
  let tin = "", realAddress = "";
  if (addr.startsWith("TIN:")) {
    const pipe = addr.indexOf("|");
    if (pipe !== -1) { tin = addr.slice(4, pipe); realAddress = addr.slice(pipe + 1); }
    else tin = addr.slice(4);
  } else { realAddress = addr; }
  return { ...raw, tin, realAddress, partnerType: tin ? "supplier" : "customer" };
}

const EMPTY_FORM = { name: "", phone: "", tin: "", email: "", address: "" };
const PAGE_SIZES = [25, 50, 100, 250];

const inputCls =
  "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2] transition";

export default function PartnerManagementPage() {
  const { t, layout } = useLanguage();
  // Car companies don't track suppliers: this page is their customer list.
  const isCar = layout === "car";
  const [allPartners, setPartners] = useState<Partner[]>([]);
  const partners = useMemo(
    () => isCar ? allPartners.filter((p) => p.partnerType === "customer") : allPartners,
    [allPartners, isCar],
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
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
  const [errors, setErrors] = useState<FormErrors>({});

  const debouncedSearch = useDebounce(search, 350);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet(isCar ? [
      ["name", "phone", "email", "address"],
      ["John Doe", "0781234567", "john@example.com", "Musanze"],
    ] : [
      ["name", "phone", "tin", "email", "address"],
      ["INYANGE Industries", "", "123456789", "inyange@example.com", "KN 5 Ave Kigali"],
      ["John Doe", "0781234567", "", "john@example.com", "Musanze"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Partners");
    XLSX.writeFile(wb, "partners_template.xlsx");
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
          await partnerRequest("/suppliers", {
            method: "POST",
            body: JSON.stringify({
              name: (row.name || row.Name || "").trim(),
              phone: (row.phone || row.Phone || "").trim() || null,
              email: (row.email || row.Email || "").trim() || null,
              address: encodeAddress(isCar ? "" : (row.tin || row.TIN || "").trim(), (row.address || row.Address || "").trim()) || null,
            }),
          });
          imported++;
        } catch { failed++; }
      }
      e.target.value = "";
      alert(`${t("partners.import_result_prefix")} ${imported} ${t("partners.import_result_suffix")}${failed ? `, ${failed} ${t("partners.import_failed_suffix")}` : ""}.`);
      await loadData(true);
    } catch { alert(t("common.parse_file_failed")); }
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const data = filtered.map((p) => ({
      [t("common.name")]: p.name,
      ...(isCar ? {} : { [t("common.type")]: p.partnerType === "supplier" ? t("partners.supplier_singular") : t("partners.customer_singular") }),
      [t("common.phone")]: p.phone || "",
      ...(isCar ? {} : { TIN: p.tin || "" }),
      [t("common.email")]: p.email || "",
      [t("common.address")]: p.realAddress || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Partners");
    XLSX.writeFile(wb, "partners.xlsx");
  }

  async function exportPDF() {
    const { jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Partners", 14, 16);
    autoTable(doc, {
      startY: 22,
      head: [isCar ? ["Name", "Phone", "Email"] : ["Name", "Type", "Phone", "TIN", "Email"]],
      body: filtered.map((p) => isCar ? [p.name, p.phone || "—", p.email || "—"] : [
        p.name,
        p.partnerType === "supplier" ? "Supplier" : "Customer",
        p.phone || "—",
        p.tin || "—",
        p.email || "—",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [19, 114, 230] },
    });
    doc.save("partners.pdf");
  }

  async function loadData(soft = false) {
    try {
      if (!soft) setLoading(true); else setRefreshing(true);
      const [partnersRes, productsRes] = await Promise.all([
        partnerRequest("/suppliers"),
        itemRequest("/products").catch(() => null),
      ]);
      const raw: RawPartner[] = partnersRes?.data?.items ?? partnersRes?.data ?? [];
      setPartners(raw.map(decodePartner));
      setProducts(productsRes?.data?.items || []);
      setLastUpdated(new Date());
    } catch (err) { console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  }

  function validate(data = form): boolean {
    const err: FormErrors = {};
    const tin = data.tin.trim(), phone = data.phone.trim();
    if (!data.name.trim()) err.name = t("partners.err_name_required");
    if (!tin && !phone) { err.contact = t("partners.err_contact_required"); }
    else {
      if (tin && !/^\d{9}$/.test(tin)) err.tin = t("partners.err_tin_digits");
      else if (tin) {
        const dup = allPartners.find((p) => p.tin === tin && p.id !== editingId);
        if (dup) err.tin = `${t("partners.err_tin_dup_prefix")} "${dup.name}"`;
      }
      if (phone && !/^\d{10}$/.test(phone.replace(/\s/g, ""))) err.phone = t("partners.err_phone_digits");
      else if (phone) {
        const norm = phone.replace(/\s/g, "");
        const dup = allPartners.find((p) => p.phone?.replace(/\s/g, "") === norm && p.id !== editingId);
        if (dup) err.phone = `${t("partners.err_phone_dup_prefix")} "${dup.name}"`;
      }
    }
    if (data.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) err.email = t("common.invalid_email");
    setErrors(err);
    return Object.keys(err).length === 0;
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const updated = { ...form, [e.target.name]: e.target.value };
    setForm(updated); validate(updated);
  }

  function openCreateModal() { setForm(EMPTY_FORM); setErrors({}); setEditingId(null); setModalMode("create"); setShowModal(true); }
  function openEditModal(p: Partner) {
    setForm({ name: p.name, phone: p.phone ?? "", tin: p.tin ?? "", email: p.email ?? "", address: p.realAddress ?? "" });
    setErrors({}); setEditingId(p.id); setModalMode("edit"); setShowModal(true);
  }
  function closeModal() { setShowModal(false); setForm(EMPTY_FORM); setErrors({}); setEditingId(null); }

  const buildPayload = () => ({
    name: form.name.trim(), phone: form.phone.trim() || null,
    email: form.email.trim() || null, address: encodeAddress(form.tin, form.address) || null,
  });

  async function createPartner() {
    if (!validate()) return;
    try { setSubmitting(true); await partnerRequest("/suppliers", { method: "POST", body: JSON.stringify(buildPayload()) }); closeModal(); await loadData(true); }
    catch (err) { alert(`${t("partners.err_create_prefix")} ${err instanceof Error ? err.message : t("common.unknown_error")}`); }
    finally { setSubmitting(false); }
  }

  async function updatePartner() {
    if (!validate() || !editingId) return;
    try { setSubmitting(true); await partnerRequest(`/suppliers/${editingId}`, { method: "PUT", body: JSON.stringify(buildPayload()) }); closeModal(); await loadData(true); }
    catch (err) { alert(`${t("partners.err_update_prefix")} ${err instanceof Error ? err.message : t("common.unknown_error")}`); }
    finally { setSubmitting(false); }
  }

  async function deletePartner(id: string) {
    if (!confirm(t("common.confirm_delete"))) return;
    try { setDeletingId(id); await partnerRequest(`/suppliers/${id}`, { method: "DELETE" }); await loadData(true); }
    catch (err) { alert(`${t("common.delete_failed_prefix")} ${err instanceof Error ? err.message : t("common.unknown_error")}`); }
    finally { setDeletingId(""); }
  }

  const supplierItemCount = useMemo(() => {
    const c: Record<string, number> = {};
    products.forEach((p) => { if (p.supplier_id) c[p.supplier_id] = (c[p.supplier_id] || 0) + 1; });
    return c;
  }, [products]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return partners
      .filter((p) => p.name?.toLowerCase().includes(q) || p.phone?.includes(q) || p.tin?.includes(q) || p.email?.toLowerCase().includes(q))
      .filter((p) => typeFilter === "all" || p.partnerType === typeFilter);
  }, [partners, debouncedSearch, typeFilter]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);


  const stats = useMemo(() => {
    const suppliers = partners.filter((p) => p.partnerType === "supplier");
    const customers = partners.filter((p) => p.partnerType === "customer");
    return {
      total: partners.length, suppliers: suppliers.length, customers: customers.length,
      itemsSupplied: products.filter((p) => p.supplier_id).length,
      activeSuppliers: suppliers.filter((s) => (supplierItemCount[s.id] || 0) > 0).length,
    };
  }, [partners, products, supplierItemCount]);

  const previewType = form.tin.trim() ? "supplier" : form.phone.trim() ? "customer" : null;

  if (loading) return <PartnersSkeleton />;

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4">

        {/* HEADER BANNER */}
        <div
          className="hgv-surface relative rounded-2xl mb-2 overflow-hidden"
          style={{ background: "linear-gradient(135deg, #0a66c2 0%, #004182 50%, #00376b 100%)" }}
        >
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />

          {/* Row 1: icon+title · actions */}
          <div className="relative flex items-center gap-3 px-4 pt-3 pb-2">
            <div className="flex items-center gap-2.5 min-w-0 mr-auto">
              <div className="w-8 h-8 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                <Users size={15} className="text-white" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest leading-none">{t("nav.partners")}</p>
                <h1 className="text-base font-extrabold text-white leading-tight tracking-tight">{t("partners.title")}</h1>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={manualRefresh} disabled={refreshing} title={t("common.refresh")}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition-all disabled:opacity-40">
                <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              </button>
              <button onClick={openCreateModal}
                className="flex items-center gap-1.5 bg-white text-[#0a66c2] px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-50 active:scale-95 transition-all shadow-lg shadow-black/20">
                <Plus size={12} strokeWidth={3} /> {t("partners.add")}
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
              {t("common.live")} · <span className="font-semibold text-white/80">{partners.length.toLocaleString()} {t("partners.count_label")}</span>
              {lastUpdated && <span className="ml-1 text-blue-200/50">· {t("common.updated")} {lastUpdated.toLocaleTimeString()}</span>}
            </p>
            <span className="text-[10px] text-blue-200/50">↻ {countdown}s</span>
          </div>

          {/* Row 3: search + filter */}
          <div className="relative flex gap-2 px-4 pb-3">
            <div className="flex-1 flex items-center gap-2 bg-white/10 hover:bg-white/15 focus-within:bg-white/20 border border-white/10 focus-within:border-white/30 rounded-xl px-3 py-2 transition-all group shadow-inner">
              <Search size={13} className="shrink-0 text-white/40 group-focus-within:text-white/80 transition-colors" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t("partners.search")}
                className="bg-transparent outline-none w-full text-sm text-white placeholder:text-white/35 font-medium" />
              {search && (
                <button onClick={() => setSearch("")} className="w-4 h-4 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center text-white/70 hover:text-white transition-all shrink-0">
                  <X size={9} />
                </button>
              )}
            </div>
            {!isCar && <div className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl px-2.5 py-2 transition-all">
              <Filter size={11} className="shrink-0 text-white/50" />
              <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                className="bg-transparent outline-none text-xs text-white font-semibold appearance-none cursor-pointer">
                <option value="all" className="text-gray-800">{t("partners.all")}</option>
                <option value="supplier" className="text-gray-800">{t("partners.suppliers")}</option>
                <option value="customer" className="text-gray-800">{t("partners.customers")}</option>
              </select>
              <ChevronDown size={10} className="text-white/35 shrink-0" />
            </div>}
          </div>
        </div>

        {/* STAT CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 mb-2">
          {(isCar ? [
            { label: t("partners.total"),            value: stats.total,           color: "text-[#0a66c2]", dot: "bg-[#0a66c2]" },
          ] : [
            { label: t("partners.total"),            value: stats.total,           color: "text-[#0a66c2]", dot: "bg-[#0a66c2]" },
            { label: t("partners.suppliers"),         value: stats.suppliers,       color: "text-blue-600",  dot: "bg-blue-500" },
            { label: t("partners.customers"),         value: stats.customers,       color: "text-slate-700", dot: "bg-slate-400" },
            { label: t("partners.active_suppliers"),  value: stats.activeSuppliers, color: "text-green-600", dot: "bg-green-500" },
            { label: t("partners.items_supplied"),    value: stats.itemsSupplied,   color: "text-amber-600", dot: "bg-amber-500" },
          ]).map((card) => (
            <div key={card.label} className="bg-white rounded-lg border border-slate-200 px-2.5 py-2">
              <div className="flex items-center gap-1 mb-1">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${card.dot}`} />
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider leading-none truncate">{card.label}</p>
              </div>
              <p className={`text-xl font-bold leading-none tabular-nums ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* TABLE */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 bg-slate-50/60">
            <p className="text-[10px] text-slate-500">
              {t("common.showing")} <span className="font-semibold text-slate-700">{paginated.length}</span> {t("common.of")} <span className="font-semibold text-slate-700">{filtered.length}</span> {t("partners.count_label")}
            </p>
            <div className="flex items-center gap-1.5">
              {(debouncedSearch || typeFilter !== "all") && (
                <button onClick={() => { setSearch(""); setTypeFilter("all"); setPage(1); }}
                  className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition mr-1">
                  <X size={10} /> {t("common.clear_filters")}
                </button>
              )}
              <button onClick={downloadTemplate} title={t("common.download_template")}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-violet-200 text-violet-600 bg-white hover:bg-violet-50 transition">
                <Download size={10} /> {t("common.template")}
              </button>
              <button onClick={() => fileInputRef.current?.click()} title={t("partners.import_tooltip")}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-violet-200 text-violet-600 bg-white hover:bg-violet-50 transition">
                <Upload size={10} /> {t("common.import")}
              </button>
              <button onClick={exportExcel} title={t("common.export_excel")}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-green-200 text-green-600 bg-white hover:bg-green-50 transition">
                <FileSpreadsheet size={10} /> Excel
              </button>
              <button onClick={exportPDF} title={t("common.export_pdf")}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-red-200 text-red-600 bg-white hover:bg-red-50 transition">
                <FileText size={10} /> PDF
              </button>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {(isCar
                    ? [t("common.name"), t("common.phone"), t("common.email"), t("common.address"), ""]
                    : [t("common.name"), t("common.type"), t("common.phone"), "TIN", t("common.email"), t("partners.items_supplied"), ""]
                  ).map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((p) => {
                  const isSupplier = p.partnerType === "supplier";
                  const itemCount = isSupplier ? (supplierItemCount[p.id] || 0) : null;
                  return (
                    <tr key={p.id} className="group border-b border-slate-50 last:border-0 hover:bg-slate-50/70 transition-colors">
                      <td className="px-3 py-1.5">
                        <p className="font-semibold text-slate-800 text-xs leading-tight">{p.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{p.id?.slice(0, 8)}</p>
                      </td>
                      {!isCar && <td className="px-3 py-1.5">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${isSupplier ? "bg-[#D5E8FB] text-[#0a66c2]" : "bg-slate-100 text-slate-600"}`}>
                          {isSupplier ? <Building2 size={9} /> : <UserCheck size={9} />}
                          {isSupplier ? t("partners.suppliers") : t("partners.customers")}
                        </span>
                      </td>}
                      <td className="px-3 py-1.5">
                        {p.phone
                          ? <div className="flex items-center gap-1 text-xs text-slate-600"><Phone size={11} className="text-slate-400 shrink-0" />{p.phone}</div>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      {!isCar && <td className="px-3 py-1.5">
                        {p.tin
                          ? <span className="font-mono text-[10px] bg-[#EBF2FD] text-[#0a66c2] px-1.5 py-0.5 rounded-md">{p.tin}</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>}
                      <td className="px-3 py-1.5">
                        {p.email
                          ? <div className="flex items-center gap-1 text-xs text-slate-600"><Mail size={11} className="text-slate-400 shrink-0" /><span className="truncate max-w-32">{p.email}</span></div>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      {isCar ? (
                        <td className="px-3 py-1.5 text-xs text-slate-600 max-w-48 truncate">{p.realAddress || <span className="text-slate-300">—</span>}</td>
                      ) : <td className="px-3 py-1.5">
                        {isSupplier ? (
                          <div className="flex items-center gap-1">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${itemCount && itemCount > 0 ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"}`}>
                              <Package size={9} />{itemCount} {t("partners.item_word")}
                            </span>
                            {itemCount === 0 && (
                              <Link href="/PurchaseManagement" className="text-[10px] text-[#0a66c2] hover:underline flex items-center gap-0.5"><ShoppingCart size={10} /> {t("common.buy")}</Link>
                            )}
                          </div>
                        ) : <span className="text-[10px] text-slate-400 italic">{t("partners.customer_singular")}</span>}
                      </td>}
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEditModal(p)} title={t("common.edit")}
                            className="p-1 rounded bg-[#EBF2FD] hover:bg-[#D5E8FB] text-[#0a66c2] transition"><Pencil size={11} /></button>
                          <button onClick={() => deletePartner(p.id)} disabled={deletingId === p.id} title={t("common.delete")}
                            className="p-1 rounded bg-red-50 hover:bg-red-100 text-red-500 transition disabled:opacity-40"><Trash2 size={11} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {paginated.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4"><Activity size={28} className="opacity-40" /></div>
              <p className="font-semibold text-slate-500 text-sm">{t("partners.no_partners")}</p>
              <p className="text-xs mt-1.5 text-slate-400">{search || typeFilter !== "all" ? t("common.try_adjust_filters") : t("partners.add_first")}</p>
              {!search && typeFilter === "all" && (
                <button onClick={openCreateModal} className="mt-5 flex items-center gap-1.5 bg-[#0a66c2] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition">
                  <Plus size={14} /> {t("partners.add")}
                </button>
              )}
            </div>
          )}

          <Pagination page={page} totalPages={totalPages} total={filtered.length}
            pageSize={pageSize} pageSizes={PAGE_SIZES} onPage={setPage} onPageSize={setPageSize} />
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-center px-4 sm:px-6 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{modalMode === "edit" ? t("partners.edit_title") : t("partners.add_title")}</h2>
                  {!isCar && previewType && <p className="text-xs text-slate-400 mt-0.5">{t("partners.save_as_prefix")} <span className={`font-semibold ${previewType === "supplier" ? "text-[#0a66c2]" : "text-slate-600"}`}>{previewType === "supplier" ? t("partners.supplier_singular") : t("partners.customer_singular")}</span></p>}
                </div>
                <button onClick={closeModal} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={17} /></button>
              </div>
              <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-4 overflow-y-auto flex-1">
                {!isCar && <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs text-slate-500">
                  {t("partners.tin_supplier")} &nbsp;·&nbsp; {t("partners.phone_customer")}
                </div>}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("common.name")} <span className="text-red-400">*</span></label>
                  <input name="name" placeholder={t("partners.name_placeholder")} value={form.name} className={inputCls} onChange={handleChange} />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1"><span className="flex items-center gap-1"><Phone size={12} /> {t("common.phone")}</span></label>
                    <input name="phone" placeholder="07XXXXXXXX" value={form.phone} maxLength={10} className={inputCls} onChange={handleChange} />
                    {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
                  </div>
                  {!isCar && <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1"><span className="flex items-center gap-1"><Building2 size={12} /> TIN <span className="text-[#0a66c2]">({t("partners.supplier_singular")})</span></span></label>
                    <input name="tin" placeholder={t("partners.tin_placeholder")} value={form.tin} maxLength={9} className={`${inputCls} font-mono`} onChange={handleChange} />
                    {errors.tin && <p className="text-red-500 text-xs mt-1">{errors.tin}</p>}
                  </div>}
                </div>
                {errors.contact && <p className="text-red-500 text-xs">{errors.contact}</p>}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1"><span className="flex items-center gap-1"><Mail size={12} /> {t("common.email")}</span></label>
                    <input name="email" placeholder="email@example.com" value={form.email} className={inputCls} onChange={handleChange} />
                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1"><span className="flex items-center gap-1"><MapPin size={12} /> {t("common.address")}</span></label>
                    <input name="address" placeholder={t("partners.address_placeholder")} value={form.address} className={inputCls} onChange={handleChange} />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2.5 px-4 sm:px-6 py-4 border-t border-slate-100 shrink-0">
                <button onClick={closeModal} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">{t("common.cancel")}</button><button onClick={modalMode === "edit" ? updatePartner : createPartner} disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition disabled:opacity-60">
                  {submitting ? (modalMode === "edit" ? t("common.saving") : t("common.adding")) : (modalMode === "edit" ? t("common.save") : t("partners.add"))}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PartnersSkeleton() {
  return (
    <div className="min-h-screen">
      <style>{`@keyframes ptr-sh{0%{background-position:-200% 0}100%{background-position:200% 0}}.ptr-sh{background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:ptr-sh 1.4s infinite;border-radius:5px}.ptr-sh-w{background:linear-gradient(90deg,rgba(255,255,255,.1) 25%,rgba(255,255,255,.22) 50%,rgba(255,255,255,.1) 75%);background-size:200% 100%;animation:ptr-sh 1.4s infinite;border-radius:5px}`}</style>
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4">
        <div className="hgv-surface relative rounded-2xl mb-2 overflow-hidden" style={{background:"linear-gradient(135deg,#0a66c2 0%,#004182 50%,#00376b 100%)"}}>
          <div className="relative flex items-center gap-3 px-4 pt-3 pb-2">
            <div className="w-8 h-8 rounded-xl ptr-sh-w shrink-0" />
            <div><div className="ptr-sh-w h-2 w-14 mb-1 rounded" /><div className="ptr-sh-w h-4 w-32 rounded" /></div>
            <div className="ml-auto flex gap-1.5"><div className="ptr-sh-w w-7 h-7 rounded-lg" /><div className="ptr-sh-w h-7 w-24 rounded-lg" /></div>
          </div>
          <div className="px-4 pb-2 flex gap-1.5"><div className="ptr-sh-w h-2 w-4 rounded-full" /><div className="ptr-sh-w h-2 w-40 rounded" /></div>
          <div className="px-4 pb-3 flex gap-2"><div className="ptr-sh-w flex-1 h-9 rounded-xl" /><div className="ptr-sh-w h-9 w-28 rounded-xl" /></div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 mb-2">
          {Array.from({length:5}).map((_,i)=>(
            <div key={i} className="bg-white rounded-lg border border-slate-200 px-2.5 py-2">
              <div className="ptr-sh h-2 w-16 mb-2 rounded" /><div className="ptr-sh h-6 w-8 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <div className="ptr-sh h-2.5 w-28 rounded" />
            <div className="flex gap-1.5">{[56,52,50,46,46].map((w,i)=><div key={i} className="ptr-sh h-5 rounded" style={{width:w}} />)}</div>
          </div>
          <div className="flex gap-3 px-3 py-2 bg-slate-50 border-b border-slate-200">
            {[120,70,70,60,80,80,40].map((w,i)=><div key={i} className="ptr-sh h-2 rounded" style={{width:w}} />)}
          </div>
          {Array.from({length:7}).map((_,i)=>(
            <div key={i} className="flex items-center gap-3 px-3 border-b border-slate-50" style={{padding:"6px 12px"}}>
              <div className="flex-1 min-w-0"><div className="ptr-sh h-2.5 w-28 rounded mb-1" /><div className="ptr-sh h-2 w-16 rounded" /></div>
              <div className="ptr-sh h-5 w-16 rounded-full" />
              {[60,56,64,72,64,28].map((w,j)=><div key={j} className="ptr-sh h-2.5 rounded shrink-0" style={{width:w}} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
