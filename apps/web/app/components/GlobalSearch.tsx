"use client";

// Search everything from one box, like WhatsApp Desktop's search (Ctrl+F
// there; here Ctrl+K anywhere, and Ctrl+F too inside the desktop app):
// pages and actions and people at once, then products / vehicles, sales,
// proformas, customers and who owes money from the server as you type.
// ↑ ↓ to move, Enter to open, Esc to close. The desktop app's menu (Edit →
// Search) opens it too. An empty box shows recent searches; where the
// browser can read barcodes (Chrome on Android), the camera button finds a
// product by its barcode. On a phone it fills the screen, as in the app.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  BarChart3, Car, CornerDownLeft, FileText, Home, MessageCircle, Package, Plus, Receipt, Search, Settings, ShoppingCart, Truck, User, Users, HandCoins, X,
  History, ScanBarcode, Wallet, CalendarCheck,
} from "lucide-react";
import { listProformas } from "@/lib/proforma-api";
import { useAuth } from "@/lib/auth-context";
import { PAYROLL_ROLES } from "@/lib/payroll-api";
import { useLanguage } from "@/lib/language-context";
import { useCanSeeFinancials, useCanUseExpenses } from "@/lib/permissions";
import { itemRequest } from "@/lib/product-api";
import { saleRequest } from "@/lib/sale-api";
import { partnerRequest } from "@/lib/supplier-api";
import { useChat } from "@/lib/chat";

interface Hit { key: string; group: string; title: string; sub?: string; icon: typeof Home; href: string; query?: string }

// The last searches on this device, newest first (as the app keeps them).
const RECENT_KEY = "hgv_recent_searches";
function readRecent(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; }
  catch { return []; }
}
function remember(q: string) {
  const v = q.trim();
  if (!v) return;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([v, ...readRecent().filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 8))); }
  catch { /* private mode: not remembered */ }
}

/** Reads one barcode with the camera (BarcodeDetector), or null. */
type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
const canScan = () => typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;

export const OPEN_SEARCH_EVENT = "hgv:search";

