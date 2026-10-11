"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Car, ChevronDown, ChevronRight, PackagePlus, Pencil, RefreshCw, ShoppingCart } from "lucide-react";
import { itemRequest } from "@/lib/product-api";
import { useLanguage } from "@/lib/language-context";
import {
  assignConflict, normalizeVehicleId, parseAttributes, productApiError, vehicleIdKey, vehicleStatus,
} from "@/lib/business-layout";
import { notify } from "@/lib/dialogs";

/** A vehicle as GET /products lists it. */
export interface ModelCar {
  id: string; name: string; description?: string; cost_price: number; selling_price: number;
  quantity: number; supplier_id?: string | null; attributes?: string | null; thumbnail?: string | null; created_at?: string;
}

interface Model {
  name: string; count: number; in_stock: number; pending: number; unassigned: number;
  min_price: number | null; max_price: number | null;
}

type IdField = "chassis_no" | "plate_no";

/**
 * Vehicles grouped by car name: each name once with how many cars it has;
 * opening one lists its cars, where a missing chassis or plate number is
 * typed straight in and saved for the whole group at once.
 */
export default function ModelGroups({ q, status, refreshKey, onStockIn, onEdit, onChanged }: {
  q: string;
  /** The page's car status filter (GET /products `status`). */
  status: string;
  /** Changes whenever the page reloads, so open groups reload too. */
  refreshKey: number;
  onStockIn: (name: string) => void;
  onEdit: (car: ModelCar) => void;
  onChanged: () => void;
}) {
  const { t } = useLanguage();
  const [models, setModels] = useState<Model[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    const qs = new URLSearchParams({ status });
    if (q.trim()) qs.set("q", q.trim());
    itemRequest(`/products/models?${qs}`)
      .then((res) => { if (live) { setModels(res?.data ?? []); setError(null); } })
      .catch((err) => {
        console.warn(err);
        if (!live) return;
        const e = productApiError(err);
        // 404/405: the server hasn't been updated with this view yet.
        setError(e && (e.status === 404 || e.status === 405) ? t("models.err_unavailable") : t("items.load_error"));
        setModels((m) => m ?? []);
      });
    return () => { live = false; };
  }, [q, status, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(name: string) {
    setOpen((s) => { const n = new Set(s); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  }

  if (models === null) {
    return <p className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-400"><RefreshCw size={13} className="animate-spin" /> {t("common.loading")}</p>;
  }
  if (error && models.length === 0) {
    return <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">{error}</p>;
  }
  if (models.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white py-16 text-center">
        <Car size={36} className="text-slate-300" />
        <p className="mt-3 font-medium text-slate-600">{t("items.no_items")}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
      {models.map((m) => {
        const isOpen = open.has(m.name);
        const price = m.min_price == null ? "" : m.min_price === m.max_price
          ? m.min_price.toLocaleString()
          : `${m.min_price.toLocaleString()} – ${(m.max_price ?? 0).toLocaleString()}`;
        return (
          <section key={m.name}>
            <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50/70">
              <button onClick={() => toggle(m.name)} aria-expanded={isOpen}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                {isOpen ? <ChevronDown size={15} className="shrink-0 text-slate-500" /> : <ChevronRight size={15} className="shrink-0 text-slate-500" />}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-slate-800">{m.name}</span>
                  <span className="flex flex-wrap gap-x-2 text-[11px] text-slate-500">
                    {price && <span className="tabular-nums">{price}</span>}
                    {m.pending > 0 && <span className="font-semibold text-amber-600">{t("models.pending").replace("{n}", String(m.pending))}</span>}
                    {m.unassigned > 0 && <span className="font-semibold text-red-600">{t("models.without_ids").replace("{n}", String(m.unassigned))}</span>}
                  </span>
                </span>
              </button>
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold tabular-nums text-slate-800">
                {t("models.cars").replace("{n}", String(m.count))}
              </span>
              <button onClick={() => onStockIn(m.name)} title={t("items.stock_in")}
                className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition">
                <PackagePlus size={14} />
              </button>
            </div>
            {isOpen && <ModelCars name={m.name} status={status} refreshKey={refreshKey} onEdit={onEdit} onChanged={onChanged} />}
          </section>
        );
      })}
    </div>
  );
}

function ModelCars({ name, status, refreshKey, onEdit, onChanged }: {
  name: string; status: string; refreshKey: number;
  onEdit: (car: ModelCar) => void; onChanged: () => void;
}) {
  const { t } = useLanguage();
  const [cars, setCars] = useState<ModelCar[] | null>(null);
  // Chassis/plate typed for cars that are missing them, by car id.
  const [drafts, setDrafts] = useState<Record<string, Record<IdField, string>>>({});
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<{ carId: string; field: string } | null>(null);

  useEffect(() => {
    let live = true;
    const qs = new URLSearchParams({ name, status, limit: "1000" });
    itemRequest(`/products?${qs}`)
      .then((res) => {
        if (!live) return;
        const items: ModelCar[] = res?.data?.items ?? [];
        // #1 is the first one stocked in.
        setCars([...items].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id)));
      })
      .catch((err) => { console.warn(err); if (live) setCars((c) => c ?? []); });
    return () => { live = false; };
  }, [name, status, refreshKey]);

  const value = (c: ModelCar, f: IdField) => drafts[c.id]?.[f] ?? parseAttributes(c.attributes)[f] ?? "";

  // The same number typed for two cars of this group.
  const repeated = useMemo(() => {
    const seen = new Map<string, number>();
    for (const c of cars ?? []) for (const f of ["chassis_no", "plate_no"] as const) {
      const k = vehicleIdKey(drafts[c.id]?.[f] ?? parseAttributes(c.attributes)[f] ?? "");
      if (k) seen.set(`${f}:${k}`, (seen.get(`${f}:${k}`) ?? 0) + 1);
    }
    return (f: IdField, v: string) => !!vehicleIdKey(v) && (seen.get(`${f}:${vehicleIdKey(v)}`) ?? 0) > 1;
  }, [cars, drafts]);

  const changed = (cars ?? []).filter((c) => {
    const a = parseAttributes(c.attributes);
    return (["chassis_no", "plate_no"] as const).some((f) => (drafts[c.id]?.[f] ?? "").trim() && drafts[c.id][f].trim() !== (a[f] ?? ""));
  });
  const anyRepeated = (cars ?? []).some((c) => repeated("chassis_no", value(c, "chassis_no")) || repeated("plate_no", value(c, "plate_no")));

  function set(id: string, f: IdField, v: string) {
    setDrafts((d) => ({ ...d, [id]: { chassis_no: d[id]?.chassis_no ?? "", plate_no: d[id]?.plate_no ?? "", [f]: v } }));
    if (conflict?.carId === id && conflict.field === f) setConflict(null);
  }

  async function save() {
    if (anyRepeated) { notify(t("assign.err_repeated")); return; }
    try {
      setSaving(true);
      const res = await itemRequest("/products/assign", {
        method: "POST",
        body: JSON.stringify({
          cars: changed.map((c) => ({
            id: c.id,
            chassis_no: normalizeVehicleId(drafts[c.id]?.chassis_no ?? "") || null,
            plate_no: normalizeVehicleId(drafts[c.id]?.plate_no ?? "") || null,
          })),
        }),
      });
      notify(t("assign.saved").replace("{n}", String(res?.data?.updated ?? changed.length)));
      setDrafts({});
      onChanged();
    } catch (err) {
      const c = assignConflict(err);
      if (c) {
        setConflict({ carId: c.carId, field: c.field });
        notify(`${t(c.field === "plate_no" ? "vehicle.err_dup_plate" : "vehicle.err_dup_chassis")} "${c.name}".`);
        document.getElementById(`model-${c.carId}-${c.field}`)?.focus();
        return;
      }
      console.warn(err);
      const e = productApiError(err);
      notify(e && (e.status === 404 || e.status === 405) ? t("stockin.err_unavailable") : e?.message || t("items.update_failed"));
    } finally { setSaving(false); }
  }

  if (cars === null) {
    return <p className="flex items-center gap-2 bg-slate-50/60 px-10 py-3 text-xs text-slate-400"><RefreshCw size={11} className="animate-spin" /> {t("common.loading")}</p>;
  }

  const STATUS = {
    available: { label: t("vehicle.status_available"), cls: "bg-green-50 text-green-700" },
    pending:   { label: t("vehicle.status_pending"),   cls: "bg-amber-50 text-amber-700" },
    sold:      { label: t("vehicle.status_sold"),      cls: "bg-slate-100 text-slate-600" },
  };
  const input = (bad: boolean) =>
    `w-full rounded-lg border ${bad ? "border-red-400 bg-red-50" : "border-slate-200 bg-white"} px-2 py-1 font-mono text-xs uppercase text-gray-800 placeholder:normal-case placeholder:font-sans placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2]`;

  return (
    <div className="bg-slate-50/60 px-3 pb-3 pt-1 sm:pl-9">
      <div className="hidden sm:grid grid-cols-[2.5rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_6rem_minmax(0,0.8fr)_4.5rem] gap-2 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        <span>#</span><span>{t("vehicle.chassis_no")}</span><span>{t("vehicle.plate_no")}</span><span>{t("vehicle.color")}</span>
        <span>{t("common.status")}</span><span className="text-right">{t("items.col_selling")}</span><span />
      </div>
      <div className="space-y-1">
        {cars.map((c, i) => {
          const a = parseAttributes(c.attributes);
          const st = STATUS[vehicleStatus(c.quantity, a)];
          const cell = (f: IdField) => a[f]
            ? <span className="truncate font-mono text-xs text-slate-800">{a[f]}</span>
            : <input id={`model-${c.id}-${f}`} aria-label={`${name} #${i + 1} ${t(`vehicle.${f}`)}`}
                className={input(repeated(f, value(c, f)) || (conflict?.carId === c.id && conflict.field === f))}
                placeholder={t(`vehicle.${f}`)} value={value(c, f)} onChange={(e) => set(c.id, f, e.target.value)} />;
          return (
            <div key={c.id} className="grid grid-cols-2 sm:grid-cols-[2.5rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_6rem_minmax(0,0.8fr)_4.5rem] items-center gap-2 rounded-lg border border-slate-100 bg-white px-2 py-1.5">
              <span className="text-xs font-bold tabular-nums text-slate-700">#{i + 1}</span>
              <span className="sm:hidden justify-self-end"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span></span>
              <span className="col-span-2 sm:col-span-1 min-w-0 flex">{cell("chassis_no")}</span>
              <span className="col-span-2 sm:col-span-1 min-w-0 flex">{cell("plate_no")}</span>
              <span className="truncate text-xs text-slate-600">{a.color || "-"}</span>
              <span className="hidden sm:block"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span></span>
              <span className="text-right text-xs font-semibold tabular-nums text-slate-800">{Number(c.selling_price || 0).toLocaleString()}</span>
              <span className="col-span-2 sm:col-span-1 flex justify-end gap-1">
                {c.quantity > 0 && (
                  <Link href={`/sales?new=1&product=${c.id}`} title={t("vehicle.sell")} className="rounded p-1 text-[#0a66c2] hover:bg-blue-50 transition">
                    <ShoppingCart size={12} />
                  </Link>
                )}
                <button onClick={() => onEdit(c)} title={t("common.edit")} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition">
                  <Pencil size={12} />
                </button>
              </span>
            </div>
          );
        })}
      </div>
      {(changed.length > 0 || anyRepeated) && (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          {anyRepeated && <span className="text-xs font-semibold text-red-600">{t("assign.err_repeated")}</span>}
          <button onClick={() => setDrafts({})} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
            {t("common.cancel")}
          </button>
          <button onClick={save} disabled={saving || anyRepeated || changed.length === 0}
            className="rounded-lg bg-[#0a66c2] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#004182] transition disabled:opacity-60">
            {saving ? t("common.saving") : t("assign.save").replace("{n}", String(changed.length))}
          </button>
        </div>
      )}
    </div>
  );
}
