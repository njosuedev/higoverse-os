"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2, X } from "lucide-react";
import { itemRequest } from "@/lib/product-api";
import { useLanguage } from "@/lib/language-context";
import { useShopSettings } from "@/lib/shop-settings-context";
import { CAR_TYPES, carTypeLabel, productApiError } from "@/lib/business-layout";
import { notify } from "@/lib/dialogs";

/** Most cars one stock in may add (product-service MAX_STOCK_CARS). */
const MAX_CARS = 200;

interface Line { name: string; count: string; price: string; car_type: string; year: string; battery_range: string; color: string; }
const EMPTY_LINE: Line = { name: "", count: "", price: "", car_type: "", year: "", battery_range: "", color: "" };

/**
 * Stock in by count: "10 BYD Yuan Up, 20 Neta U Pro". Each car becomes its own
 * vehicle sharing its line's price and specs; chassis and plate are assigned
 * car by car afterwards (`onDone` gets the new cars' ids).
 */
export default function StockInModal({ initialName, onClose, onDone }: {
  initialName?: string;
  onClose: () => void;
  onDone: (ids: string[]) => void;
}) {
  const { t } = useLanguage();
  const { carNames, carTypes: customCarTypes } = useShopSettings();
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY_LINE, name: initialName ?? "" }]);
  const [saving, setSaving] = useState(false);

  const total = lines.reduce((s, l) => s + (Number.isInteger(Number(l.count)) && Number(l.count) > 0 ? Number(l.count) : 0), 0);
  const typeOptions = [...CAR_TYPES, ...customCarTypes];

  function set(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  async function submit() {
    const bad = lines.some((l) =>
      !l.name || !(Number.isInteger(Number(l.count)) && Number(l.count) > 0) || !(Number(l.price) > 0)
      || !l.car_type || !l.year || !l.battery_range);
    if (bad) { notify(t("stockin.err_required")); return; }
    if (total > MAX_CARS) { notify(t("stockin.err_too_many").replace("{n}", String(MAX_CARS))); return; }
    try {
      setSaving(true);
      const res = await itemRequest("/products/stock", {
        method: "POST",
        body: JSON.stringify({
          lines: lines.map((l) => ({
            name: l.name, count: Number(l.count), selling_price: Number(l.price),
            car_type: l.car_type, year: Number(l.year), battery_range: Number(l.battery_range),
            color: l.color.trim() || null,
          })),
        }),
      });
      onDone(res?.data?.ids ?? []);
    } catch (err) {
      console.warn(err);
      const e = productApiError(err);
      // 404/405: the server hasn't been updated with stock in yet.
      notify(e && (e.status === 404 || e.status === 405) ? t("stockin.err_unavailable") : e?.message || t("items.add_failed"));
    } finally { setSaving(false); }
  }

  const inputCls =
    "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2] transition";
  const label = (key: string, required = true) => (
    <label className="block text-xs font-medium text-gray-600 mb-1">
      {t(key)} {required ? <span className="text-red-400">*</span> : <span className="text-gray-400 font-normal">({t("common.optional")})</span>}
    </label>
  );

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex justify-between items-center px-4 sm:px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-800">{t("stockin.title")}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{t("stockin.subtitle")}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={17} /></button>
        </div>

        <div className="px-4 sm:px-6 py-4 space-y-3 overflow-y-auto flex-1">
          {lines.map((l, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="col-span-2">
                  {label("items.name")}
                  <select className={inputCls} value={l.name} onChange={(e) => set(i, { name: e.target.value })}>
                    <option value="">{t(carNames.length ? "cars.pick_name" : "cars.no_names")}</option>
                    {[...carNames, ...(l.name && !carNames.some((n) => n.toLowerCase() === l.name.toLowerCase()) ? [l.name] : [])].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div>
                  {label("stockin.count")}
                  <input type="number" min="1" step="1" className={`${inputCls} tabular-nums`} placeholder="10"
                    value={l.count} onChange={(e) => set(i, { count: e.target.value })} />
                </div>
                <div>
                  {label("items.selling_price")}
                  <input type="number" min="0" className={`${inputCls} tabular-nums`} placeholder="0"
                    value={l.price} onChange={(e) => set(i, { price: e.target.value })} />
                </div>
                <div>
                  {label("vehicle.car_type")}
                  <select className={inputCls} value={l.car_type} onChange={(e) => set(i, { car_type: e.target.value })}>
                    <option value="">-</option>
                    {typeOptions.map((o) => <option key={o} value={o}>{carTypeLabel(t, o)}</option>)}
                  </select>
                </div>
                <div>
                  {label("vehicle.year")}
                  <input type="number" min="1950" className={`${inputCls} tabular-nums`} placeholder="2025"
                    value={l.year} onChange={(e) => set(i, { year: e.target.value })} />
                </div>
                <div>
                  {label("vehicle.battery_range")}
                  <input type="number" min="0" className={`${inputCls} tabular-nums`} placeholder="400"
                    value={l.battery_range} onChange={(e) => set(i, { battery_range: e.target.value })} />
                </div>
                <div>
                  {label("vehicle.color", false)}
                  <input className={inputCls} placeholder="White"
                    value={l.color} onChange={(e) => set(i, { color: e.target.value })} />
                </div>
              </div>
              {lines.length > 1 && (
                <div className="mt-2 flex justify-end">
                  <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                    className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600 transition">
                    <Trash2 size={12} /> {t("stockin.remove_line")}
                  </button>
                </div>
              )}
            </div>
          ))}

          <button onClick={() => setLines((ls) => [...ls, { ...EMPTY_LINE }])}
            className="flex items-center gap-1.5 text-sm font-semibold text-[#0a66c2] hover:underline">
            <Plus size={14} /> {t("stockin.add_line")}
          </button>

          <p className="text-[11px] text-slate-400">
            {t("cars.names_hint")}{" "}
            <Link href="/settings#car-names" className="font-semibold text-[#0a66c2] hover:underline">{t("nav.settings")}</Link>
            {" · "}{t("stockin.ids_later")}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2.5 px-4 sm:px-6 py-4 border-t border-slate-100 shrink-0">
          <p className={`text-sm tabular-nums ${total > MAX_CARS ? "text-red-600 font-semibold" : "text-slate-600"}`}>
            {t("stockin.total")}: <span className="font-bold text-slate-900">{total}</span>
          </p>
          <div className="flex gap-2.5">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">{t("common.cancel")}</button>
            <button onClick={submit} disabled={saving || total === 0}
              className="px-5 py-2 rounded-lg bg-[#0a66c2] text-white text-sm font-semibold hover:bg-[#004182] transition disabled:opacity-60">
              {saving ? t("common.saving") : t("stockin.submit").replace("{n}", String(total))}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
