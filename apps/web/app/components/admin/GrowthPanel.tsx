"use client";

import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronRight, Table2, TrendingUp, Trophy } from "lucide-react";
import type { AdminInsights, AdminShop, CompanyHealth, CompanyInsight } from "@/lib/admin-api";
import { HealthBadge, HealthIcon, SETUP_STEPS, TOOLTIP_STYLE, ago, monthLong, monthShort, setupDone, trend } from "./insight-ui";

const S1 = "var(--hgv-series-1)";
const S2 = "var(--hgv-series-2)";
const GRID = "var(--hgv-chart-grid)";
const AXIS = { fontSize: 11, fill: "var(--hgv-chart-axis)" };

interface Props {
  insights: AdminInsights | null;
  shops: AdminShop[];
  loading: boolean;
  t: (k: string) => string;
  lang: string;
  onOpenCompany: (id: string) => void;
  onFilterHealth: (h: CompanyHealth) => void;
}

/** The platform's growth and each company's momentum, for the admin's Overview. */
export default function GrowthPanel({ insights, shops, loading, t, lang, onOpenCompany, onFilterHealth }: Props) {
  const [asTable, setAsTable] = useState(false);
  const names = useMemo(() => new Map(shops.map((s) => [s.id, s.name])), [shops]);

  if (loading && !insights) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="hgv-shimmer h-[88px] rounded-xl border border-gray-200" />)}
        </div>
        <div className="hgv-shimmer h-64 rounded-xl border border-gray-200" />
      </div>
    );
  }
  if (!insights) return null;

  const rows = insights.timeline.map((m) => ({ ...m, label: monthShort(m.month, lang) }));
  const known = insights.companies.filter((c) => names.has(c.shop_id));
  const totalCompanies = known.length;
  const salesTrend = trend(insights.totals.sales_30d, insights.totals.sales_prev_30d);

  // Needs attention: companies going quiet, and new ones stuck before their first sale.
  const attention = known
    .filter((c) => c.health === "dormant" || c.health === "slowing" || (c.health === "new" && !c.setup.first_sale))
    .sort((a, b) => rank(a) - rank(b) || (a.last_activity_at ?? "").localeCompare(b.last_activity_at ?? ""))
    .slice(0, 8);
  const top = known.filter((c) => c.sales_30d > 0).sort((a, b) => b.sales_30d - a.sales_30d).slice(0, 5);

  return (
    <div className="space-y-3">
      {/* ── Momentum: where every company stands ── */}
      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {(["active", "slowing", "dormant", "new"] as const).map((h) => (
          <button key={h} onClick={() => onFilterHealth(h)}
            className="hgv-card-hover flex flex-col items-start rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm">
            <div className="mb-2 flex w-full items-center justify-between">
              <HealthBadge health={h} t={t} />
              <ChevronRight size={14} className="text-gray-300" />
            </div>
            <p className="text-2xl font-bold tabular-nums text-slate-900">{insights.health[h] ?? 0}</p>
            <p className="mt-0.5 text-[11px] text-gray-500">{t(`admin.health_${h}_hint`)}</p>
          </button>
        ))}
      </section>

      <section className="grid gap-2.5 sm:grid-cols-3">
        <Tile label={t("admin.sales_30d")} value={insights.totals.sales_30d}
          sub={salesTrend ? `${salesTrend.label === "new" ? t("admin.trend_new") : salesTrend.label} ${t("admin.vs_prev_30d")}` : t("admin.no_sales_yet")}
          up={salesTrend?.up} />
        <Tile label={t("admin.companies_selling")}
          value={`${insights.totals.with_first_sale} / ${totalCompanies}`}
          sub={t("admin.companies_selling_sub")} />
        <Tile label={t("admin.products_listed")} value={insights.totals.products} sub={t("admin.products_listed_sub")} />
      </section>

      {/* ── Growth, month by month ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <TrendingUp size={14} className="text-ink" /> {t("admin.growth_title")}
          </h3>
          <button onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50">
            <Table2 size={12} /> {asTable ? t("admin.show_charts") : t("admin.show_table")}
          </button>
        </div>

        {asTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="py-2 pr-3 font-semibold">{t("admin.month")}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t("admin.series_companies")}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t("admin.series_selling")}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t("admin.series_sales")}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t("admin.series_new_companies")}</th>
                  <th className="py-2 text-right font-semibold">{t("admin.series_new_people")}</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {[...insights.timeline].reverse().map((m) => (
                  <tr key={m.month} className="border-b border-gray-50">
                    <td className="py-1.5 pr-3 text-gray-700">{monthLong(m.month, lang)}</td>
                    <td className="py-1.5 pr-3 text-right">{m.total_shops}</td>
                    <td className="py-1.5 pr-3 text-right">{m.active_shops}</td>
                    <td className="py-1.5 pr-3 text-right">{m.sales}</td>
                    <td className="py-1.5 pr-3 text-right">{m.new_shops}</td>
                    <td className="py-1.5 text-right">{m.new_users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            <ChartBlock title={t("admin.chart_companies_title")} hint={t("admin.chart_companies_hint")}
              legend={[{ color: S1, label: t("admin.series_companies") }, { color: S2, label: t("admin.series_selling") }]}>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={rows} margin={{ left: -18, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: GRID }} />
                  <Line type="monotone" dataKey="total_shops" name={t("admin.series_companies")} stroke={S1} strokeWidth={2}
                    dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-paper, #fff)" }} />
                  <Line type="monotone" dataKey="active_shops" name={t("admin.series_selling")} stroke={S2} strokeWidth={2}
                    dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-paper, #fff)" }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartBlock>

            <ChartBlock title={t("admin.chart_sales_title")} hint={t("admin.chart_sales_hint")}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={rows} margin={{ left: -18, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: GRID, opacity: 0.5 }} />
                  <Bar dataKey="sales" name={t("admin.series_sales")} fill={S1} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </ChartBlock>

            <ChartBlock title={t("admin.chart_signups_title")} hint={t("admin.chart_signups_hint")} wide
              legend={[{ color: S1, label: t("admin.series_new_companies") }, { color: S2, label: t("admin.series_new_people") }]}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={rows} margin={{ left: -18, right: 8, top: 8, bottom: 0 }} barGap={2}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: GRID, opacity: 0.5 }} />
                  <Bar dataKey="new_shops" name={t("admin.series_new_companies")} fill={S1} radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="new_users" name={t("admin.series_new_people")} fill={S2} radius={[4, 4, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </ChartBlock>
          </div>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* ── Needs attention ── */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <h3 className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-800">
            <AlertTriangle size={14} className="text-warning" /> {t("admin.attention_title")}
            <span className="ml-auto text-xs font-medium text-gray-400">{attention.length}</span>
          </h3>
          {attention.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-gray-400">{t("admin.attention_none")}</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {attention.map((c) => (
                <CompanyRow key={c.shop_id} c={c} name={names.get(c.shop_id) ?? "-"} onOpen={onOpenCompany}
                  detail={c.health === "new"
                    ? t("admin.attention_setup").replace("{done}", String(setupDone(c.setup))).replace("{all}", String(SETUP_STEPS.length))
                    : `${t("admin.last_record")}: ${ago(c.last_record_at, t)}`} t={t} />
              ))}
            </ul>
          )}
        </section>

        {/* ── Most active ── */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <h3 className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-800">
            <Trophy size={14} className="text-ink" /> {t("admin.top_title")}
          </h3>
          {top.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-gray-400">{t("admin.no_sales_yet")}</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {top.map((c) => {
                const tr = trend(c.sales_30d, c.sales_prev_30d);
                return (
                  <CompanyRow key={c.shop_id} c={c} name={names.get(c.shop_id) ?? "-"} onOpen={onOpenCompany} t={t}
                    detail={`${c.sales_30d} ${t("admin.sales_in_30d")}`}
                    extra={tr && (
                      <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${tr.up ? "text-success" : "text-accent-dark"}`}>
                        {tr.up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                        {tr.label === "new" ? t("admin.trend_new") : tr.label}
                      </span>
                    )} />
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function rank(c: CompanyInsight): number {
  return c.health === "dormant" ? 0 : c.health === "slowing" ? 1 : 2;
}

function Tile({ label, value, sub, up }: { label: string; value: number | string; sub: string; up?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <p className="text-[11px] font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className={`mt-0.5 flex items-center gap-1 text-[11px] ${up === undefined ? "text-gray-500" : up ? "text-success" : "text-accent-dark"}`}>
        {up !== undefined && (up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />)}
        {sub}
      </p>
    </div>
  );
}

function ChartBlock({ title, hint, legend, wide, children }: {
  title: string; hint: string; legend?: { color: string; label: string }[]; wide?: boolean; children: React.ReactNode;
}) {
  return (
    <figure className={wide ? "lg:col-span-2" : ""}>
      <figcaption className="mb-2">
        <p className="text-xs font-semibold text-gray-800">{title}</p>
        <p className="text-[11px] text-gray-500">{hint}</p>
        {legend && (
          <div className="mt-1.5 flex flex-wrap gap-3">
            {legend.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-gray-600">
                <span className="inline-block h-[3px] w-3 rounded-full" style={{ background: l.color }} /> {l.label}
              </span>
            ))}
          </div>
        )}
      </figcaption>
      {children}
    </figure>
  );
}

function CompanyRow({ c, name, detail, extra, onOpen, t }: {
  c: CompanyInsight; name: string; detail: string; extra?: React.ReactNode; onOpen: (id: string) => void; t: (k: string) => string;
}) {
  return (
    <li>
      <button onClick={() => onOpen(c.shop_id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
        <HealthIcon health={c.health} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-gray-900">{name}</span>
          <span className="block truncate text-[11px] text-gray-500">{detail}</span>
        </span>
        {extra}
        <HealthBadge health={c.health} t={t} />
      </button>
    </li>
  );
}
