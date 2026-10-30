"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowDownRight, ArrowUpRight, Car, CheckCircle2, Circle, History, Mail, MapPin, Pencil, Phone,
  ToggleLeft, ToggleRight, Trash2, UserPlus, X, Hash,
} from "lucide-react";
import { getAdminAudit, type AdminShop, type AdminUser, type AuditEntry, type CompanyInsight } from "@/lib/admin-api";
import { formatPublicAddress } from "@/lib/product-meta";
import { prettyPhone, shopTin } from "@/lib/company";
import { normalizeLayout } from "@/lib/business-layout";
import { HealthBadge, SETUP_STEPS, TOOLTIP_STYLE, ago, fullDate, monthShort, setupDone, trend } from "./insight-ui";
import { actionLabel } from "./AuditLog";

interface Props {
  shop: AdminShop;
  insight: CompanyInsight | undefined;
  months: string[];
  members: AdminUser[];
  busy: boolean;
  t: (k: string) => string;
  lang: string;
  onClose: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onVerify: () => void;
  onDelete: () => void;
  onAddUser: () => void;
}

/** One company, as the admin follows it: momentum, setup, team and history. */
export default function CompanyDetail({ shop, insight, months, members, busy, t, lang, onClose, onEdit, onToggle, onVerify, onDelete, onAddUser }: Props) {
  const [history, setHistory] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    let live = true;
    getAdminAudit({ targetId: shop.id, limit: 50 }).then((h) => { if (live) setHistory(h); }).catch(() => { if (live) setHistory([]); });
    return () => { live = false; };
  }, [shop.id, shop.is_active, shop.updated_at]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chart = months.map((m, i) => ({ label: monthShort(m, lang), sales: insight?.monthly_sales[i] ?? 0 }));
  const tr = insight ? trend(insight.sales_30d, insight.sales_prev_30d) : null;
  const done = insight ? setupDone(insight.setup) : 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={shop.name}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink text-lg font-bold text-white">
            {shop.logo_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={shop.logo_url} alt="" className="h-12 w-12 object-cover" />
              : (shop.name?.[0] ?? "?").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold text-gray-900">{shop.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {insight && <HealthBadge health={insight.health} t={t} />}
              {normalizeLayout(shop.layout) === "car" && (
                <span className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                  <Car size={10} /> {t("layout.car")}
                </span>
              )}
              <span className="text-[11px] text-gray-500">{t("admin.joined")} {fullDate(shop.created_at, lang)}</span>
            </div>
          </div>
          <button onClick={onClose} aria-label={t("common.close")} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button onClick={onEdit} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
              <Pencil size={12} /> {t("admin.edit_shop_title")}
            </button>
            <button onClick={onToggle} disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              {shop.is_active ? <><ToggleRight size={13} /> {t("admin.disable")}</> : <><ToggleLeft size={13} /> {t("admin.enable")}</>}
            </button>
            {shop.email && !shop.email_verified && (
              <button onClick={onVerify} disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-40">
                <Mail size={12} /> {t("admin.unverified_verify")}
              </button>
            )}
            <button onClick={onDelete} disabled={busy || shop.is_active}
              title={shop.is_active ? t("admin.delete_needs_off") : t("admin.delete_shop_title")}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-500">
              <Trash2 size={12} /> {t("common.delete")}
            </button>
          </div>

          {/* Momentum */}
          {insight ? (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t("admin.momentum")}</h3>
              <div className="grid grid-cols-3 gap-2">
                <Stat label={t("admin.sales_30d")} value={insight.sales_30d}
                  sub={tr ? (
                    <span className={`flex items-center gap-0.5 ${tr.up ? "text-success" : "text-accent-dark"}`}>
                      {tr.up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                      {tr.label === "new" ? t("admin.trend_new") : tr.label}
                    </span>
                  ) : null} />
                <Stat label={t("admin.sales_all_time")} value={insight.sales_total} />
                <Stat label={t("admin.products_listed")} value={insight.products} />
                <Stat label={t("admin.purchases_count")} value={insight.purchases} />
                <Stat label={t("admin.expenses_count")} value={insight.expenses} />
                <Stat label={t("admin.proformas_count")} value={insight.proformas} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-500">
                <p>{t("admin.last_sale")}: <span className="font-semibold text-gray-700">{ago(insight.last_sale_at, t)}</span></p>
                <p>{t("admin.last_activity")}: <span className="font-semibold text-gray-700">{ago(insight.last_activity_at, t)}</span></p>
              </div>

              <figure className="mt-3 rounded-lg border border-gray-100 p-3">
                <figcaption className="mb-1 text-xs font-semibold text-gray-700">{t("admin.chart_company_sales")}</figcaption>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={chart} margin={{ left: -24, right: 4, top: 6, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--hgv-chart-grid)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--hgv-chart-axis)" }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--hgv-chart-axis)" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--hgv-chart-grid)", opacity: 0.5 }} />
                    <Bar dataKey="sales" name={t("admin.series_sales")} fill="var(--hgv-series-1)" radius={[4, 4, 0, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </figure>
            </section>
          ) : (
            <div className="hgv-shimmer h-40 rounded-lg" />
          )}

          {/* Setup */}
          {insight && (
            <section>
              <h3 className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                {t("admin.setup_title")}
                <span className="normal-case text-gray-600">{done} / {SETUP_STEPS.length}</span>
              </h3>
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-success" style={{ width: `${(done / SETUP_STEPS.length) * 100}%` }} />
              </div>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {SETUP_STEPS.map((k) => (
                  <li key={k} className={`flex items-center gap-2 text-xs ${insight.setup[k] ? "text-gray-700" : "text-gray-400"}`}>
                    {insight.setup[k] ? <CheckCircle2 size={14} className="text-success" /> : <Circle size={14} />}
                    {t(`admin.setup_${k}`)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Details */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t("admin.shop_info")}</h3>
            <dl className="space-y-1.5 text-xs">
              {[
                { icon: Mail, label: t("common.email"), value: shop.email ? `${shop.email}${shop.email_verified ? ` · ${t("admin.verified")}` : ""}` : "-" },
                { icon: Phone, label: t("common.phone"), value: prettyPhone(shop.phone) || "-" },
                { icon: Hash, label: "TIN", value: shopTin(shop) || t("company.no_tin") },
                { icon: MapPin, label: t("common.address"), value: formatPublicAddress(shop.address) || "-" },
              ].map((d) => (
                <div key={d.label} className="flex items-start gap-2">
                  <d.icon size={12} className="mt-0.5 shrink-0 text-gray-300" />
                  <dt className="w-16 shrink-0 text-gray-400">{d.label}</dt>
                  <dd className="break-all font-medium text-gray-700">{d.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Team */}
          <section>
            <h3 className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <span>{t("admin.team_members")} · {members.length}</span>
              <button onClick={onAddUser} className="flex items-center gap-1 rounded-lg bg-ink px-2 py-1 text-[11px] font-semibold normal-case text-white hover:opacity-90">
                <UserPlus size={11} /> {t("common.add")}
              </button>
            </h3>
            {members.length === 0 ? (
              <p className="py-3 text-center text-xs text-gray-400">{t("admin.no_users_assigned")}</p>
            ) : (
              <ul className="divide-y divide-gray-50 rounded-lg border border-gray-100">
                {members.map((m) => (
                  <li key={m.id} className={`flex items-center gap-2 px-3 py-2 text-xs ${m.is_active ? "" : "opacity-50"}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-gray-800">{m.name || m.email}</span>
                      {m.name && <span className="block truncate text-[11px] text-gray-400">{m.email}</span>}
                    </span>
                    <span className="shrink-0 text-gray-500">{t(`role.${m.role}`)}</span>
                    <span className="w-24 shrink-0 text-right text-[11px] text-gray-400">{ago(m.last_active_at, t)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* History */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <History size={12} /> {t("admin.history_title")}
            </h3>
            {history === null ? (
              <div className="hgv-shimmer h-16 rounded-lg" />
            ) : history.length === 0 ? (
              <p className="text-xs text-gray-400">{t("admin.history_none")}</p>
            ) : (
              <ul className="space-y-1.5">
                {history.map((h) => (
                  <li key={h.id} className="flex gap-2 text-xs">
                    <span className="w-28 shrink-0 text-gray-400">{fullDate(h.at, lang)}</span>
                    <span className="text-gray-700">{actionLabel(h, t)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-slate-50/60 px-2.5 py-2">
      <p className="truncate text-[11px] text-gray-500">{label}</p>
      <p className="text-lg font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-[11px] font-semibold">{sub}</p>}
    </div>
  );
}
