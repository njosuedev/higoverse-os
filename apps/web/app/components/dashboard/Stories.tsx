"use client";

// Stories on Home, the way Facebook shows them (and like the mobile app):
// a row of tall cards, one per topic, with a blue ring until watched; a
// click plays every vehicle or item of that topic full screen, then the
// next topic. Car companies: traffic fines and cars awaiting transfer.
// Shops: sold out, running low, best sellers this week. Both: everything
// added in the last 3 days (FRESH_DAYS), like posts. Photos are the sharp
// cover (640 px in the row, 1280 px in the viewer), never the 160 px
// list thumbnail, and the viewer keeps the photo clear of its card.
// Each story has one clear action (receive stock, sell, record the fine,
// finish the transfer) and "View".

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowLeftRight, Ban, Car, ChevronLeft, ChevronRight, Package, Pause, Play, ShieldAlert, Sparkles, TrendingUp, X,
} from "lucide-react";
import { itemRequest } from "@/lib/product-api";
import { saleRequest } from "@/lib/sale-api";
import { useLanguage } from "@/lib/language-context";
import { useShopSettings } from "@/lib/shop-settings-context";
import { useCanSeeFinancials } from "@/lib/permissions";

type Kind = "fines" | "pending" | "soldOut" | "low" | "best" | "fresh";
type Item = Record<string, unknown> & { id: string; name: string };
interface Story { kind: Kind; item: Item }
interface Group { kind: Kind; stories: Story[] }

const ORDER: Kind[] = ["fines", "pending", "soldOut", "low", "best", "fresh"];
const PLAY_MS = 8000;
const SEEN_KEY = "hgv_story_seen";
const FRESH_DAYS = 3;

const LOOK: Record<Kind, { icon: typeof Car; color: string; title: string }> = {
  fines:   { icon: ShieldAlert,    color: "#e41e3f", title: "story.fines" },
  pending: { icon: ArrowLeftRight, color: "#c47f0a", title: "story.pending" },
  soldOut: { icon: Ban,            color: "#e41e3f", title: "story.sold_out" },
  low:     { icon: AlertTriangle,  color: "#c47f0a", title: "story.low" },
  best:    { icon: TrendingUp,     color: "#2f9e2a", title: "story.best" },
  fresh:   { icon: Sparkles,       color: "#0866ff", title: "story.fresh" },
};
const isCarKind = (k: Kind) => k === "fines" || k === "pending";
const titleKey = (k: Kind, car: boolean) => (k === "fresh" && car ? "story.fresh_car" : LOOK[k].title);
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const attrs = (it: Item): Record<string, string> => {
  try { return typeof it.attributes === "string" ? JSON.parse(it.attributes) : ((it.attributes as Record<string, string>) || {}); } catch { return {}; }
};

/** Seen-key: changes with the situation (more fines, fewer left, more
 *  sold), so the story counts as new again. */
function storyId(s: Story): string {
  const a = attrs(s.item);
  const state = { fines: a.penalty_count, pending: a.sale_status, soldOut: s.item.quantity, low: s.item.quantity, best: s.item.qty_sold, fresh: "" }[s.kind];
  return `${s.kind}:${s.item.id}:${state ?? ""}`;
}

function readSeen(): string[] {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); } catch { return []; }
}
function writeSeen(ids: string[]) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-400))); } catch { /* storage blocked */ }
}

