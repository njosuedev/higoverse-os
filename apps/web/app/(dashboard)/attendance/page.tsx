"use client";

// Attendance: each day, who came to work — present, absent, late or on
// leave, with a note — for the people on Payroll. The Month tab adds up
// each person's days; Payroll shows those counts beside the salary (nothing
// is deducted by itself). Owner, admin, manager and accountant
// (expense-service's PAYROLL_ROLES), as for Payroll.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, ChevronLeft, ChevronRight, CheckCheck, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { notify } from "@/lib/dialogs";
import {
  ATTENDANCE, PAYROLL_ROLES, getAttendanceDay, getAttendanceMonth, markAttendance, payrollError, periodOf, shiftPeriod,
  type AttendanceDay, type AttendanceMonth, type AttendanceStatus,
} from "@/lib/payroll-api";
import { monthLabel } from "@/lib/payroll-print";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function shiftDay(day: string, by: number) {
  const [y, m, d] = day.split("-").map(Number);
  return ymd(new Date(y, m - 1, d + by));
}

/** Each status's colour: the button when chosen, the day's square in Month. */
const TONE: Record<AttendanceStatus, { on: string; dot: string }> = {
  present: { on: "bg-success text-white border-success", dot: "bg-success" },
  absent:  { on: "bg-accent text-white border-accent", dot: "bg-accent" },
  late:    { on: "bg-warning text-white border-warning", dot: "bg-warning" },
  leave:   { on: "bg-ink text-white border-ink", dot: "bg-ink" },
};

export default function AttendancePage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const allowed = PAYROLL_ROLES.includes(user?.role ?? "");
  const [tab, setTab] = useState<"day" | "month">("day");

  if (!allowed) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-paper-dim"><Lock size={24} className="text-text-muted" /></div>
        <h1 className="mt-4 font-display text-xl font-semibold text-text">{t("att.title")}</h1>
        <p className="mt-2 text-[15px] text-text-muted">{t("att.not_allowed")}</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-5xl space-y-3 px-3 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="font-display text-xl font-bold text-text">{t("att.title")}</h1>
            <p className="text-sm text-text-muted">{t("att.subtitle")}</p>
          </div>
          <div className="flex rounded-press border border-border bg-white p-0.5" role="tablist">
            {(["day", "month"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`rounded-[5px] px-3 py-1.5 text-sm font-semibold transition-colors ${tab === k ? "bg-ink text-white" : "text-text-muted hover:text-text"}`}>
                {t(k === "day" ? "att.tab_day" : "att.tab_month")}
              </button>
            ))}
          </div>
        </div>
        {tab === "day" ? <DayView /> : <MonthView />}
      </main>
    </div>
  );
}

