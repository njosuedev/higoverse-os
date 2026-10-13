"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck, BatteryCharging, Calendar, Car, CarFront, ChevronLeft, ChevronRight, Gauge, Images,
  MessageCircle, Phone, Search, Sparkles, X,
} from "lucide-react";
import { PRODUCT_API } from "@/lib/api-config";

/** One car name as the page shows it, already in the customer's language. */
export interface ModelView {
  name: string;
  count: number;
  minPrice: number | null;
  maxPrice: number | null;
  cover: string | null;
  photos: number;
  newArrival: boolean;
  body: string | null;       // raw car type, for the filter
  bodyLabel: string | null;
  condition: "new" | "used" | null;
  conditionLabel: string | null;
  year: string | null;
  range: string | null;      // "401 km"
  mileage: string | null;    // "38,000 km"
  colors: { name: string; count: number; hex: string | null }[];
  lastAdded: string | null;
  ask: string | null;        // wa.me link asking about this car
  testDrive: string | null;  // wa.me link booking a test drive
}

export type Labels = Record<
  | "all" | "new" | "used" | "sort" | "sort_recommended" | "sort_price_low" | "sort_price_high" | "sort_newest"
  | "search" | "no_results" | "from" | "price_on_request" | "badge_new" | "badge_last" | "ask" | "test_drive"
  | "details" | "close" | "photos" | "spec_year" | "spec_body" | "spec_range" | "spec_mileage" | "spec_condition"
  | "spec_colours" | "spec_available" | "spec_price" | "call" | "one_available" | "n_available" | "n_photos",
  string
>;

const money = (n: number) => Math.round(n).toLocaleString("en-US");
const nAvail = (L: Labels, n: number) => (n === 1 ? L.one_available : L.n_available.replace("{n}", String(n)));

