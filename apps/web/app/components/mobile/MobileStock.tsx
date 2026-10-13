"use client";

// Stock (or Vehicles) on a phone: the Android app's tab (apps/mobile/lib/
// src/screens/products_screen.dart). Car dealers choose cars grouped by
// name or every car, and filter by status; every row shows the photo, the
// status and fines, year · colour · plate (or what's in stock) and the
// price. A car opens its quick view; a product opens on the website's page.
// "+ New" opens the website's form.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Car, CloudOff, List, Package, Rows3, Share2 } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { useShopSettings } from "@/lib/shop-settings-context";
import { itemRequest } from "@/lib/product-api";
import ModelGroups from "@/app/components/items/ModelGroups";
import CarQuickView from "@/app/components/items/CarQuickView";
import CatalogueShareModal from "@/app/components/items/CatalogueShareModal";
import { full } from "./PhoneOr";
import {
  Chip, EmptyState, Fab, ListSkeleton, Photo, attributesOf, groupDigits, money, num, tf, useEndOfList,
} from "./kit";

type Row = Record<string, unknown>;
const PAGE = 20;
const STATUSES = [
  ["all", "stock.f_all"], ["available", "stock.f_available"], ["pending", "stock.f_pending"],
  ["sold", "stock.f_sold"], ["penalties", "stock.f_fines"], ["unassigned", "stock.f_no_ids"],
] as const;

