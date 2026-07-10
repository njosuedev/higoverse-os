"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { useShop } from "@/lib/shop-context";
import { LANGUAGES } from "@/lib/i18n";
import { settingsRequest } from "@/lib/settings-api";
import { getEffectiveRole } from "@/lib/auth";
import { getUnreadCount, openMessageStream } from "@/lib/messages-api";
import { getUnreadNotifCount, openNotifStream } from "@/lib/notifications-api";
import {
  Home, Package, Truck, ShoppingCart, BarChart3,
  Users, FileText, ChevronDown, ShieldCheck, Receipt,
  Sparkles, Settings, LogOut, Globe, Store,
  Bell, MessageSquare, Menu, X, ClipboardList,
} from "lucide-react";

type NavItem = { key: string; href: string; icon: typeof Home };

const CUSTOMER_MENUS: NavItem[] = [
  { key: "nav.marketplace",   href: "/",              icon: Store          },
  { key: "nav.notifications", href: "/notifications", icon: Bell           },
  { key: "nav.messages",      href: "/messages",      icon: MessageSquare  },
];

// Business-owner IA: Dashboard, Inventory, Sales, Finance▾, Marketplace, AI Advisor, More▾
// Marketplace is now the public site at "/" — Dashboard lives at "/dashboard".
const OWNER_PRIMARY: NavItem[] = [
  { key: "nav.dashboard", href: "/dashboard", icon: Home         },
  { key: "nav.inventory", href: "/items",     icon: Package      },
  { key: "nav.sales",     href: "/sales",     icon: ShoppingCart },
];
const FINANCE_MENUS: NavItem[] = [
  { key: "nav.purchases", href: "/purchases", icon: Truck     },
  { key: "nav.expenses",  href: "/expenses",  icon: Receipt   },
  { key: "nav.reports",   href: "/reports",   icon: BarChart3 },
  { key: "nav.partners",  href: "/partners",  icon: Users     },
];
const OWNER_TRAILING: NavItem[] = [
  { key: "nav.marketplace", href: "/",           icon: Store    },
  { key: "nav.advisor",     href: "/advisor",    icon: Sparkles },
];
const MORE_MENUS_BASE: NavItem[] = [
  { key: "nav.messages", href: "/messages", icon: MessageSquare },
  { key: "nav.proforma", href: "/proforma", icon: FileText      },
  { key: "nav.settings", href: "/settings", icon: Settings      },
];
const ADMIN_ITEM: NavItem = { key: "nav.admin", href: "/admin", icon: ShieldCheck };
const ORDERS_ITEM: NavItem = { key: "nav.orders", href: "/orders-admin", icon: ClipboardList };

