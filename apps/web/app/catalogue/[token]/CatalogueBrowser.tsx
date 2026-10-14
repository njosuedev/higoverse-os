"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowUpDown, BadgeCheck, BatteryCharging, Calendar, Car, CarFront, ChevronLeft, ChevronRight, Gauge, Images,
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
  | "spec_colours" | "spec_available" | "spec_price" | "call" | "one_available" | "n_available" | "n_photos" | "only_left",
  string
>;

const money = (n: number) => Math.round(n).toLocaleString("en-US");
const nAvail = (L: Labels, n: number) => (n === 1 ? L.one_available : L.n_available.replace("{n}", String(n)));
/** "6 available", or a true scarcity signal when few are left: "Only 2 left". */
const availTag = (L: Labels, n: number) => (n <= 3 ? L.only_left.replace("{n}", String(n)) : nAvail(L, n));

/** The price as an orange ticket laid on the photo, as in a sales advert. */
function PriceTicket({ m, currency, L }: { m: ModelView; currency: string; L: Labels }) {
  if (m.minPrice == null) {
    return <span className="rounded-lg bg-white/95 px-2.5 py-1 text-sm font-bold text-[#1d2330] shadow min-[540px]:px-2 min-[540px]:text-[11px]">{L.price_on_request}</span>;
  }
  const from = m.maxPrice != null && m.maxPrice > m.minPrice;
  return (
    <span className="flex flex-col rounded-lg bg-white/95 px-2.5 py-1 text-[#1d2330] min-[540px]:px-2 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.35)] backdrop-blur">
      {from && <span className="text-[10px] font-bold uppercase leading-none tracking-wide text-[#71717a] min-[540px]:text-[9px]">{L.from}</span>}
      <span className="flex items-baseline gap-0.5">
        <span className="text-xl font-extrabold leading-tight tabular-nums min-[540px]:text-sm">{money(m.minPrice)}</span>
        <span className="text-xs font-bold text-[#71717a] min-[540px]:text-[9px]">{currency}</span>
      </span>
    </span>
  );
}

