"use client";

// Higoverse's income from its tax clients, above the Tax clients list:
// expected (the agreed fees of clients whose contract has started) next to
// real (payments recorded), for a month, with the months before. Also the
// window to record a client's payment and see their payments.

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Wallet, X } from "lucide-react";
import {
  deleteTaxPayment, getTaxIncome, getTaxPayments, recordTaxPayment,
  type TaxClient, type TaxIncome as Income, type TaxPayment,
} from "@/lib/admin-api";
import AmountInput from "@/app/components/ui/AmountInput";

type T = (k: string) => string;
const money = (n: number) => Math.round(n || 0).toLocaleString("en-US");
const thisMonth = () => new Date().toISOString().slice(0, 7);
const monthLabel = (p: string) => new Date(`${p}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

/** The month's expected and real income, and the last six months. */
export function TaxIncomeSummary({ t, period, setPeriod, data }: {
  t: T; period: string; setPeriod: (p: string) => void; data: Income | null;
}) {
  const pct = data && data.expected > 0 ? Math.round((data.received / data.expected) * 100) : 0;
  const top = Math.max(1, ...(data?.history ?? []).map((h) => Math.max(h.expected, h.received)));
  const card = (label: string, value: string, sub: string, tone: string) => (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 truncate text-lg font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="truncate text-[11px] text-slate-500">{sub}</p>
    </div>
  );
  return (
    <div className="border-b border-gray-100 px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <Wallet size={14} className="text-[#0a66c2]" />
        <p className="text-sm font-semibold text-gray-800">{t("tinc.title")}</p>
        <input type="month" value={period} max={thisMonth()} onChange={(e) => e.target.value && setPeriod(e.target.value)}
          className="ml-auto rounded-lg border border-gray-200 px-2 py-1 text-xs" />
      </div>
      {!data ? <div className="hgv-shimmer h-16 rounded-lg" /> : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {card(t("tinc.expected"), `Rwf ${money(data.expected)}`, `${data.clients_expected} ${t("tinc.clients")}`, "text-slate-900")}
            {card(t("tinc.received"), `Rwf ${money(data.received)}`, `${data.clients_paid} / ${data.clients_expected} ${t("tinc.paid_in_full")}`, "text-[#057642]")}
            {card(t("tinc.outstanding"), `Rwf ${money(data.outstanding)}`, t("tinc.outstanding_hint"), data.outstanding > 0 ? "text-amber-700" : "text-slate-900")}
            {card(t("tinc.collected"), `${pct}%`, t("tinc.collected_hint"), pct >= 100 ? "text-[#057642]" : "text-slate-900")}
          </div>
          <div className="mt-3 flex items-end gap-2 overflow-x-auto" aria-label={t("tinc.history")}>
            {data.history.map((h) => (
              <button key={h.period} onClick={() => setPeriod(h.period)} title={`${t("tinc.expected")}: ${money(h.expected)} · ${t("tinc.received")}: ${money(h.received)}`}
                className={`flex min-w-[52px] flex-1 flex-col items-center gap-1 rounded-md px-1 pb-1 pt-1.5 ${h.period === period ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                <span className="flex h-14 items-end gap-0.5">
                  <span className="w-2.5 rounded-t bg-slate-300" style={{ height: `${Math.max(2, (h.expected / top) * 56)}px` }} />
                  <span className="w-2.5 rounded-t bg-[#057642]" style={{ height: `${Math.max(2, (h.received / top) * 56)}px` }} />
                </span>
                <span className="text-[10px] text-slate-500">{monthLabel(h.period)}</span>
              </button>
            ))}
          </div>
          <p className="mt-1 flex items-center gap-3 text-[10.5px] text-slate-500">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-300" /> {t("tinc.expected")}</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#057642]" /> {t("tinc.received")}</span>
          </p>
        </>
      )}
    </div>
  );
}

