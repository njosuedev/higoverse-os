"use client";

// Sales → RRA reports: the X and Z daily reports, the PLU report, closing
// stock on a date, and cash put into / taken out of the till — what RRA's
// CIS specification requires an invoicing system to produce (§7.6, §7.12,
// §7.31, §18, §19, §21). Every report can be printed.

import { useEffect, useState } from "react";
import { Loader2, Printer, X as Close } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { printHtml } from "@/lib/print-frame";
import { receiptPaper } from "@/lib/print-settings";
import { askConfirm, notify } from "@/lib/dialogs";
import { ebmApi, type EbmCashMove, type EbmDailyReport, type EbmPluReport } from "@/lib/ebm-api";
import { dailyReportHtml, pluReportHtml, stockReportHtml } from "@/lib/ebm-report-print";

type Tab = "x" | "z" | "plu" | "stock" | "cash";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const money = (n: number) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const field = "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-[#0a66c2]";
const btn = "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50";

export default function EbmReportsPanel({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const canClose = ["owner", "admin", "manager"].includes(user?.role ?? "");
  const wide = () => receiptPaper() === "a4";
  const [tab, setTab] = useState<Tab>("x");
  const [busy, setBusy] = useState(false);

  const [x, setX] = useState<EbmDailyReport | null>(null);
  const [zDay, setZDay] = useState(today());
  const [zList, setZList] = useState<{ number: number; day: string; net_total: number }[]>([]);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [plu, setPlu] = useState<EbmPluReport | null>(null);
  const [stockDay, setStockDay] = useState(today());
  const [stock, setStock] = useState<{ name: string; quantity: number }[] | null>(null);
  const [moves, setMoves] = useState<EbmCashMove[]>([]);
  const [cash, setCash] = useState({ kind: "deposit" as "deposit" | "withdrawal", amount: "", note: "" });

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    try { return await fn(); }
    catch (e) { notify(e instanceof Error ? e.message : t("common.error")); return undefined; }
    finally { setBusy(false); }
  }

  // The X report shows on opening; other tabs load when chosen.
  useEffect(() => {
    ebmApi.xReport().then((r) => setX(r.data)).catch((e) => notify(e instanceof Error ? e.message : t("common.error")));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function open(k: Tab) {
    setTab(k);
    if (k === "x") void run(() => ebmApi.xReport().then((r) => setX(r.data)));
    if (k === "z") void run(() => ebmApi.zReports().then((r) => setZList(r.data)));
    if (k === "cash") void run(() => ebmApi.cash().then((r) => setMoves(r.data)));
  }

  async function closeDay() {
    if (!(await askConfirm({ message: t("ebmr.close_confirm").replace("{day}", zDay) }))) return;
    const z = await run(() => ebmApi.closeDay(zDay));
    if (!z) return;
    printHtml(dailyReportHtml(z.data, wide()));
    setZList((l) => [{ number: z.data.number, day: z.data.day || zDay, net_total: z.data.net_total }, ...l]);
  }

  const TABS: [Tab, string][] = [["x", t("ebmr.x")], ["z", t("ebmr.z")], ["plu", t("ebmr.plu")], ["stock", t("ebmr.stock")], ["cash", t("ebmr.cash")]];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t("ebmr.title")} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="mr-auto text-sm font-semibold text-slate-800">{t("ebmr.title")}</h2>
          {busy && <Loader2 size={14} className="animate-spin text-slate-400" />}
          <button onClick={onClose} aria-label={t("common.close")} className="text-slate-400 hover:text-slate-600"><Close size={16} /></button>
        </div>
        <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 py-2">
          {TABS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => open(k)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === k ? "bg-[#0a66c2] text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto p-4 text-sm text-slate-700">
          {tab === "x" && (
            <div>
              <p className="mb-3 text-xs text-slate-500">{t("ebmr.x_hint")}</p>
              {x && <Summary r={x} />}
              <div className="mt-3 flex gap-2">
                <button className={`${btn} border border-slate-200 text-slate-600 hover:bg-slate-50`} disabled={busy}
                  onClick={() => run(() => ebmApi.xReport().then((r) => setX(r.data)))}>{t("ebmr.refresh")}</button>
                <button className={`${btn} bg-[#0a66c2] text-white`} disabled={!x} onClick={() => x && printHtml(dailyReportHtml(x, wide()))}>
                  <Printer size={13} /> {t("ebmr.print")}</button>
              </div>
            </div>
          )}

          {tab === "z" && (
            <div>
              <p className="mb-3 text-xs text-slate-500">{t("ebmr.z_hint")}</p>
              {canClose ? (
                <div className="mb-4 flex flex-wrap items-end gap-2">
                  <label className="text-xs font-medium text-slate-600">{t("ebmr.day")}
                    <input type="date" className={`${field} mt-1 block`} value={zDay} max={today()} onChange={(e) => setZDay(e.target.value)} /></label>
                  <button className={`${btn} bg-[#0a66c2] text-white`} disabled={busy || !zDay} onClick={() => void closeDay()}>{t("ebmr.close_day")}</button>
                </div>
              ) : <p className="mb-3 text-xs text-slate-500">{t("ebmr.manager_only")}</p>}
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {zList.length === 0 && <li className="px-3 py-2 text-xs text-slate-500">{t("ebmr.no_z")}</li>}
                {zList.map((z) => (
                  <li key={z.number} className="flex items-center gap-3 px-3 py-2 text-xs">
                    <span className="font-semibold">Z {z.number}</span>
                    <span className="text-slate-500">{z.day.split("-").reverse().join("/")}</span>
                    <span className="ml-auto tabular-nums">{money(z.net_total)}</span>
                    <button className="text-[#0a66c2]" aria-label={t("ebmr.print")}
                      onClick={() => run(() => ebmApi.zReport(z.number).then((r) => printHtml(dailyReportHtml(r.data, wide()))))}><Printer size={13} /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === "plu" && (
            <div>
              <p className="mb-3 text-xs text-slate-500">{t("ebmr.plu_hint")}</p>
              <div className="mb-3 flex flex-wrap items-end gap-2">
                <label className="text-xs font-medium text-slate-600">{t("ebmr.from")}
                  <input type="date" className={`${field} mt-1 block`} value={from} max={today()} onChange={(e) => setFrom(e.target.value)} /></label>
                <label className="text-xs font-medium text-slate-600">{t("ebmr.to")}
                  <input type="date" className={`${field} mt-1 block`} value={to} max={today()} onChange={(e) => setTo(e.target.value)} /></label>
                <button className={`${btn} border border-slate-200 text-slate-600 hover:bg-slate-50`} disabled={busy}
                  onClick={() => run(() => ebmApi.plu(from, to).then((r) => setPlu(r.data)))}>{t("ebmr.show")}</button>
                <button className={`${btn} bg-[#0a66c2] text-white`} disabled={!plu} onClick={() => plu && printHtml(pluReportHtml(plu, wide()))}>
                  <Printer size={13} /> {t("ebmr.print")}</button>
              </div>
              {plu && (
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-[11px] uppercase text-slate-400"><th>{t("ebm.item_code")}</th><th>{t("ebm.product")}</th><th className="text-right">{t("ebmr.qty")}</th><th className="text-right">{t("ebmr.amount")}</th><th className="text-right">{t("ebmr.left")}</th></tr></thead>
                  <tbody>{plu.items.map((i) => (
                    <tr key={i.item_code} className="border-t border-slate-100"><td className="py-1 font-mono">{i.item_code}</td><td>{i.name}</td>
                      <td className="text-right tabular-nums">{i.quantity}</td><td className="text-right tabular-nums">{money(i.amount)}</td><td className="text-right tabular-nums">{i.remaining ?? "—"}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          )}

          {tab === "stock" && (
            <div>
              <p className="mb-3 text-xs text-slate-500">{t("ebmr.stock_hint")}</p>
              <div className="mb-3 flex flex-wrap items-end gap-2">
                <label className="text-xs font-medium text-slate-600">{t("ebmr.day")}
                  <input type="date" className={`${field} mt-1 block`} value={stockDay} max={today()} onChange={(e) => setStockDay(e.target.value)} /></label>
                <button className={`${btn} border border-slate-200 text-slate-600 hover:bg-slate-50`} disabled={busy}
                  onClick={() => run(() => ebmApi.stock(stockDay).then((r) => setStock(r.data.items)))}>{t("ebmr.show")}</button>
                <button className={`${btn} bg-[#0a66c2] text-white`} disabled={!stock}
                  onClick={() => stock && printHtml(stockReportHtml({ trade_name: x?.trade_name ?? null, tin: x?.tin ?? null }, stockDay, stock, wide()))}>
                  <Printer size={13} /> {t("ebmr.print")}</button>
              </div>
              {stock && (
                <ul className="divide-y divide-slate-100 text-xs">
                  {stock.map((s) => <li key={s.name} className="flex justify-between py-1"><span>{s.name}</span><span className="tabular-nums">{s.quantity}</span></li>)}
                </ul>
              )}
            </div>
          )}

          {tab === "cash" && (
            <div>
              <p className="mb-3 text-xs text-slate-500">{t("ebmr.cash_hint")}</p>
              <div className="mb-4 flex flex-wrap items-end gap-2">
                <select className={field} value={cash.kind} onChange={(e) => setCash({ ...cash, kind: e.target.value as "deposit" | "withdrawal" })}>
                  <option value="deposit">{t("ebmr.deposit")}</option>
                  <option value="withdrawal">{t("ebmr.withdrawal")}</option>
                </select>
                <input className={`${field} w-32`} inputMode="decimal" placeholder={t("ebmr.amount")} value={cash.amount}
                  onChange={(e) => setCash({ ...cash, amount: e.target.value.replace(/[^\d.]/g, "") })} />
                <input className={`${field} min-w-0 flex-1`} maxLength={200} placeholder={t("ebmr.note")} value={cash.note}
                  onChange={(e) => setCash({ ...cash, note: e.target.value })} />
                <button className={`${btn} bg-[#0a66c2] text-white`} disabled={busy || !(Number(cash.amount) > 0)}
                  onClick={() => run(async () => {
                    const r = await ebmApi.addCash(cash.kind, Number(cash.amount), cash.note.trim() || undefined);
                    setMoves((m) => [...m, r.data]); setCash({ ...cash, amount: "", note: "" });
                  })}>{t("ebmr.record")}</button>
              </div>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-xs">
                {moves.length === 0 && <li className="px-3 py-2 text-slate-500">{t("ebmr.no_cash")}</li>}
                {moves.map((m) => (
                  <li key={m.id} className="flex gap-3 px-3 py-2">
                    <span className={m.kind === "deposit" ? "text-green-700" : "text-red-600"}>{m.kind === "deposit" ? "+" : "−"}{money(m.amount)}</span>
                    <span className="flex-1 text-slate-600">{m.note}</span>
                    <span className="text-slate-400">{m.by} · {m.at ? new Date(m.at).toLocaleTimeString() : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Summary({ r }: { r: EbmDailyReport }) {
  const { t } = useLanguage();
  const line = (k: string, v: string | number) => <p className="flex justify-between py-0.5"><span className="text-slate-500">{k}</span><span className="font-medium tabular-nums">{v}</span></p>;
  return (
    <div className="grid gap-x-6 text-xs sm:grid-cols-2">
      <div>
        {line(t("ebmr.sales_ns"), `${r.sales.count} · ${money(r.sales.total)}`)}
        {line(t("ebmr.refunds_nr"), `${r.refunds.count} · ${money(r.refunds.total)}`)}
        {line(t("ebmr.net"), money(r.net_total))}
        {line(t("ebmr.tax"), money(r.sales.total_tax - r.refunds.total_tax))}
      </div>
      <div>
        {line(t("ebmr.items_sold"), r.items_sold)}
        {line(t("ebmr.opening"), money(r.opening_deposit))}
        {line(t("ebmr.copies"), r.copies.CS.count + r.copies.CR.count)}
        {line(t("ebmr.incomplete"), r.incomplete_sales)}
      </div>
    </div>
  );
}