export default function MobileStock() {
  const { t, layout } = useLanguage();
  const isCar = layout === "car";
  const { currency, lowStock } = useShopSettings();
  const router = useRouter();
  const params = useSearchParams();
  // Home's tiles open the list already filtered: /items?status=pending
  const [status, setStatus] = useState<string>(() => (params.get("status") && STATUSES.some(([s]) => s === params.get("status")) ? params.get("status")! : "all"));
  const [byName, setByName] = useState(() => !params.get("status"));
  const lowOnly = !isCar && params.get("stock") === "low";
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [car, setCar] = useState<Row | null>(null);
  const [sharing, setSharing] = useState(false);
  const gen = useRef(0);

  const loadPage = useCallback(async (p: number, g: number) => {
    setLoading(true); setError(false);
    const q = new URLSearchParams({ page: String(p), limit: String(PAGE) });
    if (isCar && status !== "all") q.set("status", status);
    if (lowOnly) q.set("threshold", String(lowStock));
    try {
      const res = await itemRequest(lowOnly ? `/products/stock-alerts?threshold=${lowStock}` : `/products?${q}`);
      if (g !== gen.current) return;
      const data = res?.data;
      const rows = Array.isArray(data) ? (data as Row[]) : Array.isArray(data?.items) ? (data.items as Row[]) : [];
      setItems((prev) => (p === 1 ? rows : [...prev, ...rows.filter((x) => !prev.some((y) => y.id === x.id))]));
      setTotal(Array.isArray(data) ? rows.length : num(data?.total));
      setPage(p);
    } catch {
      if (g === gen.current) setError(true);
    } finally {
      if (g === gen.current) setLoading(false);
    }
  }, [isCar, status, lowOnly, lowStock]);

  const reload = useCallback(() => {
    const g = ++gen.current;
    setItems([]); setTotal(0); setPage(0);
    setRefreshKey((k) => k + 1);
    void loadPage(1, g);
  }, [loadPage]);

  useEffect(() => {
    if (isCar && byName) return;
    const first = setTimeout(reload, 0);
    return () => clearTimeout(first);
  }, [isCar, byName, reload]);

  const more = () => { if (!loading && !error && !lowOnly && page > 0 && items.length < total) void loadPage(page + 1, gen.current); };
  const end = useEndOfList(more);

  function openRow(it: Row) {
    if (isCar) setCar(it);
    else router.push(full("/items", { open: String(it.id), do: "edit" }));
  }

  return (
    <main className="pb-24">
      {isCar && (
        <div className="border-b border-border bg-paper px-2.5 pb-2 pt-2">
          <div role="radiogroup" className="flex overflow-hidden rounded-full border border-border-strong">
            {([[true, Rows3, "models.view_by_name"], [false, List, "models.view_all"]] as const).map(([v, Icon, key], i) => (
              <button key={String(v)} type="button" role="radio" aria-checked={byName === v} onClick={() => setByName(v)}
                className={`flex h-9 flex-1 items-center justify-center gap-1.5 text-[14px] font-semibold ${i > 0 ? "border-l border-border-strong" : ""} ${byName === v ? "bg-ink-soft text-ink" : "text-text"}`}>
                <Icon size={17} /> <span className="truncate">{t(key)}</span>
              </button>
            ))}
          </div>
          <div className="hgv-stories -mx-2.5 mt-2 flex gap-1.5 overflow-x-auto px-2.5">
            {STATUSES.map(([s, key]) => <Chip key={s} selected={status === s} onClick={() => setStatus(s)}>{t(key)}</Chip>)}
          </div>
          <button type="button" onClick={() => setSharing(true)}
            className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-[#25d366] text-[14px] font-semibold text-[#06260f]">
            <Share2 size={16} /> {t("catalogue.title")}
          </button>
        </div>
      )}

      {isCar && byName ? (
        <div className="px-2 pt-2">
          <ModelGroups q="" status={status === "all" ? "in_stock" : status} refreshKey={refreshKey}
            onStockIn={(name) => router.push(full("/items", { stockin: name }))}
            onEdit={(c) => router.push(full("/items", { open: String((c as { id: string }).id), do: "edit" }))}
            onChanged={() => setRefreshKey((k) => k + 1)} />
        </div>
      ) : error && items.length === 0 ? (
        <EmptyState icon={<CloudOff size={40} />} message={t("dash.offline")} onRetry={reload} retry={t("app.retry")} />
      ) : loading && items.length === 0 ? (
        <ListSkeleton count={9} thumb />
      ) : items.length === 0 ? (
        <EmptyState icon={isCar ? <Car size={40} /> : <Package size={40} />} message={t("stock.empty")} />
      ) : (
        <div className="pt-1.5">
          {lowOnly && (
            <div className="flex items-center justify-between px-4 pb-1 pt-1.5">
              <p className="text-[13px] font-extrabold text-text-muted">{t("dash.need_restock")}</p>
              <Link href="/items" className="text-[13px] font-semibold text-ink">{t("stock.f_all")}</Link>
            </div>
          )}
          {items.map((it, i) => <ProductRow key={String(it.id)} item={it} first={i === 0} isCar={isCar} currency={currency} lowStock={lowStock} t={t} onOpen={() => openRow(it)} />)}
          <div ref={end} />
          {loading && <div className="flex justify-center py-5"><span className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>}
        </div>
      )}

      <Fab href={full("/items", { add: 1 })} label={isCar ? t("vehicle.new") : t("form.new_product")} />
      {sharing && <CatalogueShareModal onClose={() => setSharing(false)} />}
      {car && <CarQuickView productId={String(car.id)} cover={car.thumbnail as string | null} onClose={() => setCar(null)} />}
    </main>
  );
}

function ProductRow({ item, first, isCar, currency, lowStock, t, onOpen }: {
  item: Row; first: boolean; isCar: boolean; currency: string; lowStock: number; t: (k: string) => string; onOpen: () => void;
}) {
  const qty = num(item.quantity);
  const a = attributesOf(item.attributes);
  const status = qty <= 0 ? { label: t("stock.f_sold"), color: "var(--color-text-faint)" }
    : a.sale_status === "pending" ? { label: t("stock.f_pending"), color: "var(--color-warning)" }
    : { label: t("stock.f_available"), color: "var(--color-success)" };
  const fines = parseInt(a.penalty_count || "0", 10) || 0;
  const sub = isCar
    ? [a.year, a.color, a.plate_no].filter(Boolean).join(" · ")
    : qty <= 0 ? t("dash.out_of_stock") : tf(t, "stock.in_stock_n", { n: groupDigits(qty) });
  return (
    <button type="button" onClick={onOpen}
      className={`flex w-full items-center gap-4 px-4 py-3 text-left active:bg-paper-dim ${first ? "" : "border-t border-border"}`}>
      <Photo src={item.thumbnail as string | null} width={52} height={40} radius={8} fallback={isCar ? <Car size={20} /> : <Package size={20} />} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-text">{String(item.name ?? "")}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {isCar && <StatusChip label={status.label} color={status.color} />}
          {isCar && fines > 0 && <StatusChip label={fines === 1 ? t("stock.fine_one") : tf(t, "stock.fines_n", { n: fines })} color="var(--color-accent)" />}
          {sub && <span className={`text-[14px] ${!isCar && qty <= lowStock ? "text-warning" : "text-text-muted"}`}>{sub}</span>}
        </span>
      </span>
      <span className="shrink-0 font-bold text-text">{money(num(item.selling_price), currency)}</span>
    </button>
  );
}

function StatusChip({ label, color }: { label: string; color: string }) {
  return (
    <span className="rounded-md px-1.5 py-px text-[12px] font-bold"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}>{label}</span>
  );
}
