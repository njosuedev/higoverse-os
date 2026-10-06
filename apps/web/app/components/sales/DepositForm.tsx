"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/language-context";
import { DEPOSIT_METHODS, type Deposit } from "@/lib/proforma-api";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** A deposit / booking payment: amount (with 30 % / 50 % / full-balance
 *  picks), how it was paid, the date (not in the future) and a reference
 *  such as a MoMo transaction id or bank slip number. */
export default function DepositForm({ balance, currency, onSubmit, onCancel, busy = false }: {
  balance: number;
  currency: string;
  onSubmit: (d: Omit<Deposit, "id" | "by" | "at">) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const { t } = useLanguage();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Deposit["method"] | "">("");
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState("");
  const [tried, setTried] = useState(false);

  const n = Number(amount) || 0;
  const errAmount = n <= 0 ? t("deposit.err_amount") : n > balance ? t("deposit.err_over").replace("{amount}", `${Math.round(balance).toLocaleString()} ${currency}`) : null;
  const errMethod = method ? null : t("deposit.err_method");
  const errDate = !date ? t("proforma.err_required") : date > today() ? t("deposit.err_future") : null;
  const input = "border border-slate-200 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400";
  const bad = (e: string | null) => (tried && e ? " !border-red-400" : "");

  function submit() {
    setTried(true);
    if (errAmount || errMethod || errDate) return;
    onSubmit({ amount: n, method: method as Deposit["method"], date, reference: reference.trim() });
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 space-y-3">
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t("deposit.amount")} ({currency}) *</label>
          <input type="number" min={0} autoFocus className={input + bad(errAmount)} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[[`30 %`, balance * 0.3], [`50 %`, balance * 0.5], [t("deposit.full"), balance]].map(([label, v]) => (
              <button key={String(label)} type="button" onClick={() => setAmount(String(Math.round(Number(v))))}
                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-700">
                {label}
              </button>
            ))}
          </div>
          {tried && errAmount && <p className="text-[11px] text-red-600 mt-1">{errAmount}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t("deposit.method")} *</label>
          <div className="flex flex-wrap gap-1.5">
            {DEPOSIT_METHODS.map((m) => (
              <button key={m} type="button" onClick={() => setMethod(m)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${method === m ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                {t(`sales.pm_${m}`)}
              </button>
            ))}
          </div>
          {tried && errMethod && <p className="text-[11px] text-red-600 mt-1">{errMethod}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t("deposit.date")} *</label>
          <input type="date" max={today()} className={input + bad(errDate)} value={date} onChange={(e) => setDate(e.target.value)} />
          {tried && errDate && <p className="text-[11px] text-red-600 mt-1">{errDate}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t("deposit.reference")}</label>
          <input maxLength={60} className={input} placeholder={t("deposit.reference_hint")} value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50">{t("common.cancel")}</button>
        <button type="button" onClick={submit} disabled={busy}
          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
          {t("deposit.record")}{n > 0 ? ` · ${Math.round(n).toLocaleString()} ${currency}` : ""}
        </button>
      </div>
    </div>
  );
}