function DayView() {
  const { t, lang } = useLanguage();
  const [day, setDay] = useState(() => ymd(new Date()));
  const [data, setData] = useState<AttendanceDay | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);   // employee id being saved, or "all"
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async (d: string) => {
    setFailed(false);
    try {
      const res = await getAttendanceDay(d);
      setData(res);
      setNotes(Object.fromEntries((res?.rows ?? []).map((r) => [r.employee.id, r.mark?.note ?? ""])));
    } catch { setFailed(true); }
  }, []);
  useEffect(() => {
    const id = setTimeout(() => { setData(null); void load(day); }, 0);
    return () => clearTimeout(id);
  }, [day, load]);

  const today = data?.today ?? ymd(new Date());
  const isToday = day >= today;
  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, leave: 0, unmarked: 0 };
    for (const r of data?.rows ?? []) c[r.mark?.status ?? "unmarked"] += 1;
    return c;
  }, [data]);

  async function save(marks: { employee_id: string; status: AttendanceStatus | null; note?: string | null }[], who: string) {
    setBusy(who);
    try {
      const res = await markAttendance(day, marks);
      if (res) setData(res);
    } catch (err) {
      notify(payrollError(err) || t("common.error"));
    } finally { setBusy(null); }
  }

  const label = new Date(`${day}T12:00:00`).toLocaleDateString(lang === "zh" ? "zh-CN" : lang === "rw" ? "rw-RW" : lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <section className="flex flex-wrap items-center gap-3 rounded-data border border-border bg-white p-3">
        <div className="flex items-center gap-1">
          <button onClick={() => setDay((d) => shiftDay(d, -1))} aria-label={t("att.prev_day")} className="rounded-press p-1.5 text-text-muted hover:bg-paper-dim hover:text-text"><ChevronLeft size={18} /></button>
          <span className="min-w-[200px] text-center font-display text-base font-semibold capitalize text-text">{label}</span>
          <button onClick={() => setDay((d) => shiftDay(d, 1))} disabled={isToday} aria-label={t("att.next_day")} className="rounded-press p-1.5 text-text-muted hover:bg-paper-dim hover:text-text disabled:opacity-30"><ChevronRight size={18} /></button>
          {!isToday && <button onClick={() => setDay(today)} className="ml-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-ink hover:bg-paper-dim">{t("att.today")}</button>}
        </div>
        <div className="flex flex-1 flex-wrap gap-x-4 gap-y-1 text-sm">
          {ATTENDANCE.map((s) => (
            <span key={s} className="flex items-center gap-1.5 text-text-muted"><span className={`h-2.5 w-2.5 rounded-full ${TONE[s].dot}`} />{t(`att.${s}`)} <b className="text-text">{counts[s]}</b></span>
          ))}
          <span className="text-text-muted">{t("att.unmarked")} <b className="text-text">{counts.unmarked}</b></span>
        </div>
        {counts.unmarked > 0 && (
          <button disabled={busy !== null}
            onClick={() => save((data?.rows ?? []).filter((r) => !r.mark).map((r) => ({ employee_id: r.employee.id, status: "present" as const, note: null })), "all")}
            className="flex items-center gap-1.5 rounded-press bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-ink-dark disabled:opacity-50">
            <CheckCheck size={15} /> {t("att.all_present")}
          </button>
        )}
      </section>

      {failed ? (
        <div className="flex items-center gap-2 rounded-press border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-accent-dark">
          <span className="flex-1">{t("payroll.load_failed")}</span>
          <button onClick={() => void load(day)} className="font-semibold underline">{t("common.retry")}</button>
        </div>
      ) : data === null ? (
        <div className="space-y-px overflow-hidden rounded-data border border-border bg-white">
          {Array.from({ length: 5 }, (_, i) => <div key={i} className="flex items-center gap-4 px-4 py-4"><span className="hgv-shimmer h-4 w-40 rounded" /><span className="hgv-shimmer ml-auto h-8 w-72 rounded" /></div>)}
        </div>
      ) : data.rows.length === 0 ? (
        <div className="flex flex-col items-center rounded-data border border-border bg-white py-14 text-center">
          <CalendarCheck size={36} className="text-text-faint" />
          <p className="mt-3 text-text-muted">{t("att.none")}</p>
          <Link href="/payroll" className="mt-4 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">{t("nav.payroll")}</Link>
        </div>
      ) : (
        <section className="hgv-fade-in overflow-hidden rounded-data border border-border bg-white">
          {data.rows.map(({ employee: e, mark }) => (
            <div key={e.id} className="hgv-ledger-row flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-[160px] flex-1">
                <p className="font-semibold text-text">{e.full_name}</p>
                <p className="text-xs text-text-muted">
                  {[e.position, mark?.marked_by_name && t("att.marked_by").replace("{name}", mark.marked_by_name)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="grid grid-cols-4 gap-1.5 max-sm:w-full" role="radiogroup" aria-label={e.full_name}>
                {ATTENDANCE.map((s) => {
                  const on = mark?.status === s;
                  return (
                    <button key={s} type="button" role="radio" aria-checked={on} disabled={busy !== null}
                      // Tapping the chosen one again clears the mark.
                      onClick={() => save([{ employee_id: e.id, status: on ? null : s, note: notes[e.id] || null }], e.id)}
                      className={`rounded-press border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${on ? TONE[s].on : "border-border text-text-muted hover:bg-paper-dim hover:text-text"}`}>
                      {t(`att.${s}`)}
                    </button>
                  );
                })}
              </div>
              {/* A note, saved when leaving the field (once the person is marked). */}
              <input value={notes[e.id] ?? ""} onChange={(ev) => setNotes((n) => ({ ...n, [e.id]: ev.target.value }))}
                onBlur={() => { if (mark && (notes[e.id] ?? "") !== (mark.note ?? "")) void save([{ employee_id: e.id, status: mark.status, note: notes[e.id] || null }], e.id); }}
                placeholder={t("att.note_hint")} disabled={!mark} maxLength={255}
                className="w-full rounded-press border border-border bg-white px-2.5 py-1.5 text-sm text-text outline-none focus:border-ink disabled:opacity-50 sm:w-56" />
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function MonthView() {
  const { t, lang } = useLanguage();
  const [period, setPeriod] = useState(() => periodOf(new Date()));
  const [data, setData] = useState<AttendanceMonth | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (p: string) => {
    setFailed(false);
    try { setData(await getAttendanceMonth(p)); } catch { setFailed(true); }
  }, []);
  useEffect(() => {
    const id = setTimeout(() => { setData(null); void load(period); }, 0);
    return () => clearTimeout(id);
  }, [period, load]);

  const days = useMemo(() => {
    if (!data) return [];
    const out: string[] = [];
    for (let d = data.first; d <= data.last; d = shiftDay(d, 1)) out.push(d);
    return out;
  }, [data]);

  return (
    <>
      <section className="flex flex-wrap items-center gap-3 rounded-data border border-border bg-white p-3">
        <div className="flex items-center gap-1">
          <button onClick={() => setPeriod((p) => shiftPeriod(p, -1))} aria-label={t("payroll.prev_month")} className="rounded-press p-1.5 text-text-muted hover:bg-paper-dim hover:text-text"><ChevronLeft size={18} /></button>
          <span className="min-w-[150px] text-center font-display text-base font-semibold capitalize text-text">{monthLabel(period, lang)}</span>
          <button onClick={() => setPeriod((p) => shiftPeriod(p, 1))} aria-label={t("payroll.next_month")} className="rounded-press p-1.5 text-text-muted hover:bg-paper-dim hover:text-text"><ChevronRight size={18} /></button>
        </div>
        <div className="flex flex-1 flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
          {ATTENDANCE.map((s) => <span key={s} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${TONE[s].dot}`} />{t(`att.${s}`)}</span>)}
        </div>
      </section>

      {failed ? (
        <div className="flex items-center gap-2 rounded-press border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-accent-dark">
          <span className="flex-1">{t("payroll.load_failed")}</span>
          <button onClick={() => void load(period)} className="font-semibold underline">{t("common.retry")}</button>
        </div>
      ) : data === null ? (
        <div className="h-48 rounded-data border border-border bg-white"><div className="hgv-shimmer m-4 h-4 w-1/2 rounded" /></div>
      ) : data.rows.length === 0 ? (
        <div className="flex flex-col items-center rounded-data border border-border bg-white py-14 text-center">
          <CalendarCheck size={36} className="text-text-faint" />
          <p className="mt-3 text-text-muted">{t("att.none_month")}</p>
        </div>
      ) : (
        <section className="hgv-fade-in overflow-hidden rounded-data border border-border bg-white">
          {data.rows.map(({ employee: e, counts, days: marks }) => (
            <div key={e.id} className="hgv-ledger-row px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="mr-auto font-semibold text-text">{e.full_name}</p>
                {ATTENDANCE.map((s) => (
                  <span key={s} className="text-sm text-text-muted">{t(`att.${s}`)} <b className="hgv-figure text-text">{counts[s]}</b></span>
                ))}
              </div>
              {/* One square per day: its colour is the mark, empty when none. */}
              <div className="mt-2 flex flex-wrap gap-[3px]">
                {days.map((d) => {
                  const s = marks[d];
                  return (
                    <span key={d} title={`${d}${s ? ` · ${t(`att.${s}`)}` : ""}`}
                      className={`flex h-5 w-5 items-center justify-center rounded-[4px] text-[9px] font-semibold ${s ? `${TONE[s].dot} text-white` : d > data.today ? "bg-paper text-text-faint/50" : "bg-paper-dim text-text-faint"}`}>
                      {Number(d.slice(8))}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
