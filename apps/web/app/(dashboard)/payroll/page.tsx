"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Gift, HandCoins, Pencil, Plus, Printer, Search, Trash2, Undo2, Users, Wallet, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { askConfirm, notify } from "@/lib/dialogs";
import { getMyShop } from "@/lib/shop-api";
import { decodeShopHumanInfo, formatPublicAddress } from "@/lib/product-meta";
import { prettyPhone, shopTin } from "@/lib/company";
import type { PrintShop } from "@/lib/proforma-print";
import {
  PAY_METHODS, PAYROLL_ROLES, addBonus, addEmployee, deleteEmployee, getMonth, giveAdvance, listEmployees, payrollError, periodOf, recordPayment,
  removeAdvance, removeBonus, shiftPeriod, undoPayment, updateEmployee,
  type Employee, type EmployeeInput, type Month, type PayMethod, type SalaryAdvance, type SalaryBonus, type SalaryPayment,
} from "@/lib/payroll-api";
import { advanceReceiptHtml, monthLabel, payrollSheetHtml, salaryLettersHtml } from "@/lib/payroll-print";
import { printHtml } from "@/lib/print-frame";
import { useShopSettings } from "@/lib/shop-settings-context";
import { Bone, SkeletonRegion, useSkeleton } from "@/app/components/ui/Skeleton";

const fmt = (n: number) => Math.round(n || 0).toLocaleString("en-US");
const today = () => new Date().toISOString().slice(0, 10);

// Printed in a hidden frame: only the print dialog shows, no extra window.
const openPrint = printHtml;