function Price({ m, currency, L, big = false }: { m: ModelView; currency: string; L: Labels; big?: boolean }) {
  if (m.minPrice == null) return <p className={`font-bold ${big ? "text-lg" : "text-sm"}`}>{L.price_on_request}</p>;
  const from = m.maxPrice != null && m.maxPrice > m.minPrice;
  return (
    <div className="text-right">
      {from && <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">{L.from}</p>}
      <p className={`font-extrabold leading-none tabular-nums ${big ? "text-3xl" : "text-xl"}`}>{money(m.minPrice)}</p>
      <p className="text-xs font-bold text-[#71717a]">{currency}</p>
    </div>
  );
}

function Swatches({ colors, max = 6, small = false }: { colors: ModelView["colors"]; max?: number; small?: boolean }) {
  if (!colors.length) return null;
  // Up to three colours are named; more are dots, so the card stays one line.
  const named = colors.length <= 3;
  return (
    <div className={`flex min-w-0 flex-wrap items-center ${named ? "gap-x-2.5 gap-y-1" : small ? "gap-1" : "gap-1.5"}`}>
      {colors.slice(0, max).map((c) => (
        <span key={c.name} title={`${c.name} (${c.count})`} className="flex min-w-0 items-center gap-1">
          <span className={`${small ? "h-3 w-3" : "h-4 w-4"} shrink-0 rounded-full border border-black/20 shadow-inner`}
            style={{ background: c.hex ?? "repeating-linear-gradient(45deg,#e5e7eb 0 3px,#fff 3px 6px)" }} />
          {named && <span className="truncate text-xs font-semibold capitalize text-[#52525b] min-[540px]:text-[11px]">{c.name}</span>}
        </span>
      ))}
      {colors.length > max && <span className={`${small ? "text-[10px]" : "text-xs"} text-[#6b7280]`}>+{colors.length - max}</span>}
    </div>
  );
}

function Specs({ m, L, dense = false }: { m: ModelView; L: Labels; dense?: boolean }) {
  // On a card, year and body already head the name; the boxes add the rest.
  const items = [
    !dense && m.year && { icon: Calendar, label: L.spec_year, value: m.year },
    !dense && m.bodyLabel && { icon: CarFront, label: L.spec_body, value: m.bodyLabel },
    m.range && { icon: BatteryCharging, label: L.spec_range, value: m.range },
    m.mileage && { icon: Gauge, label: L.spec_mileage, value: m.mileage },
    m.conditionLabel && { icon: BadgeCheck, label: L.spec_condition, value: m.conditionLabel },
  ].filter(Boolean) as { icon: typeof Calendar; label: string; value: string }[];
  if (!items.length) return null;
  if (dense) {
    return (
      <ul className="flex flex-wrap gap-1.5">
        {items.map(({ icon: Icon, label, value }) => (
          <li key={label} title={label} className="flex items-center gap-1 rounded-full bg-[#f4f4f5] px-2 py-0.5 text-[11px] font-bold">
            <Icon size={11} className="shrink-0 text-[#71717a]" aria-hidden />
            <span className="sr-only">{label}: </span>{value}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-2">
      {items.map(({ icon: Icon, label, value }) => (
        <li key={label} className="flex min-w-0 items-center gap-2 rounded-lg bg-[#f4f4f5] px-2 py-1.5">
          <Icon size={15} className="shrink-0 text-[#71717a]" />
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase leading-none tracking-wide text-[#71717a]">{label}</span>
            <span className="block truncate text-[13px] font-bold leading-tight">{value}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Round corner sticker, like a flyer's "BEST DEAL"; `at` places and sizes it. */
function Badge({ m, L, at }: { m: ModelView; L: Labels; at: string }) {
  const b = m.newArrival ? { text: L.badge_new, cls: "border-[#1d2330] bg-white text-[#1d2330]" }
    : m.count === 1 ? { text: L.badge_last, cls: "border-white bg-[#1d2330] text-white" } : null;
  if (!b) return null;
  return (
    <span className={`absolute flex items-center justify-center rounded-full border-[3px] p-1 text-center font-extrabold uppercase leading-tight shadow ${at} ${b.cls}`}>
      {b.text}
    </span>
  );
}

export default function CatalogueBrowser({ token, models, currency, L, phoneLink, phone, shopName, initialCar }: {
  token: string; models: ModelView[]; currency: string; L: Labels; phoneLink: string | null; phone: string | null; shopName: string;
  /** ?car=<name>: a link to one car opens it at once. */
  initialCar?: string | null;
}) {
  const [body, setBody] = useState<string>("all");
  const [cond, setCond] = useState<string>("all");
  const [sort, setSort] = useState("recommended");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<ModelView | null>(() => models.find((m) => m.name === initialCar) ?? null);
  // Phones: the search box takes the filter row's place while open.
  const [searching, setSearching] = useState(false);

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

  const sortOptions = (
    <>
      <option value="recommended">{L.sort_recommended}</option>
      <option value="price_low">{L.sort_price_low}</option>
      <option value="price_high">{L.sort_price_high}</option>
      <option value="newest">{L.sort_newest}</option>
    </>
  );
  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-xs font-bold transition ${active ? "border-[#1d2330] bg-[#1d2330] text-white" : "border-[#e4e4e7] bg-white text-[#1d2330] hover:border-[#a1a1aa]"}`;

  return (
    <>
      {/* Filters */}
      <div className="sticky top-0 z-20 border-b border-[#e7e7ea] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2 sm:px-4">
          {searching ? (
            <label className="relative flex-1 sm:hidden">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={L.search} aria-label={L.search}
                className="h-10 w-full rounded-full border-2 border-[#1d2330] pl-9 pr-10 text-[15px] outline-none" />
              <button type="button" aria-label={L.close} onClick={() => { setSearching(false); setQ(""); }}
                className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-[#f3f4f6]"><X size={14} /></button>
            </label>
          ) : (
            <button type="button" aria-label={L.search} onClick={() => setSearching(true)}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border sm:hidden ${q ? "border-[#1d2330] bg-[#1d2330] text-white" : "border-[#e4e4e7] text-[#1d2330]"}`}>
              <Search size={16} />
            </button>
          )}
          <div className={`hgv-stories min-w-0 flex-1 gap-2 overflow-x-auto sm:flex sm:flex-none ${searching ? "hidden" : "flex"}`}>
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
          <div className={`shrink-0 gap-2 sm:ml-auto sm:flex ${searching ? "hidden" : "flex"}`}>
            <label className="relative hidden sm:block sm:w-48">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L.search} aria-label={L.search}
                className="h-8 w-full rounded-full border border-[#e7e7ea] pl-8 pr-3 text-xs outline-none focus:border-[#1d2330]" />
            </label>
            {/* Phones: a sort icon (the native list opens over it); larger screens: the menu itself */}
            <label className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border sm:hidden ${sort !== "recommended" ? "border-[#1d2330] bg-[#1d2330] text-white" : "border-[#e4e4e7] text-[#1d2330]"}`}>
              <ArrowUpDown size={16} aria-hidden />
              <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={L.sort} className="absolute inset-0 opacity-0">
                {sortOptions}
              </select>
            </label>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={L.sort}
              className="hidden h-8 rounded-full border border-[#e7e7ea] bg-white px-2.5 text-xs font-semibold outline-none focus:border-[#1d2330] sm:block">
              {sortOptions}
            </select>
          </div>
        </div>
      </div>

      {/* Cars */}
      <section className="mx-auto max-w-6xl px-3 py-3 sm:px-4 sm:py-5">
        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-[#6b7280]">
            <Car size={44} strokeWidth={1.5} />
            <p>{L.no_results}</p>
          </div>
        ) : (
          // Phones: one big card per row, like an advert; wider screens: 2–4 columns.
          <ul className="grid grid-cols-1 gap-4 min-[540px]:grid-cols-2 min-[540px]:gap-3.5 md:grid-cols-3 lg:grid-cols-4">
            {shown.map((m) => (
              <li key={m.name} className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e7e7ea] bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.12)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-14px_rgba(0,0,0,0.25)] min-[540px]:rounded-xl">
                <button type="button" onClick={() => setOpen(m)} className="relative block text-left" aria-label={`${L.details}: ${m.name}`}>
                  <div className="aspect-[4/3] overflow-hidden bg-[#f3f4f6]">
                    {m.cover ? (
                      <FitPhoto src={m.cover} alt={m.name} lazy />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[#c4c8cf]"><Car size={44} strokeWidth={1.25} /></div>
                    )}
                  </div>
                  <span className={`absolute left-2.5 top-2.5 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide shadow min-[540px]:left-2 min-[540px]:top-2 min-[540px]:text-[10px] ${m.count <= 3 ? "bg-[#ff6800] text-white" : "bg-white text-[#1d2330]"}`}>
                    {availTag(L, m.count)}
                  </span>
                  <span className="absolute bottom-2.5 left-2.5 min-[540px]:bottom-2 min-[540px]:left-2"><PriceTicket m={m} currency={currency} L={L} /></span>
                  {m.photos > 1 && (
                    <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-xs font-semibold text-white min-[540px]:bottom-2 min-[540px]:right-2 min-[540px]:text-[10px]">
                      <Images size={12} /> {m.photos}
                    </span>
                  )}
                  <Badge m={m} L={L} at="right-2 top-2 h-14 w-14 border-2 text-[8px] min-[540px]:right-1.5 min-[540px]:top-1.5 min-[540px]:h-12 min-[540px]:w-12 min-[540px]:text-[7px]" />
                </button>
                <div className="flex flex-1 flex-col gap-2 p-3.5 min-[540px]:p-3">
                  <div className="min-w-0">
                    {(m.year || m.bodyLabel) && (
                      <p className="truncate text-[11px] font-bold uppercase tracking-wide text-[#71717a] min-[540px]:text-[10px]">{[m.year, m.bodyLabel].filter(Boolean).join(" · ")}</p>
                    )}
                    <h2 className="line-clamp-2 text-lg font-extrabold uppercase leading-tight min-[540px]:text-sm">{m.name}</h2>
                  </div>
                  <Specs m={m} L={L} dense />
                  <Swatches colors={m.colors} max={6} small />
                  <div className="mt-auto grid grid-cols-2 gap-2 pt-1 min-[540px]:gap-1.5">
                    {m.ask && (
                      <a href={m.ask} target="_blank" rel="noopener noreferrer"
                        className="flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[#ff6800] px-3 text-sm font-bold text-white hover:bg-[#e85f00] active:bg-[#e85f00] min-[540px]:h-8 min-[540px]:gap-1 min-[540px]:px-2.5 min-[540px]:text-xs">
                        <MessageCircle size={16} /> WhatsApp
                      </a>
                    )}
                    <button type="button" onClick={() => setOpen(m)}
                      className={`flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-[#d4d4d8] px-3 text-sm font-bold text-[#1d2330] hover:bg-[#f4f4f5] active:bg-[#f4f4f5] min-[540px]:h-8 min-[540px]:gap-1 min-[540px]:px-2.5 min-[540px]:text-xs ${m.ask ? "" : "col-span-2"}`}>
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
        <Details m={models.find((x) => x.name === open.name) ?? open} token={token} currency={currency} L={L} phoneLink={phoneLink} phone={phone} shopName={shopName} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

/** The whole photo, never cropped, filling its frame: the bands beside a
 *  tall or wide photo show a blurred, zoomed copy of it instead of grey. */
function FitPhoto({ src, alt, lazy = false }: { src: string; alt: string; lazy?: boolean }) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" aria-hidden loading={lazy ? "lazy" : undefined}
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-xl" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading={lazy ? "lazy" : undefined} className="relative h-full w-full object-contain" />
    </div>
  );
}

/**
 * One car in full. Phones: a full-screen sheet with a swipeable gallery and
 * the actions pinned to the bottom. Larger screens: a centred window with
 * arrows and thumbnails.
 */
function Details({ m, token, currency, L, phoneLink, phone, shopName, onClose }: {
  m: ModelView; token: string; currency: string; L: Labels; phoneLink: string | null; phone: string | null; shopName: string; onClose: () => void;
}) {
  const [photos, setPhotos] = useState<string[]>(m.cover ? [m.cover] : []);
  const [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);

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

  const n = photos.length;
  // The gallery is a scroll-snap strip: a swipe on phones, arrows elsewhere.
  const go = (k: number) => {
    const el = strip.current;
    if (!el || !n) return;
    el.scrollTo({ left: ((k + n) % n) * el.clientWidth, behavior: "smooth" });
  };

  useEffect(() => {
    box.current?.focus();
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(i + 1);
      if (e.key === "ArrowLeft") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
        className="relative flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[94dvh] sm:rounded-3xl lg:h-[90dvh] lg:max-w-6xl">
        {/* Phones and tablets: photos above the details, one scroll. Computers:
            the photos fill the left at full height, the details beside them. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain lg:flex lg:overflow-hidden">
          <div className="bg-[#111] lg:flex lg:min-w-0 lg:flex-1 lg:flex-col">
          {/* Gallery */}
          <div className="relative lg:min-h-0 lg:flex-1">
            <div ref={strip} onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / Math.max(e.currentTarget.clientWidth, 1)))}
              className="hgv-stories flex aspect-square snap-x snap-mandatory overflow-x-auto sm:aspect-[16/10] lg:aspect-auto lg:h-full">
              {n ? photos.map((p, k) => (
                <div key={k} className="h-full w-full shrink-0 snap-center">
                  <FitPhoto src={p} alt={`${m.name} ${k + 1}/${n}`} />
                </div>
              )) : (
                <div className="flex h-full w-full items-center justify-center text-[#4b5563]"><Car size={80} strokeWidth={1} /></div>
              )}
            </div>
            {/* Phones: a back arrow, as on a full page; larger screens: a cross */}
            <button type="button" onClick={onClose} aria-label={L.close}
              className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-[#1d2330] shadow sm:left-auto sm:right-3 sm:h-9 sm:w-9"
              style={{ marginTop: "env(safe-area-inset-top)" }}>
              <ArrowLeft size={20} className="sm:hidden" /><X size={18} className="hidden sm:block" />
            </button>
            {n > 1 && (
              <>
                <button type="button" aria-label="‹" onClick={() => go(i - 1)}
                  className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow sm:flex"><ChevronLeft size={20} /></button>
                <button type="button" aria-label="›" onClick={() => go(i + 1)}
                  className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow sm:flex"><ChevronRight size={20} /></button>
                <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-semibold text-white">{Math.min(i, n - 1) + 1} / {n}</span>
                {/* Phones: dots say there is more to swipe */}
                <div className="absolute inset-x-0 bottom-3.5 flex justify-center gap-1.5 sm:hidden">
                  {photos.map((_, k) => (
                    <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? "w-5 bg-white" : "w-1.5 bg-white/60"}`} />
                  ))}
                </div>
              </>
            )}
            <Badge m={m} L={L} at="right-3 top-3 h-16 w-16 text-[9px] sm:left-3 sm:right-auto sm:h-20 sm:w-20 sm:text-[11px]" />
          </div>
          {n > 1 && (
            <div className="hgv-stories hidden shrink-0 gap-2 overflow-x-auto bg-[#111] px-3 pb-3 pt-1 sm:flex lg:pt-3">
              {photos.map((p, k) => (
                <button key={k} type="button" onClick={() => go(k)} aria-label={`${k + 1}`}
                  className={`h-12 w-20 shrink-0 overflow-hidden rounded-md border-2 ${k === i ? "border-white" : "border-transparent opacity-60"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
          </div>

          <div className="p-4 sm:p-5 lg:w-[400px] lg:shrink-0 lg:overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${m.count <= 3 ? "bg-[#ff6800] text-white" : "bg-[#f4f4f5] text-[#1d2330]"}`}>{availTag(L, m.count)}</span>
                <h2 className="mt-2 text-xl font-extrabold uppercase leading-tight sm:text-2xl">{m.name}</h2>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#71717a] [overflow-wrap:anywhere]">{shopName}</p>
              </div>
              <Price m={m} currency={currency} L={L} big />
            </div>

            <div className="mt-4"><Specs m={m} L={L} /></div>

            {m.colors.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#71717a]">{L.spec_colours}</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {m.colors.map((c) => (
                    <li key={c.name} className="flex items-center gap-2 rounded-full border border-[#e7e7ea] py-1 pl-1 pr-3 text-sm">
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
                    <th scope="row" className="py-2.5 pr-3 text-left font-medium text-[#6b7280]">{k}</th>
                    <td className="py-2.5 text-right font-bold">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Larger screens: the actions follow the details */}
            <div className="mt-5 hidden gap-2 sm:grid sm:grid-cols-3 lg:grid-cols-1">
              {m.ask && (
                <a href={m.ask} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-full bg-[#ff6800] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#e85f00]">
                  <MessageCircle size={16} /> {L.ask}
                </a>
              )}
              {m.testDrive && (
                <a href={m.testDrive} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-full border-2 border-[#d4d4d8] px-4 py-2 text-sm font-bold text-[#1d2330] hover:bg-[#f4f4f5]">
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
            {m.testDrive && (
              <a href={m.testDrive} target="_blank" rel="noopener noreferrer"
                className="mt-4 flex h-11 items-center justify-center gap-2 rounded-full border-2 border-[#d4d4d8] text-sm font-bold text-[#1d2330] active:bg-[#f4f4f5] sm:hidden">
                <CarFront size={16} /> {L.test_drive}
              </a>
            )}
          </div>
        </div>

        {/* Phones: ask or call without scrolling */}
        {(m.ask || phoneLink) && (
          <div className="grid shrink-0 grid-cols-[1fr_auto] gap-2 border-t border-[#e7e7ea] bg-white px-3 pt-2.5 sm:hidden"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}>
            {m.ask && (
              <a href={m.ask} target="_blank" rel="noopener noreferrer"
                className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#ff6800] text-base font-bold text-white active:bg-[#e85f00]">
                <MessageCircle size={19} /> {L.ask}
              </a>
            )}
            {phoneLink && (
              <a href={phoneLink} aria-label={phone ?? L.call}
                className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#d4d4d8] text-[#1d2330] active:bg-[#f4f4f5]">
                <Phone size={20} />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
