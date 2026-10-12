"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, HandCoins, Pencil, Plus, Printer, Trash2, Undo2, Users, Wallet, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { askConfirm, notify } from "@/lib/dialogs";
import { getMyShop } from "@/lib/shop-api";
import { decodeShopHumanInfo, formatPublicAddress } from "@/lib/product-meta";
import { prettyPhone, shopTin } from "@/lib/company";
import type { PrintShop } from "@/lib/proforma-print";
import {
  PAY_METHODS, PAYROLL_ROLES, addEmployee, deleteEmployee, getMonth, giveAdvance, listEmployees, payrollError, periodOf, recordPayment,
  removeAdvance, shiftPeriod, undoPayment, updateEmployee,
  type Employee, type EmployeeInput, type Month, type PayMethod, type SalaryAdvance, type SalaryPayment,
} from "@/lib/payroll-api";
import { advanceReceiptHtml, monthLabel, payrollSheetHtml, salaryLettersHtml } from "@/lib/payroll-print";
import { Bone, SkeletonRegion, useSkeleton } from "@/app/components/ui/Skeleton";

const fmt = (n: number) => Math.round(n || 0).toLocaleString("en-US");
const today = () => new Date().toISOString().slice(0, 10);

function openPrint(html: string) {
  const w = window.open("", "_blank", "width=900,height=1000,scrollbars=yes,resizable=yes");
  if (w) { w.document.open(); w.document.write(html); w.document.close(); }
}