/** Everything added in the last FRESH_DAYS days, newest first (lists are). */
function addedRecently(list: Item[]): Story[] {
  const since = Date.now() - FRESH_DAYS * 86400000;
  return list
    .filter((p) => p.created_at && new Date(String(p.created_at)).getTime() > since)
    .map((item) => ({ kind: "fresh" as Kind, item }));
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Stories() {
  const { t, layout } = useLanguage();
  const isCar = layout === "car";
  const { lowStock } = useShopSettings();
  const [groups, setGroups] = useState<Group[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  // Read once (nothing is drawn before the stories load, so server and
  // browser agree on the first render).
  const [seen, setSeen] = useState<string[]>(readSeen);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const items = (r: unknown): Item[] => {
      const d = (r as { data?: unknown })?.data as { items?: Item[] } | Item[] | undefined;
      return (Array.isArray(d) ? d : d?.items) || [];
    };
    (async () => {
      try {
        let gs: Group[];
        if (isCar) {
          const [fined, pending, newest] = await Promise.all([
            itemRequest("/products?page=1&limit=40&status=penalties").catch(() => null),
            itemRequest("/products?page=1&limit=20&status=pending").catch(() => null),
            itemRequest("/products?page=1&limit=60").catch(() => null),
          ]);
          gs = [
            { kind: "fines", stories: items(fined).map((item) => ({ kind: "fines" as Kind, item })) },
            { kind: "pending", stories: items(pending).map((item) => ({ kind: "pending" as Kind, item })) },
            { kind: "fresh", stories: addedRecently(items(newest)) },
          ];
        } else {
          const now = new Date();
          const from = new Date(now); from.setDate(now.getDate() - 6);
          const [alerts, top, newest] = await Promise.all([
            itemRequest(`/products/stock-alerts?threshold=${lowStock}`).catch(() => null),
            saleRequest(`/sales/top-products?limit=5&from_date=${ymd(from)}&to_date=${ymd(now)}`).catch(() => null),
            itemRequest("/products?page=1&limit=60").catch(() => null),
          ]);
          const a = items(alerts).sort((x, y) => num(x.quantity) - num(y.quantity)).slice(0, 12);
          gs = [
            { kind: "soldOut", stories: a.filter((p) => num(p.quantity) <= 0).map((item) => ({ kind: "soldOut" as Kind, item })) },
            { kind: "low", stories: a.filter((p) => num(p.quantity) > 0).map((item) => ({ kind: "low" as Kind, item })) },
            { kind: "best", stories: items(top).filter((p) => num(p.qty_sold) > 0)
                .map((p) => ({ kind: "best" as Kind, item: { ...p, id: String(p.product_id), name: String(p.product_name ?? "") } })) },
            { kind: "fresh", stories: addedRecently(items(newest)) },
          ];
        }
        gs = gs.filter((g) => g.stories.length > 0);
        if (!alive) return;
        setGroups(gs);
        // Sharp photos: every story's cover (lists only carry a 160 px thumbnail).
        const ids = [...new Set(gs.flatMap((g) => g.stories).map((s) => s.item.id))].slice(0, 30);
        if (ids.length) {
          const r = await itemRequest(`/products/covers?ids=${ids.join(",")}&size=640`).catch(() => null);
          if (alive && r?.data) setCovers(r.data as Record<string, string>);
        }
      } catch { /* Home works without stories */ }
    })();
    return () => { alive = false; };
  }, [isCar, lowStock]);

  const isSeen = useCallback((s: Story) => seen.includes(storyId(s)), [seen]);
  const groupSeen = useCallback((g: Group) => g.stories.every(isSeen), [isSeen]);
  // Not watched yet first, then what needs action first.
  const sorted = useMemo(() => [...groups].sort((a, b) =>
    groupSeen(a) !== groupSeen(b) ? (groupSeen(a) ? 1 : -1) : ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)), [groups, groupSeen]);
  const markSeen = useCallback((s: Story) => {
    setSeen((prev) => {
      const id = storyId(s);
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      writeSeen(next);
      return next;
    });
  }, []);

  if (sorted.length === 0) return null;
  const photo = (it: Item) => covers[it.id] || (it.thumbnail as string) || "";

  return (
    <>
      <Tray groups={sorted} photo={photo} groupSeen={groupSeen} onOpen={setOpen} t={t} car={isCar} />
      {open !== null && (
        <Viewer
          groups={sorted} start={open} photo={photo} isSeen={isSeen} markSeen={markSeen}
          onClose={() => setOpen(null)} t={t} lowStock={lowStock} car={isCar}
        />
      )}
    </>
  );
}

