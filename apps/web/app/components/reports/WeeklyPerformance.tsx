"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarRange, Minus } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { reportRequest } from "@/lib/report-api";
import { expenseRequest } from "@/lib/expense-api";
import { itemRequest } from "@/lib/product-api";
import { useLanguage } from "@/lib/language-context";
import { parseAttributes } from "@/lib/business-layout";

const WEEKS = 8;

type Metric = "sales" | "count" | "expenses" | "fines" | "pending";
type Week = { label: string; from: string; to: string } & Record<Metric, number>;

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Rolling 7-day weeks ending today, oldest first (the last one is "this week"). */
function weekWindows() {
  return Array.from({ length: WEEKS }, (_, i) => {
    const end = new Date(); end.setDate(end.getDate() - 7 * (WEEKS - 1 - i));
    const start = new Date(end); start.setDate(start.getDate() - 6);
    return {
      from: ymd(start), to: ymd(end),
      label: start.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    };
  });
}

/** Week-by-week picture of how the business is doing: sales and expenses
 *  over the last 8 weeks, and this week against last week for each figure
 *  (car companies also see fines found and cars put on pending). */
export default function WeeklyPerformance({ isCar, currency, fmt }: { isCar: boolean; currency: string; fmt: (n: number) => string }) {
  const { t } = useLanguage();
  const [weeks, setWeeks] = useState<Week[] | null>(null);

  useEffect(() => {
    let alive = true;
    const wins = weekWindows();
    const first = wins[0].from, last = wins[wins.length - 1].to;
    Promise.allSettled([
      reportRequest(`/reports/daily?days=${WEEKS * 7}`),
      expenseRequest(`/expenses?page=1&limit=2000&from_date=${first}&to_date=${last}`),
      isCar ? itemRequest("/products?page=1&limit=1000&status=penalties") : Promise.resolve(null),
      isCar ? itemRequest("/products?page=1&limit=1000&status=pending") : Promise.resolve(null),
    ]).then(([daily, exp, fines, pend]) => {
      if (!alive) return;
      const out: Week[] = wins.map((w) => ({ ...w, sales: 0, count: 0, expenses: 0, fines: 0, pending: 0 }));
      const add = (day: string, m: Metric, v: number) => {
        const w = out.find((x) => day >= x.from && day <= x.to);
        if (w) w[m] += v;
      };
      if (daily.status === "fulfilled") {
        for (const d of daily.value?.data ?? []) if (d.day) { add(d.day, "sales", Number(d.revenue ?? 0)); add(d.day, "count", Number(d.sales_count ?? 0)); }
      }
      if (exp.status === "fulfilled") {
        for (const e of exp.value?.data?.items ?? []) add(String(e.expense_date ?? "").slice(0, 10), "expenses", Number(e.amount ?? 0));
      }
      if (fines.status === "fulfilled" && fines.value) {
        for (const c of fines.value?.data?.items ?? []) { const a = parseAttributes(c.attributes); if (a.penalty_checked) add(a.penalty_checked, "fines", Number(a.penalty_count || 0)); }
      }
      if (pend.status === "fulfilled" && pend.value) {
        for (const c of pend.value?.data?.items ?? []) { const a = parseAttributes(c.attributes); if (a.pending_since) add(a.pending_since, "pending", 1); }
      }
      setWeeks(out);
    });
    return () => { alive = false; };
  }, [isCar]);

  const cards = useMemo(() => {
    const list: { key: Metric; label: string; color: string; money: boolean; goodUp: boolean }[] = [
      { key: "sales",    label: t("dash.chart_sales"),    color: "#0a66c2", money: true,  goodUp: true },
      { key: "count",    label: t("sales.count"),         color: "#057642", money: false, goodUp: true },
      { key: "expenses", label: t("dash.chart_expenses"), color: "#915907", money: true,  goodUp: false },
    ];
    if (isCar) {
      list.push({ key: "fines",   label: t("dash.chart_fines"),   color: "#cc1016", money: false, goodUp: false });
      list.push({ key: "pending", label: t("dash.chart_pending"), color: "#7c3aed", money: false, goodUp: true });
    }
    return list;
  }, [isCar, t]);

  const thisW = weeks?.[weeks.length - 1], lastW = weeks?.[weeks.length - 2];

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <CalendarRange size={15} className="text-[#0a66c2]" /> {t("reports.weekly_title")}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{t("reports.weekly_sub")}</p>
        </div>
      </div>

      {/* This week vs last week, each with an 8-week trend line */}
      <div className={`grid grid-cols-2 gap-2 ${isCar ? "md:grid-cols-5" : "md:grid-cols-3"}`}>
        {cards.map((c) => {
          const now = thisW?.[c.key] ?? 0, before = lastW?.[c.key] ?? 0;
          const pct = before > 0 ? Math.round(((now - before) / before) * 100) : null;
          const up = now > before, flat = now === before;
          const good = flat ? null : up === c.goodUp;
          const tone = good === null ? "text-slate-500" : good ? "text-emerald-700" : "text-red-600";
          return (
            <div key={c.key} className="min-w-0 rounded-lg border border-slate-200 p-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: c.color }} /> <span className="truncate">{c.label}</span>
              </p>
              <p className="mt-1 truncate text-base font-bold text-slate-900 tabular-nums">
                {weeks ? (c.money ? `${currency} ${fmt(now)}` : now.toLocaleString()) : "…"}
              </p>
              <p className={`flex items-center gap-1 text-xs font-semibold ${tone}`}>
                {flat ? <Minus size={12} /> : up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {pct !== null ? `${pct > 0 ? "+" : ""}${pct}%` : flat ? "0" : t("reports.new_this_week")}
                <span className="truncate font-normal text-slate-500">{t("reports.vs_last_week")}</span>
              </p>
              <div className="mt-1 h-8">
                {weeks && (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weeks} margin={{ top: 3, right: 2, bottom: 0, left: 2 }}>
                      <Line type="monotone" dataKey={c.key} stroke={c.color} strokeWidth={1.75} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sales and expenses per week, with the number of sales as a line */}
      <div className="mt-3">
        {!weeks ? (
          <div className="h-48 animate-pulse rounded-lg bg-slate-100" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={weeks} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="money" tickFormatter={fmt} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} width={46} />
              <YAxis yAxisId="count" orientation="right" hide allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #e2e8f0" }}
                labelFormatter={(_, p) => { const w = p?.[0]?.payload as Week | undefined; return w ? `${w.from} → ${w.to}` : ""; }}
                formatter={(v: unknown, name: unknown) => {
                  const c = cards.find((x) => x.key === name);
                  const n = typeof v === "number" ? v : 0;
                  return [c?.money ? `${currency} ${n.toLocaleString()}` : n.toLocaleString(), c?.label ?? String(name)];
                }}
              />
              <Bar yAxisId="money" dataKey="sales" fill="#0a66c2" radius={[3, 3, 0, 0]} barSize={18} />
              <Bar yAxisId="money" dataKey="expenses" fill="#d9a441" radius={[3, 3, 0, 0]} barSize={18} />
              <Line yAxisId="count" type="monotone" dataKey="count" stroke="#057642" strokeWidth={2} dot={{ r: 2.5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-slate-600">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-[#0a66c2]" /> {t("dash.chart_sales")}</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-[#d9a441]" /> {t("dash.chart_expenses")}</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded bg-[#057642]" /> {t("sales.count")}</span>
        </div>
      </div>
    </section>
  );
}