export default function PayrollPage() {
  const { print: printPrefs } = useShopSettings();
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const allowed = PAYROLL_ROLES.includes(user?.role ?? "");
  const [tab, setTab] = useState<"month" | "employees">("month");
  const [period, setPeriod] = useState(() => periodOf(new Date()));
  const [month, setMonth] = useState<Month | null>(null);
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [shop, setShop] = useState<PrintShop>({ name: "" });
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [paying, setPaying] = useState<{ employee: Employee; advances: SalaryAdvance[] } | null>(null);
  const [advancing, setAdvancing] = useState<{ employee: Employee; owed: number } | null>(null);
  const [bonusing, setBonusing] = useState<SalaryPayment | null>(null);
  // Narrows the month's list by name or position.
  const [query, setQuery] = useState("");
  const skeleton = useSkeleton((tab === "month" ? month : employees) === null && !failed);

  // Loads the month and the list; bumping `reloads` loads them again.
  const [reloads, setReloads] = useState(0);
  const load = useCallback(() => setReloads((n) => n + 1), []);
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    Promise.all([getMonth(period), listEmployees()])
      .then(([m, e]) => { if (live) { setMonth(m); setEmployees(e); setFailed(false); } })
      .catch((err) => { console.warn(err); if (live) setFailed(true); });
    return () => { live = false; };
  }, [allowed, period, reloads]);

  // The company's letterhead for the printed papers.
  useEffect(() => {
    getMyShop().then((s) => {
      if (!s) return;
      setShop({
        name: s.name || "", phone: prettyPhone(s.phone), address: formatPublicAddress(s.address), logo_url: s.logo_url,
        email: s.email || decodeShopHumanInfo(s.description).email, tin: shopTin(s),
      });
    }).catch(() => {});
  }, []);

  const paid = useMemo(() => (month?.rows ?? []).map((r) => r.payment).filter((p): p is SalaryPayment => !!p), [month]);
  // Everyone's pay slip for the month: the recorded payment once paid; before
  // that, one for approval from the salary, the month's attendance and the
  // advances that will come off (marked "to be paid").
  const slips = useMemo(() => (month?.rows ?? []).flatMap((r): { key: string; slip: SalaryPayment }[] => {
    if (r.payment) return [{ key: r.payment.id, slip: r.payment }];
    const e = r.employee;
    if (!e) return [];
    const advanced = (r.advances ?? []).reduce((sum, a) => sum + a.amount, 0);
    return [{ key: `draft-${e.id}`, slip: {
      id: `draft-${e.id}`, employee_id: e.id, period, employee_name: e.full_name, employee_id_number: e.id_number, position: e.position,
      gross: e.monthly_salary, bonus: 0, accommodation: 0, overtime_hours: 0, overtime_amount: 0,
      deductions: advanced, deduction_note: advanced ? t("payroll.advance") : null, net: Math.max(0, e.monthly_salary - advanced),
      paid_on: today(), method: "bank", reference: null, expense_id: null, paid_by_name: null, created_at: null,
      bank_name: e.bank_name, bank_account: e.bank_account, contract_start: e.start_date, contract_end: e.contract_end,
      working_days: e.working_days, late_days: r.attendance?.late ?? 0, leave_days: r.attendance?.leave ?? 0, sick_days: r.attendance?.sick ?? 0,
      draft: true, doc_code: r.slip_code,
    } }];
  }), [month, period, t]);
  // Slips ticked for printing; a new month starts empty.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const pickedSlips = slips.filter((s) => picked.has(s.key)).map((s) => s.slip);
  const allPicked = slips.length > 0 && pickedSlips.length === slips.length;
  const togglePick = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // "Mark as paid": the ticked people not paid yet, or everyone still to pay when none is ticked.
  const unpaid = (month?.rows ?? []).filter((r) => !r.payment && r.employee);
  const pickedUnpaid = unpaid.filter((r) => picked.has(`draft-${r.employee!.id}`));
  const toPay = (pickedSlips.length > 0 ? pickedUnpaid : unpaid).map((r) => ({ employee: r.employee!, advances: r.advances ?? [] }));
  const [payingMany, setPayingMany] = useState<{ employee: Employee; advances: SalaryAdvance[] }[] | null>(null);

  function changeMonth(by: number) { setMonth(null); setPicked(new Set()); setPeriod((p) => shiftPeriod(p, by)); }

  function printLetters(list: SalaryPayment[]) {
    if (list.length) openPrint(salaryLettersHtml(list, shop, t, lang, { autoPrint: true, qr: printPrefs.showQr }));
  }

  async function undo(p: SalaryPayment) {
    if (!(await askConfirm({ message: t("payroll.confirm_undo").replace("{name}", p.employee_name), danger: true }))) return;
    try { await undoPayment(p.id); notify(t("payroll.undone"), "success"); load(); }
    catch (err) { notify(payrollError(err) || t("common.error")); }
  }

  // Right after paying: the letter to sign is one click away.
  async function printPrompt(p: SalaryPayment) {
    notify(t("payroll.paid_ok").replace("{name}", p.employee_name), "success");
    if (await askConfirm({ message: t("payroll.print_now"), confirmLabel: t("payroll.print_letter") })) printLetters([p]);
  }

  function printAdvance(a: SalaryAdvance) {
    openPrint(advanceReceiptHtml(a, shop, t, lang, { autoPrint: true, qr: printPrefs.showQr }));
  }

  // Right after giving an advance: the receipt to sign is one click away.
  async function advancePrompt(a: SalaryAdvance) {
    notify(t("payroll.advance_ok").replace("{name}", a.employee_name), "success");
    if (await askConfirm({ message: t("payroll.print_advance_now"), confirmLabel: t("payroll.print_receipt") })) printAdvance(a);
  }

  async function takeBackAdvance(a: SalaryAdvance) {
    if (!(await askConfirm({ message: t("payroll.confirm_remove_advance").replace("{name}", a.employee_name), danger: true }))) return;
    try { await removeAdvance(a.id); notify(t("payroll.advance_removed"), "success"); load(); }
    catch (err) { notify(payrollError(err) || t("common.error")); }
  }

  async function takeBackBonus(b: SalaryBonus) {
    if (!(await askConfirm({ message: t("payroll.confirm_remove_bonus").replace("{name}", b.employee_name), danger: true }))) return;
    try { await removeBonus(b.id); notify(t("payroll.bonus_removed"), "success"); load(); }
    catch (err) { notify(payrollError(err) || t("common.error")); }
  }

  // Right after a bonus: the updated pay slip to sign is one click away.
  async function bonusPrompt(p: SalaryPayment) {
    notify(t("payroll.bonus_ok").replace("{name}", p.employee_name), "success");
    if (await askConfirm({ message: t("payroll.print_now"), confirmLabel: t("payroll.print_letter") })) printLetters([p]);
  }

  async function remove(e: Employee) {
    if (!(await askConfirm({ message: t("payroll.confirm_delete").replace("{name}", e.full_name), danger: true }))) return;
    try { await deleteEmployee(e.id); load(); }
    catch (err) { notify(payrollError(err) || t("common.delete_failed")); }
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <Wallet size={28} className="mx-auto text-text-faint" />
        <p className="mt-3 font-semibold text-text">{t("payroll.no_access")}</p>
      </div>
    );
  }

  const totals = month?.totals;
  const q = query.trim().toLowerCase();
  const shownRows = (month?.rows ?? []).filter((r) => !q
    || [r.payment?.employee_name ?? r.employee?.full_name, r.payment?.position ?? r.employee?.position].some((v) => v?.toLowerCase().includes(q)));
  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-6xl space-y-3 px-3 py-3 sm:px-5">
        {/* Title, tabs and month */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="font-display text-xl font-bold text-text">{t("payroll.title")}</h1>
            <p className="text-sm text-text-muted">{t("payroll.subtitle")}</p>
          </div>
          <div className="flex rounded-press border border-border bg-white p-0.5" role="tablist">
            {(["month", "employees"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`rounded-[5px] px-3 py-1.5 text-sm font-semibold transition-colors ${tab === k ? "bg-ink text-white" : "text-text-muted hover:text-text"}`}>
                {t(k === "month" ? "payroll.tab_month" : "payroll.tab_employees")}
              </button>
            ))}
          </div>
          <button onClick={() => setEditing("new")}
            className="flex items-center gap-1.5 rounded-press bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-ink-dark">
            <Plus size={15} /> {t("payroll.add_employee")}
          </button>
        </div>

        {failed && (
          <div className="flex items-center gap-2 rounded-press border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-accent-dark">
            <span className="flex-1">{t("payroll.load_failed")}</span>
            <button onClick={load} className="font-semibold underline">{t("common.retry")}</button>
          </div>
        )}

        {tab === "month" ? (
          <>
            {/* The month, and where its payroll stands */}
            <section className="rounded-data border border-border bg-white">
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                <div className="flex items-center gap-1">
                  <button onClick={() => changeMonth(-1)} aria-label={t("payroll.prev_month")} className="rounded-press p-1.5 text-text-muted hover:bg-paper-dim hover:text-text"><ChevronLeft size={18} /></button>
                  <span className="min-w-[150px] text-center font-display text-base font-semibold capitalize text-text">{monthLabel(period, lang)}</span>
                  <button onClick={() => changeMonth(1)} aria-label={t("payroll.next_month")} className="rounded-press p-1.5 text-text-muted hover:bg-paper-dim hover:text-text"><ChevronRight size={18} /></button>
                </div>
                {period !== periodOf(new Date()) && (
                  <button onClick={() => { setMonth(null); setPicked(new Set()); setPeriod(periodOf(new Date())); }}
                    className="rounded-press border border-border px-2.5 py-1 text-xs font-semibold text-text-muted hover:bg-paper-dim hover:text-text">
                    {t("payroll.this_month")}
                  </button>
                )}
              </div>
              {/* 1px gaps over the border colour draw the lines between tiles */}
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-data bg-border lg:grid-cols-4">
                <Tile label={t("payroll.tile_total")} value={totals ? fmt(totals.paid_net + totals.due_gross) : "–"}
                  sub={totals ? t("payroll.people_n").replace("{n}", String(totals.employees)) : ""} />
                <Tile label={t("payroll.paid")} value={totals ? fmt(totals.paid_net) : "–"} tone="success"
                  sub={totals ? t("payroll.paid_of").replace("{paid}", String(totals.paid_count)).replace("{n}", String(totals.employees)) : ""}
                  progress={totals && totals.employees ? totals.paid_count / totals.employees : undefined} />
                <Tile label={t("payroll.to_pay")} value={totals ? fmt(totals.due_gross) : "–"} tone={totals?.due_count ? "warning" : undefined}
                  sub={totals ? t("payroll.people_n").replace("{n}", String(totals.due_count)) : ""} />
                <Tile label={t("payroll.tile_bonuses")} value={totals ? fmt(totals.paid_bonus ?? 0) : "–"}
                  sub={totals?.advances_outstanding ? `${t("payroll.advances_out")}: ${fmt(totals.advances_outstanding)}` : "RWF"} />
              </div>
            </section>

            {skeleton ? <RowsSkeleton /> : month === null ? <div className="min-h-[200px]" /> : month.rows.length === 0 ? (
              <Empty text={t("payroll.no_one_this_month")} action={t("payroll.add_employee")} onAction={() => setEditing("new")} />
            ) : (
              <section className="hgv-fade-in overflow-hidden rounded-data border border-border bg-white">
                {/* Every pay slip of the month at once (one A4 page each), and the month's sheet */}
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
                  <label className="relative mr-auto w-full sm:w-64">
                    <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("payroll.search")} aria-label={t("payroll.search")}
                      className="w-full rounded-press border border-border bg-white py-1.5 pl-8 pr-2 text-sm text-text placeholder:text-text-faint focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/20" />
                  </label>
                  <button onClick={() => openPrint(payrollSheetHtml(period, paid, shop, t, lang, { autoPrint: true, qr: printPrefs.showQr, code: month?.doc_code }))} disabled={paid.length === 0}
                    className="flex items-center gap-1.5 rounded-press border border-border px-3 py-1.5 text-sm font-semibold text-text hover:bg-paper-dim disabled:opacity-40">
                    <Printer size={14} /> {t("payroll.print_sheet")}
                  </button>
                  {toPay.length > 0 && (
                    <button onClick={() => setPayingMany(toPay)}
                      className="flex items-center gap-1.5 rounded-press bg-success px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90">
                      <Wallet size={14} /> {t("payroll.mark_paid").replace("{n}", String(toPay.length))}
                    </button>
                  )}
                  {pickedSlips.length > 0 && (
                    <button onClick={() => printLetters(pickedSlips)}
                      className="flex items-center gap-1.5 rounded-press border border-ink px-3 py-1.5 text-sm font-semibold text-ink hover:bg-ink-soft">
                      <Printer size={14} /> {t("payroll.print_selected").replace("{n}", String(pickedSlips.length))}
                    </button>
                  )}
                  <button onClick={() => printLetters(slips.map((s) => s.slip))} disabled={slips.length === 0}
                    className="flex items-center gap-1.5 rounded-press bg-ink px-3 py-1.5 text-sm font-semibold text-white hover:bg-ink-dark disabled:opacity-40">
                    <Printer size={14} /> {t("payroll.print_all_slips").replace("{n}", String(slips.length))}
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-paper-dim/60 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                        <th className="w-8 px-3 py-2">
                          <input type="checkbox" className="h-4 w-4 cursor-pointer accent-[var(--color-ink)] align-middle" disabled={slips.length === 0}
                            checked={allPicked} ref={(el) => { if (el) el.indeterminate = pickedSlips.length > 0 && !allPicked; }}
                            onChange={() => setPicked(allPicked ? new Set() : new Set(slips.map((s) => s.key)))}
                            aria-label={t("payroll.select_all")} title={t("payroll.select_all")} />
                        </th>
                        <th className="w-8 px-3 py-2">#</th>
                        <th className="px-3 py-2" data-primary>{t("payroll.col_employee")}</th>
                        <th className="px-3 py-2 text-right">{t("payroll.col_basic")}</th>
                        <th className="px-3 py-2 text-right">{t("payroll.col_extras")}</th>
                        <th className="px-3 py-2 text-right">{t("payroll.col_deductions")}</th>
                        <th className="px-3 py-2 text-right">{t("payroll.col_net")}</th>
                        <th className="px-3 py-2">{t("payroll.col_attendance")}</th>
                        <th className="px-3 py-2">{t("payroll.col_status")}</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownRows.length === 0 && (
                        <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-text-muted">{t("payroll.no_match")}</td></tr>
                      )}
                      {shownRows.map((r, i) => {
                        const e = r.employee, p = r.payment;
                        const name = p?.employee_name ?? e?.full_name ?? "";
                        const advances = r.advances ?? [];
                        const bonuses = r.bonuses ?? [];
                        const owed = advances.reduce((sum, a) => sum + a.amount, 0);
                        const extras = p ? (p.bonus || 0) + (p.accommodation || 0) + (p.overtime_amount || 0) : 0;
                        const att = r.attendance;
                        const rowKey = p ? p.id : `draft-${e?.id}`;
                        const marked = att ? att.present + att.absent + att.late + att.leave + (att.sick ?? 0) : 0;
                        return (
                          <Fragment key={p?.id ?? e?.id}>
                            <tr className={`border-b border-border align-top last:border-0 hover:bg-paper-dim/40 ${picked.has(rowKey) ? "bg-ink-soft/40" : ""}`}>
                              <td className="px-3 py-2.5">
                                <input type="checkbox" className="h-4 w-4 cursor-pointer accent-[var(--color-ink)] align-middle" checked={picked.has(rowKey)}
                                  onChange={() => togglePick(rowKey)} aria-label={t("payroll.select_slip").replace("{name}", name)} />
                              </td>
                              <td className="px-3 py-2.5 text-xs text-text-faint tabular-nums">{i + 1}</td>
                              <td className="px-3 py-2.5">
                                <p className="font-semibold text-text">{name}</p>
                                <p className="text-xs text-text-muted">{p?.position ?? e?.position ?? ""}</p>
                              </td>
                              <td className="hgv-figure px-3 py-2.5 text-right">{fmt(p?.gross ?? e?.monthly_salary ?? 0)}</td>
                              <td className="hgv-figure px-3 py-2.5 text-right"
                                title={p && extras ? [
                                  p.bonus ? `${t("payroll.bonus")}: ${fmt(p.bonus)}` : "",
                                  p.accommodation ? `${t("payroll.accommodation")}: ${fmt(p.accommodation)}` : "",
                                  p.overtime_amount ? `${t("payroll.overtime_amount")}: ${fmt(p.overtime_amount)}` : "",
                                ].filter(Boolean).join("\n") : undefined}>
                                {extras ? <span className="text-success">+{fmt(extras)}</span> : "-"}
                              </td>
                              <td className="hgv-figure px-3 py-2.5 text-right">
                                {p ? (p.deductions ? `-${fmt(p.deductions)}` : "-") : owed ? <span className="text-text-muted">-{fmt(owed)}</span> : "-"}
                              </td>
                              <td className="hgv-figure px-3 py-2.5 text-right font-semibold text-text">{p ? fmt(p.net) : "-"}</td>
                              <td className="px-3 py-2.5 text-xs">
                                {marked > 0 && att ? (
                                  <Link href="/attendance" className="inline-flex flex-wrap gap-x-2 text-text-muted hover:text-ink" title={t("nav.attendance")}>
                                    <span><b className="text-success">{att.present}</b> {t("att.present")}</span>
                                    {att.absent > 0 && <span><b className="text-accent-dark">{att.absent}</b> {t("att.absent")}</span>}
                                    {att.late > 0 && <span><b className="text-warning">{att.late}</b> {t("att.late")}</span>}
                                    {att.leave > 0 && <span><b className="text-text">{att.leave}</b> {t("att.leave")}</span>}
                                    {(att.sick ?? 0) > 0 && <span><b className="text-text">{att.sick}</b> {t("att.sick")}</span>}
                                  </Link>
                                ) : <span className="text-text-faint">-</span>}
                              </td>
                              <td className="px-3 py-2.5">
                                {p ? (
                                  <div>
                                    <span className="whitespace-nowrap rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                                      {t("payroll.status_paid")}
                                    </span>
                                    <p className="mt-1.5 whitespace-nowrap text-[11px] text-text-faint">{p.paid_on} · {t(`payroll.method_${p.method}`)}</p>
                                  </div>
                                ) : (
                                  <span className="whitespace-nowrap rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">{t("payroll.status_due")}</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center justify-end gap-1">
                                  {p ? (<>
                                    <button onClick={() => printLetters([p])} title={t("payroll.print_letter")}
                                      className="flex items-center gap-1.5 whitespace-nowrap rounded-press border border-border px-2.5 py-1.5 text-xs font-semibold text-text hover:bg-paper-dim">
                                      <Printer size={13} /> {t("payroll.print_letter")}
                                    </button>
                                    <button onClick={() => setBonusing(p)} title={t("payroll.add_bonus")}
                                      className="flex items-center gap-1.5 whitespace-nowrap rounded-press border border-success/40 px-2.5 py-1.5 text-xs font-semibold text-success hover:bg-success/10">
                                      <Gift size={13} /> {t("payroll.bonus")}
                                    </button>
                                    <button onClick={() => undo(p)} title={t("payroll.undo")} aria-label={t("payroll.undo")}
                                      className="rounded-press p-1.5 text-text-muted hover:bg-paper-dim hover:text-accent-dark"><Undo2 size={15} /></button>
                                  </>) : e && (<>
                                    <button onClick={() => { const d = slips.find((x) => x.key === rowKey); if (d) printLetters([d.slip]); }} title={t("payroll.print_draft")}
                                      className="flex items-center gap-1.5 whitespace-nowrap rounded-press border border-border px-2.5 py-1.5 text-xs font-semibold text-text hover:bg-paper-dim">
                                      <Printer size={13} /> {t("payroll.print_letter")}
                                    </button>
                                    <button onClick={() => setPaying({ employee: e, advances })}
                                      className="flex items-center gap-1.5 rounded-press bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink-dark">
                                      <Wallet size={13} /> {t("payroll.pay")}
                                    </button>
                                  </>)}
                                  {e?.active && (
                                    <button onClick={() => setAdvancing({ employee: e, owed })} title={t("payroll.give_advance")} aria-label={t("payroll.give_advance")}
                                      className="rounded-press p-1.5 text-text-muted hover:bg-paper-dim hover:text-text"><HandCoins size={15} /></button>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {/* Bonuses added after paying, under their person */}
                            {bonuses.length > 0 && (
                              <tr className="border-b border-border">
                                <td colSpan={10} className="px-3 pb-2.5 pt-0">
                                  <ul className="ml-8 space-y-1 border-l-2 border-success/40 pl-3">
                                    {bonuses.map((b) => (
                                      <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                                        <span className="font-semibold text-success"><Gift size={12} className="mr-1 inline align-[-1px]" />{t("payroll.bonus")} · <span className="hgv-figure">+{fmt(b.amount)} RWF</span></span>
                                        <span>{b.given_on} · {t(`payroll.method_${b.method}`)}{b.note ? ` · ${b.note}` : ""}{b.given_by_name ? ` · ${b.given_by_name}` : ""}</span>
                                        <span className="ml-auto">
                                          <button onClick={() => takeBackBonus(b)} title={t("payroll.remove_bonus")} aria-label={t("payroll.remove_bonus")}
                                            className="rounded-press p-1 text-text-muted hover:bg-paper-dim hover:text-accent-dark"><Trash2 size={13} /></button>
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </td>
                              </tr>
                            )}
                            {/* Advances given and still to deduct, under their person */}
                            {advances.length > 0 && (
                              <tr className="border-b border-border">
                                <td colSpan={10} className="px-3 pb-2.5 pt-0">
                                  <ul className="ml-8 space-y-1 border-l-2 border-border-strong pl-3">
                                    {advances.map((a) => (
                                      <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                                        <span className="font-semibold text-text">{t("payroll.advance")} · <span className="hgv-figure">{fmt(a.amount)} RWF</span></span>
                                        <span>{a.given_on} · {t(`payroll.method_${a.method}`)}{a.note ? ` · ${a.note}` : ""}</span>
                                        <span className="text-text-faint">{t("payroll.advance_to_deduct")}</span>
                                        <span className="ml-auto flex gap-1">
                                          <button onClick={() => printAdvance(a)} title={t("payroll.print_receipt")} aria-label={t("payroll.print_receipt")}
                                            className="rounded-press p-1 text-text-muted hover:bg-paper-dim hover:text-text"><Printer size={13} /></button>
                                          <button onClick={() => takeBackAdvance(a)} title={t("payroll.remove_advance")} aria-label={t("payroll.remove_advance")}
                                            className="rounded-press p-1 text-text-muted hover:bg-paper-dim hover:text-accent-dark"><Trash2 size={13} /></button>
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                    {/* The month's totals for those paid */}
                    {paid.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-border-strong bg-paper-dim/60 font-semibold text-text">
                          <td className="px-3 py-2.5" colSpan={3}>{t("payroll.total_paid").replace("{n}", String(paid.length))}</td>
                          <td className="hgv-figure px-3 py-2.5 text-right">{fmt(paid.reduce((sum, x) => sum + x.gross, 0))}</td>
                          <td className="hgv-figure px-3 py-2.5 text-right">+{fmt(paid.reduce((sum, x) => sum + (x.bonus || 0) + (x.accommodation || 0) + (x.overtime_amount || 0), 0))}</td>
                          <td className="hgv-figure px-3 py-2.5 text-right">-{fmt(paid.reduce((sum, x) => sum + x.deductions, 0))}</td>
                          <td className="hgv-figure px-3 py-2.5 text-right">{fmt(paid.reduce((sum, x) => sum + x.net, 0))}</td>
                          <td colSpan={3} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </section>
            )}
          </>
        ) : skeleton ? <RowsSkeleton /> : employees === null ? <div className="min-h-[200px]" /> : employees.length === 0 ? (
          <Empty text={t("payroll.no_employees")} action={t("payroll.add_employee")} onAction={() => setEditing("new")} />
        ) : (
          <section className="hgv-fade-in overflow-hidden rounded-data border border-border bg-white">
            {employees.map((e) => (
              <div key={e.id} className={`hgv-ledger-row flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 ${e.active ? "" : "opacity-60"}`}>
                <div className="min-w-[180px] flex-1">
                  <p className="font-semibold text-text">{e.full_name}</p>
                  <p className="text-xs text-text-muted">
                    {[e.position, e.id_number && `${t("payroll.id_short")} ${e.id_number}`, e.phone].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <p className="hgv-figure text-sm font-semibold text-text">{fmt(e.monthly_salary)} RWF</p>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${e.active ? "bg-success/10 text-success" : "bg-paper-dim text-text-muted"}`}>
                  {e.active ? t("payroll.active") : t("payroll.left_on").replace("{date}", e.left_on ?? "")}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => setEditing(e)} aria-label={t("common.edit")} title={t("common.edit")}
                    className="rounded-press p-1.5 text-text-muted hover:bg-paper-dim hover:text-text"><Pencil size={15} /></button>
                  <button onClick={() => remove(e)} aria-label={t("common.delete")} title={t("common.delete")}
                    className="rounded-press p-1.5 text-text-muted hover:bg-paper-dim hover:text-accent-dark"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </section>
        )}
      </main>

      {editing && (
        <EmployeeForm employee={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} />
      )}
      {paying && (
        <PayForm employee={paying.employee} advances={paying.advances} period={period} onClose={() => setPaying(null)}
          onPaid={(p) => { setPaying(null); load(); printPrompt(p); }} />
      )}
      {payingMany && (
        <PayManyForm people={payingMany} period={period} onClose={() => setPayingMany(null)}
          onDone={async (done) => {
            setPayingMany(null); setPicked(new Set()); load();
            if (!done.length) return;
            notify(t("payroll.marked_paid").replace("{n}", String(done.length)), "success");
            if (await askConfirm({ message: t("payroll.print_now_many").replace("{n}", String(done.length)), confirmLabel: t("payroll.print_all_slips").replace("{n}", String(done.length)) })) printLetters(done);
          }} />
      )}
      {bonusing && (
        <BonusForm payment={bonusing} onClose={() => setBonusing(null)}
          onAdded={(p) => { setBonusing(null); load(); bonusPrompt(p); }} />
      )}
      {advancing && (
        <AdvanceForm employee={advancing.employee} owed={advancing.owed} onClose={() => setAdvancing(null)}
          onGiven={(a) => { setAdvancing(null); load(); advancePrompt(a); }} />
      )}
    </div>
  );

}

/** One figure of the month's summary (RWF), with a line under it. */
function Tile({ label, value, sub, tone, progress }: {
  label: string; value: string; sub: string; tone?: "success" | "warning"; progress?: number;
}) {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-text";
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`hgv-figure mt-1 text-xl font-bold ${color}`}>{value}</p>
      {progress !== undefined && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper-dim" aria-hidden="true">
          <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <p className="mt-1 truncate text-xs text-text-muted">{sub}</p>
    </div>
  );
}

function Empty({ text, action, onAction }: { text: string; action: string; onAction: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-data border border-border bg-white px-6 py-14 text-center">
      <Users size={30} className="text-text-faint" />
      <p className="mt-3 text-sm text-text-muted">{text}</p>
      <button onClick={onAction} className="mt-4 flex items-center gap-1.5 rounded-press bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-ink-dark">
        <Plus size={15} /> {action}
      </button>
    </div>
  );
}

function RowsSkeleton() {
  return (
    <SkeletonRegion className="overflow-hidden rounded-data border border-border bg-white">
      {[150, 120, 170, 110].map((w, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-b-0">
          <div className="flex-1 space-y-1.5">
            <Bone className="h-3.5" style={{ width: w }} />
            <Bone className="h-2.5 w-40" />
          </div>
          <Bone className="h-6 w-14 rounded-full" />
          <Bone className="h-7 w-20 rounded-press" />
        </div>
      ))}
    </SkeletonRegion>
  );
}

// ─── Forms ────────────────────────────────────────────────────────────────────

const inputCls = "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/20";

function Modal({ title, subtitle, onClose, children, footer }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-text">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-text-faint hover:bg-paper-dim"><X size={17} /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">{footer}</div>
      </div>
    </div>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  const { t } = useLanguage();
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-text-muted">
        {label} {optional ? <span className="font-normal text-text-faint">({t("common.optional")})</span> : <span className="text-accent">*</span>}
      </span>
      {children}
    </label>
  );
}

function EmployeeForm({ employee, onClose, onSaved }: { employee: Employee | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useLanguage();
  const [f, setF] = useState({
    full_name: employee?.full_name ?? "", id_number: employee?.id_number ?? "", phone: employee?.phone ?? "",
    position: employee?.position ?? "", monthly_salary: employee ? String(employee.monthly_salary) : "",
    start_date: employee?.start_date ?? "", left_on: employee?.left_on ?? "", notes: employee?.notes ?? "",
    bank_name: employee?.bank_name ?? "", bank_account: employee?.bank_account ?? "", contract_end: employee?.contract_end ?? "",
    working_days: String(employee?.working_days ?? 26),
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (f.full_name.trim().length < 2 || !(Number(f.monthly_salary.replace(/,/g, "")) > 0)) { notify(t("payroll.err_employee")); return; }
    const body: EmployeeInput = {
      full_name: f.full_name, id_number: f.id_number || null, phone: f.phone || null, position: f.position || null,
      monthly_salary: Number(f.monthly_salary.replace(/,/g, "")), start_date: f.start_date || null, left_on: f.left_on || null, notes: f.notes || null,
      bank_name: f.bank_name || null, bank_account: f.bank_account || null, contract_end: f.contract_end || null,
      working_days: Math.min(31, Math.max(1, Math.round(Number(f.working_days) || 26))),
    };
    try {
      setSaving(true);
      if (employee) await updateEmployee(employee.id, body); else await addEmployee(body);
      onSaved();
    } catch (err) { notify(payrollError(err) || t("common.error")); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={t(employee ? "payroll.edit_employee" : "payroll.add_employee")} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-muted hover:bg-paper-dim">{t("common.cancel")}</button>
        <button onClick={save} disabled={saving} className="rounded-lg bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-ink-dark disabled:opacity-60">
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </>}>
      <Field label={t("payroll.full_name")}><input className={inputCls} value={f.full_name} onChange={set("full_name")} placeholder="Jean Mugisha" autoFocus /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("payroll.position")} optional><input className={inputCls} value={f.position} onChange={set("position")} placeholder={t("payroll.position_hint")} /></Field>
        <Field label={t("payroll.monthly_salary")}><input className={`${inputCls} tabular-nums`} inputMode="numeric" value={f.monthly_salary} onChange={set("monthly_salary")} placeholder="0" /></Field>
        <Field label={t("payroll.id_number")} optional><input className={inputCls} value={f.id_number} onChange={set("id_number")} placeholder="1 1990 8 0012345 6 78" /></Field>
        <Field label={t("payroll.phone")} optional><input className={inputCls} inputMode="tel" value={f.phone} onChange={set("phone")} placeholder="078..." /></Field>
        <Field label={t("payroll.start_date")} optional><input type="date" className={inputCls} value={f.start_date} onChange={set("start_date")} /></Field>
        <Field label={t("payroll.left_date")} optional><input type="date" className={inputCls} value={f.left_on} onChange={set("left_on")} /></Field>
      </div>
      <p className="text-xs text-text-faint">{t("payroll.left_hint")}</p>
      {/* For the pay slip */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("payroll.contract_end")} optional><input type="date" className={inputCls} value={f.contract_end} onChange={set("contract_end")} /></Field>
        <Field label={t("payroll.working_days")}><input className={`${inputCls} tabular-nums`} inputMode="numeric" value={f.working_days} onChange={set("working_days")} placeholder="26" /></Field>
        <Field label={t("payroll.bank_name")} optional><input className={inputCls} value={f.bank_name} onChange={set("bank_name")} placeholder="Equity, BK, I&M…" /></Field>
        <Field label={t("payroll.bank_account")} optional><input className={`${inputCls} tabular-nums`} value={f.bank_account} onChange={set("bank_account")} /></Field>
      </div>
      <Field label={t("payroll.notes")} optional><textarea className={inputCls} rows={2} value={f.notes} onChange={set("notes")} /></Field>
    </Modal>
  );
}

function PayForm({ employee, advances, period, onClose, onPaid }: {
  employee: Employee; advances: SalaryAdvance[]; period: string; onClose: () => void; onPaid: (p: SalaryPayment) => void;
}) {
  const { t, lang } = useLanguage();
  const [gross, setGross] = useState(String(employee.monthly_salary));
  const [bonus, setBonus] = useState("");
  const [accommodation, setAccommodation] = useState("");
  const [otHours, setOtHours] = useState("");
  const [otAmount, setOtAmount] = useState("");
  const [deductions, setDeductions] = useState("");
  const [note, setNote] = useState("");
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState<PayMethod>("cash");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const num = (v: string) => Number(v.replace(/,/g, "")) || 0;
  const g = num(gross), d = num(deductions);
  const extras = { bonus: num(bonus), accommodation: num(accommodation), overtime_hours: num(otHours), overtime_amount: num(otAmount) };
  // The month's pay before deductions: basic + bonus + accommodation + overtime.
  const total = g + extras.bonus + extras.accommodation + extras.overtime_amount;
  // Advances given up to the payment date come off this salary (the server does the same).
  const due = advances.filter((a) => a.given_on <= paidOn);
  const advanced = due.reduce((sum, a) => sum + a.amount, 0);
  const net = total - advanced - d;

  async function save() {
    if (!(g > 0)) { notify(t("payroll.err_amount")); return; }
    // The whole salary may have been taken in advance (nothing left to give), but no more.
    if (d < 0 || net < 0 || (net === 0 && d > 0)) { notify(t(advanced ? "payroll.err_advances_take_all" : "payroll.err_deductions")); return; }
    if (d > 0 && !note.trim()) { notify(t("payroll.err_deduction_note")); return; }
    try {
      setSaving(true);
      onPaid(await recordPayment({
        employee_id: employee.id, period, gross: g, ...extras, deductions: d, deduction_note: note.trim() || null,
        paid_on: paidOn, method, reference: reference.trim() || null,
      }));
    } catch (err) { notify(payrollError(err) || t("common.error")); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={t("payroll.pay_title").replace("{name}", employee.full_name)} subtitle={monthLabel(period, lang)} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-muted hover:bg-paper-dim">{t("common.cancel")}</button>
        <button onClick={save} disabled={saving || net < 0 || (net === 0 && advanced === 0)} className="rounded-lg bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-ink-dark disabled:opacity-60">
          {saving ? t("common.saving") : t("payroll.record_payment")}
        </button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("payroll.salary_month")}><input className={`${inputCls} tabular-nums`} inputMode="numeric" value={gross} onChange={(e) => setGross(e.target.value)} /></Field>
        <Field label={t(advanced ? "payroll.other_deductions" : "payroll.deductions")} optional><input className={`${inputCls} tabular-nums`} inputMode="numeric" value={deductions} onChange={(e) => setDeductions(e.target.value)} placeholder="0" /></Field>
        {/* On top of the basic salary (printed on the pay slip) */}
        <Field label={t("payroll.bonus")} optional><input className={`${inputCls} tabular-nums`} inputMode="numeric" value={bonus} onChange={(e) => setBonus(e.target.value)} placeholder="0" /></Field>
        <Field label={t("payroll.accommodation")} optional><input className={`${inputCls} tabular-nums`} inputMode="numeric" value={accommodation} onChange={(e) => setAccommodation(e.target.value)} placeholder="0" /></Field>
        <Field label={t("payroll.overtime_hours")} optional><input className={`${inputCls} tabular-nums`} inputMode="decimal" value={otHours} onChange={(e) => setOtHours(e.target.value)} placeholder="0" /></Field>
        <Field label={t("payroll.overtime_amount")} optional><input className={`${inputCls} tabular-nums`} inputMode="numeric" value={otAmount} onChange={(e) => setOtAmount(e.target.value)} placeholder="0" /></Field>
      </div>
      {total !== g && (
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
          <span className="text-text-muted">{t("payroll.total_pay")}</span>
          <span className="hgv-figure font-semibold text-text">{fmt(total)} RWF</span>
        </div>
      )}
      {due.length > 0 && (
        <div className="rounded-lg border border-border px-3 py-2">
          <p className="text-xs font-medium text-text-muted">{t("payroll.advances_deducted")}</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {due.map((a) => (
              <li key={a.id} className="flex justify-between gap-3">
                <span className="text-text-muted">{a.given_on}{a.note ? ` · ${a.note}` : ""}</span>
                <span className="hgv-figure font-semibold text-text">- {fmt(a.amount)} RWF</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {d > 0 && (
        <Field label={t("payroll.deduction_note")}><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("payroll.deduction_hint")} /></Field>
      )}
      <div className="flex items-center justify-between rounded-lg bg-paper-dim px-3 py-2.5">
        <span className="text-sm text-text-muted">{t("payroll.net")}</span>
        <span className={`hgv-figure text-lg font-bold ${net > 0 || (net === 0 && advanced > 0) ? "text-text" : "text-accent-dark"}`}>{fmt(net)} RWF</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("payroll.paid_date")}><input type="date" className={inputCls} value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} /></Field>
        <Field label={t("payroll.reference")} optional><input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      </div>
      <div>
        <span className="mb-1 block text-xs font-medium text-text-muted">{t("payroll.method")} <span className="text-accent">*</span></span>
        <div className="flex flex-wrap gap-1.5">
          {PAY_METHODS.map((m) => (
            <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={method === m}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${method === m ? "border-ink bg-ink-soft text-ink" : "border-border text-text-muted hover:border-border-strong"}`}>
              {t(`payroll.method_${m}`)}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-text-faint">{t("payroll.expense_hint")}</p>
    </Modal>
  );
}

/** Records the month's salary for several people at once (each as Pay would:
 *  the full salary, their advances deducted), with one date and method. */
function PayManyForm({ people, period, onClose, onDone }: {
  people: { employee: Employee; advances: SalaryAdvance[] }[]; period: string; onClose: () => void; onDone: (paid: SalaryPayment[]) => void;
}) {
  const { t, lang } = useLanguage();
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState<PayMethod>("bank");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState<number | null>(null);   // how many are done while saving
  // Each person's bonus this month, typed beside their name (optional).
  const [bonuses, setBonuses] = useState<Record<string, string>>({});
  const lines = people.map(({ employee, advances }) => {
    const advanced = advances.filter((a) => a.given_on <= paidOn).reduce((sum, a) => sum + a.amount, 0);
    const bonus = Number((bonuses[employee.id] ?? "").replace(/,/g, "")) || 0;
    return { employee, advanced, bonus, net: employee.monthly_salary + bonus - advanced };
  });
  const total = lines.reduce((sum, l) => sum + Math.max(0, l.net), 0);

  async function save() {
    const done: SalaryPayment[] = [];
    const failed: string[] = [];
    setSaving(0);
    for (const l of lines) {
      try {
        done.push(await recordPayment({
          employee_id: l.employee.id, period, gross: l.employee.monthly_salary, bonus: l.bonus, accommodation: 0, overtime_hours: 0, overtime_amount: 0,
          deductions: 0, deduction_note: null, paid_on: paidOn, method, reference: reference.trim() || null,
        }));
      } catch (err) {
        failed.push(`${l.employee.full_name}: ${payrollError(err) || t("common.error")}`);
      }
      setSaving(done.length + failed.length);
    }
    if (failed.length) notify(failed.join("\n"));
    onDone(done);
  }

  return (
    <Modal title={t("payroll.mark_paid").replace("{n}", String(people.length))} subtitle={monthLabel(period, lang)} onClose={saving === null ? onClose : () => {}}
      footer={<>
        <button onClick={onClose} disabled={saving !== null} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-muted hover:bg-paper-dim disabled:opacity-50">{t("common.cancel")}</button>
        <button onClick={save} disabled={saving !== null} className="rounded-lg bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-ink-dark disabled:opacity-60">
          {saving !== null ? `${t("common.saving")} ${saving}/${lines.length}` : t("payroll.record_payment")}
        </button>
      </>}>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex items-center gap-3 border-b border-border bg-paper-dim/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          <span className="flex-1">{t("payroll.col_employee")}</span>
          <span className="w-24 text-right">{t("payroll.bonus")}</span>
          <span className="w-28 text-right">{t("payroll.col_net")}</span>
        </div>
        {lines.map((l) => (
          <div key={l.employee.id} className="flex items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-0">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-text">{l.employee.full_name}</span>
              <span className="block text-xs text-text-muted">
                {fmt(l.employee.monthly_salary)}{l.advanced > 0 && ` · ${t("payroll.advance")} -${fmt(l.advanced)}`}
              </span>
            </span>
            <input value={bonuses[l.employee.id] ?? ""} inputMode="numeric" placeholder="0" disabled={saving !== null}
              onChange={(e) => setBonuses((b) => ({ ...b, [l.employee.id]: e.target.value }))}
              aria-label={`${t("payroll.bonus")} · ${l.employee.full_name}`}
              className="w-24 rounded-lg border border-border bg-white px-2 py-1 text-right text-sm tabular-nums text-text placeholder:text-text-faint focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/20" />
            <span className="hgv-figure w-28 text-right font-semibold text-text">{fmt(l.net)} RWF</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-lg bg-paper-dim px-3 py-2.5">
        <span className="text-sm text-text-muted">{t("payroll.net")}</span>
        <span className="hgv-figure text-lg font-bold text-text">{fmt(total)} RWF</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("payroll.paid_date")}><input type="date" className={inputCls} value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} /></Field>
        <Field label={t("payroll.reference")} optional><input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      </div>
      <div>
        <span className="mb-1 block text-xs font-medium text-text-muted">{t("payroll.method")} <span className="text-accent">*</span></span>
        <div className="flex flex-wrap gap-1.5">
          {PAY_METHODS.map((m) => (
            <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={method === m}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${method === m ? "border-ink bg-ink-soft text-ink" : "border-border text-text-muted hover:border-border-strong"}`}>
              {t(`payroll.method_${m}`)}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-text-faint">{t("payroll.mark_paid_hint")}</p>
    </Modal>
  );
}

/** A bonus on top of a salary already paid: its own expense on the day it's
 *  given, and added to the pay slip. */
function BonusForm({ payment, onClose, onAdded }: {
  payment: SalaryPayment; onClose: () => void; onAdded: (p: SalaryPayment) => void;
}) {
  const { t, lang } = useLanguage();
  const [amount, setAmount] = useState("");
  const [givenOn, setGivenOn] = useState(today());
  const [method, setMethod] = useState<PayMethod>(payment.method);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const a = Number(amount.replace(/,/g, "")) || 0;

  async function save() {
    if (!(a > 0)) { notify(t("payroll.err_amount")); return; }
    try {
      setSaving(true);
      const res = await addBonus(payment.id, {
        amount: a, given_on: givenOn, method, reference: reference.trim() || null, note: note.trim() || null,
      });
      onAdded(res.payment);
    } catch (err) { notify(payrollError(err) || t("common.error")); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={t("payroll.bonus_title").replace("{name}", payment.employee_name)} subtitle={monthLabel(payment.period, lang)} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-muted hover:bg-paper-dim">{t("common.cancel")}</button>
        <button onClick={save} disabled={saving || !(a > 0)} className="flex items-center gap-1.5 rounded-lg bg-success px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
          <Gift size={15} /> {saving ? t("common.saving") : t("payroll.add_bonus")}
        </button>
      </>}>
      <dl className="grid grid-cols-3 gap-2 rounded-lg bg-paper-dim px-3 py-2.5 text-sm">
        <div><dt className="text-xs text-text-muted">{t("payroll.net")}</dt><dd className="hgv-figure font-semibold text-text">{fmt(payment.net)}</dd></div>
        <div><dt className="text-xs text-text-muted">{t("payroll.bonus")}</dt><dd className="hgv-figure font-semibold text-success">+{fmt(a)}</dd></div>
        <div><dt className="text-xs text-text-muted">{t("payroll.new_net")}</dt><dd className="hgv-figure font-bold text-text">{fmt(payment.net + a)}</dd></div>
      </dl>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("payroll.bonus_amount")}><input className={`${inputCls} tabular-nums`} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus /></Field>
        <Field label={t("payroll.bonus_date")}><input type="date" className={inputCls} value={givenOn} max={today()} onChange={(e) => setGivenOn(e.target.value)} /></Field>
      </div>
      <Field label={t("payroll.bonus_reason")} optional><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("payroll.bonus_reason_hint")} /></Field>
      <div>
        <span className="mb-1 block text-xs font-medium text-text-muted">{t("payroll.method")} <span className="text-accent">*</span></span>
        <div className="flex flex-wrap gap-1.5">
          {PAY_METHODS.map((m) => (
            <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={method === m}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${method === m ? "border-ink bg-ink-soft text-ink" : "border-border text-text-muted hover:border-border-strong"}`}>
              {t(`payroll.method_${m}`)}
            </button>
          ))}
        </div>
      </div>
      <Field label={t("payroll.reference")} optional><input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      <p className="text-xs text-text-faint">{t("payroll.bonus_hint")}</p>
    </Modal>
  );
}

function AdvanceForm({ employee, owed, onClose, onGiven }: {
  employee: Employee; owed: number; onClose: () => void; onGiven: (a: SalaryAdvance) => void;
}) {
  const { t } = useLanguage();
  const [amount, setAmount] = useState("");
  const [givenOn, setGivenOn] = useState(today());
  const [method, setMethod] = useState<PayMethod>("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const a = Number(amount.replace(/,/g, "")) || 0;
  // At most one month's salary, so the next payment can take them back.
  const most = Math.max(employee.monthly_salary - owed, 0);

  async function save() {
    if (!(a > 0)) { notify(t("payroll.err_amount")); return; }
    if (a > most) { notify(t("payroll.err_advance_too_much").replace("{max}", fmt(most))); return; }
    try {
      setSaving(true);
      onGiven(await giveAdvance({
        employee_id: employee.id, amount: a, given_on: givenOn, method,
        reference: reference.trim() || null, note: note.trim() || null,
      }));
    } catch (err) { notify(payrollError(err) || t("common.error")); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={t("payroll.advance_title").replace("{name}", employee.full_name)} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-muted hover:bg-paper-dim">{t("common.cancel")}</button>
        <button onClick={save} disabled={saving || !(a > 0) || a > most} className="rounded-lg bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-ink-dark disabled:opacity-60">
          {saving ? t("common.saving") : t("payroll.give_advance")}
        </button>
      </>}>
      <dl className="grid grid-cols-3 gap-2 rounded-lg bg-paper-dim px-3 py-2.5 text-sm">
        <div><dt className="text-xs text-text-muted">{t("payroll.monthly_salary")}</dt><dd className="hgv-figure font-semibold text-text">{fmt(employee.monthly_salary)}</dd></div>
        <div><dt className="text-xs text-text-muted">{t("payroll.already_advanced")}</dt><dd className="hgv-figure font-semibold text-text">{fmt(owed)}</dd></div>
        <div><dt className="text-xs text-text-muted">{t("payroll.can_advance")}</dt><dd className="hgv-figure font-semibold text-text">{fmt(most)}</dd></div>
      </dl>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("payroll.advance_amount")}><input className={`${inputCls} tabular-nums`} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus /></Field>
        <Field label={t("payroll.advance_date")}><input type="date" className={inputCls} value={givenOn} max={today()} onChange={(e) => setGivenOn(e.target.value)} /></Field>
      </div>
      <Field label={t("payroll.advance_reason")} optional><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("payroll.advance_reason_hint")} /></Field>
      <div>
        <span className="mb-1 block text-xs font-medium text-text-muted">{t("payroll.method")} <span className="text-accent">*</span></span>
        <div className="flex flex-wrap gap-1.5">
          {PAY_METHODS.map((m) => (
            <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={method === m}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${method === m ? "border-ink bg-ink-soft text-ink" : "border-border text-text-muted hover:border-border-strong"}`}>
              {t(`payroll.method_${m}`)}
            </button>
          ))}
        </div>
      </div>
      <Field label={t("payroll.reference")} optional><input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      <p className="text-xs text-text-faint">{t("payroll.advance_hint")}</p>
    </Modal>
  );
}
