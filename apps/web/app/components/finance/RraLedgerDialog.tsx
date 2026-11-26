"use client";

// The RRA Tax Ledger pack: a year's expenses not supported by EBM, what is
// still missing on them, and the Excel schedule and PDF pack (signed
// schedule + every supporting document) to lodge in E-Tax. lib/rra-ledger.ts.

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, Landmark, X } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/dialogs";
import { exportRraExcel, exportRraPdf, loadRraLedger, type RraItem } from "@/lib/rra-ledger";

export default function RraLedgerDialog({ currency, onClose, onOpen }: {
  currency: string; onClose: () => void; onOpen?: (id: string) => void;
}) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [items, setItems] = useState<RraItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const from = `${year}-01-01`, to = `${year}-12-31`;

  useEffect(() => {
    let live = true;
    loadRraLedger(from, to)
      .then((r) => { if (live) { setItems(r.items); setTotal(r.total); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [from, to]);

  const incomplete = (items ?? []).filter((i) => i.missing.length);
  const money = (n: number) => Math.round(n).toLocaleString();

  async function run(kind: "excel" | "pdf") {
    if (!items?.length) return;
    setBusy(kind === "excel" ? "Excel" : "PDF");
    try {
      if (kind === "excel") await exportRraExcel(items, { from, to, currency });
      else {
        const r = await exportRraPdf(items, { from, to, currency, preparedBy: user?.name ?? "",
          onProgress: (d, all) => setBusy(`PDF ${d}/${all}`) });
        if (r.separateFiles) notify(t("rra.pdf_files").replace("{n}", String(r.separateFiles)), "success");
      }
    } catch (e) { notify(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t("rra.title")} className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <Landmark size={18} className="mt-0.5 shrink-0 text-[#0a66c2]" />
          <div className="mr-auto">
            <h3 className="text-sm font-bold text-slate-900">{t("rra.title")}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{t("rra.intro")}</p>
          </div>
          <button onClick={onClose} disabled={!!busy} aria-label={t("common.close")} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-5 py-3">
          <label className="text-xs font-semibold text-slate-600">{t("rra.year")}
            <select value={year} onChange={(e) => { setItems(null); setYear(Number(e.target.value)); }}
              className="ml-2 rounded-lg border border-slate-200 px-2 py-1 text-xs">
              {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          {items && (
            <p className="text-xs text-slate-600">
              <b className="text-slate-900">{items.length}</b> {t("rra.expenses")} · <b className="text-slate-900">{money(total)} {currency}</b>
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3">
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          {!items && !error && <p className="py-6 text-center text-xs text-slate-400">{t("common.loading")}</p>}
          {items && items.length === 0 && <p className="py-6 text-center text-xs text-slate-500">{t("rra.none")}</p>}
          {items && items.length > 0 && (incomplete.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <CheckCircle2 size={14} /> {t("rra.all_ready")}
            </p>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                <AlertTriangle size={14} /> {t("rra.incomplete").replace("{n}", String(incomplete.length))}
              </p>
              <ul className="mt-2 space-y-1">
                {incomplete.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-x-2 text-[11px] text-amber-900">
                    <span className="tabular-nums">{i.expense_date.slice(0, 10)}</span>
                    <span className="font-semibold">{i.title}</span>
                    <span className="tabular-nums">{money(i.amount)}</span>
                    <span>— {t("rra.missing")}: {i.missing.map((m) => t(`rra.missing_${m}`)).join(", ")}</span>
                    {onOpen && <button onClick={() => onOpen(i.id)} className="font-semibold text-[#0a66c2] underline">{t("common.edit")}</button>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <ol className="mt-3 list-decimal space-y-1 pl-4 text-[11px] text-slate-500">
            <li>{t("rra.step1")}</li>
            <li>{t("rra.step2")}</li>
            <li>{t("rra.step3")}</li>
          </ol>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button onClick={() => void run("excel")} disabled={!items?.length || !!busy}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-[#0a66c2] hover:text-[#0a66c2] disabled:opacity-40">
            <FileSpreadsheet size={13} /> {t("rra.excel")}
          </button>
          <button onClick={() => void run("pdf")} disabled={!items?.length || !!busy}
            className="flex items-center gap-1.5 rounded-lg bg-[#0a66c2] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">
            <FileText size={13} /> {busy || t("rra.pdf")}
          </button>
        </div>
      </div>
    </div>
  );
}