function Price({ m, currency, L, big = false }: { m: ModelView; currency: string; L: Labels; big?: boolean }) {
  if (m.minPrice == null) return <p className={`font-bold ${big ? "text-lg" : "text-sm"}`}>{L.price_on_request}</p>;
  const from = m.maxPrice != null && m.maxPrice > m.minPrice;
  return (
    <div className="text-right">
      {from && <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">{L.from}</p>}
      <p className={`font-extrabold leading-none tabular-nums ${big ? "text-3xl" : "text-xl"}`}>{money(m.minPrice)}</p>
      <p className="text-xs font-bold text-[#ff6800]">{currency}</p>
    </div>
  );
}

function Swatches({ colors, max = 6 }: { colors: ModelView["colors"]; max?: number }) {
  if (!colors.length) return null;
  return (
    <div className="flex items-center gap-1.5">
      {colors.slice(0, max).map((c) => (
        <span key={c.name} title={`${c.name} (${c.count})`}
          className="h-4 w-4 rounded-full border border-black/15 shadow-inner"
          style={{ background: c.hex ?? "repeating-linear-gradient(45deg,#e5e7eb 0 3px,#fff 3px 6px)" }} />
      ))}
      {colors.length > max && <span className="text-xs text-[#6b7280]">+{colors.length - max}</span>}
    </div>
  );
}

function Specs({ m, L, dense = false }: { m: ModelView; L: Labels; dense?: boolean }) {
  const items = [
    m.year && { icon: Calendar, label: L.spec_year, value: m.year },
    m.bodyLabel && { icon: CarFront, label: L.spec_body, value: m.bodyLabel },
    m.range && { icon: BatteryCharging, label: L.spec_range, value: m.range },
    m.mileage && { icon: Gauge, label: L.spec_mileage, value: m.mileage },
    m.conditionLabel && { icon: BadgeCheck, label: L.spec_condition, value: m.conditionLabel },
  ].filter(Boolean) as { icon: typeof Calendar; label: string; value: string }[];
  if (!items.length) return null;
  return (
    <ul className={`grid gap-1.5 ${dense ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
      {items.map(({ icon: Icon, label, value }) => (
        <li key={label} className="flex min-w-0 items-center gap-2 rounded-lg bg-[#fff6ef] px-2 py-1.5">
          <Icon size={15} className="shrink-0 text-[#ff6800]" />
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase leading-none tracking-wide text-[#9a6b4a]">{label}</span>
            <span className="block truncate text-[13px] font-bold leading-tight">{value}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Round corner sticker, like a flyer's "BEST DEAL"; `at` places and sizes it. */
function Badge({ m, L, at }: { m: ModelView; L: Labels; at: string }) {
  const b = m.newArrival ? { text: L.badge_new, cls: "border-[#ff6800] bg-white text-[#ff6800]" }
    : m.count === 1 ? { text: L.badge_last, cls: "border-white bg-[#ff6800] text-white" } : null;
  if (!b) return null;
  return (
    <span className={`absolute flex items-center justify-center rounded-full border-[3px] p-1 text-center font-extrabold uppercase leading-tight shadow ${at} ${b.cls}`}>
      {b.text}
    </span>
  );
}

export default function CatalogueBrowser({ token, models, currency, L, phoneLink, phone, initialCar }: {
  token: string; models: ModelView[]; currency: string; L: Labels; phoneLink: string | null; phone: string | null;
  /** ?car=<name>: a link to one car opens it at once. */
  initialCar?: string | null;
}) {
  const [body, setBody] = useState<string>("all");
  const [cond, setCond] = useState<string>("all");
  const [sort, setSort] = useState("recommended");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<ModelView | null>(() => models.find((m) => m.name === initialCar) ?? null);

  const bodies = useMemo(() => {
    const seen = new Map<string, string>();
    models.forEach((m) => { if (m.body && m.bodyLabel) seen.set(m.body, m.bodyLabel); });
    return [...seen.entries()];
  }, [models]);
  const hasNew = models.some((m) => m.condition === "new");
  const hasUsed = models.some((m) => m.condition === "used");

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = models.filter((m) =>
      (body === "all" || m.body === body)
      && (cond === "all" || m.condition === cond)
      && (!term || m.name.toLowerCase().includes(term) || m.colors.some((c) => c.name.toLowerCase().includes(term))));
    const price = (m: ModelView) => m.minPrice ?? Number.POSITIVE_INFINITY;
    if (sort === "price_low") list.sort((a, b) => price(a) - price(b));
    if (sort === "price_high") list.sort((a, b) => (b.minPrice ?? -1) - (a.minPrice ?? -1));
    if (sort === "newest") list.sort((a, b) => (b.lastAdded ?? "").localeCompare(a.lastAdded ?? ""));
    return list;
  }, [models, body, cond, sort, q]);

  const chip = (active: boolean) =>
    `shrink-0 rounded-full border-2 px-3.5 py-1.5 text-sm font-bold transition ${active ? "border-[#ff6800] bg-[#ff6800] text-white" : "border-[#ffd9bf] bg-white text-[#1d2330] hover:border-[#ff6800]"}`;

  return (
    <>
      {/* Filters */}
      <div className="sticky top-0 z-20 border-b border-[#f0e6de] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
          <div className="hgv-stories -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <button type="button" className={chip(body === "all" && cond === "all")} onClick={() => { setBody("all"); setCond("all"); }}>{L.all}</button>
            {bodies.length > 1 && bodies.map(([k, label]) => (
              <button key={k} type="button" className={chip(body === k)} onClick={() => setBody(body === k ? "all" : k)}>{label}</button>
            ))}
            {hasNew && hasUsed && (
              <>
                <button type="button" className={chip(cond === "new")} onClick={() => setCond(cond === "new" ? "all" : "new")}>{L.new}</button>
                <button type="button" className={chip(cond === "used")} onClick={() => setCond(cond === "used" ? "all" : "used")}>{L.used}</button>
              </>
            )}
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <label className="relative flex-1 sm:w-48 sm:flex-none">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L.search} aria-label={L.search}
                className="w-full rounded-full border-2 border-[#f0e6de] py-1.5 pl-8 pr-3 text-sm outline-none focus:border-[#ff6800]" />
            </label>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={L.sort}
              className="rounded-full border-2 border-[#f0e6de] bg-white px-3 py-1.5 text-sm font-semibold outline-none focus:border-[#ff6800]">
              <option value="recommended">{L.sort_recommended}</option>
              <option value="price_low">{L.sort_price_low}</option>
              <option value="price_high">{L.sort_price_high}</option>
              <option value="newest">{L.sort_newest}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Cars */}
      <section className="mx-auto max-w-5xl px-4 py-6">
        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-[#6b7280]">
            <Car size={44} strokeWidth={1.5} />
            <p>{L.no_results}</p>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((m) => (
              <li key={m.name} className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#f0e6de] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-12px_rgba(255,104,0,0.35)]">
                <button type="button" onClick={() => setOpen(m)} className="relative block text-left" aria-label={`${L.details}: ${m.name}`}>
                  <div className="aspect-[16/10] overflow-hidden bg-[#f3f4f6]">
                    {m.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.cover} alt={m.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[#c4c8cf]"><Car size={56} strokeWidth={1.25} /></div>
                    )}
                  </div>
                  <span className="absolute left-3 top-3 rounded-md bg-[#ff6800] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow">
                    {nAvail(L, m.count)}
                  </span>
                  {m.photos > 1 && (
                    <span className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
                      <Images size={12} /> {L.n_photos.replace("{n}", String(m.photos))}
                    </span>
                  )}
                  <Badge m={m} L={L} at="right-2 top-2 h-16 w-16 text-[9px]" />
                </button>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-lg font-extrabold uppercase leading-tight">{m.name}</h2>
                      <div className="mt-1.5"><Swatches colors={m.colors} /></div>
                    </div>
                    <Price m={m} currency={currency} L={L} />
                  </div>
                  <Specs m={m} L={L} dense />
                  <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
                    {m.ask && (
                      <a href={m.ask} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[#ff6800] px-3 py-2 text-sm font-bold text-white hover:bg-[#e85f00]">
                        <MessageCircle size={15} /> WhatsApp
                      </a>
                    )}
                    <button type="button" onClick={() => setOpen(m)}
                      className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border-2 border-[#ff6800] px-3 py-1.5 text-sm font-bold text-[#ff6800] hover:bg-[#fff1e6] ${m.ask ? "" : "col-span-2"}`}>
                      <Sparkles size={15} /> {L.details}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && (
        <Details m={open} token={token} currency={currency} L={L} phoneLink={phoneLink} phone={phone} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

function Details({ m, token, currency, L, phoneLink, phone, onClose }: {
  m: ModelView; token: string; currency: string; L: Labels; phoneLink: string | null; phone: string | null; onClose: () => void;
}) {
  const [photos, setPhotos] = useState<string[]>(m.cover ? [m.cover] : []);
  const [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    if (m.photos > 0) {
      fetch(`${PRODUCT_API}/catalogue/public/${token}/photos?name=${encodeURIComponent(m.name)}&size=960`)
        .then((r) => (r.ok ? r.json() : null))
        .then((r) => { if (alive && Array.isArray(r?.data) && r.data.length) setPhotos(r.data); })
        .catch(() => { /* keep the cover */ });
    }
    return () => { alive = false; };
  }, [m.name, m.photos, token]);

  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((x) => (x + 1) % Math.max(photos.length, 1));
      if (e.key === "ArrowLeft") setI((x) => (x - 1 + photos.length) % Math.max(photos.length, 1));
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose, photos.length]);

  const n = photos.length;
  const rows: [string, string | null][] = [
    [L.spec_available, nAvail(L, m.count)],
    [L.spec_price, m.minPrice == null ? L.price_on_request
      : m.maxPrice != null && m.maxPrice > m.minPrice ? `${money(m.minPrice)} – ${money(m.maxPrice)} ${currency}` : `${money(m.minPrice)} ${currency}`],
    [L.spec_year, m.year], [L.spec_body, m.bodyLabel], [L.spec_range, m.range],
    [L.spec_mileage, m.mileage], [L.spec_condition, m.conditionLabel],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={m.name} onClick={(e) => e.stopPropagation()} style={{ outline: "none" }}
        className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white outline-none sm:rounded-3xl">
        {/* Gallery */}
        <div className="relative bg-[#111]">
          <div className="aspect-[16/10]">
            {n ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photos[i % n]} alt={`${m.name} ${i + 1}/${n}`} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-[#4b5563]"><Car size={80} strokeWidth={1} /></div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label={L.close}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#1d2330] shadow hover:bg-white"><X size={18} /></button>
          {n > 1 && (
            <>
              <button type="button" aria-label="‹" onClick={() => setI((x) => (x - 1 + n) % n)}
                className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow"><ChevronLeft size={20} /></button>
              <button type="button" aria-label="›" onClick={() => setI((x) => (x + 1) % n)}
                className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow"><ChevronRight size={20} /></button>
              <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-semibold text-white">{(i % n) + 1} / {n}</span>
            </>
          )}
          <Badge m={m} L={L} at="left-3 top-3 h-20 w-20 text-[11px]" />
        </div>
        {n > 1 && (
          <div className="flex gap-2 overflow-x-auto bg-[#111] px-3 pb-3">
            {photos.map((p, k) => (
              <button key={k} type="button" onClick={() => setI(k)} aria-label={`${k + 1}`}
                className={`h-12 w-20 shrink-0 overflow-hidden rounded-md border-2 ${k === i % n ? "border-[#ff6800]" : "border-transparent opacity-70"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="overflow-y-auto p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="inline-block rounded-md bg-[#ff6800] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">{nAvail(L, m.count)}</span>
              <h2 className="mt-2 text-2xl font-extrabold uppercase leading-tight">{m.name}</h2>
            </div>
            <Price m={m} currency={currency} L={L} big />
          </div>

          <div className="mt-4"><Specs m={m} L={L} /></div>

          {m.colors.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#9a6b4a]">{L.spec_colours}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {m.colors.map((c) => (
                  <li key={c.name} className="flex items-center gap-2 rounded-full border border-[#f0e6de] py-1 pl-1 pr-3 text-sm">
                    <span className="h-5 w-5 rounded-full border border-black/15" style={{ background: c.hex ?? "repeating-linear-gradient(45deg,#e5e7eb 0 3px,#fff 3px 6px)" }} />
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-[#6b7280]">× {c.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <table className="mt-4 w-full text-sm">
            <tbody>
              {rows.filter(([, v]) => v).map(([k, v]) => (
                <tr key={k} className="border-b border-[#f3ece6] last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-medium text-[#6b7280]">{k}</th>
                  <td className="py-2 text-right font-bold">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {m.ask && (
              <a href={m.ask} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-full bg-[#ff6800] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#e85f00]">
                <MessageCircle size={16} /> {L.ask}
              </a>
            )}
            {m.testDrive && (
              <a href={m.testDrive} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-full border-2 border-[#ff6800] px-4 py-2 text-sm font-bold text-[#ff6800] hover:bg-[#fff1e6]">
                <CarFront size={16} /> {L.test_drive}
              </a>
            )}
            {phoneLink && (
              <a href={phoneLink}
                className="flex items-center justify-center gap-2 rounded-full border-2 border-[#1d2330] px-4 py-2 text-sm font-bold text-[#1d2330] hover:bg-[#f3f4f6]">
                <Phone size={16} /> {phone ?? L.call}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
