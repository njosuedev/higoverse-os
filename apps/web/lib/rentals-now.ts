"use client";

import { useEffect, useState } from "react";
import { saleRequest } from "@/lib/sale-api";
import { useLanguage } from "@/lib/language-context";

/** An active rental that isn't over yet (sale-service GET /rentals/busy). */
export interface ActiveRental {
  id: string;
  rental_no: string;
  product_id: string;
  customer: string;
  customer_phone: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
}

/** Cars by id: rented today (`now`), or booked for a rental that starts
 *  later (`next`, the soonest). A car is Rented only between its rental's
 *  start and end dates; from the day after the end it is Available again. */
export interface RentalsByCar {
  now: Record<string, ActiveRental>;
  next: Record<string, ActiveRental>;
}

export const EMPTY_RENTALS: RentalsByCar = { now: {}, next: {} };
const EMPTY = EMPTY_RENTALS;
const TTL = 15_000;
let cache: { at: number; day: string; promise: Promise<RentalsByCar> } | null = null;

/** Local date (YYYY-MM-DD): the rental dates are the business's own days. */
export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function byCar(rows: ActiveRental[], today: string): RentalsByCar {
  const out: RentalsByCar = { now: {}, next: {} };
  for (const r of rows) {
    if (!r.product_id || r.end_date < today) continue;
    if (r.start_date <= today) out.now[r.product_id] = r;
    else if (!out.next[r.product_id] || r.start_date < out.next[r.product_id].start_date) out.next[r.product_id] = r;
  }
  return out;
}

/** The business's running and upcoming rentals by car. Shared by every
 *  screen on the page; `fresh` skips the short cache (after a change). */
export function loadRentals(fresh = false): Promise<RentalsByCar> {
  const day = localDay();
  if (!fresh && cache && cache.day === day && Date.now() - cache.at < TTL) return cache.promise;
  const promise = saleRequest("/rentals/busy")
    .then((res) => byCar(Array.isArray(res?.data) ? (res.data as ActiveRental[]) : [], day))
    .catch(() => EMPTY);
  cache = { at: Date.now(), day, promise };
  return promise;
}

/** Car companies only; everyone else gets no rentals. Reloads when
 *  `refreshKey` changes (e.g. the page's last refresh time). */
export function useRentals(refreshKey: unknown = 0): RentalsByCar {
  const { layout } = useLanguage();
  const [rentals, setRentals] = useState<RentalsByCar>(EMPTY);
  useEffect(() => {
    if (layout !== "car") return;
    let live = true;
    loadRentals().then((r) => { if (live) setRentals(r); });
    return () => { live = false; };
  }, [layout, refreshKey]);
  return rentals;
}
