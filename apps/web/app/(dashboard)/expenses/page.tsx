"use client";

import { useEffect, useMemo, useState } from "react";
import { expenseRequest } from "@/lib/expense-api";
import { useLanguage } from "@/lib/language-context";
import PageSkeleton from "@/app/components/dashboard/PageSkeleton";
import Pagination from "@/app/components/ui/Pagination";
import DateRangeFilter from "@/app/components/ui/DateRangeFilter";
import {
  Receipt, RefreshCw, Plus, Trash2, X, Search, Filter,
  Calendar, TrendingDown, DollarSign, BarChart3, Tag, AlertCircle,
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

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loading) loadExpenses(); }, [page, pageSize, dateFrom, dateTo, catFilter]);

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
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4">

        {/* ── HEADER ─────────────────────────────────────────── */}
        <div className="text-white rounded-xl p-4 mb-3" style={{ background: "#1372e6" }}>
          <div className="flex flex-wrap justify-between items-center gap-2">
            <div className="flex items-center gap-2.5">
              <Receipt size={20} />
              <div>
                <h1 className="text-base font-semibold">{t("expenses.title")}</h1>
                <p className="text-blue-100 text-xs mt-0.5">
                  {lastUpdated ? `${t("common.updated")} ${lastUpdated.toLocaleTimeString()}` : "—"} · {total.toLocaleString()} {t("expenses.records")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => loadAll(true)} disabled={refreshing}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition disabled:opacity-50">
                <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              </button>
              <button onClick={openModal}
                className="bg-white px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-semibold hover:bg-blue-50 transition" style={{ color: "#1372e6" }}>
                <Plus size={15} /> {t("expenses.add")}
              </button>
            </div>
          </div>

          {/* SEARCH + FILTERS */}
          <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
            <div className="flex-1 flex items-center bg-white/10 rounded-lg px-3 py-2 gap-2">
              <Search size={15} className="shrink-0 text-blue-100" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t("expenses.search")}
                className="bg-transparent outline-none w-full text-sm placeholder:text-blue-100" />
              {search && <button onClick={() => setSearch("")} className="text-blue-100 hover:text-white"><X size={13} /></button>}
            </div>
            <div className="flex items-center bg-white/10 rounded-lg px-3 py-2 gap-2">
              <Filter size={15} className="shrink-0 text-blue-100" />
              <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value as Category | ""); setPage(1); }}
                className="bg-transparent outline-none text-sm">
                <option value="" className="text-gray-700">{t("expenses.all_categories")}</option>
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c} className="text-gray-700">{t(`expenses.cat.${c}`)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* DATE RANGE */}
          <DateRangeFilter
            from={dateFrom} to={dateTo}
            onFrom={(v) => { setDateFrom(v); setPage(1); }}
            onTo={(v)   => { setDateTo(v);   setPage(1); }}
            onClear={()  => { setDateFrom(""); setDateTo(""); setPage(1); }}
            accentClass="focus:ring-[#1372e6]/30 focus:border-[#1372e6]"
          />
        </div>

        {/* ── STAT CARDS ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          {[
            {
              label: t("expenses.total_today"),
              value: summaryToday.total_expenses.toLocaleString(),
              sub: `${summaryToday.count} ${t("expenses.records")}`,
              color: "text-[#1372e6]", bg: "bg-[#EBF2FD]", icon: <TrendingDown size={17} />,
            },
            {
              label: t("expenses.total_month"),
              value: summaryMonth.total_expenses.toLocaleString(),
              sub: `${summaryMonth.count} ${t("expenses.records")}`,
              color: "text-[#0d5cc4]", bg: "bg-[#D5E8FB]", icon: <DollarSign size={17} />,
            },
            {
              label: t("expenses.top_category"),
              value: topCategory ? t(`expenses.cat.${topCategory.category}`) : "—",
              sub: topCategory ? topCategory.total.toLocaleString() : t("common.no_data"),
              color: "text-orange-600", bg: "bg-orange-50", icon: <Tag size={17} />,
            },
            {
              label: t("expenses.categories_used"),
              value: byCategory.length,
              sub: `${ALL_CATEGORIES.length} ${t("expenses.available")}`,
              color: "text-violet-600", bg: "bg-violet-50", icon: <BarChart3 size={17} />,
            },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap justify-between items-start gap-2">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide leading-none">{card.label}</p>
                  <p className={`text-base font-bold mt-1.5 ${card.color}`}>{card.value}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{card.sub}</p>
                </div>
                <div className={`${card.bg} ${card.color} p-1.5 rounded-lg shrink-0`}>{card.icon}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── EXPENSES TABLE ─────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          {hasDateFilter && (
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 text-xs bg-[#EBF2FD]" style={{ color: "#1372e6" }}>
              <Calendar size={13} />
              <span>
                {dateFrom && <> {t("common.date")}: <span className="font-semibold">{dateFrom}</span></>}
                {dateTo   && <> → <span className="font-semibold">{dateTo}</span></>}
                {" "}· <span className="font-semibold">{total.toLocaleString()}</span> {t("expenses.records")}
              </span>
              <button onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }} className="ml-auto hover:opacity-70" style={{ color: "#1372e6" }}><X size={13} /></button>
            </div>
          )}

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
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.map((e) => {
                const d = e.expense_date ? new Date(e.expense_date) : null;
                const colors = CATEGORY_COLORS[e.category] || CATEGORY_COLORS.other;
                return (
                  <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {d ? (
                        <div>
                          <p className="text-xs font-medium text-slate-700">{toDateStr(d)}</p>
                          <p className="text-xs text-slate-400">{d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-slate-800">{e.title}</p>
                      <p className="text-xs text-slate-400 font-mono">{e.id.slice(0, 8)}</p>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${colors.badge}`}>
                        {t(`expenses.cat.${e.category}`)}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-bold tabular-nums" style={{ color: "#1372e6" }}>
                      {Number(e.amount).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-slate-500 text-xs max-w-[200px] truncate">
                      {e.notes || <span className="text-slate-300 italic">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => deleteExpense(e.id)} disabled={deletingId === e.id}
                        className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition disabled:opacity-40">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredExpenses.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <div className="p-4 bg-slate-100 rounded-2xl mb-3"><AlertCircle size={32} className="opacity-40" /></div>
              <p className="font-medium text-slate-500 text-sm">{t("expenses.no_expenses")}</p>
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
          <div className="mt-6 bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <BarChart3 size={15} style={{ color: "#1372e6" }} />
              {t("expenses.breakdown_title")}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {byCategory.map((row) => {
                const colors = CATEGORY_COLORS[row.category] || CATEGORY_COLORS.other;
                const grandTotal = byCategory.reduce((s, r) => s + r.total, 0);
                const pct = grandTotal > 0 ? Math.round((row.total / grandTotal) * 100) : 0;
                return (
                  <div key={row.category} className={`rounded-xl p-3 ${colors.bg}`}>
                    <p className={`text-xs font-semibold uppercase tracking-wide ${colors.text}`}>{t(`expenses.cat.${row.category}`)}</p>
                    <p className={`text-lg font-bold mt-1 ${colors.text}`}>{row.total.toLocaleString()}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-slate-400">{row.count} {t("expenses.records")}</p>
                      <p className={`text-xs font-bold ${colors.text}`}>{pct}%</p>
                    </div>
                    <div className="mt-2 h-1 bg-black/10 rounded-full overflow-hidden">
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