// ── The row of cards ─────────────────────────────────────────────────────
function Tray({ groups, photo, groupSeen, onOpen, t, car }: {
  groups: Group[]; photo: (it: Item) => string; groupSeen: (g: Group) => boolean; onOpen: (i: number) => void; t: (k: string) => string; car: boolean;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const measure = () => {
    const el = row.current;
    if (el) setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [groups]);
  const scroll = (dir: number) => row.current?.scrollBy({ left: dir * 300, behavior: "smooth" });

  return (
    <section aria-label={t("story.title")} className="relative">
      <div ref={row} onScroll={measure} className="hgv-stories flex gap-2 overflow-x-auto scroll-smooth pb-1">
        {groups.map((g, i) => {
          const first = g.stories[0];
          const n = g.stories.length;
          const sub = n === 1 ? first.item.name : t(car ? "story.n_cars" : "story.n_items").replace("{n}", String(n));
          const img = photo(first.item);
          return (
            <button key={g.kind} type="button" onClick={() => onOpen(i)}
              className="group relative h-[220px] w-[124px] flex-none overflow-hidden rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
              aria-label={`${t(titleKey(g.kind, car))}, ${sub}`}>
              <Backdrop kind={g.kind} car={car} src={img} className="transition-transform duration-300 group-hover:scale-[1.04]" />
              <span className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80 transition-colors group-hover:bg-black/10" />
              <span className="absolute left-2 top-2"><TopicAvatar kind={g.kind} seen={groupSeen(g)} /></span>
              <span className="absolute inset-x-2.5 bottom-2.5">
                <span className="block text-[13px] font-semibold leading-tight text-white">{t(titleKey(g.kind, car))}</span>
                <span className="mt-0.5 block truncate text-[11.5px] text-white/85">{sub}</span>
              </span>
            </button>
          );
        })}
      </div>
      {edge.left && <TrayArrow side="left" onClick={() => scroll(-1)} label={t("story.prev")} />}
      {edge.right && <TrayArrow side="right" onClick={() => scroll(1)} label={t("story.next")} />}
    </section>
  );
}

function TrayArrow({ side, onClick, label }: { side: "left" | "right"; onClick: () => void; label: string }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className={`hgv-story-arrow absolute top-1/2 -translate-y-1/2 ${side === "left" ? "left-1" : "right-1"} flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white text-text shadow-md hover:bg-paper-dim`}>
      <Icon size={20} />
    </button>
  );
}

/** The topic's picture: its icon on its colour, in a ring that is blue until
 *  everything in it has been watched, then grey (Facebook's rule). */
function TopicAvatar({ kind, seen, size = 40 }: { kind: Kind; seen: boolean; size?: number }) {
  const Icon = LOOK[kind].icon;
  return (
    <span className="flex items-center justify-center rounded-full"
      style={{ width: size, height: size, padding: size * 0.075, border: `${size * 0.075}px solid ${seen ? "#a8a8a8" : "#0866ff"}` }}>
      <span className="flex h-full w-full items-center justify-center rounded-full" style={{ background: LOOK[kind].color }}>
        <Icon size={size * 0.44} color="#fff" strokeWidth={2.4} />
      </span>
    </span>
  );
}

function Backdrop({ kind, car, src, contain, className = "" }: { kind: Kind; car: boolean; src: string; contain?: boolean; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={`absolute inset-0 h-full w-full ${contain ? "object-contain" : "object-cover"} ${className}`} />;
  }
  const Icon = car || isCarKind(kind) ? Car : Package;
  return (
    <span className={`absolute inset-0 flex items-center justify-center ${className}`}
      style={{ background: `linear-gradient(135deg, ${LOOK[kind].color}dd, #000000cc)` }}>
      <Icon size={52} color="rgba(255,255,255,0.35)" />
    </span>
  );
}

