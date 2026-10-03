"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ChevronRight } from "lucide-react";
import { Area, Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { itemRequest } from "@/lib/product-api";
import { expenseRequest } from "@/lib/expense-api";
import { useLanguage } from "@/lib/language-context";
import { useAutoRefresh } from "@/lib/hooks";
import { parseAttributes } from "@/lib/business-layout";

interface Daily { day: string; revenue: number }
type Point = { key: string; day: string; sales: number; expenses: number; fines: number; pending: number };

const DAYS = 8; // today and the 7 days before, like the revenue chart it replaces

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function lastDays(): string[] {
  return Array.from({ length: DAYS }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (DAYS - 1 - i)); return ymd(d); });
}

/** Car companies' dashboard chart: money in and out (sales, expenses) as
 *  lines, and cars needing follow-up (fines found, cars put on pending) as
 *  bars on their own scale. No profit figures. */
export default function CarPerformanceChart({ daily, fmtCurrency }: { daily: Daily[]; fmtCurrency: (n: number) => string }) {
  const { t } = useLanguage();
  const [extra, setExtra] = useState<{ expenses: Record<string, number>; fines: Record<string, number>; pending: Record<string, number> }>({ expenses: {}, fines: {}, pending: {} });

  const load = useCallback(async () => {
    const keys = lastDays();
    const [exp, fin, pend] = await Promise.allSettled([
      expenseRequest(`/expenses?page=1&limit=500&from_date=${keys[0]}&to_date=${keys[keys.length - 1]}`),
      itemRequest("/products?page=1&limit=1000&status=penalties"),
      itemRequest("/products?page=1&limit=1000&status=pending"),
    ]);
    const inRange = new Set(keys);
    const expenses: Record<string, number> = {}, fines: Record<string, number> = {}, pending: Record<string, number> = {};
    if (exp.status === "fulfilled") {
      for (const e of exp.value?.data?.items ?? []) {
        const k = String(e.expense_date ?? "").slice(0, 10);
        if (inRange.has(k)) expenses[k] = (expenses[k] ?? 0) + Number(e.amount ?? 0);
      }
    }
    // Fines: how many were found on the day a car's plate was checked.
    if (fin.status === "fulfilled") {
      for (const c of fin.value?.data?.items ?? []) {
        const a = parseAttributes(c.attributes);
        const k = a.penalty_checked ?? "";
        if (inRange.has(k)) fines[k] = (fines[k] ?? 0) + Number(a.penalty_count || 0);
      }
    }
    // Pending: cars reserved for a buyer, by the day they were reserved.
    if (pend.status === "fulfilled") {
      for (const c of pend.value?.data?.items ?? []) {
        const k = parseAttributes(c.attributes).pending_since ?? "";
        if (inRange.has(k)) pending[k] = (pending[k] ?? 0) + 1;
      }
    }
    return { expenses, fines, pending };
  }, []);

  useEffect(() => {
    let alive = true;
    load().then((r) => { if (alive) setExtra(r); }).catch(() => {});
    return () => { alive = false; };
  }, [load]);
  useAutoRefresh(() => { load().then(setExtra).catch(() => {}); });

  const data: Point[] = useMemo(() => {
    const rev: Record<string, number> = {};
    daily.forEach((d) => { if (d.day) rev[d.day] = d.revenue ?? 0; });
    return lastDays().map((key) => {
      const d = new Date(`${key}T00:00:00`);
      return {
        key, day: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }),
        sales: rev[key] ?? 0, expenses: extra.expenses[key] ?? 0, fines: extra.fines[key] ?? 0, pending: extra.pending[key] ?? 0,
      };
    });
  }, [daily, extra]);

  const sum = (k: keyof Omit<Point, "key" | "day">) => data.reduce((s, p) => s + p[k], 0);
  const SERIES = [
    { key: "sales",    label: t("dash.chart_sales"),    color: "#0a66c2", money: true },
    { key: "expenses", label: t("dash.chart_expenses"), color: "#915907", money: true },
    { key: "fines",    label: t("dash.chart_fines"),    color: "#cc1016", money: false },
    { key: "pending",  label: t("dash.chart_pending"),  color: "#7c3aed", money: false },
  ] as const;

  return (
    <>
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display font-semibold text-text text-base flex items-center gap-2">
          <Activity size={13} className="text-ink" />
          {t("dash.performance_7d")}
        </h2>
        <Link href="/reports" className="text-[11px] font-semibold text-ink hover:text-ink-dark flex items-center gap-0.5 transition-colors duration-200">
          {t("dash.full_report")} <ChevronRight size={12} />
        </Link>
      </div>

      {/* Totals double as the legend. */}
      <div className="mb-1.5 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
        {SERIES.map((s) => (
          <div key={s.key} className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: s.color }} /> {s.label}
            </p>
            <p className="hgv-figure truncate text-sm font-semibold text-text">
              {s.money ? fmtCurrency(sum(s.key)) : sum(s.key).toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={130}>
        <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="carSalesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0a66c2" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#0a66c2" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#8c8c8c" }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="money" hide />
          <YAxis yAxisId="count" orientation="right" hide allowDecimals={false} domain={[0, (max: number) => Math.max(4, max * 1.6)]} />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 2, border: "1px solid #e0dfdc", boxShadow: "0 2px 8px rgba(0,0,0,.1)" }}
            formatter={(v: unknown, name: unknown) => {
              const s = SERIES.find((x) => x.key === name);
              const n = typeof v === "number" ? v : 0;
              return [s?.money ? fmtCurrency(n) : n.toLocaleString(), s?.label ?? String(name)];
            }}
          />
          <Bar yAxisId="count" dataKey="pending" fill="#7c3aed" fillOpacity={0.75} barSize={7} radius={[2, 2, 0, 0]} />
          <Bar yAxisId="count" dataKey="fines" fill="#cc1016" fillOpacity={0.75} barSize={7} radius={[2, 2, 0, 0]} />
          <Area yAxisId="money" type="monotone" dataKey="sales" stroke="#0a66c2" fill="url(#carSalesFill)" strokeWidth={2} dot={false} />
          <Line yAxisId="money" type="monotone" dataKey="expenses" stroke="#915907" strokeWidth={1.75} dot={false} strokeDasharray="4 2" />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}
