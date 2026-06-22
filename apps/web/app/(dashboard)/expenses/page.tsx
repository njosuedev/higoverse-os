"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { expenseRequest } from "@/lib/expense-api";
import { useLanguage } from "@/lib/language-context";
import PageSkeleton from "@/app/components/dashboard/PageSkeleton";
import Pagination from "@/app/components/ui/Pagination";
import DateRangeFilter from "@/app/components/ui/DateRangeFilter";
import {
  Receipt, RefreshCw, Plus, Trash2, X, Search, Filter,
  Calendar, TrendingDown, DollarSign, BarChart3, Tag, AlertCircle, ChevronDown,
  Download, Upload, FileSpreadsheet, FileText,
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
}

interface CategoryStat { category: Category; total: number; count: number; }

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

  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setShowModal(true);
  }

  async function submitForm() {
    if (!form.title.trim()) { alert(t("expenses.title_field") + " required."); return; }
    if (!form.amount || Number(form.amount) <= 0) { alert(t("expenses.amount") + " must be > 0."); return; }
    if (!form.expense_date) { alert(t("expenses.expense_date") + " required."); return; }

    try {
      setSubmitting(true);
      await expenseRequest("/expenses", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          category: form.category,
          amount: Number(form.amount),
          notes: form.notes.trim() || undefined,
          expense_date: form.expense_date + "T00:00:00",
        }),
      });
      setShowModal(false);
      setForm(EMPTY_FORM);
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

  const inputCls = "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition";

  if (loading) return <PageSkeleton cards={4} rows={6} cols={5} />;

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
                    "",
                  ].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map((e) => {
                  const d = e.expense_date ? new Date(e.expense_date) : null;
                  const colors = CATEGORY_COLORS[e.category] || CATEGORY_COLORS.other;
                  return (
                    <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {d ? (
                          <div>
                            <p className="text-xs font-medium text-slate-700">{toDateStr(d)}</p>
                            <p className="text-[10px] text-slate-400">{d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        <p className="font-semibold text-slate-800 text-xs leading-tight">{e.title}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{e.id.slice(0, 8)}</p>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${colors.badge}`}>
                          {t(`expenses.cat.${e.category}`)}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-bold tabular-nums text-xs" style={{ color: "#1372e6" }}>
                        {Number(e.amount).toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-slate-500 text-[10px] max-w-[200px] truncate">
                        {e.notes || <span className="text-slate-300 italic">—</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        <button onClick={() => deleteExpense(e.id)} disabled={deletingId === e.id}
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

          {filteredExpenses.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <AlertCircle size={28} className="opacity-40" />
              </div>
              <p className="font-semibold text-slate-500 text-sm">{t("expenses.no_expenses")}</p>
              {!search && !catFilter && (
                <button onClick={openModal}
                  className="mt-4 flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 rounded-lg transition hover:opacity-90" style={{ background: "#1372e6" }}>
                  <Plus size={14} /> {t("expenses.add")}
                </button>
              )}
            </div>
          )}

          <Pagination page={page} totalPages={totalPages} total={total}
            pageSize={pageSize} pageSizes={PAGE_SIZES} onPage={setPage} onPageSize={setPageSize} />
        </div>

        {/* ── BY-CATEGORY BREAKDOWN ───────────────────────────── */}
        {byCategory.length > 0 && (
          <div className="mt-3 bg-white rounded-xl border border-slate-200 p-3">
            <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <BarChart3 size={15} style={{ color: "#1372e6" }} />
              {t("expenses.breakdown_title")}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {byCategory.map((row) => {
                const colors = CATEGORY_COLORS[row.category] || CATEGORY_COLORS.other;
                const grandTotal = byCategory.reduce((s, r) => s + r.total, 0);
                const pct = grandTotal > 0 ? Math.round((row.total / grandTotal) * 100) : 0;
                return (
                  <div key={row.category} className={`rounded-xl p-2.5 ${colors.bg}`}>
                    <p className={`text-[10px] font-semibold uppercase tracking-wide ${colors.text}`}>{t(`expenses.cat.${row.category}`)}</p>
                    <p className={`text-sm font-bold mt-1 ${colors.text}`}>{row.total.toLocaleString()}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[10px] text-slate-400">{row.count} {t("expenses.records")}</p>
                      <p className={`text-[10px] font-bold ${colors.text}`}>{pct}%</p>
                    </div>
                    <div className="mt-1.5 h-1 bg-black/10 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${colors.text.replace("text-", "bg-")}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── MODAL ───────────────────────────────────────────── */}
        {showModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
                <h2 className="text-base font-semibold text-slate-800">{t("expenses.add_title")}</h2>
                <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM); }}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={17} /></button>
              </div>

              <div className="px-6 py-5 grid gap-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t("expenses.title_field")} <span className="text-red-400">*</span>
                  </label>
                  <input className={inputCls} placeholder="e.g. Monthly rent, Electricity bill"
                    value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
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
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {t("expenses.amount")} <span className="text-red-400">*</span>
                    </label>
                    <input type="number" min="0" step="0.01" className={inputCls} placeholder="0"
                      value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t("expenses.expense_date")} <span className="text-red-400">*</span>
                  </label>
                  <input type="date" className={inputCls}
                    value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("common.notes")}</label>
                  <textarea rows={2} className={`${inputCls} resize-none`} placeholder="Optional notes..."
                    value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>

                {form.amount && Number(form.amount) > 0 && (
                  <div className="rounded-lg px-3 py-2 text-xs bg-[#EBF2FD]" style={{ color: "#1372e6" }}>
                    {t("expenses.recording")}: <span className="font-bold">{Number(form.amount).toLocaleString()}</span>
                    {" "}{t("expenses.under")} <span className="font-bold">{t(`expenses.cat.${form.category}`)}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-slate-100 shrink-0">
                <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM); }}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">
                  {t("common.cancel")}
                </button>
                <button onClick={submitForm} disabled={submitting}
                  className="px-5 py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-60 hover:opacity-90" style={{ background: "#1372e6" }}>
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