/** A client's payments, and recording one (for [period] by default). */
export function TaxPaymentsDialog({ client, period, expected, received, t, onClose, onChanged }: {
  client: TaxClient; period: string; expected: number; received: number; t: T; onClose: () => void; onChanged: () => void;
}) {
  const [rows, setRows] = useState<TaxPayment[] | null>(null);
  const [form, setForm] = useState({
    period, amount: String(Math.max(0, expected - received) || client.monthly_fee || ""), paid_on: new Date().toISOString().slice(0, 10),
    method: "mtn" as "" | "cash" | "mtn" | "bank", reference: "", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try { setRows(await getTaxPayments(client.id)); } catch (e) { setRows([]); setError(e instanceof Error ? e.message : t("admin.err_load")); }
  }
  useEffect(() => { void load(); }, [client.id]); // eslint-disable-line react-hooks/exhaustive-deps -- loads once when the window opens

  async function save() {
    const amount = Number(form.amount);
    if (!(amount > 0)) { setError(t("tinc.err_amount")); return; }
    setBusy(true); setError(null);
    try {
      await recordTaxPayment({ client_id: client.id, period: form.period, amount, paid_on: form.paid_on, method: form.method || null,
        reference: form.reference || null, notes: form.notes || null });
      setForm((f) => ({ ...f, amount: "", reference: "", notes: "" }));
      await load(); onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : t("common.error")); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true);
    try { await deleteTaxPayment(id); await load(); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : t("common.error")); }
    finally { setBusy(false); }
  }

  const input = "w-full h-9 rounded-lg border border-slate-200 px-2.5 text-sm focus:outline-none focus:border-[#057642]";
  const label = (k: string, el: React.ReactNode) => (
    <label className="block"><span className="mb-0.5 block text-[11px] font-medium text-slate-500">{t(k)}</span>{el}</label>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t("tinc.payments")} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Wallet size={16} className="text-[#057642]" />
          <div className="mr-auto min-w-0">
            <p className="font-bold text-slate-800">{t("tinc.payments")}</p>
            <p className="truncate text-xs text-slate-500">{client.name} · {t("tinc.fee")}: Rwf {money(client.monthly_fee ?? 0)}</p>
          </div>
          <button onClick={onClose} aria-label={t("common.close")} className="rounded p-1 hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {error && <p className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-4">
            {label("tinc.month", <input type="month" className={input} value={form.period} onChange={(e) => e.target.value && setForm({ ...form, period: e.target.value })} />)}
            {label("tinc.amount", <AmountInput className={input} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />)}
            {label("tinc.paid_on", <input type="date" className={input} value={form.paid_on} onChange={(e) => setForm({ ...form, paid_on: e.target.value })} />)}
            {label("tinc.method", <select className={input} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as typeof form.method })}>
              <option value="mtn">MTN MoMo</option><option value="bank">Bank</option><option value="cash">Cash</option><option value="">-</option>
            </select>)}
            <div className="col-span-2">{label("tinc.reference", <input className={input} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />)}</div>
            <div className="col-span-2 flex justify-end">
              <button onClick={() => void save()} disabled={busy}
                className="flex items-center gap-1.5 rounded-lg bg-[#057642] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} {t("tinc.record")}
              </button>
            </div>
          </div>
          {rows === null ? (
            <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-slate-400" /></div>
          ) : rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">{t("tinc.none")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-16 shrink-0 text-xs font-semibold text-slate-700">{monthLabel(p.period)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                    {p.paid_on}{p.method ? ` · ${p.method === "mtn" ? "MTN MoMo" : p.method === "bank" ? "Bank" : "Cash"}` : ""}{p.reference ? ` · ${p.reference}` : ""}
                  </span>
                  <span className="text-sm font-bold tabular-nums text-[#057642]">{money(p.amount)}</span>
                  <button onClick={() => void remove(p.id)} disabled={busy} aria-label={t("common.delete")}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Loads the month's figures (again when [version] changes). */
export function useTaxIncome(period: string, version: number) {
  const [data, setData] = useState<Income | null>(null);
  useEffect(() => {
    let alive = true;
    getTaxIncome(period).then((d) => { if (alive) setData(d); }).catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, [period, version]);
  return data;
}
