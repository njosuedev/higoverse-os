"use client";

// Search everything from one box, like WhatsApp Desktop's search (Ctrl+F
// there; here Ctrl+K anywhere, and Ctrl+F too inside the desktop app):
// pages and actions and people at once, then products / vehicles, sales and
// customers from the server as you type. ↑ ↓ to move, Enter to open, Esc to
// close. The desktop app's menu (Edit → Search) opens it too.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3, Car, CornerDownLeft, FileText, Home, MessageCircle, Package, Plus, Receipt, Search, Settings, ShoppingCart, Truck, User, Users, X,
} from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { useCanSeeFinancials } from "@/lib/permissions";
import { itemRequest } from "@/lib/product-api";
import { saleRequest } from "@/lib/sale-api";
import { partnerRequest } from "@/lib/supplier-api";
import { useChat } from "@/lib/chat";

interface Hit { key: string; group: string; title: string; sub?: string; icon: typeof Home; href: string }

export const OPEN_SEARCH_EVENT = "hgv:search";

export default function GlobalSearch() {
  const { t, layout } = useLanguage();
  const isCar = layout === "car";
  const fin = useCanSeeFinancials();
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

  // Ctrl+K (and Ctrl+F in the desktop app), or the header button / desktop menu.
  useEffect(() => {
    const desktop = "higoverseDesktop" in window;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === "k" || (desktop && k === "f"))) { e.preventDefault(); setOpen(true); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(OPEN_SEARCH_EVENT, onOpen); };
  }, []);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 10); }, [open]);
  const close = () => { setOpen(false); setQ(""); setActive(0); };

  // Pages and actions: what this business can do, by name.
  const actions: Hit[] = useMemo(() => [
    { key: "a-sale", group: "search.actions", title: t("search.new_sale"), icon: Plus, href: "/sales?new=1" },
    { key: "a-item", group: "search.actions", title: t(isCar ? "search.new_vehicle" : "search.new_product"), icon: Plus, href: "/items?add=1" },
    { key: "p-home", group: "search.pages", title: t("nav.dashboard"), icon: Home, href: "/" },
    { key: "p-items", group: "search.pages", title: t("nav.inventory"), icon: isCar ? Car : Package, href: "/items" },
    { key: "p-sales", group: "search.pages", title: t("nav.sales"), icon: ShoppingCart, href: "/sales" },
    { key: "p-msg", group: "search.pages", title: t("nav.messages"), icon: MessageCircle, href: "/messages" },
    { key: "p-team", group: "search.pages", title: t("team.title"), icon: Users, href: "/team" },
    { key: "p-partners", group: "search.pages", title: t("nav.partners"), icon: Users, href: "/partners" },
    ...(!isCar ? [{ key: "p-pur", group: "search.pages", title: t("nav.purchases"), icon: Truck, href: "/purchases" }] : []),
    { key: "p-pf", group: "search.pages", title: t("nav.proforma"), icon: FileText, href: "/sales?tab=proforma" },
    ...(fin ? [
      { key: "p-exp", group: "search.pages", title: t("nav.expenses"), icon: Receipt, href: "/expenses" },
      { key: "p-rep", group: "search.pages", title: t("nav.reports"), icon: BarChart3, href: "/reports" },
    ] : []),
    { key: "p-set", group: "search.pages", title: t("nav.settings"), icon: Settings, href: "/settings" },
  ], [t, isCar, fin]);

  const needle = q.trim().toLowerCase();
  const local: Hit[] = useMemo(() => {
    const people = chat.members.filter((m) => m.id !== chat.me && (!needle || m.name.toLowerCase().includes(needle)))
      .slice(0, 5)
      .map((m) => ({ key: `u-${m.id}`, group: "search.people", title: m.name, sub: t(`role.${m.role}`), icon: User, href: `/messages?with=${m.id}` }));
    const acts = actions.filter((a) => !needle || a.title.toLowerCase().includes(needle)).slice(0, needle ? 6 : 8);
    return [...acts, ...people];
  }, [actions, chat.members, chat.me, needle, t]);

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
        const [items, sales] = await Promise.all([
          itemRequest(`/products?q=${encodeURIComponent(needle)}&limit=6&page=1`).catch(() => null),
          saleRequest(`/sales?q=${encodeURIComponent(needle)}&limit=5&page=1`).catch(() => null),
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
        setRemote({ q: needle, hits: [...it, ...sl, ...cu] });
      } finally {
        if (alive) setLoading(false);
      }
    }, 220);
    return () => { alive = false; clearTimeout(timer); };
  }, [needle, isCar, t]);

  const hits = useMemo(() => [...local, ...(needle && remote.q === needle ? remote.hits : [])], [local, remote, needle]);

  const go = useCallback((h: Hit) => { setOpen(false); setQ(""); setActive(0); router.push(h.href); }, [router]);

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={t("search.title")}
      className="fixed inset-0 z-[160] flex items-start justify-center bg-black/40 p-4 pt-[10vh]" onClick={close}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
          {loading && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-ink" />}
          <button type="button" onClick={close} aria-label={t("common.close")}
            className="shrink-0 rounded-full p-1.5 text-text-faint hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-2">
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
        <div className="flex items-center gap-4 border-t border-slate-100 px-4 py-2 text-[11px] text-text-faint">
          <span><kbd className="font-sans font-semibold">↑ ↓</kbd> {t("search.move")}</span>
          <span><kbd className="font-sans font-semibold">Enter</kbd> {t("search.open")}</span>
          <span><kbd className="font-sans font-semibold">Esc</kbd> {t("common.close")}</span>
        </div>
      </div>
    </div>
  );
}
