"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ClipboardPaste, Download, FileSignature, Landmark, Wallet, Loader2, Pencil, Phone, Plus, RefreshCw, Search, Store, Trash2, X,
} from "lucide-react";
import {
  createTaxClient, deleteTaxClient, fillMissingTaxContracts, getTaxClients, importTaxClients, updateTaxClient,
  type AdminShop, type TaxClient, type TaxClientInput,
} from "@/lib/admin-api";
import { cleanTin, normalizePhone, prettyPhone, shopTin, tinError } from "@/lib/company";
import TaxContracts from "@/app/components/admin/TaxContracts";
import { TaxIncomeSummary, TaxPaymentsDialog, useTaxIncome } from "@/app/components/admin/TaxIncome";

type T = (k: string) => string;

const input = "w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:border-[#0a66c2]";

/** The form's values checked like the server checks them; null fields stay empty. */
function check(v: { name: string; delegate: string; phone: string; tin: string; notes: string; fee?: string }):
  { data: TaxClientInput; errors: Partial<Record<"name" | "phone" | "tin" | "fee", string>> } {
  const errors: Partial<Record<"name" | "phone" | "tin" | "fee", string>> = {};
  const feeText = (v.fee ?? "").replace(/[,\s]/g, "").replace(/rwf|frw/gi, "");
  const fee = feeText ? Number(feeText) : null;
  if (fee !== null && !(fee >= 0)) errors.fee = "clients.err_fee";
  const name = v.name.replace(/\s+/g, " ").trim();
  if (!name) errors.name = "clients.err_name";
  const phone = v.phone.trim() ? normalizePhone(v.phone) : null;
  if (v.phone.trim() && !phone) errors.phone = "company.err_phone";
  const tinErr = tinError(v.tin, false);
  if (tinErr) errors.tin = tinErr;
  return {
    data: { name, delegate: v.delegate.trim() || null, phone, tin: cleanTin(v.tin) || null, notes: v.notes.trim() || null, monthly_fee: fee },
    errors,
  };
}

/** Rows pasted from a spreadsheet: [No,] Name, Representative, Phone, TIN[, Monthly fee] — tab separated. */
function parsePaste(text: string) {
  return text.split(/\r?\n/).map((line) => line.split("\t").map((c) => c.trim()))
    // Title rows ("Higoverse") have a single cell; header rows name the TIN column.
    .filter((cells) => cells.filter(Boolean).length >= 2 && !cells.some((c) => /^tin$/i.test(c)))
    // A leading row number ("1", "27") is dropped.
    .map((cells) => (cells.length >= 5 && /^\d{0,4}$/.test(cells[0]) ? cells.slice(1) : cells))
    .map(([name = "", delegate = "", phone = "", tin = "", fee = ""]) => check({ name, delegate, phone, tin, notes: "", fee }));
}

