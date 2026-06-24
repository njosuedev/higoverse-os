"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { useShop } from "@/lib/shop-context";
import { LANGUAGES } from "@/lib/i18n";
import { settingsRequest } from "@/lib/settings-api";
import {
  Home, Package, Truck, ShoppingCart, BarChart3,
  Users, FileText, ChevronDown, ShieldCheck, Receipt,
  Sparkles, Settings, LogOut, Moon, Sun, Globe, Wifi, Store,
} from "lucide-react";

function useDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("darkMode") === "true";
    setDark(saved);
    document.documentElement.classList.toggle("dark", saved);
  }, []);
  function toggle() {
    setDark((d) => {
      const next = !d;
      localStorage.setItem("darkMode", String(next));
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  }
  return { dark, toggle };
}

export default function DashboardHeader({ loading = false }: { loading?: boolean }) {
  const pathname   = usePathname();
  const router     = useRouter();
  const { lang, setLang, t } = useLanguage();
  const { user, logout } = useAuth();
  const { shop } = useShop();
  const { dark, toggle: toggleDark } = useDarkMode();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const isVerified = shop?.is_active === true || user?.role === "admin";

  const menus = [
    // Always visible to every logged-in user
    { key: "nav.marketplace", href: "/marketplace", icon: Store,        verified: false },
    // Advisor and all shop management only visible when shop is verified or admin
    { key: "nav.advisor",     href: "/advisor",     icon: Sparkles,     verified: true },
    { key: "nav.home",        href: "/",            icon: Home,         verified: true },
    { key: "nav.items",       href: "/items",       icon: Package,      verified: true },
    { key: "nav.partners",    href: "/partners",    icon: Users,        verified: true },
    { key: "nav.purchases",   href: "/purchases",   icon: Truck,        verified: true },
    { key: "nav.sales",       href: "/sales",       icon: ShoppingCart, verified: true },
    { key: "nav.proforma",    href: "/proforma",    icon: FileText,     verified: true },
    { key: "nav.expenses",    href: "/expenses",    icon: Receipt,      verified: true },
    { key: "nav.reports",     href: "/reports",     icon: BarChart3,    verified: true },
    ...(user?.role === "admin"
      ? [{ key: "nav.admin", href: "/admin", icon: ShieldCheck, verified: false }]
      : []),
  ].filter((m) => !m.verified || isVerified);

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
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="w-16 mx-1 my-auto h-8 bg-slate-100 animate-pulse rounded-lg flex-shrink-0" />
              ))
            : menus.map((menu) => {
                const Icon = menu.icon;
                const active = menu.href === "/" ? pathname === "/" : menu.href === "/marketplace" ? pathname === "/marketplace" || pathname.startsWith("/marketplace/") : pathname.startsWith(menu.href);
                const isAdmin   = menu.href === "/admin";
                const isAdvisor = menu.href === "/advisor";
                const indicatorColor = isAdmin ? "bg-red-500" : "bg-[#1372e6]";
                const activeText     = isAdmin ? "text-red-600" : "text-[#1372e6]";
                const idleText       = isAdvisor
                  ? "text-[#1372e6] hover:bg-slate-50"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50";

                return (
                  <Link key={menu.href} href={menu.href}
                    className={`relative flex flex-col items-center justify-center gap-0.5 px-3 lg:px-4
                      flex-shrink-0 min-w-[56px] transition-colors
                      ${active ? activeText : idleText}`}>
                    <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
                    <span className="text-[10px] font-semibold hidden sm:block leading-none">{t(menu.key)}</span>
                    {active && (
                      <span className={`absolute bottom-0 left-1.5 right-1.5 h-[3px] rounded-t-full ${indicatorColor}`} />
                    )}
                  </Link>
                );
              })}
        </nav>

        {/* ── RIGHT: Open a Shop + settings menu ── */}
        <div className="flex items-center justify-end gap-2 px-4">

          {/* "Open a Shop" — only for non-verified, non-admin accounts */}
          {!loading && !isVerified && user?.role !== "admin" && (
            <Link
              href="/marketplace?apply=1"
              className="hidden sm:flex items-center gap-1.5 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition hover:opacity-90 shrink-0"
              style={{ background: "#ff6a00", whiteSpace: "nowrap" }}
            >
              <Store size={12} /> Open a Shop
            </Link>
          )}

          <div ref={menuRef} className="relative">

            {/* Trigger: shop avatar or gear */}
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
                  {shop?.name?.[0]?.toUpperCase() ?? "H"}
                </div>
              )}
              <ChevronDown size={14} className={`text-slate-500 transition-transform hidden sm:block ${menuOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-[300px] bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden">

                {/* ── Profile header — gradient ── */}
                <div className="bg-gradient-to-br from-[#1372e6] to-[#0a4fb5] px-4 pt-5 pb-5">
                  <div className="flex items-center gap-3.5">
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      {shop?.logo_url ? (
                        <img src={shop.logo_url} alt={shop.name}
                          className="w-[52px] h-[52px] rounded-2xl object-cover ring-2 ring-white/40" />
                      ) : (
                        <div className="w-[52px] h-[52px] rounded-2xl bg-white/20 flex items-center justify-center text-white font-bold text-xl ring-2 ring-white/30">
                          {(user?.name?.[0] ?? shop?.name?.[0] ?? "H").toUpperCase()}
                        </div>
                      )}
                      {/* Online dot */}
                      <span className="absolute -bottom-1 -right-1 w-[14px] h-[14px] bg-green-400 border-2 border-[#1372e6] rounded-full" />
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-white text-[13px] truncate leading-snug">
                        {user?.name ?? shop?.name ?? "User"}
                      </p>
                      <p className="text-white/60 text-[11px] truncate mt-0.5">{user?.email ?? ""}</p>
                      <div className="mt-2">
                        {shop?.is_active ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-green-500/20 text-green-200 border border-green-400/30 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-300 inline-block" />
                            Verified shop
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-white/10 text-white/75 border border-white/20 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                            Pending verification
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Options ── */}
                <div className="p-2">

                  {/* Dark mode */}
                  <button
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
                  </button>

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

                  {/* Settings */}
                  <Link href="/settings" onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition group">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-slate-200 flex items-center justify-center text-slate-500 transition">
                      <Settings size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700">Settings</p>
                      <p className="text-[10px] text-slate-400 leading-snug">Shop, profile &amp; preferences</p>
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
