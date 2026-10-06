"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Car, ChevronLeft, ChevronRight, ExternalLink, Loader2, X } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { itemRequest } from "@/lib/product-api";
import { parseImages } from "@/lib/image";
import { carTypeLabel, depositSummary, parseAttributes, vehicleStatus } from "@/lib/business-layout";

interface Product {
  id: string; name: string; quantity: number; selling_price: number;
  images?: string | null; thumbnail?: string | null; attributes?: string | null;
}

const money = (n: number) => Math.round(n || 0).toLocaleString();

/**
 * One car at a glance: every photo (large, with thumbnails, ← / → and a
 * "3 / 7" counter) beside all its details — specs, status, buyer, deposits,
 * fines — and a link to open it in Vehicles. Fetches the car on open.
 */
export default function CarQuickView({ productId, cover, onClose }: {
  productId: string;
  /** Shown while the full photos load. */
  cover?: string | null;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [car, setCar] = useState<Product | null>(null);
  const [failed, setFailed] = useState(false);
  const [i, setI] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    let cancelled = false;
    itemRequest(`/products/${productId}`)
      .then((res) => { if (!cancelled) setCar(res?.data ?? null); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [productId]);

  const images = useMemo(() => {
    const list = car ? parseImages(car.images) : [];
    return car && !list.length && car.thumbnail ? [car.thumbnail] : list;
  }, [car]);
  const n = images.length;

  // Keyboard: Esc closes, arrows move; focus moves in and returns on close.
  useEffect(() => {
    opener.current = document.activeElement;
    dialog.current?.focus();
    return () => { (opener.current as HTMLElement | null)?.focus?.(); };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (n > 1 && e.key === "ArrowRight") setI((x) => (x + 1) % n);
      if (n > 1 && e.key === "ArrowLeft") setI((x) => (x - 1 + n) % n);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, onClose]);
  // Preload the neighbours so the next photo appears at once.
  useEffect(() => {
    if (n < 2) return;
    for (const j of [(i + 1) % n, (i - 1 + n) % n]) { const img = new Image(); img.src = images[j]; }
  }, [i, n, images]);

  const a = parseAttributes(car?.attributes);
  const status = car ? vehicleStatus(car.quantity, a) : null;
  const fines = Number(a.penalty_count || 0);
  const pay = car ? depositSummary(a, car.selling_price) : null;
  const statusStyle = status === "sold" ? "bg-slate-800 text-white" : status === "pending" ? "bg-amber-500 text-white" : "bg-emerald-600 text-white";
  const spec = (label: string, value?: string | number | null, mono = false) => (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`text-sm font-medium text-slate-800 truncate ${mono ? "font-mono tracking-wide" : ""}`}>{String(value ?? "").trim() || "—"}</dd>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-black/75 flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={car?.name ?? t("common.loading")}
        className="w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl outline-none grid md:grid-cols-[1.35fr_1fr]"
        onClick={(e) => e.stopPropagation()}>

        {/* Photos */}
        <div className="bg-slate-950 md:rounded-l-2xl flex flex-col">
          <div className="relative aspect-[4/3] flex items-center justify-center">
            {n > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={images[i]} alt={`${car?.name ?? ""} ${i + 1}`} className="max-w-full max-h-full object-contain" />
            ) : cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" className="max-w-full max-h-full object-contain opacity-80" />
            ) : car || failed ? (
              <span className="flex flex-col items-center gap-2 text-white/60 text-sm"><Car size={30} />{t("vehicle.no_images")}</span>
            ) : null}
            {!car && !failed && <Loader2 size={26} className="absolute animate-spin text-white/80" />}
            {n > 1 && (<>
              <button onClick={() => setI((i - 1 + n) % n)} aria-label={t("admin.prev")}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow"><ChevronLeft size={20} /></button>
              <button onClick={() => setI((i + 1) % n)} aria-label={t("admin.next")}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow"><ChevronRight size={20} /></button>
              <span aria-live="polite" className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-semibold text-white tabular-nums">{i + 1} / {n}</span>
            </>)}
          </div>
          {n > 1 && (
            <div className="flex gap-2 p-2 overflow-x-auto">
              {images.map((src, j) => (
                <button key={j} onClick={() => setI(j)} aria-label={`${j + 1} / ${n}`} aria-current={j === i}
                  className={`w-16 h-12 shrink-0 rounded-md overflow-hidden border-2 transition ${j === i ? "border-white" : "border-transparent opacity-55 hover:opacity-100"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-slate-900 leading-tight">{car?.name ?? <span className="inline-block h-5 w-40 rounded bg-slate-100" />}</h2>
              {car && <p className="text-2xl font-extrabold text-slate-900 tabular-nums mt-1">{money(car.selling_price)} <span className="text-sm font-semibold text-slate-400">RWF</span></p>}
            </div>
            <button onClick={onClose} aria-label={t("common.close")} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X size={18} /></button>
          </div>

          {status && (
            <div className="flex flex-wrap gap-1.5">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statusStyle}`}>{t(`vehicle.status_${status}`)}</span>
              {fines > 0 && <span className="rounded-full px-2.5 py-0.5 text-xs font-bold bg-red-600 text-white">{fines} {fines === 1 ? t("vehicle.fine") : t("vehicle.fines")}</span>}
            </div>
          )}

          {car && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-slate-200 p-3">
              {spec(t("vehicle.chassis_no"), a.chassis_no, true)}
              {spec(t("vehicle.plate_no"), a.plate_no, true)}
              {spec(t("vehicle.car_type"), a.car_type ? carTypeLabel(t, a.car_type) : "")}
              {spec(t("vehicle.year"), a.year)}
              {spec(t("vehicle.color"), a.color)}
              {spec(t("vehicle.battery_range"), a.battery_range ? `${a.battery_range} km` : "")}
              {spec(t("vehicle.mileage"), a.mileage ? `${Number(a.mileage).toLocaleString()} km` : "")}
              {spec(t("vehicle.condition"), a.condition ? t(`proforma.condition_${a.condition}`) : "")}
            </dl>
          )}

          {status === "pending" && pay && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-800">{t("vehicle.section_buyer")}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                {spec(t("vehicle.buyer_name"), a.buyer_name)}
                {spec(t("vehicle.buyer_phone"), a.buyer_phone)}
                {spec(t("vehicle.agreed_price"), money(pay.price))}
                {spec(t("vehicle.balance"), money(pay.balance))}
              </dl>
              <div className="h-1.5 rounded-full bg-amber-100 overflow-hidden" title={`${money(pay.paid)} ${t("vehicle.paid_of")} ${money(pay.price)}`}>
                <div className="h-full bg-amber-500" style={{ width: `${pay.price ? Math.min(100, (pay.paid / pay.price) * 100) : 0}%` }} />
              </div>
              <p className="text-xs text-amber-800">{money(pay.paid)} {t("vehicle.paid_of")} {money(pay.price)}</p>
            </div>
          )}

          {fines > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm text-red-800">
              <b>{fines} {fines === 1 ? t("vehicle.fine") : t("vehicle.fines")}</b>
              {a.penalty_amount ? ` · ${money(Number(a.penalty_amount))} RWF` : ""}
              {a.penalty_checked ? <span className="block text-xs text-red-700/80 mt-0.5">{a.penalty_checked}</span> : null}
            </div>
          )}

          {failed && <p className="text-sm text-red-600">{t("common.error")}</p>}

          <Link href={`/items?open=${productId}`} onClick={onClose}
            className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#0a66c2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#004182] transition">
            <ExternalLink size={15} /> {t("vehicle.open_in_vehicles")}
          </Link>
        </div>
      </div>
    </div>
  );
}
