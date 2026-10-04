"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import CircleStack from "@/app/components/ui/CircleStack";

export interface StockAlertItem {
  id: string; name: string; quantity: number; selling_price: number;
  cost_price?: number | null; supplier_id?: string | null;
}

/** Where restocking one item happens: car companies stock in on the Vehicles
 *  page; shops open a purchase pre-filled with the item. */
export function restockHref(item: StockAlertItem, isCar: boolean) {
  if (isCar) return `/items?open=${item.id}&do=stockin`;
  const qs = new URLSearchParams({ name: item.name, selling: String(item.selling_price ?? "") });
  if (item.cost_price != null) qs.set("cost", String(item.cost_price));
  if (item.supplier_id) qs.set("supplierId", item.supplier_id);
  return `/purchases?${qs}`;
}

/** Low and empty stock as overlapping circles: the count in the middle, the
 *  ring filled against the low-stock level (red when empty), emptiest first.
 *  Clicking one goes straight to restocking that item. */
export default function StockAlertCircles({ items, total, threshold, isCar, allHref, fmtMoney }: {
  items: StockAlertItem[]; total: number; threshold: number; isCar: boolean; allHref: string; fmtMoney: (n: number) => string;
}) {
  const { t } = useLanguage();
  const sorted = [...items].sort((a, b) => a.quantity - b.quantity);
  const byId = new Map(sorted.map((i) => [i.id, i]));
  const left = (q: number) => (q <= 0 ? t("dash.empty_stock") : `${q} ${t("dash.units_left")}`);

  return (
    <CircleStack
      items={sorted.map((item) => ({
        id: item.id, href: restockHref(item, isCar), label: `${item.name}: ${left(item.quantity)} · ${t("reports.restock")}`,
        done: item.quantity / Math.max(1, threshold), color: "var(--color-warning)",
        center: item.quantity, centerTone: item.quantity <= 0 ? "danger" as const : undefined,
      }))}
      extra={total - sorted.length}
      extraHref={allHref}
      caption={(id) => {
        const it = byId.get(id)!;
        return (
          <div className="flex items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-text">{it.name}</p>
              <p className="truncate text-xs text-text-muted">
                <span className={it.quantity <= 0 ? "font-semibold text-accent-dark" : "font-semibold text-warning"}>{left(it.quantity)}</span>
                {" · "}<span className="hgv-figure">{fmtMoney(it.selling_price)}</span>
              </p>
            </div>
            <Link href={restockHref(it, isCar)}
              className="flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-dark hover:bg-[#f9d6d8]">
              <Plus size={12} /> {isCar ? t("items.stock_in") : t("reports.restock")}
            </Link>
          </div>
        );
      }}
    />
  );
}