export default function PayrollPage() {
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

  function changeMonth(by: number) { setMonth(null); setPeriod((p) => shiftPeriod(p, by)); }

  function printLetters(list: SalaryPayment[]) {
    if (list.length) openPrint(salaryLettersHtml(list, shop, t, lang, { autoPrint: true }));
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
    openPrint(advanceReceiptHtml(a, shop, t, lang, { autoPrint: true }));
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
            {/* Month and its totals */}
            <section className="flex flex-wrap items-center gap-3 rounded-data border border-border bg-white p-3">
              <div className="flex items-center gap-1">
                <button onClick={() => changeMonth(-1)} aria-label={t("payroll.prev_month")} className="rounded-press p-1.5 text-text-muted hover:bg-paper-dim hover:text-text"><ChevronLeft size={18} /></button>
                <span className="min-w-[150px] text-center font-display text-base font-semibold capitalize text-text">{monthLabel(period, lang)}</span>
                <button onClick={() => changeMonth(1)} aria-label={t("payroll.next_month")} className="rounded-press p-1.5 text-text-muted hover:bg-paper-dim hover:text-text"><ChevronRight size={18} /></button>
              </div>
              <div className="flex flex-1 flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="text-text-muted">{t("payroll.paid")}: <b className="hgv-figure text-success">{totals ? `${totals.paid_count} · ${fmt(totals.paid_net)} RWF` : "–"}</b></span>
                <span className="text-text-muted">{t("payroll.to_pay")}: <b className={`hgv-figure ${totals?.due_count ? "text-warning" : "text-text"}`}>{totals ? `${totals.due_count} · ${fmt(totals.due_gross)} RWF` : "–"}</b></span>
                {!!totals?.advances_outstanding && (
                  <span className="text-text-muted">{t("payroll.advances_out")}: <b className="hgv-figure text-text">{fmt(totals.advances_outstanding)} RWF</b></span>
                )}
              </div>
              {paid.length > 0 && (
                <div className="flex gap-2">
                  <button onClick={() => openPrint(payrollSheetHtml(period, paid, shop, t, lang, { autoPrint: true }))}
                    className="flex items-center gap-1.5 rounded-press border border-border px-3 py-1.5 text-sm font-semibold text-text hover:bg-paper-dim">
                    <Printer size={14} /> {t("payroll.print_sheet")}
                  </button>
                  <button onClick={() => printLetters(paid)}
                    className="flex items-center gap-1.5 rounded-press border border-border px-3 py-1.5 text-sm font-semibold text-text hover:bg-paper-dim">
                    <Printer size={14} /> {t("payroll.print_all")}
                  </button>
                </div>
              )}
            </section>

            {skeleton ? <RowsSkeleton /> : month === null ? <div className="min-h-[200px]" /> : month.rows.length === 0 ? (
              <Empty text={t("payroll.no_one_this_month")} action={t("payroll.add_employee")} onAction={() => setEditing("new")} />
            ) : (
              <section className="hgv-fade-in overflow-hidden rounded-data border border-border bg-white">
                {month.rows.map((r) => {
                  const e = r.employee, p = r.payment;
                  const name = p?.employee_name ?? e?.full_name ?? "";
                  const advances = r.advances ?? [];
                  const owed = advances.reduce((sum, a) => sum + a.amount, 0);
                  return (
                    <div key={p?.id ?? e?.id} className="hgv-ledger-row px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="min-w-[180px] flex-1">
                        <p className="font-semibold text-text">{name}</p>
                        <p className="text-xs text-text-muted">{[p?.position ?? e?.position, e && `${fmt(e.monthly_salary)} RWF / ${t("payroll.month_short")}`].filter(Boolean).join(" · ")}</p>
                      </div>
                      {p ? (
                        <>
                          <div className="text-right">
                            <p className="hgv-figure font-semibold text-text">{fmt(p.net)} RWF</p>
                            <p className="text-xs text-text-muted">
                              {t("payroll.paid_on").replace("{date}", p.paid_on)} · {t(`payroll.method_${p.method}`)}
                              {p.deductions > 0 && ` · -${fmt(p.deductions)}`}
                            </p>
                          </div>
                          <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">{t("payroll.status_paid")}</span>
                          <div className="flex gap-1">
                            <button onClick={() => printLetters([p])} title={t("payroll.print_letter")}
                              className="flex items-center gap-1.5 rounded-press border border-border px-2.5 py-1.5 text-xs font-semibold text-text hover:bg-paper-dim">
                              <Printer size={13} /> {t("payroll.print_letter")}
                            </button>
                            <button onClick={() => undo(p)} title={t("payroll.undo")} aria-label={t("payroll.undo")}
                              className="rounded-press p-1.5 text-text-muted hover:bg-paper-dim hover:text-accent-dark"><Undo2 size={15} /></button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">{t("payroll.status_due")}</span>
                          {e && (
                            <button onClick={() => setPaying({ employee: e, advances })}
                              className="flex items-center gap-1.5 rounded-press bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink-dark">
                              <Wallet size={13} /> {t("payroll.pay")}
                            </button>
                          )}
                        </>
                      )}
                      {e?.active && (
                        <button onClick={() => setAdvancing({ employee: e, owed })} title={t("payroll.give_advance")}
                          className="flex items-center gap-1.5 rounded-press border border-border px-2.5 py-1.5 text-xs font-semibold text-text hover:bg-paper-dim">
                          <HandCoins size={13} /> {t("payroll.advance")}
                        </button>
                      )}
                    </div>
                    {advances.length > 0 && (
                      <ul className="mt-2 space-y-1 border-l-2 border-border-strong pl-3">
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
                    )}
                    </div>
                  );
                })}
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
      {advancing && (
        <AdvanceForm employee={advancing.employee} owed={advancing.owed} onClose={() => setAdvancing(null)}
          onGiven={(a) => { setAdvancing(null); load(); advancePrompt(a); }} />
      )}
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
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (f.full_name.trim().length < 2 || !(Number(f.monthly_salary.replace(/,/g, "")) > 0)) { notify(t("payroll.err_employee")); return; }
    const body: EmployeeInput = {
      full_name: f.full_name, id_number: f.id_number || null, phone: f.phone || null, position: f.position || null,
      monthly_salary: Number(f.monthly_salary.replace(/,/g, "")), start_date: f.start_date || null, left_on: f.left_on || null, notes: f.notes || null,
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
      <Field label={t("payroll.notes")} optional><textarea className={inputCls} rows={2} value={f.notes} onChange={set("notes")} /></Field>
    </Modal>
  );
}

function PayForm({ employee, advances, period, onClose, onPaid }: {
  employee: Employee; advances: SalaryAdvance[]; period: string; onClose: () => void; onPaid: (p: SalaryPayment) => void;
}) {
  const { t, lang } = useLanguage();
  const [gross, setGross] = useState(String(employee.monthly_salary));
  const [deductions, setDeductions] = useState("");
  const [note, setNote] = useState("");
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState<PayMethod>("cash");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const g = Number(gross.replace(/,/g, "")) || 0, d = Number(deductions.replace(/,/g, "")) || 0;
  // Advances given up to the payment date come off this salary (the server does the same).
  const due = advances.filter((a) => a.given_on <= paidOn);
  const advanced = due.reduce((sum, a) => sum + a.amount, 0);
  const net = g - advanced - d;

  async function save() {
    if (!(g > 0)) { notify(t("payroll.err_amount")); return; }
    // The whole salary may have been taken in advance (nothing left to give), but no more.
    if (d < 0 || net < 0 || (net === 0 && d > 0)) { notify(t(advanced ? "payroll.err_advances_take_all" : "payroll.err_deductions")); return; }
    if (d > 0 && !note.trim()) { notify(t("payroll.err_deduction_note")); return; }
    try {
      setSaving(true);
      onPaid(await recordPayment({
        employee_id: employee.id, period, gross: g, deductions: d, deduction_note: note.trim() || null,
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
      </div>
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
