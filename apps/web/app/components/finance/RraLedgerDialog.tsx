"use client";

// Expenses › RRA ledger: downloads the expenses selected on the Expenses page
// (its dates, category, place, EBM filter and search) as one organised PDF
// (summary, schedule, signatures, every supporting document) or as Excel
// (with an RRA Tax Ledger sheet for E-Tax). lib/rra-ledger.ts.

import { useEffect, useState } from "react";
import { FileSpreadsheet, FileText, Landmark, X } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { exportAllExcel, exportAllPdf, filtersText, loadExpenses, periodOf, type BookExpense, type Selection } from "@/lib/rra-ledger";

export default function RraLedgerDialog({ currency, selection, onClose }: {
  currency: string; selection: Selection; onClose: () => void;
}) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [items, setItems] = useState<BookExpense[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
  // A download that failed: its button says "Try again" (no pop-up).
  const [failed, setFailed] = useState("");

  // The expenses selected on the page, loaded once when the window opens.
  useEffect(() => {
    let live = true;
    loadExpenses(selection)
      .then((list) => { if (live) { setItems(list); setError(""); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [selection]);

  const money = (n: number) => Math.round(n).toLocaleString();
  const total = (items ?? []).reduce((s, i) => s + i.amount, 0);
  const { from, to } = periodOf(selection, items ?? []);
  const filters = filtersText(selection);

  async function run(kind: "excel" | "pdf") {
    if (!items?.length) return;
    setBusy(kind); setFailed("");
    try {
      const opts = { from, to, currency, filters };
      if (kind === "excel") await exportAllExcel(items, opts);
      else await exportAllPdf(items, { ...opts, preparedBy: user?.name ?? "", onProgress: (d: number, all: number) => setProgress(`${d}/${all}`) });
    } catch { setFailed(kind); }
    finally { setBusy(""); setProgress(""); }
  }
  const label = (key: string, id: string) =>
    busy === id ? `${t("rra.preparing")}${progress ? ` ${progress}` : ""}` : failed === id ? t("rra.try_again") : t(key);

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

        {/* What will be downloaded: exactly what is selected on the page */}
        <div className="px-5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("rra.selected")}</p>
          {error && <p className="mt-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          {!items && !error && <div className="hgv-shimmer mt-2 h-4 w-72 rounded" aria-label={t("common.loading")} />}
          {items && (
            <p className="mt-1 text-sm text-slate-700">
              <b className="text-slate-900">{items.length}</b> {t("rra.expenses_word")} · <b className="text-slate-900">{money(total)} {currency}</b>
              <span className="text-slate-500"> · {from} → {to}</span>
            </p>
          )}
          {filters && <p className="mt-0.5 text-xs text-slate-500">{filters}</p>}
          {items && items.length === 0 && <p className="mt-2 text-xs text-slate-500">{t("rra.nothing_selected")}</p>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3">
          <ol className="list-decimal space-y-1 pl-4 text-[11px] text-slate-500">
            <li>{t("rra.step1")}</li>
            <li>{t("rra.step2")}</li>
            <li>{t("rra.step3")}</li>
          </ol>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button onClick={() => void run("excel")} disabled={!!busy || !items?.length}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-[#0a66c2] hover:text-[#0a66c2] disabled:opacity-40">
            <FileSpreadsheet size={13} /> {label("rra.excel", "excel")}
          </button>
          <button onClick={() => void run("pdf")} disabled={!!busy || !items?.length}
            className="flex items-center gap-1.5 rounded-lg bg-[#0a66c2] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">
            <FileText size={13} /> {label("rra.pdf", "pdf")}
          </button>
        </div>
      </div>
    </div>
  );
}
