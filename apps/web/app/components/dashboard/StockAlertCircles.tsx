"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useLanguage } from "@/lib/language-context";

interface Alert { id: string; name: string; quantity: number; selling_price: number }

/** Low and empty stock as overlapping circles: each ring fills with what's
 *  left against the low-stock level, with the count in the middle (red when
 *  empty). The hovered/tapped item's details show underneath, so the panel
 *  keeps one height however many items need restocking. */
export default function StockAlertCircles({ items, total, threshold, restockHref, fmtCurrency }: {
  items: Alert[]; total: number; threshold: number; restockHref: string; fmtCurrency: (n: number) => string;
}) {
  const { t } = useLanguage();
  // Empty first, then the lowest.
  const sorted = [...items].sort((a, b) => a.quantity - b.quantity);
  const [active, setActive] = useState<string | null>(null);
  const shown = sorted.find((i) => i.id === active) ?? sorted[0];
  const extra = total - sorted.length;

  return (
    <div className="px-3.5 pb-3">
      <div className="flex items-center pl-1.5 pt-1" onMouseLeave={() => setActive(null)}>
        {sorted.map((item, i) => {
          const empty = item.quantity <= 0;
          const label = `${item.name}: ${empty ? t("dash.empty_stock") : `${item.quantity} ${t("dash.units_left")}`}`;
          return (
            <button key={item.id} type="button" aria-label={label} title={label} aria-pressed={shown?.id === item.id}
              onMouseEnter={() => setActive(item.id)} onFocus={() => setActive(item.id)} onClick={() => setActive(item.id)}
              className="relative -ml-2.5 rounded-full transition-transform first:ml-0 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
              style={{ zIndex: shown?.id === item.id ? 30 : sorted.length - i }}>
              <StockRing qty={item.quantity} threshold={threshold} />
            </button>
          );
        })}
        {extra > 0 && (
          <Link href={restockHref} aria-label={`+${extra}`}
            className="relative -ml-2.5 flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-paper-dim text-xs font-bold text-text hover:bg-paper-deep">
            +{extra}
          </Link>
        )}
      </div>

      {shown && (
        <div className="mt-2 flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-text">{shown.name}</p>
            <p className="truncate text-xs text-text-muted">
              <span className={shown.quantity <= 0 ? "font-semibold text-accent-dark" : "font-semibold text-warning"}>
                {shown.quantity <= 0 ? t("dash.empty_stock") : `${shown.quantity} ${t("dash.units_left")}`}
              </span>
              {" · "}<span className="hgv-figure">{fmtCurrency(shown.selling_price)}</span>
            </p>
          </div>
          <Link href={restockHref}
            className="flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-dark hover:bg-[#f9d6d8]">
            <Plus size={12} /> {t("reports.restock")}
          </Link>
        </div>
      )}
    </div>
  );
}

/** Count in the middle of a ring filled to quantity / low-stock level. */
function StockRing({ qty, threshold }: { qty: number; threshold: number }) {
  const R = 20, C = 2 * Math.PI * R;
  const done = Math.max(0, Math.min(1, qty / Math.max(1, threshold)));
  const empty = qty <= 0;
  return (
    <span className={`relative flex h-11 w-11 items-center justify-center rounded-full ${empty ? "bg-accent-soft" : "bg-white"}`}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="22" cy="22" r={R} fill="none" stroke={empty ? "var(--color-accent)" : "var(--color-border)"} strokeWidth="3" />
        {done > 0 && (
          <circle cx="22" cy="22" r={R} fill="none" stroke="var(--color-warning)" strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${C * done} ${C}`} />
        )}
      </svg>
      <span className={`hgv-figure relative text-sm font-bold ${empty ? "text-accent-dark" : "text-text"}`}>{qty}</span>
    </span>
  );
}
