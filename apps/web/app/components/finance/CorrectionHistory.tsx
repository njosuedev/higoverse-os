"use client";

// The history of type corrections (Expenses ⇄ Income): what moved, from
// which category to which, who did it, when and why. Read-only: corrections
// are never changed or deleted (expense-service models/correction.py).

import { useEffect, useState } from "react";
import { ArrowRight, History, X } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { apiError, listCorrections, type Correction } from "@/lib/income";

export default function CorrectionHistory({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const [rows, setRows] = useState<Correction[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listCorrections().then(setRows).catch((e) => { setRows([]); setError(apiError(e, t("common.error"))); });
  }, [t]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const side = (k: string) => t(k === "income" ? "move.type_income" : "move.type_expense");
  const cat = (type: string, c?: string | null) => (!c ? "" : t(type === "income" ? `income.src_${c}` : `expenses.cat.${c}`));
  const when = (iso: string) => new Date(iso).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t("move.history")} className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <History size={17} className="text-slate-600" />
          <div className="mr-auto">
            <p className="font-bold text-slate-800">{t("move.history")}</p>
            <p className="text-xs text-slate-500">{t("move.history_hint")}</p>
          </div>
          <button onClick={onClose} aria-label={t("common.close")} className="p-1 rounded hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {rows === null ? (
            <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="hgv-shimmer h-10 rounded" />)}</div>
          ) : rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">{error || t("move.history_none")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 truncate">{r.title} · <span className="tabular-nums">{Math.round(r.amount).toLocaleString()}</span></p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-600 flex-wrap">
                        <span className={r.from_type === "income" ? "text-[#057642] font-semibold" : "text-[#0a66c2] font-semibold"}>{side(r.from_type)}</span>
                        {r.from_category && <span className="text-slate-500">({cat(r.from_type, r.from_category)})</span>}
                        <ArrowRight size={12} className="text-slate-400" />
                        <span className={r.to_type === "income" ? "text-[#057642] font-semibold" : "text-[#0a66c2] font-semibold"}>{side(r.to_type)}</span>
                        {r.to_category && <span className="text-slate-500">({cat(r.to_type, r.to_category)})</span>}
                        {r.transaction_date && <span className="text-slate-400">· {r.transaction_date.slice(0, 10)}</span>}
                      </p>
                      <p className="mt-1 text-xs text-slate-700"><span className="font-semibold">{t("move.reason")}:</span> {r.reason}</p>
                    </div>
                    <div className="text-right text-xs text-slate-500 shrink-0">
                      <p className="font-semibold text-slate-700">{r.corrected_by_name || "—"}</p>
                      {r.corrected_by_role && <p>{t(`role.${r.corrected_by_role}`)}</p>}
                      <p className="tabular-nums">{when(r.corrected_at)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
