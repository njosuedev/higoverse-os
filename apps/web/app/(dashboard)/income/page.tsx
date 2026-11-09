"use client";

// Income: money the business earns outside its sales (rentals, services,
// commissions, interest…), next to Expenses. Rents from Sales → Rentals and
// "money received" kept in Expenses are counted here too (lib/income.ts),
// and Reports and Home add all of it to the profit.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CarFront, Pencil, Plus, RefreshCw, Search, Trash2, TrendingUp, X } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import DeepLink from "@/app/components/DeepLink";
import DateRangeFilter from "@/app/components/ui/DateRangeFilter";
import { askConfirm, notify } from "@/lib/dialogs";
import { settingsRequest } from "@/lib/settings-api";
import {
  deleteIncome, incomeTotals, INCOME_SOURCES, listIncomes, rentalsIn, saveIncome,
  type Income, type IncomeInput, type IncomeMethod, type IncomeSource, type IncomeTotals,
} from "@/lib/income";
import { listRentals, type Rental } from "@/lib/rental-api";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const money = (n: number) => Math.round(n || 0).toLocaleString();

function apiDetail(err: unknown, fallback: string): string {
  const m = /error: \d+ ([\s\S]*)$/.exec(err instanceof Error ? err.message : "");
  try {
    const d = m && JSON.parse(m[1])?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg).replace(/^Value error, /, "");
  } catch { /* not JSON */ }
  return fallback;
}

interface Form { title: string; source: IncomeSource; amount: string; date: string; method: IncomeMethod | ""; payer: string; reference: string; notes: string }
const emptyForm = (): Form => ({ title: "", source: "services", amount: "", date: ymd(new Date()), method: "", payer: "", reference: "", notes: "" });

/** One row of the list: recorded here, or a rent from Rentals (read-only). */
type Row = { kind: "income"; at: string; item: Income } | { kind: "rental"; at: string; item: Rental };

