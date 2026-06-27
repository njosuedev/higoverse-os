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
  Sparkles, Settings, LogOut, Moon, Sun, Globe, Store,
  Bell, MessageSquare,
} from "lucide-react";

function useDarkMode() {
  const pathname = usePathname();
  const isMarketplace = pathname === "/marketplace" || pathname.startsWith("/marketplace/");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("darkMode") === "true";
    setDark(saved);
    // Marketplace is always light-mode — never apply dark class there
    document.documentElement.classList.toggle("dark", saved && !isMarketplace);
  }, [isMarketplace]);

  function toggle() {
    setDark((d) => {
      const next = !d;
      localStorage.setItem("darkMode", String(next));
      // Only apply to document when NOT on marketplace
      if (!isMarketplace) {
        document.documentElement.classList.toggle("dark", next);
      }
      return next;
    });
  }
  return { dark, toggle, isMarketplace };
}

const CUSTOMER_MENUS = [
  { key: "nav.marketplace",   href: "/marketplace",   icon: Store          },
  { key: "nav.notifications", href: "/notifications", icon: Bell           },
  { key: "nav.messages",      href: "/messages",      icon: MessageSquare  },
];

const OWNER_MENUS = [
  { key: "nav.home",       href: "/",           icon: Home         },
  { key: "nav.items",      href: "/items",       icon: Package      },
  { key: "nav.partners",   href: "/partners",    icon: Users        },
  { key: "nav.purchases",  href: "/purchases",   icon: Truck        },
  { key: "nav.sales",      href: "/sales",       icon: ShoppingCart },
  { key: "nav.expenses",   href: "/expenses",    icon: Receipt      },
  { key: "nav.reports",    href: "/reports",     icon: BarChart3    },
  { key: "nav.proforma",   href: "/proforma",    icon: FileText     },
  { key: "nav.advisor",    href: "/advisor",     icon: Sparkles     },
  { key: "nav.marketplace",href: "/marketplace", icon: Store        },
  { key: "nav.messages",   href: "/messages",    icon: MessageSquare},
];

const ADMIN_MENUS = [
  ...OWNER_MENUS,
  { key: "nav.admin", href: "/admin", icon: ShieldCheck },
];