function isActiveHref(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export default function DashboardHeader({ loading = false }: { loading?: boolean }) {
  const pathname   = usePathname();
  const router     = useRouter();
  const { lang, setLang, t } = useLanguage();
  const { user, logout, ready } = useAuth();
  const { shop, loading: shopLoading } = useShop();

  const [menuOpen, setMenuOpen]         = useState(false);
  const [openDropdown, setOpenDropdown] = useState<"finance" | "more" | null>(null);
  const [mobileOpen, setMobileOpen]     = useState(false);
  const [mobileFinanceOpen, setMobileFinanceOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen]       = useState(false);
  const [unreadMsgs, setUnreadMsgs]     = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const navRef  = useRef<HTMLDivElement>(null);

  // Derived early so effects below can use it as a dependency
  const isShopOwnerEarly = !!shop?.is_active && getEffectiveRole(user ?? null, true) === "SHOP_OWNER";

  // ── Sounds ─────────────────────────────────────────────────────────────────
  function playNotifSound() {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      // Single rising note for notifications
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
      setTimeout(() => ctx.close(), 800);
    } catch { /* AudioContext unavailable */ }
  }

  function playMsgSound() {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      // Two-note ping for messages (same as chat page)
      ([[ 587.3, 0, 0.13 ], [ 783.9, 0.09, 0.18 ]] as const).forEach(([freq, when, dur]) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine"; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + when);
        gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + when + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + dur);
        osc.start(ctx.currentTime + when); osc.stop(ctx.currentTime + when + dur);
      });
      setTimeout(() => ctx.close(), 1000);
    } catch { /* AudioContext unavailable */ }
  }

  // ── Load initial badge counts ───────────────────────────────────────────────
  const refreshBadges = useCallback(async () => {
    try { setUnreadMsgs(await getUnreadCount()); } catch { /* silent */ }
    try { setUnreadNotifs(await getUnreadNotifCount()); } catch { /* silent */ }
  }, []);

  // Initial load + 60s catch-up poll (SSE handles real-time)
  useEffect(() => {
    if (!user) return;
    refreshBadges();
    const t = setInterval(refreshBadges, 60_000);
    return () => clearInterval(t);
  }, [user, refreshBadges]);

  // ── Notification SSE — real-time bell badge + sound ────────────────────────
  useEffect(() => {
    if (!user) return;
    const ctrl = openNotifStream(
      (evt) => {
        if (evt.type === "new_notification") {
          setUnreadNotifs((n) => n + 1);
          playNotifSound();
        }
      },
      () => { /* SSE unavailable — 60s poll handles recovery */ },
    );
    return () => ctrl.abort();
  }, [user]);

  // ── Request browser notification permission once (all users) ─────────────
  useEffect(() => {
    if (!user) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [user]);

  // Clear badge automatically when the user is on the messages page
  useEffect(() => {
    if (pathname === "/messages") setUnreadMsgs(0);
  }, [pathname]);

  // ── Message SSE — real-time message badge + sound + browser notification ───
  useEffect(() => {
    if (!user) return;
    const ctrl = openMessageStream(
      (evt) => {
        if (evt.type !== "new_message") return;

        // Only increment badge when not already on messages page
        if (pathname !== "/messages") {
          setUnreadMsgs((n) => n + 1);
        }

        playMsgSound();

        // Browser notification for everyone — always show so the user knows
        if (evt.message) {
          const senderName = evt.message.sender_name ?? (isShopOwnerEarly ? "a customer" : "a shop");
          const title  = `New message from ${senderName}`;
          const body   = evt.message.content.slice(0, 120);
          const convId = evt.conversation_id;

          if ("Notification" in window && Notification.permission === "granted") {
            const notif = new Notification(title, {
              body,
              icon: "/higoverse.png",
              tag:  convId ?? "msg",
              requireInteraction: false,
            });
            if (convId) {
              notif.onclick = () => {
                window.focus();
                router.push(`/messages?conv=${convId}`);
                notif.close();
              };
            }
          }
        }
      },
      () => { /* SSE unavailable — 60s poll handles recovery */ },
    );
    return () => ctrl.abort();
  }, [user, isShopOwnerEarly, router, pathname]);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenDropdown(null);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  // Close transient UI whenever the route changes
  useEffect(() => {
    setOpenDropdown(null);
    setMobileOpen(false);
  }, [pathname]);

  async function changeLang(code: typeof lang) {
    setLang(code);
    settingsRequest("/settings", { method: "PUT", body: JSON.stringify({ language: code }) }).catch(() => {});
  }

  function handleLogout() {
    setMenuOpen(false);
    logout();
    router.replace("/login");
  }

  function clearBadge(href: string) {
    if (href === "/notifications") setUnreadNotifs(0);
    if (href === "/messages") setUnreadMsgs(0);
  }

  function badgeFor(href: string) {
    return href === "/notifications" ? unreadNotifs : href === "/messages" ? unreadMsgs : 0;
  }

  const currentLang = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
  void currentLang;

  // Wait for both auth (localStorage hydration) AND shop fetch before committing to a role.
  // This prevents the flash where a shop owner briefly sees customer menus on hard refresh.
  const isResolving = !ready || shopLoading;
  const role        = isResolving ? null : getEffectiveRole(user ?? null, shop?.is_active === true);
  const isAdmin     = role === "ADMIN";
  const isShopOwner = role === "SHOP_OWNER";
  const isCustomer  = role === "CUSTOMER";

  const isBusinessNav = isAdmin || isShopOwner;
  const moreMenus = isAdmin ? [...MORE_MENUS_BASE, ORDERS_ITEM, ADMIN_ITEM] : MORE_MENUS_BASE;

  // Flat list used for the mobile drawer and badge bookkeeping
  const flatMenus: NavItem[] = isBusinessNav
    ? [...OWNER_PRIMARY, ...FINANCE_MENUS, ...OWNER_TRAILING, ...moreMenus]
    : CUSTOMER_MENUS;

  function NavLink({ menu, compact = false }: { menu: NavItem; compact?: boolean }) {
    const Icon = menu.icon;
    const active = isActiveHref(pathname, menu.href);
    const isAdminItem = menu.href === "/admin";
    const indicatorColor = isAdminItem ? "bg-red-500" : "bg-blue-600";
    const activeText = isAdminItem ? "text-red-600" : "text-blue-600";
    const isAdvisor = menu.href === "/advisor";
    const idleText = isAdvisor ? "text-blue-600 hover:bg-slate-50" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50";
    const badge = badgeFor(menu.href);

    return (
      <Link
        href={menu.href}
        onClick={() => clearBadge(menu.href)}
        className={`relative flex flex-shrink-0 flex-col items-center justify-center gap-0.5 px-3 py-1.5 transition-colors ${
          compact ? "" : "min-w-[56px] lg:px-4"
        } ${active ? activeText : idleText}`}
      >
        <span className="relative">
          <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
          {badge > 0 && (
            <span className="absolute -top-1 -right-1.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-black leading-none text-white">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </span>
        <span className="hidden text-[10px] font-semibold leading-none md:block">{t(menu.key)}</span>
        {active && <span className={`absolute bottom-0 left-1.5 right-1.5 h-[3px] rounded-t-full ${indicatorColor}`} />}
      </Link>
    );
  }

  function GroupTrigger({
    label,
    icon: Icon,
    items,
    id,
  }: {
    label: string;
    icon: typeof Home;
    items: NavItem[];
    id: "finance" | "more";
  }) {
    const active = items.some((m) => isActiveHref(pathname, m.href));
    const open = openDropdown === id;
    const totalBadge = items.reduce((sum, m) => sum + badgeFor(m.href), 0);

    return (
      <div className="relative flex-shrink-0">
        <button
          type="button"
          onClick={() => setOpenDropdown((cur) => (cur === id ? null : id))}
          className={`relative flex h-full flex-col items-center justify-center gap-0.5 px-3 py-1.5 transition-colors lg:px-4 ${
            active ? "text-blue-600" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <span className="relative flex items-center gap-0.5">
            <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
            <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
            {totalBadge > 0 && (
              <span className="absolute -top-1.5 -right-1 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-black leading-none text-white">
                {totalBadge > 99 ? "99+" : totalBadge}
              </span>
            )}
          </span>
          <span className="hidden text-[10px] font-semibold leading-none md:block">{label}</span>
          {active && <span className="absolute bottom-0 left-1.5 right-1.5 h-[3px] rounded-t-full bg-blue-600" />}
        </button>

        {open && (
          <div className="absolute left-1/2 top-full mt-2 w-52 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl z-50">
            {items.map((menu) => {
              const Icon2 = menu.icon;
              const itemActive = isActiveHref(pathname, menu.href);
              const badge = badgeFor(menu.href);
              return (
                <Link
                  key={menu.href}
                  href={menu.href}
                  onClick={() => {
                    clearBadge(menu.href);
                    setOpenDropdown(null);
                  }}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    itemActive ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon2 size={16} />
                  <span className="flex-1">{t(menu.key)}</span>
                  {badge > 0 && (
                    <span className="flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black leading-none text-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="h-[60px]" />

      <header className="fixed top-0 left-0 right-0 z-50 flex h-[60px] items-center justify-between border-b border-slate-200 bg-white shadow-sm px-3 sm:px-4">

        {/* ── LEFT: Logo + mobile hamburger ── */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 md:hidden"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <Link href="/" className="flex items-center gap-2.5 transition hover:opacity-80">
            {loading
              ? <div className="h-8 w-8 animate-pulse rounded-xl bg-slate-200" />
              : <img src="/higoverse.png" alt="Higoverse" className="h-8 w-8 rounded-xl object-cover" />}
            <span className="hidden text-[15px] font-bold tracking-tight text-slate-900 sm:inline">Higoverse</span>
          </Link>
        </div>

        {/* ── CENTER: Nav (desktop) ── */}
        <nav ref={navRef} className="hidden flex-1 items-stretch justify-center md:flex">
          {(loading || isResolving) ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="mx-1 my-auto h-8 w-16 flex-shrink-0 animate-pulse rounded-lg bg-slate-100" />
            ))
          ) : isBusinessNav ? (
            <>
              {OWNER_PRIMARY.map((menu) => <NavLink key={menu.href} menu={menu} />)}
              <GroupTrigger label={t("nav.finance")} icon={BarChart3} items={FINANCE_MENUS} id="finance" />
              {OWNER_TRAILING.map((menu) => <NavLink key={menu.href} menu={menu} />)}
              <GroupTrigger label={t("nav.more")} icon={Menu} items={moreMenus} id="more" />
            </>
          ) : (
            CUSTOMER_MENUS.map((menu) => <NavLink key={menu.href} menu={menu} />)
          )}
        </nav>

        {/* ── RIGHT: CTA + account menu ── */}
        <div className="flex items-center justify-end gap-2">

          {/* "Create Shop" — only for CUSTOMER accounts (fully resolved) */}
          {!loading && !isResolving && isCustomer && (
            <Link
              href="/?apply=1"
              className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-orange-600 sm:flex"
            >
              <Store size={12} /> Create Shop
            </Link>
          )}

          {/* Role badge for customers */}
          {!loading && !isResolving && isCustomer && (
            <span className="hidden shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 md:flex">
              Customer
            </span>
          )}

          <div ref={menuRef} className="relative">

            {/* Trigger */}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className={`flex items-center gap-2 rounded-xl px-2 py-1.5 transition ${menuOpen ? "bg-slate-100" : "hover:bg-slate-100"}`}
            >
              {loading ? (
                <div className="h-8 w-8 animate-pulse rounded-full bg-slate-200" />
              ) : shop?.logo_url ? (
                <img src={shop.logo_url} alt={shop.name} className="h-8 w-8 rounded-full border border-slate-200 object-cover" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {user?.name?.[0]?.toUpperCase() ?? shop?.name?.[0]?.toUpperCase() ?? "H"}
                </div>
              )}
              <ChevronDown size={14} className={`hidden text-slate-500 transition-transform sm:block ${menuOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-[300px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">

                {/* ── Profile header ── */}
                <div className="bg-gradient-to-br from-blue-600 to-blue-800 px-4 pb-5 pt-5">
                  <div className="flex items-center gap-3.5">
                    <div className="relative shrink-0">
                      {shop?.logo_url ? (
                        <img src={shop.logo_url} alt={shop.name} className="h-[52px] w-[52px] rounded-2xl object-cover ring-2 ring-white/40" />
                      ) : (
                        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-white/20 text-xl font-bold text-white ring-2 ring-white/30">
                          {(user?.name?.[0] ?? shop?.name?.[0] ?? "H").toUpperCase()}
                        </div>
                      )}
                      <span className="absolute -bottom-1 -right-1 h-[14px] w-[14px] rounded-full border-2 border-blue-600 bg-green-400" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold leading-snug text-white">
                        {user?.name ?? shop?.name ?? "User"}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-white/60">{user?.email ?? ""}</p>
                      <div className="mt-2">
                        {isAdmin ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-400/30 bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-200">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-300" />
                            Admin
                          </span>
                        ) : isShopOwner ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-green-400/30 bg-green-500/20 px-2 py-0.5 text-[10px] font-bold text-green-200">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-300" />
                            Shop Owner
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                            Customer
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Options ── */}
                <div className="p-2">

                  {/* Create Shop — customer shortcut */}
                  {isCustomer && (
                    <Link href="/?apply=1" onClick={() => setMenuOpen(false)}
                      className="group mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-orange-50">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-500 transition group-hover:bg-orange-100">
                        <Store size={15} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700">Create a Shop</p>
                        <p className="text-[10px] leading-snug text-slate-400">Apply for shop dashboard access</p>
                      </div>
                    </Link>
                  )}

                  {/* Language */}
                  <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <Globe size={15} />
                    </div>
                    <span className="text-sm font-medium text-slate-700">Language</span>
                    <div className="relative ml-auto shrink-0">
                      <select
                        value={lang}
                        onChange={(e) => changeLang(e.target.value as typeof lang)}
                        className="cursor-pointer appearance-none rounded-lg border-0 bg-slate-100 py-1.5 pl-2 pr-6 text-[11px] font-semibold text-slate-700 outline-none transition hover:bg-slate-200"
                      >
                        {LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.flag} {l.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={11} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                  </div>

                  {/* Settings — accessible to everyone */}
                  <Link href="/settings" onClick={() => setMenuOpen(false)}
                    className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-slate-200">
                      <Settings size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700">
                        {isCustomer ? "Account & Profile" : "Settings"}
                      </p>
                      <p className="text-[10px] leading-snug text-slate-400">
                        {isCustomer ? "Password and account preferences" : "Shop, profile & preferences"}
                      </p>
                    </div>
                    <ChevronDown size={13} className="ml-auto shrink-0 -rotate-90 text-slate-300 transition group-hover:text-slate-400" />
                  </Link>
                </div>

                {/* ── Logout ── */}
                <div className="border-t border-slate-100 px-2 pb-2 pt-1">
                  <button onClick={handleLogout}
                    className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-red-50">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-400 transition group-hover:bg-red-100">
                      <LogOut size={15} />
                    </div>
                    <span className="text-sm font-semibold text-red-500 transition group-hover:text-red-600">Log Out</span>
                  </button>
                </div>

              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Mobile drawer ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
              <div className="flex items-center gap-2.5">
                <img src="/higoverse.png" alt="Higoverse" className="h-8 w-8 rounded-xl object-cover" />
                <span className="text-[15px] font-bold tracking-tight text-slate-900">Higoverse</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="flex-1 space-y-1 p-3">
              {isBusinessNav ? (
                <>
                  {OWNER_PRIMARY.map((menu) => (
                    <MobileLink key={menu.href} menu={menu} pathname={pathname} t={t} badge={badgeFor(menu.href)} onNavigate={() => { clearBadge(menu.href); setMobileOpen(false); }} />
                  ))}

                  <button
                    type="button"
                    onClick={() => setMobileFinanceOpen((o) => !o)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <BarChart3 size={18} />
                    <span className="flex-1 text-left">{t("nav.finance")}</span>
                    <ChevronDown size={14} className={`transition-transform ${mobileFinanceOpen ? "rotate-180" : ""}`} />
                  </button>
                  {mobileFinanceOpen && (
                    <div className="ml-4 space-y-1 border-l border-slate-100 pl-3">
                      {FINANCE_MENUS.map((menu) => (
                        <MobileLink key={menu.href} menu={menu} pathname={pathname} t={t} badge={badgeFor(menu.href)} onNavigate={() => { clearBadge(menu.href); setMobileOpen(false); }} />
                      ))}
                    </div>
                  )}

                  {OWNER_TRAILING.map((menu) => (
                    <MobileLink key={menu.href} menu={menu} pathname={pathname} t={t} badge={badgeFor(menu.href)} onNavigate={() => { clearBadge(menu.href); setMobileOpen(false); }} />
                  ))}

                  <button
                    type="button"
                    onClick={() => setMobileMoreOpen((o) => !o)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Menu size={18} />
                    <span className="flex-1 text-left">{t("nav.more")}</span>
                    <ChevronDown size={14} className={`transition-transform ${mobileMoreOpen ? "rotate-180" : ""}`} />
                  </button>
                  {mobileMoreOpen && (
                    <div className="ml-4 space-y-1 border-l border-slate-100 pl-3">
                      {moreMenus.map((menu) => (
                        <MobileLink key={menu.href} menu={menu} pathname={pathname} t={t} badge={badgeFor(menu.href)} onNavigate={() => { clearBadge(menu.href); setMobileOpen(false); }} />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                flatMenus.map((menu) => (
                  <MobileLink key={menu.href} menu={menu} pathname={pathname} t={t} badge={badgeFor(menu.href)} onNavigate={() => { clearBadge(menu.href); setMobileOpen(false); }} />
                ))
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

function MobileLink({
  menu,
  pathname,
  t,
  badge,
  onNavigate,
}: {
  menu: NavItem;
  pathname: string;
  t: (key: string) => string;
  badge: number;
  onNavigate: () => void;
}) {
  const Icon = menu.icon;
  const active = isActiveHref(pathname, menu.href);
  return (
    <Link
      href={menu.href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
        active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      <Icon size={18} />
      <span className="flex-1">{t(menu.key)}</span>
      {badge > 0 && (
        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black leading-none text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}