function ClientDialog({ client, t, onClose, onSaved }: {
  client: TaxClient | null; t: T; onClose: () => void; onSaved: (c: TaxClient) => void;
}) {
  const [v, setV] = useState({
    name: client?.name ?? "", delegate: client?.delegate ?? "", phone: client?.phone ? prettyPhone(client.phone) : "",
    tin: client?.tin ?? "", notes: client?.notes ?? "",
    fee: client?.monthly_fee != null ? String(client.monthly_fee) : "",
  });
  const [shown, setShown] = useState<Partial<Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { data, errors } = check(v);
    setShown(errors);
    if (Object.keys(errors).length) return;
    setBusy(true); setError("");
    try {
      onSaved(client ? await updateTaxClient(client.id, data) : await createTaxClient(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.err_generic"));
      setBusy(false);
    }
  }

  const field = (k: keyof typeof v, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      <input value={v[k]} onChange={set(k)} className={`${input} ${shown[k] ? "border-red-400" : ""}`} {...extra} />
      {shown[k] && <span className="mt-1 block text-xs text-red-600">{t(shown[k]!)}</span>}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
        aria-label={t(client ? "clients.edit" : "clients.add")} className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            {client ? <Pencil size={14} /> : <Plus size={14} />} {t(client ? "clients.edit" : "clients.add")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <div className="space-y-3 px-4 py-4">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {field("name", t("clients.name"), { maxLength: 255, autoFocus: true })}
          {field("delegate", t("clients.delegate"), { maxLength: 255 })}
          <div className="grid grid-cols-2 gap-3">
            {field("phone", t("common.phone"), { inputMode: "tel", placeholder: "0788 123 456" })}
            {field("tin", t("clients.tin"), { inputMode: "numeric", maxLength: 11, placeholder: "123456789" })}
          </div>
          {field("fee", t("clients.fee"), { inputMode: "numeric", placeholder: "20000" })}
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">{t("common.notes")}</span>
            <textarea value={v.notes} onChange={set("notes")} maxLength={2000} rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#0a66c2]" />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-[#0a66c2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0958a8] disabled:opacity-50">
            {busy && <Loader2 size={12} className="animate-spin" />} {t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

function ImportDialog({ t, onClose, onDone }: { t: T; onClose: () => void; onDone: (msg: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rows = useMemo(() => parsePaste(text), [text]);
  const good = rows.filter((r) => !Object.keys(r.errors).length);

  async function run() {
    setBusy(true); setError("");
    try {
      const r = await importTaxClients(good.map((g) => g.data));
      onDone(t("clients.imported").replace("{added}", String(r.added)).replace("{skipped}", String(r.skipped.length)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.err_generic"));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("clients.paste")}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><ClipboardPaste size={14} /> {t("clients.paste")}</h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <p className="text-xs text-slate-500">{t("clients.paste_hint")}</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} autoFocus spellCheck={false}
            placeholder={"1\tEXAMPLE TRADING LTD\tJane Doe\t0788 000 000\t100000000"}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs focus:outline-none focus:border-[#0a66c2]" />
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr><th className="px-2 py-1.5">{t("clients.name")}</th><th className="px-2 py-1.5">{t("clients.delegate")}</th>
                    <th className="px-2 py-1.5">{t("common.phone")}</th><th className="px-2 py-1.5">{t("clients.tin")}</th><th className="px-2 py-1.5" /></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r, i) => {
                    const errs = Object.values(r.errors);
                    return (
                      <tr key={i} className={errs.length ? "bg-red-50/60" : ""}>
                        <td className="px-2 py-1.5 font-medium text-slate-800">{r.data.name || "-"}</td>
                        <td className="px-2 py-1.5 text-slate-600">{r.data.delegate ?? "-"}</td>
                        <td className="px-2 py-1.5 tabular-nums text-slate-600">{prettyPhone(r.data.phone) || "-"}</td>
                        <td className="px-2 py-1.5 tabular-nums text-slate-600">{r.data.tin ?? "-"}</td>
                        <td className="px-2 py-1.5 text-red-600">{errs.map((e) => t(e!)).join(" · ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3">
          {rows.length > 0 && (
            <span className="mr-auto text-xs text-slate-500">
              {t("clients.paste_count").replace("{good}", String(good.length)).replace("{bad}", String(rows.length - good.length))}
            </span>
          )}
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            {t("common.cancel")}
          </button>
          <button onClick={run} disabled={busy || !good.length}
            className="flex items-center gap-1.5 rounded-lg bg-[#0a66c2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0958a8] disabled:opacity-50">
            {busy && <Loader2 size={12} className="animate-spin" />} {t("common.import")} ({good.length})
          </button>
        </div>
      </div>
    </div>
  );
}

/** Higoverse's own tax clients: who they are, who we deal with, how to reach them. */
export default function TaxClients({ t, shops, onOpenCompany, onRows, initialQuery = "" }: {
  t: T; shops: AdminShop[];
  /** Opens a company's details (a client whose TIN is on Higoverse). */
  onOpenCompany: (shopId: string) => void;
  /** The list as it now stands, so the Companies tab can mark tax clients. */
  onRows?: (rows: TaxClient[]) => void;
  initialQuery?: string;
}) {
  const [rows, setRows] = useState<TaxClient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [q, setQ] = useState(initialQuery);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<TaxClient | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // The tax advisory contracts of one client.
  const [contractsOf, setContractsOf] = useState<TaxClient | null>(null);
  const [filling, setFilling] = useState(false);
  // Expected (agreed fees) and real income (payments) for a month.
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [incomeVersion, setIncomeVersion] = useState(0);
  // Any change to the clients (fee, new, deleted, imported, contracts made)
  // shows in the income at once.
  const clientsKey = useMemo(() => (rows ?? []).map((r) => `${r.id}:${r.monthly_fee ?? ""}:${r.contracts ?? 0}`).join("|"), [rows]);
  const income = useTaxIncome(period, incomeVersion, clientsKey);
  const incomeOf = useMemo(() => new Map((income?.clients ?? []).map((c) => [c.client_id, c])), [income]);
  const [payingFor, setPayingFor] = useState<TaxClient | null>(null);
  // Every client must have a contract.
  const missing = useMemo(() => (rows ?? []).filter((r) => !r.contracts), [rows]);

  const load = useCallback(async () => {
    setBusy(true); setError(null);
    try { setRows(await getTaxClients()); }
    catch (e) { setError(e instanceof Error ? e.message : t("admin.err_load")); }
    finally { setBusy(false); }
  }, [t]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once when the tab opens
  useEffect(() => { void load(); }, [load]);

  async function fillMissing() {
    setFilling(true); setError(null);
    try {
      const r = await fillMissingTaxContracts();
      setNotice(t("clients.filled").replace("{made}", String(r.made)) +
        (r.no_fee.length ? ` ${t("clients.no_fee").replace("{names}", r.no_fee.slice(0, 8).join(", ") + (r.no_fee.length > 8 ? "…" : ""))}` : ""));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : t("admin.err_generic")); }
    finally { setFilling(false); }
  }

  // Clients that also run their business on Higoverse: the company with the same TIN.
  const companyByTin = useMemo(() => {
    const m = new Map<string, AdminShop>();
    for (const s of shops) { const tin = shopTin(s); if (tin && !m.has(tin)) m.set(tin, s); }
    return m;
  }, [shops]);

  useEffect(() => { if (rows) onRows?.(rows); }, [rows, onRows]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    return (rows ?? []).filter((r) => !s
      || r.name.toLowerCase().includes(s) || (r.delegate ?? "").toLowerCase().includes(s)
      || (digits.length >= 3 && ((r.tin ?? "").includes(digits) || (r.phone ?? "").includes(digits))));
  }, [rows, q]);

  async function remove(c: TaxClient) {
    setDeleting(c.id);
    try {
      await deleteTaxClient(c.id);
      setRows((p) => (p ?? []).filter((r) => r.id !== c.id));
    } catch (e) { setError(e instanceof Error ? e.message : t("admin.err_generic")); }
    finally { setDeleting(null); }
  }

  const exportCsv = () => {
    const cell = (v: unknown) => {
      const x = v == null ? "" : String(v);
      return `"${(/^[=+\-@]/.test(x) ? "'" + x : x).replace(/"/g, '""')}"`;
    };
    const head = ["No", t("clients.name"), t("clients.delegate"), t("common.phone"), t("clients.tin"), t("common.notes"), t("clients.fee")];
    const lines = shown.map((r, i) => [i + 1, r.name, r.delegate ?? "", prettyPhone(r.phone), r.tin ?? "", r.notes ?? "", r.monthly_fee ?? ""].map(cell).join(","));
    const blob = new Blob(["﻿" + [head.map(cell).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `higoverse-tax-clients-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const btn = "flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40";

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-gray-100 bg-slate-50/60 px-4 py-2.5 sm:flex-row sm:items-center">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <Landmark size={14} className="text-ink" /> {t("admin.tab_clients")}
          {rows && <span className="rounded-full bg-ink-soft px-2 py-0.5 text-[11px] font-semibold text-ink">{rows.length}</span>}
        </h2>
        <div className="relative sm:ml-auto">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("clients.search")}
            className="w-full rounded-lg border border-gray-200 py-1.5 pl-7 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-56" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditing("new")} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#0a66c2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0958a8] sm:flex-none">
            <Plus size={12} /> {t("clients.add")}
          </button>
          <button onClick={() => setImporting(true)} className={btn}><ClipboardPaste size={12} /> {t("clients.paste_short")}</button>
          {missing.length > 0 && (
            <button onClick={() => void fillMissing()} disabled={filling} title={t("clients.fill_hint")}
              className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50">
              {filling ? <Loader2 size={12} className="animate-spin" /> : <FileSignature size={12} />} {t("clients.fill").replace("{n}", String(missing.length))}
            </button>
          )}
          <button onClick={exportCsv} disabled={!shown.length} className={btn}><Download size={12} /> {t("admin.export_csv")}</button>
          <button onClick={load} disabled={busy} aria-label={t("common.refresh")} className={btn}>
            <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <TaxIncomeSummary t={t} period={period} setPeriod={setPeriod} data={income} />

      {error && <p className="px-4 py-3 text-sm text-red-600">{error}</p>}
      {notice && (
        <p className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          <CheckCircle2 size={14} /> {notice}
          <button onClick={() => setNotice(null)} aria-label={t("common.close")} className="ml-auto text-emerald-600"><X size={14} /></button>
        </p>
      )}

      {rows === null && !error ? (
        <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="hgv-shimmer h-10 rounded-lg" />)}</div>
      ) : shown.length === 0 ? (
        <div className="py-16 text-center">
          <Landmark size={32} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm font-semibold text-gray-400">{t(rows?.length ? "clients.none_found" : "clients.empty")}</p>
          {!rows?.length && <p className="mt-1 text-xs text-gray-400">{t("clients.empty_hint")}</p>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm sm:min-w-[720px]">
            <thead className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="w-10 px-4 py-2 font-semibold">#</th>
                <th data-primary className="px-2 py-2 font-semibold">{t("clients.name")}</th>
                <th className="px-2 py-2 font-semibold">{t("clients.delegate")}</th>
                <th className="px-2 py-2 font-semibold">{t("common.phone")}</th>
                <th className="px-2 py-2 font-semibold">{t("clients.tin")}</th>
                <th className="px-2 py-2 font-semibold text-right">{t("clients.fee_short")}</th>
                <th className="px-2 py-2 font-semibold">{t("contract.title_short")}</th>
                <th className="px-2 py-2 font-semibold">{t("tinc.this_month")}</th>
                <th className="w-28 px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {shown.map((r, i) => (
                <tr key={r.id} className="group hover:bg-slate-50/70">
                  <td className="px-4 py-2 tabular-nums text-gray-400">{i + 1}</td>
                  <td className="px-2 py-2">
                    <span className="font-medium text-gray-800">{r.name}</span>
                    {(() => {
                      const co = r.tin ? companyByTin.get(r.tin) : undefined;
                      if (!co) return null;
                      return (
                        <button onClick={() => onOpenCompany(co.id)} title={`${t("clients.on_higoverse_hint")}: ${co.name}`}
                          className="ml-2 inline-flex max-w-[14rem] items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-emerald-700 hover:underline">
                          <Store size={10} className="shrink-0" />
                          <span className="truncate">{t("clients.on_higoverse")}{co.name.trim().toLowerCase() !== r.name.trim().toLowerCase() ? ` · ${co.name}` : ""}</span>
                        </button>
                      );
                    })()}
                    {r.notes && <span className="block max-w-xs truncate text-[11px] text-gray-400" title={r.notes}>{r.notes}</span>}
                  </td>
                  <td className="px-2 py-2 text-gray-600">{r.delegate ?? "-"}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {r.phone ? (
                      <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 text-gray-700 hover:text-[#0a66c2]">
                        <Phone size={11} className="text-gray-400" /> {prettyPhone(r.phone)}
                      </a>
                    ) : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-2 py-2 font-mono text-[13px] text-gray-700">{r.tin ?? "-"}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-700">{r.monthly_fee != null ? Math.round(r.monthly_fee).toLocaleString() : <span className="text-amber-600">—</span>}</td>
                  <td className="px-2 py-2">
                    <button onClick={() => setContractsOf(r)}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.contracts ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"} hover:underline`}>
                      {r.contracts ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                      {r.contracts ? t("clients.has_contract") : t("clients.no_contract")}
                    </button>
                  </td>
                  <td className="px-2 py-2">
                    {(() => {
                      const inc = incomeOf.get(r.id);
                      const st = inc?.status ?? "none";
                      const tone = st === "paid" ? "bg-emerald-50 text-emerald-700" : st === "partial" ? "bg-amber-50 text-amber-700"
                        : st === "unpaid" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-500";
                      return (
                        <button onClick={() => setPayingFor(r)} title={t("tinc.record")}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold hover:underline ${tone}`}>
                          <Wallet size={11} />
                          {st === "none" ? t("tinc.st_none") : st === "paid" ? t("tinc.st_paid")
                            : `${Math.round(inc!.received).toLocaleString("en-US")} / ${Math.round(inc!.expected).toLocaleString("en-US")}`}
                        </button>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2">
                    {confirmId === r.id ? (
                      <span className="flex items-center justify-end gap-1">
                        <button onClick={() => { setConfirmId(null); void remove(r); }} disabled={deleting === r.id}
                          className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700">
                          {t("common.delete")}
                        </button>
                        <button onClick={() => setConfirmId(null)} className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-600">
                          {t("common.cancel")}
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center justify-end gap-1">
                        <button onClick={() => setContractsOf(r)} title={t("contract.title")} aria-label={`${t("contract.title")} ${r.name}`}
                          className="rounded-md p-1.5 text-gray-400 hover:bg-blue-50 hover:text-[#0a66c2]"><FileSignature size={13} /></button>
                        <button onClick={() => setEditing(r)} aria-label={`${t("common.edit")} ${r.name}`}
                          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil size={13} /></button>
                        <button onClick={() => setConfirmId(r.id)} aria-label={`${t("common.delete")} ${r.name}`}
                          className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                          {deleting === r.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ClientDialog client={editing === "new" ? null : editing} t={t} onClose={() => setEditing(null)}
          onSaved={(c) => {
            const isNew = !(rows ?? []).some((r) => r.id === c.id);
            setRows((p) => (p ?? []).some((r) => r.id === c.id) ? (p ?? []).map((r) => (r.id === c.id ? c : r)) : [...(p ?? []), c]);
            setEditing(null);
            // Every client must have a contract: a new one goes straight to it.
            if (isNew || !c.contracts) setContractsOf(c);
          }} />
      )}
      {contractsOf && <TaxContracts client={contractsOf} t={t} onClose={() => { setContractsOf(null); void load(); setIncomeVersion((v) => v + 1); }} />}
      {payingFor && (
        <TaxPaymentsDialog client={payingFor} period={period} t={t}
          expected={incomeOf.get(payingFor.id)?.expected ?? 0} received={incomeOf.get(payingFor.id)?.received ?? 0}
          onClose={() => setPayingFor(null)} onChanged={() => setIncomeVersion((v) => v + 1)} />
      )}
      {importing && (
        <ImportDialog t={t} onClose={() => setImporting(false)}
          onDone={(msg) => { setImporting(false); setNotice(msg); void load(); }} />
      )}
    </div>
  );
}