export default function DashboardHeader({ loading = false }: { loading?: boolean }) {
  const pathname   = usePathname();
  const router     = useRouter();
  const { lang, setLang, t } = useLanguage();
  const { user, logout, ready } = useAuth();
  const { shop, loading: shopLoading } = useShop();
  const { dark, toggle: toggleDark, isMarketplace } = useDarkMode();

  const [menuOpen, setMenuOpen]         = useState(false);
  const [unreadMsgs, setUnreadMsgs]     = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

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
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  async function changeLang(code: typeof lang) {
    setLang(code);
    settingsRequest("/settings", { method: "PUT", body: JSON.stringify({ language: code }) }).catch(() => {});
  }

  function handleLogout() {
    setMenuOpen(false);
    logout();
    router.replace("/login");
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

  const menus = isAdmin ? ADMIN_MENUS : isShopOwner ? OWNER_MENUS : CUSTOMER_MENUS;

  return (
    <>
      <div className="h-[60px]" />

      <header
        className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 shadow-sm h-[60px]"
        style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr" }}
      >

        {/* ── LEFT: Logo ── */}
        <div className="flex items-center px-4">
          <Link href="/marketplace" className="flex items-center gap-2.5 hover:opacity-80 transition">
            {loading
              ? <div className="w-8 h-8 rounded-xl bg-slate-200 animate-pulse" />
              : <img src="/higoverse.png" alt="Higoverse" className="w-8 h-8 rounded-xl object-cover" />}
            <span className="font-bold text-[15px] text-slate-900 hidden sm:inline tracking-tight">Higoverse</span>
          </Link>
        </div>

        {/* ── CENTER: Nav tabs ── */}
        <nav className="flex items-stretch overflow-x-auto scrollbar-hide">
          {(loading || isResolving)
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="w-16 mx-1 my-auto h-8 bg-slate-100 animate-pulse rounded-lg flex-shrink-0" />
              ))
            : menus.map((menu) => {
                const Icon = menu.icon;
                const active = menu.href === "/"
                  ? pathname === "/"
                  : menu.href === "/marketplace"
                  ? pathname === "/marketplace" || pathname.startsWith("/marketplace/")
                  : pathname.startsWith(menu.href);
                const isAdminItem  = menu.href === "/admin";
                const isAdvisor    = menu.href === "/advisor";
                const indicatorColor = isAdminItem ? "bg-red-500" : "bg-[#1372e6]";
                const activeText     = isAdminItem ? "text-red-600" : "text-[#1372e6]";
                const idleText       = isAdvisor
                  ? "text-[#1372e6] hover:bg-slate-50"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50";

                const badge =
                  menu.href === "/notifications" ? unreadNotifs :
                  menu.href === "/messages"      ? unreadMsgs   : 0;

                return (
                  <Link key={menu.href} href={menu.href}
                    onClick={() => {
                      if (menu.href === "/notifications") setUnreadNotifs(0);
                      if (menu.href === "/messages")      setUnreadMsgs(0);
                    }}
                    className={`relative flex flex-col items-center justify-center gap-0.5 px-3 lg:px-4
                      flex-shrink-0 min-w-[56px] transition-colors
                      ${active ? activeText : idleText}`}>
                    <span className="relative">
                      <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
                      {badge > 0 && (
                        <span className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center leading-none">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] font-semibold hidden sm:block leading-none">{t(menu.key)}</span>
                    {active && (
                      <span className={`absolute bottom-0 left-1.5 right-1.5 h-[3px] rounded-t-full ${indicatorColor}`} />
                    )}
                  </Link>
                );
              })}
        </nav>

        {/* ── RIGHT: CTA + settings menu ── */}
        <div className="flex items-center justify-end gap-2 px-4">

          {/* "Create Shop" — only for CUSTOMER accounts (fully resolved) */}
          {!loading && !isResolving && isCustomer && (
            <Link
              href="/marketplace?apply=1"
              className="hidden sm:flex items-center gap-1.5 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition hover:opacity-90 shrink-0"
              style={{ background: "#ff6a00", whiteSpace: "nowrap" }}
            >
              <Store size={12} /> Create Shop
            </Link>
          )}

          {/* Role badge for customers */}
          {!loading && !isResolving && isCustomer && (
            <span className="hidden md:flex items-center gap-1 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
              Customer
            </span>
          )}

          <div ref={menuRef} className="relative">

            {/* Trigger */}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-xl transition
                ${menuOpen ? "bg-slate-100" : "hover:bg-slate-100"}`}
            >
              {loading ? (
                <div className="w-8 h-8 rounded-full bg-slate-200 animate-pulse" />
              ) : shop?.logo_url ? (
                <img src={shop.logo_url} alt={shop.name}
                  className="w-8 h-8 rounded-full object-cover border border-slate-200" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#1372e6] flex items-center justify-center text-white text-xs font-bold">
                  {user?.name?.[0]?.toUpperCase() ?? shop?.name?.[0]?.toUpperCase() ?? "H"}
                </div>
              )}
              <ChevronDown size={14} className={`text-slate-500 transition-transform hidden sm:block ${menuOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-[300px] bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden">

                {/* ── Profile header ── */}
                <div className="bg-gradient-to-br from-[#1372e6] to-[#0a4fb5] px-4 pt-5 pb-5">
                  <div className="flex items-center gap-3.5">
                    <div className="relative shrink-0">
                      {shop?.logo_url ? (
                        <img src={shop.logo_url} alt={shop.name}
                          className="w-[52px] h-[52px] rounded-2xl object-cover ring-2 ring-white/40" />
                      ) : (
                        <div className="w-[52px] h-[52px] rounded-2xl bg-white/20 flex items-center justify-center text-white font-bold text-xl ring-2 ring-white/30">
                          {(user?.name?.[0] ?? shop?.name?.[0] ?? "H").toUpperCase()}
                        </div>
                      )}
                      <span className="absolute -bottom-1 -right-1 w-[14px] h-[14px] bg-green-400 border-2 border-[#1372e6] rounded-full" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-white text-[13px] truncate leading-snug">
                        {user?.name ?? shop?.name ?? "User"}
                      </p>
                      <p className="text-white/60 text-[11px] truncate mt-0.5">{user?.email ?? ""}</p>
                      <div className="mt-2">
                        {isAdmin ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-500/20 text-red-200 border border-red-400/30 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-300 inline-block" />
                            Admin
                          </span>
                        ) : isShopOwner ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-green-500/20 text-green-200 border border-green-400/30 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-300 inline-block" />
                            Shop Owner
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-500/20 text-amber-200 border border-amber-400/30 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
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
                    <Link href="/marketplace?apply=1" onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-orange-50 transition group mb-1">
                      <div className="w-8 h-8 rounded-lg bg-orange-50 group-hover:bg-orange-100 flex items-center justify-center transition"
                        style={{ color: "#ff6a00" }}>
                        <Store size={15} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700">Create a Shop</p>
                        <p className="text-[10px] text-slate-400 leading-snug">Apply for shop dashboard access</p>
                      </div>
                    </Link>
                  )}

                  {/* Dark mode — hidden on marketplace (not supported there) */}
                  {!isMarketplace && <button
                    onClick={toggleDark}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-50 transition group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition
                        ${dark ? "bg-slate-900 text-amber-400" : "bg-slate-100 text-slate-500"}`}>
                        {dark ? <Sun size={15} /> : <Moon size={15} />}
                      </div>
                      <span className="text-sm font-medium text-slate-700">{dark ? "Light Mode" : "Dark Mode"}</span>
                    </div>
                    <div className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${dark ? "bg-[#1372e6]" : "bg-slate-200"}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200 ${dark ? "left-4" : "left-0.5"}`} />
                    </div>
                  </button>}

                  {/* Language */}
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                      <Globe size={15} />
                    </div>
                    <span className="text-sm font-medium text-slate-700">Language</span>
                    <div className="ml-auto relative shrink-0">
                      <select
                        value={lang}
                        onChange={(e) => changeLang(e.target.value as typeof lang)}
                        className="appearance-none bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg pl-2 pr-6 py-1.5 cursor-pointer outline-none transition border-0"
                      >
                        {LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.flag} {l.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Settings — accessible to everyone */}
                  <Link href="/settings" onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition group">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-slate-200 flex items-center justify-center text-slate-500 transition">
                      <Settings size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700">
                        {isCustomer ? "Account & Profile" : "Settings"}
                      </p>
                      <p className="text-[10px] text-slate-400 leading-snug">
                        {isCustomer ? "Password and account preferences" : "Shop, profile & preferences"}
                      </p>
                    </div>
                    <ChevronDown size={13} className="ml-auto -rotate-90 text-slate-300 group-hover:text-slate-400 transition shrink-0" />
                  </Link>
                </div>

                {/* ── Logout ── */}
                <div className="px-2 pb-2 pt-1 border-t border-slate-100">
                  <button onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-50 transition group">
                    <div className="w-8 h-8 rounded-lg bg-red-50 group-hover:bg-red-100 flex items-center justify-center text-red-400 transition">
                      <LogOut size={15} />
                    </div>
                    <span className="text-sm font-semibold text-red-500 group-hover:text-red-600 transition">Log Out</span>
                  </button>
                </div>

              </div>
            )}
          </div>
        </div>

      </header>
    </>
  );
}
