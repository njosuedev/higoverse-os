"use client";

// Sales on a phone: the Android app's Sales tab (apps/mobile/lib/src/
// screens/sales_screen.dart) — Sales or Proforma, a period (today, 7 or 30
// days), the count and revenue, then the sales by day, newest first, more
// as you scroll. A sale opens its details in a sheet; "+ New sale" opens
// the website's sale form.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CloudOff, Receipt, TrendingUp } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { useShopSettings } from "@/lib/shop-settings-context";
import { useCanSeeFinancials, useShowsProfit } from "@/lib/permissions";
import { saleRequest } from "@/lib/sale-api";
import ProformaPanel from "@/app/components/sales/ProformaPanel";
import { full } from "./PhoneOr";
import {
  Bone, Chip, EmptyState, Fab, IconAvatar, InfoRow, ListSkeleton, Segmented, Sheet,
  daysAgo, groupDigits, hhmm, lastDays, money, num, parseTimestamp, shortDate, useEndOfList, weekdayShort,
} from "./kit";

type Row = Record<string, unknown>;
const PAGE = 25;
const PERIODS = [{ days: 1, key: "sales.today" }, { days: 7, key: "sales.7d" }, { days: 30, key: "sales.30d" }];

export function payLabel(t: (k: string) => string, m: unknown) {
  const v = typeof m === "string" && m ? m : "cash";
  return ["cash", "mtn", "airtel", "bank", "card", "debt"].includes(v) ? t(`sales.pm_${v}`) : v;
}

