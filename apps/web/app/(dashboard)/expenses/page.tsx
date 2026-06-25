"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { expenseRequest, expenseUploadProof } from "@/lib/expense-api";
import { useLanguage } from "@/lib/language-context";
import Pagination from "@/app/components/ui/Pagination";
import DateRangeFilter from "@/app/components/ui/DateRangeFilter";
import {
  Receipt, RefreshCw, Plus, Trash2, X, Search, Filter,
  Calendar, BarChart3, AlertCircle, ChevronDown,
  Download, Upload, FileSpreadsheet, FileText, Paperclip, ImageIcon, FileIcon,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Category =
  | "rent" | "utilities" | "salaries" | "supplies"
  | "maintenance" | "marketing" | "transport" | "taxes" | "other";

interface Expense {
  id: string;
  shop_id: string;
  created_by: string;
  title: string;
  category: Category;
  amount: number;
  notes?: string;
  expense_date: string;
  created_at: string;
  has_proof?: boolean;
}

interface CategoryStat { category: Category; total: number; count: number; }
interface ProofEntry   { name: string; type: string; preview: string; file: File; }
interface ProofFile    { name: string; type: string; data: string; }

const ALL_CATEGORIES: Category[] = [
  "rent", "utilities", "salaries", "supplies",
  "maintenance", "marketing", "transport", "taxes", "other",
];

const CATEGORY_COLORS: Record<Category, { bg: string; text: string; badge: string }> = {
  rent:        { bg: "bg-blue-50",   text: "text-blue-700",   badge: "bg-blue-100 text-blue-700" },
  utilities:   { bg: "bg-cyan-50",   text: "text-cyan-700",   badge: "bg-cyan-100 text-cyan-700" },
  salaries:    { bg: "bg-violet-50", text: "text-violet-700", badge: "bg-violet-100 text-violet-700" },
  supplies:    { bg: "bg-amber-50",  text: "text-amber-700",  badge: "bg-amber-100 text-amber-700" },
  maintenance: { bg: "bg-orange-50", text: "text-orange-700", badge: "bg-orange-100 text-orange-700" },
  marketing:   { bg: "bg-pink-50",   text: "text-pink-700",   badge: "bg-pink-100 text-pink-700" },
  transport:   { bg: "bg-teal-50",   text: "text-teal-700",   badge: "bg-teal-100 text-teal-700" },
  taxes:       { bg: "bg-purple-50", text: "text-purple-700", badge: "bg-purple-100 text-purple-700" },
  other:       { bg: "bg-slate-50",  text: "text-slate-600",  badge: "bg-slate-100 text-slate-600" },
};

const PAGE_SIZES = [25, 50, 100, 250];
const EMPTY_FORM = { title: "", category: "other" as Category, amount: "", notes: "", expense_date: "" };

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ExpenseManagementPage() {
  const { t } = useLanguage();

  const [expenses, setExpenses]       = useState<Expense[]>([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [pageSize, setPageSize]       = useState(25);
  const [dateFrom, setDateFrom]       = useState(() => toDateStr(new Date()));
  const [dateTo, setDateTo]           = useState(() => toDateStr(new Date()));
  const [catFilter, setCatFilter]     = useState<Category | "">("");
  const [search, setSearch]           = useState("");

  const [summaryToday, setSummaryToday]   = useState({ total_expenses: 0, count: 0 });
  const [summaryMonth, setSummaryMonth]   = useState({ total_expenses: 0, count: 0 });
  const [byCategory, setByCategory]       = useState<CategoryStat[]>([]);

  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [showModal, setShowModal]     = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [deletingId, setDeletingId]   = useState("");
  const [form, setForm]               = useState(EMPTY_FORM);

  const [proofEntries, setProofEntries]   = useState<ProofEntry[]>([]);
  const [viewingProofs, setViewingProofs] = useState<ProofFile[]>([]);
  const [viewerIndex, setViewerIndex]     = useState(0);

  const fileInputRef    = useRef<HTMLInputElement>(null);
  const proofInputRef   = useRef<HTMLInputElement>(null);

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loading) loadExpenses(); }, [page, pageSize, dateFrom, dateTo, catFilter]);

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["title", "category", "amount", "expense_date", "notes"],
      ["Monthly Rent", "rent", "200000", toDateStr(new Date()), "Office rent payment"],
      ["Electricity Bill", "utilities", "50000", toDateStr(new Date()), ""],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");
    XLSX.writeFile(wb, "expenses_template.xlsx");
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
          const title = (row.title || row.Title || "").trim();
          const amount = Number(row.amount || row.Amount || 0);
          const expDate = (row.expense_date || row["Expense Date"] || toDateStr(new Date())).trim();
          if (!title || !amount) { failed++; continue; }
          const cat = (row.category || row.Category || "other").toLowerCase() as Category;
          await expenseRequest("/expenses", {
            method: "POST",
            body: JSON.stringify({
              title,
              category: ALL_CATEGORIES.includes(cat) ? cat : "other",
              amount,
              notes: (row.notes || row.Notes || "").trim() || undefined,
              expense_date: expDate + (expDate.includes("T") ? "" : "T00:00:00"),
            }),
          });
          imported++;
        } catch { failed++; }
      }
      e.target.value = "";
      alert(`Imported ${imported} expenses${failed ? `, ${failed} failed` : ""}.`);
      await loadAll(true);
    } catch { alert("Failed to parse file."); }
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const data = filteredExpenses.map((e) => ({
      Date: e.expense_date ? new Date(e.expense_date).toLocaleDateString() : "",
      Title: e.title,
      Category: e.category,
      Amount: e.amount,
      Notes: e.notes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");
    XLSX.writeFile(wb, "expenses.xlsx");
  }

  async function exportPDF() {
    const { jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Expenses Report", 14, 16);
    autoTable(doc, {
      startY: 22,
      head: [["Date", "Title", "Category", "Amount", "Notes"]],
      body: filteredExpenses.map((e) => [
        e.expense_date ? new Date(e.expense_date).toLocaleDateString() : "—",
        e.title,
        e.category,
        Number(e.amount).toLocaleString(),
        e.notes || "—",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [19, 114, 230] },
    });
    doc.save("expenses.pdf");
  }

  async function loadAll(soft = false) {
    try {
      if (!soft) setLoading(true); else setRefreshing(true);
      await Promise.all([loadExpenses(), loadSummaries(), loadByCategory()]);
      setLastUpdated(new Date());
    } finally { setLoading(false); setRefreshing(false); }
  }

  async function loadExpenses() {
    try {
      const params = new URLSearchParams({
        page: String(page), limit: String(pageSize),
        ...(dateFrom && { from_date: dateFrom }),
        ...(dateTo   && { to_date: dateTo }),
        ...(catFilter && { category: catFilter }),
      });
      const res = await expenseRequest(`/expenses?${params}`);
      setExpenses(res?.data?.items || []);
      setTotal(res?.data?.total || 0);
    } catch (err) { console.error(err); }
  }

  async function loadSummaries() {
    const today = toDateStr(new Date());
    const now   = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const [todayRes, monthRes] = await Promise.allSettled([
      expenseRequest(`/expenses/summary?from_date=${today}&to_date=${today}`),
      expenseRequest(`/expenses/summary?from_date=${monthStart}&to_date=${today}`),
    ]);
    if (todayRes.status === "fulfilled") setSummaryToday(todayRes.value?.data || { total_expenses: 0, count: 0 });
    if (monthRes.status === "fulfilled") setSummaryMonth(monthRes.value?.data || { total_expenses: 0, count: 0 });
  }

  async function loadByCategory() {
    try {
      const res = await expenseRequest("/expenses/by-category");
      setByCategory(res?.data || []);
    } catch { /* ignore */ }
  }

  function openModal() {
    setForm({ ...EMPTY_FORM, expense_date: toDateStr(new Date()) });
    setProofEntries([]);
    setShowModal(true);
  }

  function handleProofSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    const remaining = 5 - proofEntries.length;
    const toAdd = picked.slice(0, remaining);
    toAdd.forEach((file) => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setProofEntries((prev) => [...prev, { name: file.name, type: file.type, preview: ev.target?.result as string, file }]);
        };
        reader.readAsDataURL(file);
      } else {
        setProofEntries((prev) => [...prev, { name: file.name, type: file.type, preview: "pdf", file }]);
      }
    });
    if (proofInputRef.current) proofInputRef.current.value = "";
  }

  function removeProofEntry(idx: number) {
    setProofEntries((prev) => prev.filter((_, i) => i !== idx));
  }

  async function openProofViewer(expenseId: string) {
    try {
      const res = await expenseRequest(`/expenses/${expenseId}/proof`);
      const files: ProofFile[] = res?.data?.files || [];
      if (files.length) { setViewingProofs(files); setViewerIndex(0); }
      else alert("No proof found for this expense.");
    } catch { alert("Could not load proof."); }
  }

  async function submitForm() {
    if (!form.title.trim()) { alert(t("expenses.title_field") + " required."); return; }
    if (!form.amount || Number(form.amount) <= 0) { alert(t("expenses.amount") + " must be > 0."); return; }
    if (!form.expense_date) { alert(t("expenses.expense_date") + " required."); return; }

    try {
      setSubmitting(true);
      const res = await expenseRequest("/expenses", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          category: form.category,
          amount: Number(form.amount),
          notes: form.notes.trim() || undefined,
          expense_date: form.expense_date + "T00:00:00",
        }),
      });

      if (proofEntries.length > 0 && res?.data?.id) {
        await expenseUploadProof(res.data.id, proofEntries.map((e) => e.file));
      }

      setShowModal(false);
      setForm(EMPTY_FORM);
      setProofEntries([]);
      await loadAll(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error");
    } finally { setSubmitting(false); }
  }

  async function deleteExpense(id: string) {
    if (!confirm(t("common.confirm_delete"))) return;
    try {
      setDeletingId(id);
      await expenseRequest(`/expenses/${id}`, { method: "DELETE" });
      await loadAll(true);
    } catch { alert("Delete failed."); }
    finally { setDeletingId(""); }
  }

  const filteredExpenses = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return expenses;
    return expenses.filter((e) =>
      e.title.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      (e.notes || "").toLowerCase().includes(q)
    );
  }, [expenses, search]);

  const totalPages = Math.ceil(total / pageSize);
  const topCategory = byCategory[0];
  const hasDateFilter = dateFrom || dateTo;

  const inputCls = "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-2.5 py-1.5 w-full text-xs focus:outline-none focus:ring-2 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition";

  if (loading) return <ExpenseSkeleton />;

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4">

        {/* ── HEADER ─────────────────────────────────────────── */}
        <div className="relative rounded-2xl mb-2 overflow-hidden"
          style={{ background: "linear-gradient(135deg, #1372e6 0%, #1168d6 50%, #0a47a0 100%)" }}>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "20px 20px" }} />

          {/* Row 1: icon + title + actions */}
          <div className="relative flex items-center gap-3 px-4 pt-3 pb-2">
            <div className="flex items-center gap-2.5 min-w-0 mr-auto">
              <div className="w-8 h-8 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                <Receipt size={15} className="text-white" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest leading-none">Finance</p>
                <h1 className="text-base font-extrabold text-white leading-tight tracking-tight">{t("expenses.title")}</h1>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => loadAll(true)} disabled={refreshing}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition-all disabled:opacity-40">
                <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              </button>
              <button onClick={openModal}
                className="flex items-center gap-1.5 bg-white text-[#1372e6] px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-50 active:scale-95 transition-all shadow-lg shadow-black/20">
                <Plus size={12} strokeWidth={3} /> {t("expenses.add")}
              </button>
            </div>
          </div>

          {/* Row 2: live indicator */}
          <div className="relative flex items-center gap-1.5 px-4 pb-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
            </span>
            <p className="text-[10px] text-blue-100/70">
              Live · <span className="font-semibold text-white/80">{total.toLocaleString()} {t("expenses.records")}</span>
              {lastUpdated && <span className="ml-1 text-blue-200/50">· Updated {lastUpdated.toLocaleTimeString()}</span>}
            </p>
          </div>

          {/* Row 3: search + category filter + date range */}
          <div className="relative px-4 pb-3 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 bg-white/10 hover:bg-white/15 focus-within:bg-white/20 border border-white/10 focus-within:border-white/30 rounded-xl px-3 py-2 transition-all group shadow-inner">
                <Search size={13} className="shrink-0 text-white/40 group-focus-within:text-white/80 transition-colors" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("expenses.search")}
                  className="bg-transparent outline-none w-full text-sm text-white placeholder:text-white/35 font-medium" />
                {search && <button onClick={() => setSearch("")} className="w-4 h-4 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center text-white/70 hover:text-white transition-all shrink-0"><X size={9} /></button>}
              </div>
              <div className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl px-2.5 py-2 transition-all">
                <Filter size={11} className="shrink-0 text-white/50" />
                <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value as Category | ""); setPage(1); }}
                  className="bg-transparent outline-none text-xs text-white font-semibold appearance-none cursor-pointer">
                  <option value="" className="text-gray-800">{t("expenses.all_categories")}</option>
                  {ALL_CATEGORIES.map((c) => (
                    <option key={c} value={c} className="text-gray-800">{t(`expenses.cat.${c}`)}</option>
                  ))}
                </select>
                <ChevronDown size={10} className="text-white/35 shrink-0" />
              </div>
            </div>
            <DateRangeFilter
              from={dateFrom} to={dateTo}
              onFrom={(v) => { setDateFrom(v); setPage(1); }}
              onTo={(v) => { setDateTo(v); setPage(1); }}
              onClear={() => { setDateFrom(""); setDateTo(""); setPage(1); }}
              accentClass="focus:ring-[#1372e6]/30 focus:border-[#1372e6]"
            />
          </div>
        </div>

        {/* ── STAT CARDS ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-2">
          {[
            { label: t("expenses.total_today"),     value: summaryToday.total_expenses.toLocaleString(), sub: `${summaryToday.count} ${t("expenses.records")}`,  color: "text-[#1372e6]",  dot: "bg-[#1372e6]" },
            { label: t("expenses.total_month"),     value: summaryMonth.total_expenses.toLocaleString(), sub: `${summaryMonth.count} ${t("expenses.records")}`,  color: "text-blue-700",   dot: "bg-blue-600" },
            { label: t("expenses.top_category"),    value: topCategory ? t(`expenses.cat.${topCategory.category}`) : "—", sub: topCategory ? topCategory.total.toLocaleString() : t("common.no_data"), color: "text-orange-600", dot: "bg-orange-400" },
            { label: t("expenses.categories_used"), value: String(byCategory.length), sub: `${ALL_CATEGORIES.length} ${t("expenses.available")}`, color: "text-violet-600", dot: "bg-violet-500" },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-lg border border-slate-200 px-2.5 py-2">
              <div className="flex items-center gap-1 mb-1">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${card.dot}`} />
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider leading-none truncate">{card.label}</p>
              </div>
              <p className={`text-sm font-bold leading-none tabular-nums ${card.color}`}>{card.value}</p>
              {card.sub && <p className="text-[9px] text-slate-400 mt-0.5 leading-tight truncate">{card.sub}</p>}
            </div>
          ))}
        </div>

        {/* ── EXPENSES TABLE ─────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

          {/* toolbar */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 bg-slate-50/60">
            <p className="text-[10px] text-slate-500">
              Showing <span className="font-semibold text-slate-700">{filteredExpenses.length.toLocaleString()}</span> of <span className="font-semibold text-slate-700">{total.toLocaleString()}</span> {t("expenses.records")}
            </p>
            <div className="flex items-center gap-1.5">
              {(search || catFilter) && (
                <button onClick={() => { setSearch(""); setCatFilter(""); setPage(1); }} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition mr-1"><X size={10} /> Clear</button>
              )}
              <button onClick={downloadTemplate} title="Download import template"
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-violet-200 text-violet-600 bg-white hover:bg-violet-50 transition">
                <Download size={10} /> Template
              </button>
              <button onClick={() => fileInputRef.current?.click()} title="Import from CSV/Excel"
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-violet-200 text-violet-600 bg-white hover:bg-violet-50 transition">
                <Upload size={10} /> Import
              </button>
              <button onClick={exportExcel} title="Export to Excel"
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-green-200 text-green-600 bg-white hover:bg-green-50 transition">
                <FileSpreadsheet size={10} /> Excel
              </button>
              <button onClick={exportPDF} title="Export to PDF"
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-red-200 text-red-600 bg-white hover:bg-red-50 transition">
                <FileText size={10} /> PDF
              </button>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />

          {hasDateFilter && (
            <div className="flex items-center gap-2 px-4 py-1.5 border-b border-slate-100 text-xs bg-[#EBF2FD]" style={{ color: "#1372e6" }}>
              <Calendar size={13} />
              <span>
                {dateFrom && <> {t("common.date")}: <span className="font-semibold">{dateFrom}</span></>}
                {dateTo   && <> → <span className="font-semibold">{dateTo}</span></>}
                {" "}· <span className="font-semibold">{total.toLocaleString()}</span> {t("expenses.records")}
              </span>
              <button onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }} className="ml-auto hover:opacity-70" style={{ color: "#1372e6" }}><X size={13} /></button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {[
                    t("expenses.col_date"),
                    t("expenses.col_title"),
                    t("expenses.col_category"),
                    t("expenses.col_amount"),
                    t("expenses.col_notes"),
                    "Proof",
                    "",
                  ].map((h) => (
                    <th key={h} className="px-2.5 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map((e) => {
                  const d = e.expense_date ? new Date(e.expense_date) : null;
                  const colors = CATEGORY_COLORS[e.category] || CATEGORY_COLORS.other;
                  return (
                    <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-2.5 py-1 whitespace-nowrap">
                        {d ? (
                          <div>
                            <p className="text-[10px] font-medium text-slate-700 leading-tight">{toDateStr(d)}</p>
                            <p className="text-[9px] text-slate-400 leading-tight">{d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                        ) : <span className="text-slate-300 text-[10px]">—</span>}
                      </td>
                      <td className="px-2.5 py-1">
                        <p className="font-semibold text-slate-800 text-[11px] leading-tight">{e.title}</p>
                        <p className="text-[9px] text-slate-400 font-mono leading-tight">{e.id.slice(0, 8)}</p>
                      </td>
                      <td className="px-2.5 py-1">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${colors.badge}`}>
                          {t(`expenses.cat.${e.category}`)}
                        </span>
                      </td>
                      <td className="px-2.5 py-1 font-bold tabular-nums text-[11px]" style={{ color: "#1372e6" }}>
                        {Number(e.amount).toLocaleString()}
                      </td>
                      <td className="px-2.5 py-1 text-slate-500 text-[9px] max-w-[180px] truncate">
                        {e.notes || <span className="text-slate-300 italic">—</span>}
                      </td>
                      <td className="px-2.5 py-1">
                        {e.has_proof ? (
                          <button onClick={() => openProofViewer(e.id)} title="View proof"
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition text-[9px] font-medium">
                            <Paperclip size={8} /> View
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[9px] italic">—</span>
                        )}
                      </td>
                      <td className="px-2.5 py-1">
                        <button onClick={() => deleteExpense(e.id)} disabled={deletingId === e.id}
                          className="p-0.5 rounded bg-red-50 hover:bg-red-100 text-red-500 transition disabled:opacity-40">
                          <Trash2 size={10} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredExpenses.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                <AlertCircle size={20} className="opacity-40" />
              </div>
              <p className="font-semibold text-slate-500 text-xs">{t("expenses.no_expenses")}</p>
              {!search && !catFilter && (
                <button onClick={openModal}
                  className="mt-3 flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition hover:opacity-90" style={{ background: "#1372e6" }}>
                  <Plus size={11} /> {t("expenses.add")}
                </button>
              )}
            </div>
          )}

          <Pagination page={page} totalPages={totalPages} total={total}
            pageSize={pageSize} pageSizes={PAGE_SIZES} onPage={setPage} onPageSize={setPageSize} />
        </div>

        {/* ── BY-CATEGORY BREAKDOWN ───────────────────────────── */}
        {byCategory.length > 0 && (
          <div className="mt-2 bg-white rounded-xl border border-slate-200 px-3 py-2">
            <h2 className="text-[11px] font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <BarChart3 size={12} style={{ color: "#1372e6" }} />
              {t("expenses.breakdown_title")}
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1.5">
              {byCategory.map((row) => {
                const colors = CATEGORY_COLORS[row.category] || CATEGORY_COLORS.other;
                const grandTotal = byCategory.reduce((s, r) => s + r.total, 0);
                const pct = grandTotal > 0 ? Math.round((row.total / grandTotal) * 100) : 0;
                return (
                  <div key={row.category} className={`rounded-lg px-2 py-1.5 ${colors.bg}`}>
                    <p className={`text-[8px] font-semibold uppercase tracking-wide ${colors.text} truncate`}>{t(`expenses.cat.${row.category}`)}</p>
                    <p className={`text-[11px] font-bold mt-0.5 ${colors.text} tabular-nums`}>{row.total.toLocaleString()}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[8px] text-slate-400">{row.count}</p>
                      <p className={`text-[8px] font-bold ${colors.text}`}>{pct}%</p>
                    </div>
                    <div className="mt-1 h-0.5 bg-black/10 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${colors.text.replace("text-", "bg-")}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── PROOF VIEWER ────────────────────────────────────── */}
        {viewingProofs.length > 0 && (() => {
          const current = viewingProofs[viewerIndex];
          return (
            <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setViewingProofs([])}>
              <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}>

                {/* header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Paperclip size={14} className="text-emerald-500" />
                    Expense Proof
                    {viewingProofs.length > 1 && (
                      <span className="text-xs font-normal text-slate-400 ml-1">
                        {viewerIndex + 1} / {viewingProofs.length}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={current.data} download={current.name}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
                      <Download size={11} /> Download
                    </a>
                    <button onClick={() => setViewingProofs([])}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={16} /></button>
                  </div>
                </div>

                {/* main viewer */}
                <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-50 min-h-0">
                  {current.type === "application/pdf" ? (
                    <iframe src={current.data} className="w-full h-[60vh] rounded border border-slate-200" title={current.name} />
                  ) : (
                    <img src={current.data} alt={current.name} className="max-w-full max-h-[60vh] object-contain rounded shadow" />
                  )}
                </div>

                {/* thumbnail strip (only when >1 file) */}
                {viewingProofs.length > 1 && (
                  <div className="flex gap-2 px-4 py-3 border-t border-slate-100 overflow-x-auto shrink-0 bg-slate-50/60">
                    {viewingProofs.map((f, i) => (
                      <button key={i} onClick={() => setViewerIndex(i)}
                        className={`shrink-0 w-14 h-14 rounded-lg border-2 overflow-hidden flex items-center justify-center transition ${i === viewerIndex ? "border-[#1372e6] shadow" : "border-slate-200 hover:border-slate-400"}`}>
                        {f.type === "application/pdf" ? (
                          <FileIcon size={20} className="text-red-400" />
                        ) : (
                          <img src={f.data} alt={f.name} className="w-full h-full object-cover" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── MODAL ───────────────────────────────────────────── */}
        {showModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-3">
            <div className="bg-white rounded-xl w-full max-w-md shadow-2xl max-h-[92vh] flex flex-col">
              <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100 shrink-0">
                <h2 className="text-sm font-semibold text-slate-800">{t("expenses.add_title")}</h2>
                <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setProofEntries([]); }}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={14} /></button>
              </div>

              <div className="px-4 py-3 grid gap-3 overflow-y-auto flex-1">
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-0.5">
                    {t("expenses.title_field")} <span className="text-red-400">*</span>
                  </label>
                  <input className={inputCls} placeholder="e.g. Monthly rent, Electricity bill"
                    value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-0.5">
                      {t("expenses.category")} <span className="text-red-400">*</span>
                    </label>
                    <select className={inputCls} value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value as Category })}>
                      {ALL_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{t(`expenses.cat.${c}`)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-0.5">
                      {t("expenses.amount")} <span className="text-red-400">*</span>
                    </label>
                    <input type="number" min="0" step="0.01" className={inputCls} placeholder="0"
                      value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-0.5">
                    {t("expenses.expense_date")} <span className="text-red-400">*</span>
                  </label>
                  <input type="date" className={inputCls}
                    value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-0.5">{t("common.notes")}</label>
                  <textarea rows={2} className={`${inputCls} resize-none`} placeholder="Optional notes..."
                    value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>

                {/* ── Proof upload (up to 5 files) ── */}
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-0.5 flex items-center gap-1">
                    <Paperclip size={10} /> Proof
                    <span className="text-slate-400 font-normal ml-1 text-[10px]">up to 5 · image or PDF · max 5 MB</span>
                  </label>
                  <input ref={proofInputRef} type="file" accept="image/*,application/pdf"
                    multiple className="hidden" onChange={handleProofSelect} />

                  {proofEntries.length > 0 && (
                    <div className="grid grid-cols-4 gap-1.5 mb-1.5">
                      {proofEntries.map((entry, idx) => (
                        <div key={idx} className="relative rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                          {entry.preview === "pdf" ? (
                            <div className="flex flex-col items-center justify-center gap-0.5 py-2 px-1">
                              <FileIcon size={18} className="text-red-400" />
                              <span className="text-[8px] text-slate-500 truncate w-full text-center px-1">{entry.name}</span>
                            </div>
                          ) : (
                            <img src={entry.preview} alt={entry.name} className="w-full h-14 object-cover" />
                          )}
                          <button onClick={() => removeProofEntry(idx)}
                            className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 transition">
                            <X size={7} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {proofEntries.length < 5 && (
                    <button type="button" onClick={() => proofInputRef.current?.click()}
                      className="w-full border border-dashed border-slate-300 hover:border-[#1372e6] rounded-lg px-3 py-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 hover:text-[#1372e6] transition-colors">
                      <ImageIcon size={11} />
                      {proofEntries.length === 0 ? "Attach receipts / documents" : `Add more (${5 - proofEntries.length} left)`}
                    </button>
                  )}
                </div>

                {form.amount && Number(form.amount) > 0 && (
                  <div className="rounded-lg px-2.5 py-1.5 text-[11px] bg-[#EBF2FD]" style={{ color: "#1372e6" }}>
                    {t("expenses.recording")}: <span className="font-bold">{Number(form.amount).toLocaleString()}</span>
                    {" "}{t("expenses.under")} <span className="font-bold">{t(`expenses.cat.${form.category}`)}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100 shrink-0">
                <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setProofEntries([]); }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition">
                  {t("common.cancel")}
                </button>
                <button onClick={submitForm} disabled={submitting}
                  className="px-4 py-1.5 rounded-lg text-white text-xs font-semibold transition disabled:opacity-60 hover:opacity-90 flex items-center gap-1.5" style={{ background: "#1372e6" }}>
                  {proofEntries.length > 0 && !submitting && <Paperclip size={10} />}
                  {submitting ? t("common.saving") : t("expenses.add")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ExpenseSkeleton() {
  return (
    <div className="min-h-screen">
      <style>{`
        @keyframes exp-sh {
          0%   { background-position: -600px 0; }
          100% { background-position:  600px 0; }
        }
        .exp-sh {
          background: linear-gradient(90deg, #f0f0f0 25%, #e4e4e4 50%, #f0f0f0 75%);
          background-size: 600px 100%;
          animation: exp-sh 1.4s infinite linear;
        }
        .exp-sh-blue {
          background: linear-gradient(90deg, rgba(255,255,255,0.10) 25%, rgba(255,255,255,0.20) 50%, rgba(255,255,255,0.10) 75%);
          background-size: 600px 100%;
          animation: exp-sh 1.4s infinite linear;
        }
      `}</style>

      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4">

        {/* Banner */}
        <div className="rounded-2xl mb-2 overflow-hidden px-4 pt-3 pb-3"
          style={{ background: "linear-gradient(135deg, #1372e6 0%, #1168d6 50%, #0a47a0 100%)" }}>
          <div className="flex items-center gap-2.5 mb-2">
            <div className="exp-sh-blue w-8 h-8 rounded-xl shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="exp-sh-blue h-2 w-12 rounded" />
              <div className="exp-sh-blue h-3 w-28 rounded" />
            </div>
            <div className="exp-sh-blue h-6 w-6 rounded-lg shrink-0" />
            <div className="exp-sh-blue h-7 w-20 rounded-lg shrink-0" />
          </div>
          <div className="exp-sh-blue h-7 rounded-xl mb-1.5" />
          <div className="exp-sh-blue h-6 rounded-xl" />
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-200 px-2.5 py-2">
              <div className="flex items-center gap-1 mb-1.5">
                <div className="exp-sh w-1.5 h-1.5 rounded-full shrink-0" />
                <div className="exp-sh h-1.5 w-16 rounded" />
              </div>
              <div className="exp-sh h-4 w-14 rounded mb-1" />
              <div className="exp-sh h-1.5 w-10 rounded" />
            </div>
          ))}
        </div>

        {/* Table card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 bg-slate-50/60">
            <div className="exp-sh h-2 w-24 rounded" />
            <div className="flex items-center gap-1.5">
              {[56, 44, 48, 40].map((w, i) => (
                <div key={i} className="exp-sh h-5 rounded" style={{ width: w }} />
              ))}
            </div>
          </div>

          {/* Table head */}
          <div className="grid gap-3 px-2.5 py-1.5 border-b border-slate-200 bg-slate-50"
            style={{ gridTemplateColumns: "80px 1fr 80px 70px 120px 50px 30px" }}>
            {[...Array(7)].map((_, i) => (
              <div key={i} className="exp-sh h-1.5 rounded" />
            ))}
          </div>

          {/* Table rows */}
          {[...Array(9)].map((_, i) => (
            <div key={i} className="grid gap-3 px-2.5 py-1 border-b border-slate-50 items-center"
              style={{ gridTemplateColumns: "80px 1fr 80px 70px 120px 50px 30px" }}>
              <div className="space-y-0.5">
                <div className="exp-sh h-2 w-16 rounded" />
                <div className="exp-sh h-1.5 w-10 rounded" />
              </div>
              <div className="space-y-0.5">
                <div className="exp-sh h-2.5 rounded" />
                <div className="exp-sh h-1.5 w-3/4 rounded" />
              </div>
              <div className="exp-sh h-4 w-14 rounded-full" />
              <div className="exp-sh h-2.5 w-12 rounded" />
              <div className="exp-sh h-2 rounded" />
              <div className="exp-sh h-4 w-9 rounded" />
              <div className="exp-sh h-5 w-5 rounded" />
            </div>
          ))}

          {/* Pagination row */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100">
            <div className="exp-sh h-2 w-20 rounded" />
            <div className="flex gap-1">
              {[...Array(4)].map((_, i) => <div key={i} className="exp-sh h-6 w-7 rounded" />)}
            </div>
          </div>
        </div>

        {/* Breakdown strip */}
        <div className="mt-2 bg-white rounded-xl border border-slate-200 px-3 py-2">
          <div className="exp-sh h-2.5 w-32 rounded mb-2" />
          <div className="grid grid-cols-5 gap-1.5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="exp-sh h-14 rounded-lg" />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
