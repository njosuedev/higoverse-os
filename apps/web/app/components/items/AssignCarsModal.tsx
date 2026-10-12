"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Bone, SkeletonRegion, useSkeleton } from "@/app/components/ui/Skeleton";
import { itemRequest } from "@/lib/product-api";
import { useLanguage } from "@/lib/language-context";
import { assignConflict, carTypeLabel, normalizeVehicleId, parseAttributes, productApiError, vehicleIdKey as idKey } from "@/lib/business-layout";
import { notify } from "@/lib/dialogs";

interface Car { id: string; name: string; attributes?: string | null; created_at?: string; }
type Field = "chassis_no" | "plate_no" | "color";
type Draft = Record<Field, string>;

/**
 * Give each stocked-in car its chassis and plate number (and colour). Lists
 * every car still missing one — or just `ids` — grouped by model. A car can
 * be saved with only its chassis; it stays on the list until it has both.
 */
export default function AssignCarsModal({ ids, onClose, onSaved }: {
  ids?: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [cars, setCars] = useState<Car[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<{ carId: string; field: string } | null>(null);
  const skeleton = useSkeleton(cars === null);

  useEffect(() => {
    itemRequest("/products?status=unassigned&limit=1000")
      .then((res) => {
        const all: Car[] = res?.data?.items ?? [];
        const only = ids ? new Set(ids) : null;
        // Grouped by model, oldest first within each, as they were stocked in.
        const list = all.filter((c) => !only || only.has(c.id))
          .sort((a, b) => a.name.localeCompare(b.name) || String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id));
        setCars(list);
        setDrafts(Object.fromEntries(list.map((c) => {
          const a = parseAttributes(c.attributes);
          return [c.id, { chassis_no: a.chassis_no ?? "", plate_no: a.plate_no ?? "", color: a.color ?? "" }];
        })));
      })
      .catch((err) => { console.warn(err); setCars([]); notify(t("items.load_error")); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Chassis/plate typed twice in this list, shown before saving.
  const repeated = useMemo(() => {
    const seen = new Map<string, number>();
    for (const d of Object.values(drafts)) {
      for (const f of ["chassis_no", "plate_no"] as const) {
        const k = idKey(d[f]);
        if (k) seen.set(`${f}:${k}`, (seen.get(`${f}:${k}`) ?? 0) + 1);
      }
    }
    return (f: Field, v: string) => f !== "color" && !!idKey(v) && (seen.get(`${f}:${idKey(v)}`) ?? 0) > 1;
  }, [drafts]);

  function set(id: string, f: Field, v: string) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [f]: v } }));
    if (conflict?.carId === id && conflict.field === f) setConflict(null);
  }

  const changed = (cars ?? []).filter((c) => {
    const a = parseAttributes(c.attributes), d = drafts[c.id];
    return d && (["chassis_no", "plate_no", "color"] as const).some((f) => d[f].trim() && d[f].trim() !== (a[f] ?? ""));
  });
  const anyRepeated = (cars ?? []).some((c) => drafts[c.id] && (repeated("chassis_no", drafts[c.id].chassis_no) || repeated("plate_no", drafts[c.id].plate_no)));

  async function save() {
    if (anyRepeated) { notify(t("assign.err_repeated")); return; }
    try {
      setSaving(true);
      const res = await itemRequest("/products/assign", {
        method: "POST",
        body: JSON.stringify({
          cars: changed.map((c) => ({
            id: c.id,
            chassis_no: normalizeVehicleId(drafts[c.id].chassis_no) || null,
            plate_no: normalizeVehicleId(drafts[c.id].plate_no) || null,
            color: drafts[c.id].color.trim() || null,
          })),
        }),
      });
      notify(t("assign.saved").replace("{n}", String(res?.data?.updated ?? changed.length)));
      onSaved();
    } catch (err) {
      const c = assignConflict(err);
      if (c) {
        setConflict({ carId: c.carId, field: c.field });
        notify(`${t(c.field === "plate_no" ? "vehicle.err_dup_plate" : "vehicle.err_dup_chassis")} "${c.name}".`);
        document.getElementById(`assign-${c.carId}-${c.field}`)?.focus();
        return;
      }
      console.warn(err);
      const e = productApiError(err);
      notify(e && (e.status === 404 || e.status === 405) ? t("stockin.err_unavailable") : e?.message || t("items.update_failed"));
    } finally { setSaving(false); }
  }

  const inputCls = (bad: boolean, mono: boolean) =>
    `border ${bad ? "border-red-400 bg-red-50" : "border-slate-200"} text-gray-800 placeholder:text-gray-400 rounded-lg px-2.5 py-1.5 w-full text-sm focus:outline-none focus:ring-2 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2] transition ${mono ? "font-mono uppercase" : ""}`;

  // Row numbers restart for each model: "BYD Yuan Up #1…#10".
  const rowNo = useMemo(() => {
    const no: Record<string, number> = {};
    (cars ?? []).forEach((c, i, all) => { no[c.id] = i > 0 && all[i - 1].name === c.name ? no[all[i - 1].id] + 1 : 1; });
    return no;
  }, [cars]);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl max-h-[92dvh] flex flex-col">
        <div className="flex justify-between items-center px-4 sm:px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-800">{t("assign.title")}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{t("assign.subtitle")}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={17} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-3">
          {skeleton ? (
            <SkeletonRegion className="space-y-2 pt-1">
              <Bone className="h-3 w-28 mt-2" />
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-2 items-center">
                  <Bone className="col-span-2 sm:col-span-1 h-3 w-24" />
                  <Bone className="h-8" />
                  <Bone className="h-8" />
                  <Bone className="col-span-2 sm:col-span-1 h-8" />
                </div>
              ))}
            </SkeletonRegion>
          ) : cars === null ? (
            <div className="min-h-[200px]" aria-busy="true" />
          ) : cars.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">{t("assign.none")}</p>
          ) : (
            <div className="hgv-fade-in space-y-1.5">
              {/* Column labels (wide screens) */}
              <div className="hidden sm:grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <span>{t("items.col_product")}</span><span>{t("vehicle.chassis_no")}</span><span>{t("vehicle.plate_no")}</span><span>{t("vehicle.color")}</span>
              </div>
              {cars.map((c) => {
                const d = drafts[c.id];
                const a = parseAttributes(c.attributes);
                const n = rowNo[c.id];
                const first = n === 1;
                const bad = (f: Field) => repeated(f, d[f]) || (conflict?.carId === c.id && conflict.field === f);
                return (
                  <div key={c.id}>
                    {first && <p className="pt-2 pb-1 text-xs font-bold text-slate-700">{c.name}</p>}
                    <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-2 items-center rounded-lg border border-slate-100 px-2 py-1.5 sm:border-0 sm:px-1 sm:py-0">
                      <p className="col-span-2 sm:col-span-1 text-xs text-slate-600 truncate">
                        <span className="font-semibold text-slate-800 tabular-nums">#{n}</span>
                        {[a.year, a.car_type && carTypeLabel(t, a.car_type)].filter(Boolean).map((x) => ` · ${x}`).join("")}
                      </p>
                      <input id={`assign-${c.id}-chassis_no`} aria-label={`${c.name} #${n} ${t("vehicle.chassis_no")}`}
                        className={inputCls(bad("chassis_no"), true)} placeholder={t("vehicle.chassis_no")}
                        value={d.chassis_no} onChange={(e) => set(c.id, "chassis_no", e.target.value)} />
                      <input id={`assign-${c.id}-plate_no`} aria-label={`${c.name} #${n} ${t("vehicle.plate_no")}`}
                        className={inputCls(bad("plate_no"), true)} placeholder={t("vehicle.plate_no")}
                        value={d.plate_no} onChange={(e) => set(c.id, "plate_no", e.target.value)} />
                      <input aria-label={`${c.name} #${n} ${t("vehicle.color")}`}
                        className={`${inputCls(false, false)} col-span-2 sm:col-span-1`} placeholder={t("vehicle.color")}
                        value={d.color} onChange={(e) => set(c.id, "color", e.target.value)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 sm:px-6 py-4 border-t border-slate-100 shrink-0">
          <p className="text-xs text-slate-500 max-w-md">{anyRepeated ? <span className="font-semibold text-red-600">{t("assign.err_repeated")}</span> : t("assign.hint")}</p>
          <div className="flex gap-2.5">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">{t("common.cancel")}</button>
            <button onClick={save} disabled={saving || changed.length === 0 || anyRepeated}
              className="px-5 py-2 rounded-lg bg-[#0a66c2] text-white text-sm font-semibold hover:bg-[#004182] transition disabled:opacity-60">
              {saving ? t("common.saving") : t("assign.save").replace("{n}", String(changed.length))}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