export default function GlobalSearch() {
  const { t, layout } = useLanguage();
  const isCar = layout === "car";
  const fin = useCanSeeFinancials();
  const expenses = useCanUseExpenses();
  const { user } = useAuth();
  const payroll = PAYROLL_ROLES.includes(user?.role ?? "");
  const router = useRouter();
  const chat = useChat();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  // Server results, for the text they were found for.
  const [remote, setRemote] = useState<{ q: string; hits: Hit[] }>({ q: "", hits: [] });
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const customers = useRef<{ id: string; name: string; phone?: string }[] | null>(null);
  const debts = useRef<{ id: string; debtor_name: string; phone?: string; balance?: number; is_paid?: boolean }[] | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);

  // Ctrl+K (and Ctrl+F in the desktop app), or the header button / desktop menu.
  useEffect(() => {
    const desktop = "higoverseDesktop" in window;
    const onKey = (e: KeyboardEvent) => {
      // Autofill (a saved email or password picked) sends key events without a key.
      const k = (e.key ?? "").toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === "k" || (desktop && k === "f"))) { e.preventDefault(); setOpen(true); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(OPEN_SEARCH_EVENT, onOpen); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => { setRecent(readRecent()); input.current?.focus(); }, 10);
    return () => clearTimeout(id);
  }, [open]);
  const close = () => { setOpen(false); setQ(""); setActive(0); };

  // Pages and actions: what this business can do, by name.
  const actions: Hit[] = useMemo(() => [
    { key: "a-sale", group: "search.actions", title: t("search.new_sale"), icon: Plus, href: "/sales?new=1" },
    { key: "a-item", group: "search.actions", title: t(isCar ? "search.new_vehicle" : "search.new_product"), icon: Plus, href: "/items?add=1" },
    ...(expenses ? [{ key: "a-exp", group: "search.actions", title: t("form.new_expense"), icon: Plus, href: "/expenses?new=1" }] : []),
    { key: "a-debt", group: "search.actions", title: t("form.new_debt"), icon: Plus, href: "/sales?debt=new" },
    { key: "a-pf", group: "search.actions", title: t("pf.new"), icon: Plus, href: "/sales?proforma=new" },
    { key: "p-home", group: "search.pages", title: t("nav.dashboard"), icon: Home, href: "/" },
    { key: "p-items", group: "search.pages", title: t("nav.inventory"), icon: isCar ? Car : Package, href: "/items" },
    { key: "p-sales", group: "search.pages", title: t("nav.sales"), icon: ShoppingCart, href: "/sales" },
    ...(isCar ? [{ key: "p-msg", group: "search.pages", title: t("nav.messages"), icon: MessageCircle, href: "/messages" }] : []),
    { key: "p-team", group: "search.pages", title: t("team.title"), icon: Users, href: "/team" },
    { key: "p-partners", group: "search.pages", title: t("nav.partners"), icon: Users, href: "/partners" },
    ...(!isCar ? [{ key: "p-pur", group: "search.pages", title: t("nav.purchases"), icon: Truck, href: "/purchases" }] : []),
    { key: "p-pf", group: "search.pages", title: t("nav.proforma"), icon: FileText, href: "/sales?tab=proforma" },
    ...(payroll ? [
      { key: "p-att", group: "search.pages", title: t("nav.attendance"), icon: CalendarCheck, href: "/attendance" },
      { key: "p-pay", group: "search.pages", title: t("nav.payroll"), icon: HandCoins, href: "/payroll" },
    ] : []),
    ...(fin ? [
      { key: "p-exp", group: "search.pages", title: t("nav.expenses"), icon: Receipt, href: "/expenses" },
      { key: "p-rep", group: "search.pages", title: t("nav.reports"), icon: BarChart3, href: "/reports" },
    ] : []),
    { key: "p-set", group: "search.pages", title: t("nav.settings"), icon: Settings, href: "/settings" },
  ], [t, isCar, fin, payroll]);

  const needle = q.trim().toLowerCase();
  const local: Hit[] = useMemo(() => {
    // Teammates open a conversation: car companies only (shops have no Messages).
    const people = !isCar ? [] : chat.members.filter((m) => m.id !== chat.me && (!needle || m.name.toLowerCase().includes(needle)))
      .slice(0, 5)
      .map((m) => ({ key: `u-${m.id}`, group: "search.people", title: m.name, sub: t(`role.${m.role}`), icon: User, href: `/messages?with=${m.id}` }));
    const acts = actions.filter((a) => !needle || a.title.toLowerCase().includes(needle)).slice(0, needle ? 6 : 8);
    // Nothing typed yet: recent searches first.
    const past = needle ? [] : recent.map((r) => ({ key: `r-${r}`, group: "search.recent", title: r, icon: History, href: "", query: r }));
    return [...past, ...acts, ...people];
  }, [actions, chat.members, chat.me, needle, t, recent, isCar]);

  // From the server, a moment after typing stops.
  useEffect(() => {
    if (!needle) return;
    let alive = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        if (customers.current === null) {
          const r = await partnerRequest("/suppliers?limit=200").catch(() => null);
          const all = (r?.data?.items || r?.data || []) as { id: string; name: string; phone?: string; address?: string }[];
          customers.current = all.filter((c) => !c.address?.startsWith("TIN:"));
        }
        if (debts.current === null) {
          const r = await saleRequest("/debts").catch(() => null);
          debts.current = (r?.data?.items ?? []) as NonNullable<typeof debts.current>;
        }
        const [items, sales, proformas] = await Promise.all([
          itemRequest(`/products?q=${encodeURIComponent(needle)}&limit=6&page=1`).catch(() => null),
          saleRequest(`/sales?q=${encodeURIComponent(needle)}&limit=5&page=1`).catch(() => null),
          listProformas({ search: needle, limit: 5, page: 1 }).catch(() => null),
        ]);
        if (!alive) return;
        const it = ((items?.data?.items ?? []) as { id: string; name: string; quantity: number }[]).map((p) => ({
          key: `i-${p.id}`, group: isCar ? "search.vehicles" : "search.products", title: p.name,
          sub: t("search.in_stock").replace("{n}", String(p.quantity)), icon: isCar ? Car : Package, href: `/items?open=${p.id}`,
        }));
        const sl = ((sales?.data?.items ?? []) as { id: string; product_name?: string; quantity: number; created_at?: string }[]).map((s) => ({
          key: `s-${s.id}`, group: "search.sales", title: s.product_name || t("nav.sales"),
          sub: `${s.quantity} · ${s.created_at ? new Date(s.created_at).toLocaleDateString() : ""}`, icon: ShoppingCart, href: "/sales",
        }));
        const cu = (customers.current ?? []).filter((c) => `${c.name} ${c.phone ?? ""}`.toLowerCase().includes(needle)).slice(0, 5).map((c) => ({
          key: `c-${c.id}`, group: "search.customers", title: c.name, sub: c.phone, icon: Users, href: "/partners",
        }));
        const pf = (proformas?.items ?? []).map((p) => ({
          key: `p-${p.id}`, group: "pf.title", title: p.invoice_no, sub: p.customer || t("pf.no_customer"), icon: FileText, href: "/sales?tab=proforma",
        }));
        const owe = (debts.current ?? []).filter((d) => !d.is_paid && `${d.debtor_name} ${d.phone ?? ""}`.toLowerCase().includes(needle)).slice(0, 5).map((d) => ({
          key: `d-${d.id}`, group: "debts.title", title: d.debtor_name, sub: d.phone, icon: Wallet, href: "/sales?view=debts",
        }));
        setRemote({ q: needle, hits: [...it, ...sl, ...pf, ...cu, ...owe] });
      } finally {
        if (alive) setLoading(false);
      }
    }, 220);
    return () => { alive = false; clearTimeout(timer); };
  }, [needle, isCar, t]);

  const hits = useMemo(() => [...local, ...(needle && remote.q === needle ? remote.hits : [])], [local, remote, needle]);

  const go = useCallback((h: Hit) => {
    // A recent search fills the box again.
    if (h.query) { setQ(h.query); setActive(0); input.current?.focus(); return; }
    remember(q);
    setOpen(false); setQ(""); setActive(0); router.push(h.href);
  }, [router, q]);

  async function scan() {
    setScanning(true);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const video = document.createElement("video");
      video.srcObject = stream; video.playsInline = true; video.muted = true;
      await video.play();
      const Ctor = (window as unknown as { BarcodeDetector: new () => Detector }).BarcodeDetector;
      const detector = new Ctor();
      // Up to 15 seconds of looking.
      for (let i = 0; i < 75; i++) {
        const found = await detector.detect(video).catch(() => []);
        const code = found.find((b) => b.rawValue?.trim())?.rawValue.trim();
        if (code) { setQ(code); setActive(0); remember(code); break; }
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch { /* no camera or refused: nothing to do */ }
    finally {
      stream?.getTracks().forEach((tr) => tr.stop());
      setScanning(false);
    }
  }

  if (!open) return null;
  // Drawn on the page itself, above everything (the phone's tab bar too).
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t("search.title")}
      className="fixed inset-0 z-[160] flex items-start justify-center bg-black/40 md:p-4 md:pt-[10vh]" onClick={close}>
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-white pt-[env(safe-area-inset-top)] shadow-2xl md:h-auto md:max-w-xl md:rounded-2xl md:pt-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Search size={18} className="shrink-0 text-text-faint" />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder={t(isCar ? "search.placeholder_car" : "search.placeholder")}
            className="hgv-bare h-14 w-full border-0 bg-transparent text-[15px] text-text outline-none placeholder:text-text-faint"
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (e.key === "Enter" && hits[active]) { e.preventDefault(); go(hits[active]); }
            }} />
          {(loading || scanning) && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-ink" />}
          {canScan() && (
            <button type="button" onClick={scan} disabled={scanning} aria-label={t("search.scan")} title={t("search.scan")}
              className="shrink-0 rounded-full p-1.5 text-text-muted hover:bg-slate-100 disabled:opacity-40"><ScanBarcode size={18} /></button>
          )}
          <button type="button" onClick={close} aria-label={t("common.close")}
            className="shrink-0 rounded-full p-1.5 text-text-faint hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto py-2 md:max-h-[60dvh] md:flex-none">
          {hits.length === 0 && !loading && (
            <p className="px-5 py-8 text-center text-sm text-text-faint">{t("search.nothing").replace("{q}", q.trim())}</p>
          )}
          {hits.map((h, i) => {
            const header = i === 0 || hits[i - 1].group !== h.group ? (
              <p key={`g-${h.group}`} className="px-5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-text-faint">{t(h.group)}</p>
            ) : null;
            const Icon = h.icon;
            return (
              <div key={h.key}>
                {header}
                <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(h)}
                  className={`mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-lg px-3 py-2 text-left ${i === active ? "bg-slate-100" : "hover:bg-slate-100"}`}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper-dim text-ink"><Icon size={16} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-text">{h.title}</span>
                    {h.sub && <span className="block truncate text-xs text-text-faint">{h.sub}</span>}
                  </span>
                  {i === active && <CornerDownLeft size={14} className="shrink-0 text-text-faint" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="hidden items-center gap-4 border-t border-slate-100 px-4 py-2 text-[11px] text-text-faint md:flex">
          <span><kbd className="font-sans font-semibold">↑ ↓</kbd> {t("search.move")}</span>
          <span><kbd className="font-sans font-semibold">Enter</kbd> {t("search.open")}</span>
          <span><kbd className="font-sans font-semibold">Esc</kbd> {t("common.close")}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
