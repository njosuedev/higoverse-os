"use client";

// The General Ledger and Trial Balance of a car company, laid out as in
// QuickBooks: each account with its beginning balance, every transaction
// (date, type, number, name, memo, the other account — "split" — debit,
// credit, running balance) and its total; then every account's balance in
// a debit or a credit column. View and export only; the postings come from
// the records already kept (lib/ledger.ts). Owner and accountant.

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, FileSpreadsheet, FileText, RefreshCw, Scale, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { useShopSettings } from "@/lib/shop-settings-context";
import { useCanUseLedger } from "@/lib/permissions";
import { useShop } from "@/lib/shop-context";
import DateRangeFilter from "@/app/components/ui/DateRangeFilter";
import { notify } from "@/lib/dialogs";
import {
  ACCOUNTS, accountName, exportLedgerExcel, exportLedgerPdf, generalLedger, loadLedger, trialBalance,
  type AccountType, type LedgerLine,
} from "@/lib/ledger";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const amt = (n: number) => (n ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "");
const bal = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

const TYPE_KEYS: AccountType[] = ["bank", "ar", "liability", "equity", "income", "cogs", "expense"];

export default function LedgerPage() {
  const { t, lang } = useLanguage();
  const { currency } = useShopSettings();
  const { loading: shopLoading } = useShop();
  const allowed = useCanUseLedger();
  const now = new Date();
  const [from, setFrom] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`);
  const [to, setTo] = useState(ymd(now));
  const [view, setView] = useState<"gl" | "tb">("gl");
  const [account, setAccount] = useState("");
  const [lines, setLines] = useState<LedgerLine[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Loads again when the end date changes or Refresh is pressed.
  const [rev, setRev] = useState(0);
  const load = useCallback(() => { setLoading(true); setError(""); setRev((r) => r + 1); }, []);
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    loadLedger(to)
      .then((r) => { if (live) { setLines(r.lines); setWarnings(r.warnings); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [allowed, to, rev]);

  const gl = useMemo(() => generalLedger(lines, from, to, lang), [lines, from, to, lang]);
  const shown = useMemo(() => (account ? gl.filter((g) => g.account.code === account) : gl), [gl, account]);
  const tb = useMemo(() => trialBalance(lines, to), [lines, to]);
  const typeName = (k: AccountType) => t(`ledger.type_${k}`);
  const txnName = (k: string) => t(`ledger.txn_${k}`);

  async function run(f: () => Promise<void>) {
    setBusy(true);
    try { await f(); } catch (e) { notify(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  if (shopLoading) return null;
  if (!allowed) return <p className="mx-auto max-w-3xl px-4 py-10 text-sm text-slate-500">{t("ledger.no_access")}</p>;

  const th = "px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap";
  const num = "px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap";

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4">
        {/* Header */}
        <div className="rounded-xl mb-2 overflow-hidden border border-slate-200 bg-white">
          <div className="flex items-center gap-2 px-4 pt-3 pb-2 flex-wrap">
            <BookOpen size={16} className="text-[#0a66c2] shrink-0" />
            <div className="mr-auto">
              <h1 className="text-sm font-bold text-slate-900">{t("ledger.title")}</h1>
              <p className="text-xs text-slate-500">{t("ledger.hint")}</p>
            </div>
            <button onClick={() => void load()} title={t("common.refresh")} aria-label={t("common.refresh")}
              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-[#0a66c2]">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
            <button onClick={() => void run(() => exportLedgerExcel(shown, tb, { from, to, currency }))} disabled={busy || loading}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-600 hover:border-[#0a66c2] hover:text-[#0a66c2] disabled:opacity-40">
              <FileSpreadsheet size={12} /> Excel
            </button>
            <button onClick={() => void run(() => exportLedgerPdf(shown, tb, { from, to, currency, view }))} disabled={busy || loading}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-600 hover:border-[#0a66c2] hover:text-[#0a66c2] disabled:opacity-40">
              <FileText size={12} /> PDF
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2">
            <div role="tablist" className="flex overflow-hidden rounded-lg border border-slate-200">
              {([["gl", BookOpen, t("ledger.general_ledger")], ["tb", Scale, t("ledger.trial_balance")]] as const).map(([k, Icon, label]) => (
                <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${view === k ? "bg-[#0a66c2] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>
            {view === "gl" && (
              <select value={account} onChange={(e) => setAccount(e.target.value)} aria-label={t("ledger.account")}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">
                <option value="">{t("ledger.all_accounts")}</option>
                {TYPE_KEYS.map((k) => (
                  <optgroup key={k} label={typeName(k)}>
                    {ACCOUNTS.filter((a) => a.type === k).map((a) => <option key={a.code} value={a.code}>{accountName(a.code, lang)}</option>)}
                  </optgroup>
                ))}
              </select>
            )}
            <div className="ml-auto">
              <DateRangeFilter from={view === "gl" ? from : ""} to={to}
                onFrom={(v) => setFrom(v)} onTo={(v) => { setLoading(true); setTo(v || ymd(new Date())); }}
                onClear={() => { setFrom(""); setTo(ymd(new Date())); }} />
            </div>
          </div>
          <p className="border-t border-slate-100 px-4 py-1.5 text-[11px] text-slate-500">
            {view === "gl"
              ? `${from || t("ledger.start")} → ${to} · ${currency} · ${t("ledger.accrual")}`
              : `${t("ledger.as_of")} ${to} · ${currency}`}
          </p>
        </div>

        {warnings.includes("vehicles_unreachable") && (
          <p className="mb-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle size={13} /> {t("ledger.warn_vehicles")}
          </p>
        )}
        {error && <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-400">{t("common.loading")}</div>
        ) : view === "gl" ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[980px] text-xs text-slate-700">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className={th}>{t("ledger.col_date")}</th>
                  <th className={th}>{t("ledger.col_type")}</th>
                  <th className={th}>{t("ledger.col_num")}</th>
                  <th className={th}>{t("ledger.col_name")}</th>
                  <th className={th}>{t("ledger.col_memo")}</th>
                  <th className={th}>{t("ledger.col_split")}</th>
                  <th className={`${th} text-right`}>{t("ledger.debit")}</th>
                  <th className={`${th} text-right`}>{t("ledger.credit")}</th>
                  <th className={`${th} text-right`}>{t("ledger.balance")}</th>
                </tr>
              </thead>
              {shown.length === 0 && (
                <tbody><tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">{t("ledger.empty")}</td></tr></tbody>
              )}
              {shown.map((g) => (
                <tbody key={g.account.code} className="border-b border-slate-200">
                  <tr className="bg-[#EBF2FD]">
                    <td colSpan={9} className="px-2.5 py-1.5 font-bold text-[#0a3d73]">
                      {accountName(g.account.code, lang)} <span className="ml-1 font-normal text-slate-500">· {typeName(g.account.type)}</span>
                    </td>
                  </tr>
                  <tr className="text-slate-500">
                    <td colSpan={4} />
                    <td className="px-2.5 py-1.5 italic" colSpan={4}>{t("ledger.beginning")}</td>
                    <td className={num}>{bal(g.opening)}</td>
                  </tr>
                  {g.rows.map((r, i) => (
                    <tr key={`${r.txn}:${i}`} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-2.5 py-1.5 whitespace-nowrap">{r.date}</td>
                      <td className="px-2.5 py-1.5 whitespace-nowrap">{txnName(r.type)}</td>
                      <td className="px-2.5 py-1.5 whitespace-nowrap">{r.num}</td>
                      <td className="px-2.5 py-1.5 max-w-[160px] truncate" title={r.name}>{r.name}</td>
                      <td className="px-2.5 py-1.5 max-w-[260px] truncate" title={r.memo}>
                        {r.memo}{r.currency && r.currency !== currency && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">{r.currency}</span>}
                      </td>
                      <td className="px-2.5 py-1.5 max-w-[200px] truncate text-slate-500" title={r.split}>{r.split === "-Split-" ? t("ledger.split_many") : r.split}</td>
                      <td className={num}>{amt(r.debit)}</td>
                      <td className={num}>{amt(r.credit)}</td>
                      <td className={num}>{bal(r.balance)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-300 font-bold">
                    <td colSpan={6} className="px-2.5 py-1.5">{t("ledger.total_for")} {accountName(g.account.code, lang)}</td>
                    <td className={num}>{amt(g.debit)}</td>
                    <td className={num}>{amt(g.credit)}</td>
                    <td className={num}>{bal(g.closing)}</td>
                  </tr>
                </tbody>
              ))}
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[560px] text-xs text-slate-700">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className={th}>{t("ledger.account")}</th>
                  <th className={th}>{t("ledger.account_type")}</th>
                  <th className={`${th} text-right`}>{t("ledger.debit")}</th>
                  <th className={`${th} text-right`}>{t("ledger.credit")}</th>
                </tr>
              </thead>
              <tbody>
                {tb.rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">{t("ledger.empty")}</td></tr>}
                {tb.rows.map((r) => (
                  <tr key={r.account.code} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-2.5 py-1.5">{accountName(r.account.code, lang)}</td>
                    <td className="px-2.5 py-1.5 text-slate-500">{typeName(r.account.type)}</td>
                    <td className={num}>{amt(r.debit)}</td>
                    <td className={num}>{amt(r.credit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-300 font-bold">
                <tr>
                  <td className="px-2.5 py-2" colSpan={2}>{t("ledger.total")}</td>
                  <td className={num}>{bal(tb.debit)}</td>
                  <td className={num}>{bal(tb.credit)}</td>
                </tr>
              </tfoot>
            </table>
            <p className={`border-t border-slate-100 px-3 py-2 text-[11px] ${tb.debit === tb.credit ? "text-emerald-700" : "text-red-700"}`}>
              {tb.debit === tb.credit ? t("ledger.balanced") : t("ledger.unbalanced")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