export default function MobileSales({ proforma: startProforma = false }: { proforma?: boolean }) {
  const { t, lang } = useLanguage();
  const { currency } = useShopSettings();
  const fin = useCanSeeFinancials();
  const [proforma, setProforma] = useState(startProforma);
  const [days, setDays] = useState(7);
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [summary, setSummary] = useState<Row | null>(null);
  const [open, setOpen] = useState<Row | null>(null);
  const gen = useRef(0);

  const loadPage = useCallback(async (p: number, g: number, d: number) => {
    setLoading(true); setError(false);
    const r = lastDays(d);
    try {
      const res = await saleRequest(`/sales?page=${p}&limit=${PAGE}&from_date=${r.from}&to_date=${r.to}`);
      if (g !== gen.current) return;
      const data = (res?.data ?? {}) as Row;
      const rows = Array.isArray(data.items) ? (data.items as Row[]) : [];
      setItems((prev) => {
        const have = new Set(prev.map((x) => x.id));
        return p === 1 ? rows : [...prev, ...rows.filter((x) => !have.has(x.id))];
      });
      setTotal(num(data.total));
      setPage(p);
    } catch {
      if (g === gen.current) setError(true);
    } finally {
      if (g === gen.current) setLoading(false);
    }
  }, []);

  const reload = useCallback((d: number) => {
    const g = ++gen.current;
    setItems([]); setTotal(0); setPage(0); setSummary(null);
    const r = lastDays(d);
    saleRequest(`/sales/summary?from_date=${r.from}&to_date=${r.to}`)
      .then((res) => { if (g === gen.current) setSummary((res?.data ?? {}) as Row); })
      .catch(() => { if (g === gen.current) setSummary({}); });
    void loadPage(1, g, d);
  }, [loadPage]);

  useEffect(() => {
    if (proforma) return;
    const first = setTimeout(() => reload(days), 0);
    return () => clearTimeout(first);
  }, [days, proforma, reload]);

  const more = () => { if (!loading && !error && page > 0 && items.length < total) void loadPage(page + 1, gen.current, days); };
  const end = useEndOfList(more);

  return (
    <main className="pb-24">
      <div className="flex gap-2 bg-paper px-2.5 pt-2">
        <Chip selected={!proforma} onClick={() => setProforma(false)}>{t("nav.sales")}</Chip>
        <Chip selected={proforma} onClick={() => setProforma(true)}>{t("pf.title")}</Chip>
      </div>

      {proforma ? (
        <div className="px-2 pt-2"><ProformaPanel /></div>
      ) : (<>
        <div className="bg-paper px-2.5 pb-2 pt-2">
          <Segmented value={days} options={PERIODS.map((p) => ({ value: p.days, label: t(p.key) }))} onChange={setDays} />
          <div className="mt-3 flex gap-2.5">
            <Figure label={t("dash.sales")} icon={<Receipt size={18} />} value={summary == null ? null : Object.keys(summary).length ? groupDigits(num(summary.sales_count)) : "-"} />
            {fin && <Figure label={t("dash.revenue")} icon={<TrendingUp size={18} />} value={summary == null ? null : Object.keys(summary).length ? money(num(summary.revenue), currency) : "-"} />}
          </div>
        </div>
        <div className="border-t border-border" />

        {error && items.length === 0 ? (
          <EmptyState icon={<CloudOff size={40} />} message={t("dash.offline")} onRetry={() => reload(days)} retry={t("app.retry")} />
        ) : loading && items.length === 0 ? (
          <ListSkeleton count={9} />
        ) : items.length === 0 ? (
          <EmptyState icon={<Receipt size={40} />} message={t("sales.none")} />
        ) : (
          <div className="pt-1.5">
            {items.map((r, i) => {
              const when = parseTimestamp(r.created_at);
              const prev = i === 0 ? null : parseTimestamp(items[i - 1].created_at);
              const newDay = when && (!prev || daysAgo(prev) !== daysAgo(when));
              return (
                <div key={String(r.id)}>
                  {newDay && (
                    <p className={`px-3 pb-0.5 text-[13px] font-extrabold text-text-muted ${i === 0 ? "pt-1.5" : "pt-3"}`}>
                      {daysAgo(when) === 0 ? t("act.today") : daysAgo(when) === 1 ? t("act.yesterday") : `${weekdayShort(lang, when)} ${shortDate(lang, when)}`}
                    </p>
                  )}
                  <button type="button" onClick={() => setOpen(r)}
                    className={`flex w-full items-center gap-4 px-4 py-3 text-left active:bg-paper-dim ${!newDay && i > 0 ? "border-t border-border" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-text">{String(r.product_name ?? t("sale.default"))}</p>
                      <p className="truncate text-[14px] text-text-muted">
                        {num(r.quantity) || 1} × {groupDigits(num(r.unit_price))} · {payLabel(t, r.payment_method)} · {when ? hhmm(when) : ""}
                      </p>
                    </div>
                    <span className="shrink-0 font-extrabold text-text">{money(num(r.total_amount), currency)}</span>
                  </button>
                </div>
              );
            })}
            <div ref={end} />
            {loading && <div className="flex justify-center py-5"><span className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>}
            {error && items.length > 0 && <EmptyState icon={<CloudOff size={32} />} message={t("dash.offline")} onRetry={more} retry={t("app.retry")} />}
          </div>
        )}
      </>)}

      {/* The Proforma list has its own "New proforma" button. */}
      {!proforma && <Fab href={full("/sales", { new: 1 })} label={t("form.new_sale")} />}
      <SaleSheet sale={open} onClose={() => setOpen(null)} />
    </main>
  );
}

function Figure({ label, icon, value }: { label: string; icon: React.ReactNode; value: string | null }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-border bg-white p-3.5">
      <div className="flex items-center">
        <span className="min-w-0 flex-1 truncate text-[12px] font-bold uppercase tracking-wide text-text-muted">{label}</span>
        <span className="text-ink">{icon}</span>
      </div>
      {value == null ? <Bone w={96} h={18} className="mt-2.5" /> : <p className="mt-1.5 truncate text-[20px] font-black text-text">{value}</p>}
    </div>
  );
}

/** One sale: amount, what, how it was paid, and (when allowed) its profit. */
function SaleSheet({ sale, onClose }: { sale: Row | null; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const { currency } = useShopSettings();
  const prof = useShowsProfit();
  if (!sale) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const totalV = num(sale.total_amount);
  const paid = sale.amount_paid == null ? null : num(sale.amount_paid);
  const when = parseTimestamp(sale.created_at);
  return (
    <Sheet open onClose={onClose}>
      <div className="flex items-center gap-3.5">
        <IconAvatar icon={<Receipt size={22} />} color="var(--color-ink)" size={46} />
        <div className="min-w-0">
          <p className="truncate text-[20px] font-extrabold tracking-[-0.3px] text-text">{String(sale.product_name ?? t("sale.default"))}</p>
          {when && <p className="font-medium text-text-faint">{shortDate(lang, when)}, {hhmm(when)}</p>}
        </div>
      </div>
      <div className="mt-[18px] rounded-[14px] bg-paper px-4 py-4 text-center">
        <p className="font-semibold text-text-muted">{t("sale.total")}</p>
        <p className="mt-1 truncate text-[28px] font-black tracking-[-0.5px] text-text">{money(totalV, currency)}</p>
      </div>
      <div className="mt-2.5">
        <InfoRow label={t("sale.quantity")} value={groupDigits(num(sale.quantity))} />
        <InfoRow label={t("sale.unit_price")} value={money(num(sale.unit_price), currency)} />
        <InfoRow label={t("sale.payment")} value={payLabel(t, sale.payment_method)} />
        {paid != null && paid < totalV && (<>
          <InfoRow label={t("sale.paid")} value={money(paid, currency)} />
          <InfoRow label={t("sale.balance")} value={money(totalV - paid, currency)} color="var(--color-warning)" strong />
        </>)}
        {prof && sale.profit != null && (
          <InfoRow label={t("sale.profit")} value={money(num(sale.profit), currency)} color={num(sale.profit) >= 0 ? "var(--color-success)" : "var(--color-accent)"} />
        )}
      </div>
      {String(sale.notes ?? "").trim() && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="font-semibold text-text-muted">{t("sale.notes")}</p>
          <p className="mt-1 text-text">{String(sale.notes)}</p>
        </div>
      )}
      {/* Print, edit or delete: on the website's Sales page. */}
      <Link href={full("/sales")} className="mt-5 flex h-12 items-center justify-center rounded-full border border-border font-bold text-text active:bg-paper-dim">
        {t("sale.manage")}
      </Link>
    </Sheet>
  );
}
