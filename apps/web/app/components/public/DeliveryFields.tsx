"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { MapPin, Banknote, Smartphone } from "lucide-react";

const HigoMapPicker = dynamic(() => import("@/app/components/ui/HigoMapPicker"), { ssr: false });

export interface DeliveryValue {
  phone: string;
  address: string;
  lat: number | null;
  lng: number | null;
  notes: string;
  paymentMethod: "cash" | "mobile_money";
}

export function deliveryValid(v: DeliveryValue): boolean {
  return v.phone.trim().length >= 3 && v.address.trim().length >= 3;
}

interface Props {
  value: DeliveryValue;
  onChange: (value: DeliveryValue) => void;
}

/** Shared delivery/payment fields — used by the single-product quick-order
 *  modal and the cart checkout so both collect delivery info identically. */
export default function DeliveryFields({ value, onChange }: Props) {
  const [showMap, setShowMap] = useState(false);
  const set = <K extends keyof DeliveryValue>(k: K, v: DeliveryValue[K]) => onChange({ ...value, [k]: v });

  return (
    <>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Delivery phone</label>
        <input
          value={value.phone}
          onChange={(e) => set("phone", e.target.value)}
          placeholder="07XX XXX XXX"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Delivery address</label>
        <div className="flex gap-2">
          <input
            value={value.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="Street, sector, district…"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-400"
          />
          <button
            type="button"
            onClick={() => setShowMap(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <MapPin size={13} /> Pin
          </button>
        </div>
        {value.lat != null && value.lng != null && (
          <p className="mt-1 text-[11px] text-emerald-600">Pinned on map ✓</p>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Delivery notes (optional)</label>
        <textarea
          value={value.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={2}
          placeholder="Landmark, gate code, preferred time…"
          className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Payment</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => set("paymentMethod", "cash")}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
              value.paymentMethod === "cash" ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}
          >
            <Banknote size={14} /> Cash on delivery
          </button>
          <button
            type="button"
            onClick={() => set("paymentMethod", "mobile_money")}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
              value.paymentMethod === "mobile_money" ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}
          >
            <Smartphone size={14} /> Mobile money
          </button>
        </div>
      </div>

      {showMap && (
        <HigoMapPicker
          initialLat={value.lat}
          initialLng={value.lng}
          onConfirm={(pos, label) => {
            onChange({ ...value, lat: pos.lat, lng: pos.lng, address: label || value.address });
            setShowMap(false);
          }}
          onClose={() => setShowMap(false)}
        />
      )}
    </>
  );
}
