"use client";

// A tax client's contracts with Higoverse (platform admin only): the list,
// a form to make or correct one, and printing it (lib/tax-contract-print.ts).
// The client's details come from the Tax clients row; Higoverse's side
// (representative, phones, MoMo code, bank account…) is filled in from the
// last contract and kept in the database, never in the code.

import { useEffect, useState } from "react";
import { FileSignature, Loader2, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import {
  createTaxContract, deleteTaxContract, getTaxContractCompany, getTaxContracts, updateTaxContract,
  type TaxClient, type TaxContract, type TaxContractCompany, type TaxContractInput,
} from "@/lib/admin-api";
import { printHtml } from "@/lib/print-frame";
import { taxContractHtml } from "@/lib/tax-contract-print";

type T = (k: string) => string;

const input = "w-full h-9 rounded-lg border border-slate-200 px-2.5 text-sm focus:outline-none focus:border-[#0a66c2]";
const today = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => `${today().slice(0, 7)}-01`;

/** Until a contract has been saved once: only what the website already
 *  publishes (lib/site.ts). The TIN, representative, other phone, MoMo code
 *  and bank account are typed once, then come from the last contract. */
const COMPANY_START: TaxContractCompany = {
  name: "HIGOVERSE", tin: "", representative: "", title: "Umuyobozi Mukuru",
  phone: "", phone2: "0790885174", email: "higoverse@gmail.com", website: "www.higoverse.com",
  address: "Kicukiro, Masaka", momo_code: "", bank_name: "Equity Bank", bank_account: "",
};

function blank(client: TaxClient, company: TaxContractCompany): TaxContractInput {
  return {
    client_id: client.id, contract_date: today(), start_date: firstOfMonth(),
    client_name: client.name, client_tin: client.tin ?? "", client_phone: client.phone ?? "",
    client_representative: client.delegate ?? "", monthly_fee: client.monthly_fee ?? 0, payment_day: 28, notes: "", company: { ...company },
  };
}

export default function TaxContracts({ client, t, onClose }: { client: TaxClient; t: T; onClose: () => void }) {
  const [rows, setRows] = useState<TaxContract[] | null>(null);
  const [company, setCompany] = useState<TaxContractCompany>(COMPANY_START);
  const [form, setForm] = useState<TaxContractInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function load() {
    try {
      const [list, last] = await Promise.all([getTaxContracts(client.id), getTaxContractCompany()]);
      setRows(list);
      if (last && Object.keys(last).length) setCompany({ ...COMPANY_START, ...last });
    } catch (e) { setRows([]); setError(e instanceof Error ? e.message : t("admin.err_load")); }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once when the window opens
  useEffect(() => { void load(); }, [client.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Partial<TaxContractInput>) => setForm((f) => (f ? { ...f, ...p } : f));
  const setCo = (p: Partial<TaxContractCompany>) => setForm((f) => (f ? { ...f, company: { ...f.company, ...p } } : f));

  function openNew() { setEditingId(null); setError(null); setForm(blank(client, company)); }
  function openEdit(c: TaxContract) {
    setEditingId(c.id); setError(null);
    setForm({
      client_id: c.client_id, contract_date: c.contract_date, start_date: c.start_date, client_name: c.client_name,
      client_tin: c.client_tin ?? "", client_phone: c.client_phone ?? "", client_representative: c.client_representative ?? "",
      monthly_fee: c.monthly_fee, payment_day: c.payment_day, notes: c.notes ?? "", company: { ...COMPANY_START, ...c.company },
    });
  }

  async function save(andPrint: boolean) {
    if (!form) return;
    if (!form.client_name.trim()) { setError(t("contract.err_name")); return; }
    if (!(form.monthly_fee > 0)) { setError(t("contract.err_fee")); return; }
    setBusy(true); setError(null);
    try {
      const saved = editingId ? await updateTaxContract(editingId, form) : await createTaxContract(form);
      setForm(null); setEditingId(null);
      setCompany({ ...COMPANY_START, ...saved.company });
      await load();
      if (andPrint) print(saved);
    } catch (e) { setError(e instanceof Error ? e.message : t("common.error")); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    setBusy(true);
    try { await deleteTaxContract(id); setConfirmId(null); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : t("common.error")); }
    finally { setBusy(false); }
  }

  const print = (c: TaxContract) => printHtml(taxContractHtml(c, { autoPrint: true, logoUrl: `${window.location.origin}/higoverse-logo.png` }));
  const field = (k: string, el: React.ReactNode, wide = false) => (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="block text-[11px] font-medium text-slate-500 mb-0.5">{t(k)}</span>{el}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t("contract.title")} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <FileSignature size={17} className="text-[#0a66c2]" />
          <div className="mr-auto min-w-0">
            <p className="font-bold text-slate-800">{t("contract.title")}</p>
            <p className="truncate text-xs text-slate-500">{client.name}{client.tin ? ` · ${client.tin}` : ""}</p>
          </div>
          {!form && <button onClick={openNew} className="flex items-center gap-1.5 rounded-lg bg-[#0a66c2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0958a8]">
            <Plus size={13} /> {t("contract.new")}
          </button>}
          <button onClick={onClose} aria-label={t("common.close")} className="p-1 rounded hover:bg-slate-100"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && <p className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

          {form ? (
            <div className="space-y-4 p-4">
              <section>
                <p className="mb-1.5 text-xs font-bold text-slate-700">{t("contract.client_side")}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {field("contract.client_name", <input className={input} value={form.client_name} onChange={(e) => set({ client_name: e.target.value })} />, true)}
                  {field("clients.tin", <input className={input} value={form.client_tin ?? ""} onChange={(e) => set({ client_tin: e.target.value })} />)}
                  {field("common.phone", <input className={input} value={form.client_phone ?? ""} onChange={(e) => set({ client_phone: e.target.value })} />)}
                  {field("contract.client_rep", <input className={input} value={form.client_representative ?? ""} onChange={(e) => set({ client_representative: e.target.value })} />, true)}
                </div>
              </section>
              <section>
                <p className="mb-1.5 text-xs font-bold text-slate-700">{t("contract.terms")}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {field("contract.date", <input type="date" className={input} value={form.contract_date} onChange={(e) => set({ contract_date: e.target.value })} />)}
                  {field("contract.start", <input type="date" className={input} value={form.start_date} onChange={(e) => set({ start_date: e.target.value })} />)}
                  {field("contract.fee", <input type="number" min="0" className={input} value={form.monthly_fee || ""} onChange={(e) => set({ monthly_fee: Number(e.target.value) || 0 })} />)}
                  {field("contract.pay_day", <input type="number" min="1" max="31" className={input} value={form.payment_day} onChange={(e) => set({ payment_day: Math.min(31, Math.max(1, Number(e.target.value) || 28)) })} />)}
                </div>
                <div className="mt-2">{field("common.notes", <textarea rows={2} className={`${input} h-auto py-1.5`} value={form.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />)}</div>
              </section>
              <section>
                <p className="mb-0.5 text-xs font-bold text-slate-700">{t("contract.company_side")}</p>
                <p className="mb-1.5 text-[11px] text-slate-500">{t("contract.company_hint")}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {field("contract.rep", <input className={input} value={form.company.representative ?? ""} onChange={(e) => setCo({ representative: e.target.value })} />)}
                  {field("contract.rep_title", <input className={input} value={form.company.title ?? ""} onChange={(e) => setCo({ title: e.target.value })} />)}
                  {field("clients.tin", <input className={input} value={form.company.tin ?? ""} onChange={(e) => setCo({ tin: e.target.value })} />)}
                  {field("common.phone", <input className={input} value={form.company.phone ?? ""} onChange={(e) => setCo({ phone: e.target.value })} />)}
                  {field("contract.phone2", <input className={input} value={form.company.phone2 ?? ""} onChange={(e) => setCo({ phone2: e.target.value })} />)}
                  {field("contract.email", <input className={input} value={form.company.email ?? ""} onChange={(e) => setCo({ email: e.target.value })} />)}
                  {field("contract.website", <input className={input} value={form.company.website ?? ""} onChange={(e) => setCo({ website: e.target.value })} />)}
                  {field("contract.address", <input className={input} value={form.company.address ?? ""} onChange={(e) => setCo({ address: e.target.value })} />)}
                  {field("contract.momo", <input className={input} value={form.company.momo_code ?? ""} onChange={(e) => setCo({ momo_code: e.target.value })} />)}
                  {field("contract.bank", <input className={input} value={form.company.bank_name ?? ""} onChange={(e) => setCo({ bank_name: e.target.value })} />)}
                  {field("contract.account", <input className={input} value={form.company.bank_account ?? ""} onChange={(e) => setCo({ bank_account: e.target.value })} />, true)}
                </div>
              </section>
            </div>
          ) : rows === null ? (
            <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <FileSignature size={30} className="mx-auto mb-2 text-slate-200" />
              <p className="text-sm text-slate-500">{t("contract.none")}</p>
              <button onClick={openNew} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#0a66c2] px-3 py-1.5 text-xs font-semibold text-white">
                <Plus size={13} /> {t("contract.new")}
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{c.contract_date} · Rwf {Math.round(c.monthly_fee).toLocaleString()} / {t("contract.month")}</p>
                    <p className="truncate text-xs text-slate-500">{t("contract.start")}: {c.start_date} · {c.client_representative || "—"}{c.created_by ? ` · ${c.created_by}` : ""}</p>
                  </div>
                  {confirmId === c.id ? (
                    <span className="flex items-center gap-1">
                      <button onClick={() => void remove(c.id)} disabled={busy} className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white">{t("common.delete")}</button>
                      <button onClick={() => setConfirmId(null)} className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-600">{t("common.cancel")}</button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <button onClick={() => print(c)} title={t("contract.print")} className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-[#0a66c2] hover:text-[#0a66c2]"><Printer size={12} /> {t("contract.print")}</button>
                      <button onClick={() => openEdit(c)} aria-label={t("common.edit")} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil size={13} /></button>
                      <button onClick={() => setConfirmId(c.id)} aria-label={t("common.delete")} className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {form && (
          <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
            <button onClick={() => { setForm(null); setEditingId(null); }} disabled={busy} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600">{t("common.cancel")}</button>
            <button onClick={() => void save(false)} disabled={busy} className="rounded-lg border border-[#0a66c2] px-3 py-1.5 text-xs font-semibold text-[#0a66c2] disabled:opacity-50">{t("common.save")}</button>
            <button onClick={() => void save(true)} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-[#0a66c2] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />} {t("contract.save_print")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