// ── Full-screen viewer ───────────────────────────────────────────────────
function Viewer({ groups, start, photo, isSeen, markSeen, onClose, t, lowStock, car }: {
  groups: Group[]; start: number; photo: (it: Item) => string; isSeen: (s: Story) => boolean; markSeen: (s: Story) => void;
  onClose: () => void; t: (k: string) => string; lowStock: number; car: boolean;
}) {
  const [g, setG] = useState(start);
  const [i, setI] = useState(() => Math.max(0, groups[start].stories.findIndex((s) => !isSeen(s))));
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [progress, setProgress] = useState(0);
  const story = groups[g].stories[i];

  const next = useCallback(() => {
    setProgress(0);
    if (i < groups[g].stories.length - 1) setI(i + 1);
    else if (g < groups.length - 1) { setG(g + 1); setI(0); }
    else onClose();
  }, [g, i, groups, onClose]);
  const prev = useCallback(() => {
    setProgress(0);
    if (i > 0) setI(i - 1);
    else if (g > 0) { setG(g - 1); setI(groups[g - 1].stories.length - 1); }
  }, [g, i, groups]);

  useEffect(() => { markSeen(story); }, [story, markSeen]);

  // Full-size photo (1280 px) for the story on screen; the row's 640 px one meanwhile.
  const [big, setBig] = useState<Record<string, string>>({});
  useEffect(() => {
    const id = story.item.id;
    if (big[id] !== undefined) return;
    let alive = true;
    itemRequest(`/products/covers?ids=${id}&size=1280`)
      .then((r) => { if (alive) setBig((b) => ({ ...b, [id]: (r?.data as Record<string, string> | undefined)?.[id] ?? "" })); })
      .catch(() => {});
    return () => { alive = false; };
  }, [story, big]);

  // The photo sits between the top bar and the card, so nothing covers it.
  const card = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(180);
  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCardH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The clock: fills the bar, then the next story.
  useEffect(() => {
    if (paused || held) return;
    const started = performance.now() - progress * PLAY_MS;
    let raf = 0;
    const tick = (now: number) => {
      const p = (now - started) / PLAY_MS;
      if (p >= 1) { next(); return; }
      setProgress(p);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, held, next, g, i]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [next, prev, onClose]);

  const group = groups[g];
  const src = big[story.item.id] || photo(story.item);
  const atStart = g === 0 && i === 0;

  return (
    <div role="dialog" aria-modal="true" aria-label={t(titleKey(group.kind, car))}
      className="hgv-story-viewer fixed inset-0 z-[150] flex items-center justify-center bg-[#0c1014]/95 p-4" onClick={onClose}>
      <button type="button" onClick={onClose} aria-label={t("common.close")}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
        <X size={22} />
      </button>

      <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={prev} disabled={atStart} aria-label={t("story.prev")}
          className="hidden h-12 w-12 flex-none items-center justify-center rounded-full bg-[#f5f5f5] text-[#0c1014] shadow-lg hover:bg-[#ffffff] disabled:invisible sm:flex">
          <ChevronLeft size={26} />
        </button>

        {/* The story, 9:16 like Facebook's */}
        <div className="relative aspect-[9/16] h-[min(88vh,860px)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl bg-black text-white"
          onPointerDown={() => setHeld(true)} onPointerUp={() => setHeld(false)} onPointerLeave={() => setHeld(false)}>
          <span className="absolute inset-0 scale-110 opacity-40 blur-2xl"><Backdrop kind={story.kind} car={car} src={src} /></span>
          <span className="absolute inset-x-0" style={{ top: 72, bottom: cardH + 20 }}>
            <Backdrop kind={story.kind} car={car} src={src} contain />
          </span>

          {/* tap zones: left third back, the rest next */}
          <button type="button" aria-hidden="true" tabIndex={-1} onClick={prev} className="absolute inset-y-0 left-0 w-1/3 cursor-default" />
          <button type="button" aria-hidden="true" tabIndex={-1} onClick={next} className="absolute inset-y-0 right-0 w-2/3 cursor-default" />

          <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent px-3 pb-8 pt-3">
            <div className="flex gap-1">
              {group.stories.map((_, k) => (
                <span key={k} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35">
                  <span className="block h-full bg-white" style={{ width: `${k < i ? 100 : k === i ? progress * 100 : 0}%` }} />
                </span>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2.5">
              <TopicAvatar kind={group.kind} seen={false} size={38} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">{t(titleKey(group.kind, car))}</p>
                {group.stories.length > 1 && <p className="text-xs text-white/75">{i + 1} / {group.stories.length}</p>}
              </div>
              <button type="button" onClick={(e) => { e.stopPropagation(); setPaused((p) => !p); }}
                aria-label={paused ? t("story.play") : t("story.pause")}
                className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15">
                {paused ? <Play size={18} fill="#fff" /> : <Pause size={18} fill="#fff" />}
              </button>
            </div>
          </div>

          <div ref={card} className="absolute inset-x-3 bottom-3" onPointerDown={(e) => e.stopPropagation()}>
            <StoryCard story={story} t={t} lowStock={lowStock} onAction={() => setPaused(true)} />
          </div>
        </div>

        <button type="button" onClick={next} aria-label={t("story.next")}
          className="hidden h-12 w-12 flex-none items-center justify-center rounded-full bg-[#f5f5f5] text-[#0c1014] shadow-lg hover:bg-[#ffffff] sm:flex">
          <ChevronRight size={26} />
        </button>
      </div>
    </div>
  );
}

/** What the story says, in one line, and the action that goes with it. */
function StoryCard({ story, t, lowStock, onAction }: { story: Story; t: (k: string) => string; lowStock: number; onAction: () => void }) {
  const { currency } = useShopSettings();
  const fmtCurrency = (n: number) => `${Math.round(n).toLocaleString()} ${currency}`;
  const fin = useCanSeeFinancials();
  const it = story.item;
  const a = attrs(it);
  const color = LOOK[story.kind].color;
  const Icon = LOOK[story.kind].icon;
  const fill = (k: string, n: number | string) => t(k).replace("{n}", String(n));
  const fines = num(a.penalty_count);
  const specs = [a.plate_no, a.year, a.color].filter(Boolean).join(" · ");
  const { headline, detail, action } = (() => {
    switch (story.kind) {
      case "fines": return {
        headline: fines === 1 ? t("story.fine_one") : fill("story.fines_n", fines),
        detail: num(a.penalty_amount) > 0 && fin ? fmtCurrency(num(a.penalty_amount)) : specs,
        action: { label: t("story.record_fine"), href: `/items?open=${it.id}&do=fines` },
      };
      case "pending": return {
        headline: t("story.pending"), detail: a.buyer_name || specs,
        action: { label: t("story.finish_transfer"), href: `/items?open=${it.id}&do=pending` },
      };
      case "soldOut": return {
        headline: t("story.sold_out"), detail: t("story.sold_out_hint"),
        action: { label: t("purchases.restock"), href: `/items?open=${it.id}&do=stockin` },
      };
      case "low": return {
        headline: fill("story.left", num(it.quantity).toLocaleString()), detail: fill("story.low_hint", lowStock),
        action: { label: t("purchases.restock"), href: `/items?open=${it.id}&do=stockin` },
      };
      case "best": return {
        headline: fill("story.sold_week", num(it.qty_sold).toLocaleString()), detail: fin && it.revenue != null ? fmtCurrency(num(it.revenue)) : "",
        action: { label: t("vehicle.sell"), href: `/sales?new=1&product=${it.id}` },
      };
      default: return {
        headline: num(it.quantity) > 0 ? fill("story.in_stock", num(it.quantity).toLocaleString()) : t("story.sold"),
        detail: it.created_at ? new Date(String(it.created_at)).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "",
        // Added and already sold (a car, say): nothing to sell, only to look at.
        action: num(it.quantity) > 0 ? { label: t("vehicle.sell"), href: `/sales?new=1&product=${it.id}` } : null,
      };
    }
  })();
  const price = it.selling_price;
  return (
    <div className="rounded-xl bg-[#212328]/95 p-3.5 text-white shadow-2xl backdrop-blur">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[15px] font-bold leading-snug">{it.name}</p>
        {price != null && fin && <p className="flex-none text-sm font-semibold text-white/75">{fmtCurrency(num(price))}</p>}
      </div>
      {isCarKind(story.kind) && specs && story.kind === "fines" && <p className="text-xs text-white/60">{specs}</p>}
      <p className="mt-2 flex items-center gap-2 text-lg font-extrabold" style={{ color }}>
        <Icon size={18} strokeWidth={2.4} /> {headline}
      </p>
      {detail && <p className="mt-0.5 text-[12.5px] text-white/65">{detail}</p>}
      <div className="mt-3 flex gap-2">
        {action && <Link href={action.href} onClick={onAction}
          className="flex h-10 flex-[3] items-center justify-center rounded-lg bg-[#0095f6] text-sm font-semibold text-white hover:bg-[#1877f2]">
          {action.label}
        </Link>}
        <Link href={`/items?open=${it.id}`} onClick={onAction}
          className="flex h-10 flex-[2] items-center justify-center rounded-lg bg-[#363636] text-sm font-semibold text-[#fafafa] hover:bg-[#262626]">
          {t("common.view")}
        </Link>
      </div>
    </div>
  );
}