export default function IncomePage() {
  const { t, layout } = useLanguage();
  const isCar = layout === "car";
  const now = new Date();
  const [from, setFrom] = useState(ymd(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(ymd(now));
  const [source, setSource] = useState<IncomeSource | "">("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Income[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [totals, setTotals] = useState<IncomeTotals | null>(null);
  const [currency, setCurrency] = useState("RWF");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, tot, rents] = await Promise.all([
        listIncomes({ from: from || undefined, to: to || undefined }),
        incomeTotals(from || undefined, to || undefined, isCar),
        isCar ? listRentals().catch(() => [] as Rental[]) : Promise.resolve([] as Rental[]),
      ]);
      setItems(list);
      setTotals(tot);
      setRentals(rentalsIn(rents, from || undefined, to || undefined));
    } catch (e) { notify(apiDetail(e, t("common.error"))); }
    finally { setLoading(false); }
  }, [from, to, isCar, t]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    settingsRequest("/settings").then((s) => s?.data?.currency && setCurrency(s.data.currency)).catch(() => {});
  }, []);

  const rows: Row[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list: Row[] = [
      ...items.filter((i) => !source || i.source === source).map((i) => ({ kind: "income" as const, at: i.income_date, item: i })),
      ...(!source || source === "rental" ? rentals.map((r) => ({ kind: "rental" as const, at: r.start_date, item: r })) : []),
    ];
    return list
      .filter((r) => !q || (r.kind === "income"
        ? [r.item.title, r.item.payer, r.item.reference, r.item.notes]
        : [r.item.customer, r.item.car_name, r.item.plate_no, r.item.rental_no]).some((x) => (x || "").toLowerCase().includes(q)))
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [items, rentals, source, search]);

  const bySource = useMemo(() => {
    const m: Record<string, number> = {};
    items.forEach((i) => { m[i.source] = (m[i.source] ?? 0) + i.amount; });
    if (totals?.rentals) m.rental = (m.rental ?? 0) + totals.rentals;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [items, totals]);

  function openNew() { setEditingId(null); setForm(emptyForm()); }
  function openEdit(i: Income) {
    setEditingId(i.id);
    setForm({
      title: i.title, source: i.source, amount: String(i.amount), date: (i.income_date || "").slice(0, 10),
      method: i.payment_method ?? "", payer: i.payer ?? "", reference: i.reference ?? "", notes: i.notes ?? "",
    });
  }
  const set = (p: Partial<Form>) => setForm((f) => (f ? { ...f, ...p } : f));

  async function submit() {
    if (!form) return;
    if (!form.title.trim()) { notify(t("income.err_title")); return; }
    if (!(Number(form.amount) > 0)) { notify(t("income.err_amount")); return; }
    if (!form.date) { notify(t("income.err_date")); return; }
    const body: IncomeInput = {
      title: form.title.trim(), source: form.source, amount: Number(form.amount), income_date: `${form.date}T00:00:00`,
      payment_method: form.method || null, payer: form.payer.trim() || null, reference: form.reference.trim() || null, notes: form.notes.trim() || null,
    };
    setBusy(true);
    try {
      await saveIncome(body, editingId ?? undefined);
      setForm(null);
      setEditingId(null);
      notify(t("income.saved"), "success");
      await load();
    } catch (e) { notify(apiDetail(e, t("common.error"))); }
    finally { setBusy(false); }
  }

  async function remove(i: Income) {
    if (!(await askConfirm({ message: t("income.delete_q"), danger: true }))) return;
    try { await deleteIncome(i.id); await load(); } catch (e) { notify(apiDetail(e, t("common.delete_failed"))); }
  }

  const inputCls = "w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#057642]/30 focus:border-[#057642]";
  const label = (k: string, req = false) => <label className="block text-[11px] font-medium text-slate-500 mb-0.5">{t(k)}{req && <span className="text-red-400"> *</span>}</label>;
  const methodLabel = (m?: string | null) => (m === "mtn" ? "MTN MoMo" : m === "bank" ? t("income.method_bank") : m === "cash" ? t("income.method_cash") : "");

  return (
    <div className="min-h-screen">
      <DeepLink keys={["new"]} onParams={(p) => { if (p.get("new") === "1") openNew(); }} />
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4">
        {/* Header */}
        <div className="rounded-xl mb-2 overflow-hidden border border-emerald-200 bg-white">
          <div className="flex items-center gap-2 px-4 pt-3 pb-2 flex-wrap">
            <TrendingUp size={16} className="text-[#057642] shrink-0" />
            <div className="mr-auto">
              <h1 className="text-sm font-bold text-slate-900">{t("income.title")}</h1>
              <p className="text-xs text-slate-500">{t("income.hint")}</p>
            </div>
            <button onClick={() => void load()} title={t("common.refresh")} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-[#057642]">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
            <button onClick={openNew} className="flex items-center gap-1.5 text-white text-xs font-bold px-3 py-2 rounded-lg bg-[#057642] hover:opacity-90">
              <Plus size={13} strokeWidth={3} /> {t("income.new")}
            </button>
          </div>
          <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
            <select value={source} onChange={(e) => setSource(e.target.value as IncomeSource | "")}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white">
              <option value="">{t("income.all_sources")}</option>
              {INCOME_SOURCES.map((s) => <option key={s} value={s}>{t(`income.src_${s}`)}</option>)}
            </select>
            <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} onClear={() => { setFrom(""); setTo(""); }} />
            <div className="hgv-search hgv-search--sm hgv-page-search ml-auto w-full sm:w-64">
              <Search size={15} className="hgv-search-icon" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("income.search")} className="hgv-search-input text-sm" />
              {search && <button type="button" onClick={() => setSearch("")} className="hgv-search-clear"><X size={13} /></button>}
            </div>
          </div>
        </div>

        {/* Figures */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
          <Figure label={t("income.total")} value={`${currency} ${money(totals?.total ?? 0)}`} detail={`${(totals?.recordedCount ?? 0) + (totals?.rentalsCount ?? 0)} ${t("income.records")}`} strong />
          <Figure label={t("income.recorded_here")} value={money(totals?.recorded ?? 0)} detail={`${totals?.recordedCount ?? 0} ${t("income.records")}`} />
          {isCar
            ? <Figure label={t("income.from_rentals")} value={money(totals?.rentals ?? 0)} detail={`${totals?.rentalsCount ?? 0} ${t("rental.title").toLowerCase()}`} />
            : <Figure label={t("income.top_source")} value={bySource[0] ? t(`income.src_${bySource[0][0]}`) : "-"} detail={bySource[0] ? money(bySource[0][1]) : t("common.no_data")} />}
          <Figure label={t("income.from_expenses")} value={money(totals?.fromExpenses ?? 0)} detail={t("income.from_expenses_hint")} />
        </div>

        {/* By source */}
        {bySource.length > 1 && (
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 mb-2">
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {bySource.map(([s, v]) => {
                const pct = totals?.total ? Math.round((v / totals.total) * 100) : 0;
                return (
                  <div key={s} className="min-w-[120px]">
                    <p className="text-[11px] font-semibold text-slate-500">{t(`income.src_${s}`)} · {pct}%</p>
                    <p className="text-sm font-bold tabular-nums text-slate-800">{money(v)}</p>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-[#057642]" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* List */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading && rows.length === 0 ? (
            <div className="divide-y divide-slate-100">
              {[0, 1, 2].map((i) => <div key={i} className="px-4 py-3.5"><div className="hgv-shimmer h-3 w-1/3 rounded" /></div>)}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-center px-4">
              <TrendingUp size={30} className="text-slate-200 mb-2" />
              <p className="text-sm font-medium text-slate-500">{t("income.none")}</p>
              <button onClick={openNew} className="mt-3 flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#057642]">
                <Plus size={12} /> {t("income.new")}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rows.map((r) => r.kind === "income" ? (
                <div key={`i-${r.item.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                  <div className="w-20 shrink-0 text-xs text-slate-500 tabular-nums">{r.at.slice(0, 10)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">{r.item.title}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {[t(`income.src_${r.item.source}`), r.item.payer, methodLabel(r.item.payment_method), r.item.reference].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-[#057642]">+{money(r.item.amount)}</p>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(r.item)} title={t("common.edit")} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:text-blue-600"><Pencil size={13} /></button>
                    <button onClick={() => void remove(r.item)} title={t("common.delete")} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:text-red-600"><Trash2 size={13} /></button>
                  </div>
                </div>
              ) : (
                <div key={`r-${r.item.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                  <div className="w-20 shrink-0 text-xs text-slate-500 tabular-nums">{r.at}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate flex items-center gap-1.5"><CarFront size={13} className="text-slate-400" /> {r.item.customer} · {r.item.car_name}</p>
                    <p className="text-xs text-slate-500 truncate">{t("income.src_rental")} · {r.item.rental_no} · {r.item.start_date} → {r.item.end_date}</p>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-[#057642]">+{money(r.item.rent_amount)}</p>
                  <Link href="/sales?tab=rentals" className="text-[11px] font-semibold text-blue-600 hover:underline w-[68px] text-right">{t("rental.title")}</Link>
                </div>
              ))}
            </div>
          )}
        </div>
        {(totals?.fromExpenses ?? 0) > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            {t("income.expenses_note").replace("{amount}", money(totals!.fromExpenses))}{" "}
            <Link href="/expenses" className="font-semibold text-blue-600 hover:underline">{t("nav.expenses")}</Link>
          </p>
        )}
      </div>

      {/* New / edit */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={() => !busy && setForm(null)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <p className="font-bold text-slate-800">{t(editingId ? "income.edit" : "income.new")}</p>
              <button onClick={() => setForm(null)} aria-label={t("common.close")} className="p-1 rounded hover:bg-slate-100"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>{label("income.what", true)}<input className={inputCls} value={form.title} placeholder={t("income.what_ph")} onChange={(e) => set({ title: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div>{label("income.source", true)}
                  <select className={inputCls} value={form.source} onChange={(e) => set({ source: e.target.value as IncomeSource })}>
                    {INCOME_SOURCES.map((s) => <option key={s} value={s}>{t(`income.src_${s}`)}</option>)}
                  </select>
                </div>
                <div>{label("income.amount", true)}<input type="number" min="0" className={inputCls} value={form.amount} onChange={(e) => set({ amount: e.target.value })} /></div>
                <div>{label("income.date", true)}<input type="date" className={inputCls} value={form.date} onChange={(e) => set({ date: e.target.value })} /></div>
                <div>{label("income.method")}
                  <select className={inputCls} value={form.method} onChange={(e) => set({ method: e.target.value as IncomeMethod | "" })}>
                    <option value="">-</option>
                    <option value="cash">{t("income.method_cash")}</option>
                    <option value="mtn">MTN MoMo</option>
                    <option value="bank">{t("income.method_bank")}</option>
                  </select>
                </div>
                <div>{label("income.payer")}<input className={inputCls} value={form.payer} onChange={(e) => set({ payer: e.target.value })} /></div>
                <div>{label("income.reference")}<input className={inputCls} value={form.reference} onChange={(e) => set({ reference: e.target.value })} /></div>
              </div>
              {isCar && form.source === "rental" && !editingId && (
                <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">{t("income.rental_warning")}</p>
              )}
              <div>{label("common.notes")}<textarea rows={2} className={inputCls} value={form.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100">
              <button onClick={() => setForm(null)} disabled={busy} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm">{t("common.cancel")}</button>
              <button onClick={() => void submit()} disabled={busy} className="px-4 py-1.5 rounded-lg text-white text-sm font-semibold bg-[#057642] disabled:opacity-50">
                {busy ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, detail, strong = false }: { label: string; value: string; detail: string; strong?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl border px-3.5 py-3 ${strong ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white"}`}>
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-xl font-bold tabular-nums ${strong ? "text-[#057642]" : "text-slate-900"}`}>{value}</p>
      <p className="mt-0.5 truncate text-xs text-slate-500">{detail}</p>
    </div>
  );
}
