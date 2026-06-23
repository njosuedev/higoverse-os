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

  const menus = [
    { key: "nav.home",      href: "/",          icon: Home },
    { key: "nav.items",     href: "/items",      icon: Package },
    { key: "nav.partners",  href: "/partners",   icon: Users },
    { key: "nav.purchases", href: "/purchases",  icon: Truck },
    { key: "nav.sales",     href: "/sales",      icon: ShoppingCart },
    { key: "nav.proforma",  href: "/proforma",   icon: FileText },
    { key: "nav.expenses",  href: "/expenses",   icon: Receipt },
    { key: "nav.reports",   href: "/reports",    icon: BarChart3 },
    { key: "nav.marketplace", href: "/marketplace", icon: Store },
    { key: "nav.advisor",   href: "/advisor",    icon: Sparkles },
    ...(user?.role === "admin"
      ? [{ key: "nav.admin", href: "/admin", icon: ShieldCheck }]
      : []),
  ];

  return (
    <>
      <div className="h-[60px]" />

      <header
        className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 shadow-sm h-[60px]"
        style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr" }}
      >

        {/* ── LEFT: Logo ── */}
        <div className="flex items-center px-4">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition">
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
                const active = menu.href === "/" ? pathname === "/" : pathname.startsWith(menu.href);
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

        {/* ── RIGHT: Single settings menu button ── */}
        <div className="flex items-center justify-end px-4">
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
              <div className="absolute right-0 top-full mt-2 w-[280px] bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden">

                {/* Shop identity */}
                <div className="px-4 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    {shop?.logo_url ? (
                      <img src={shop.logo_url} alt={shop.name}
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-[#1372e6] flex items-center justify-center text-white font-bold text-lg">
                        {shop?.name?.[0]?.toUpperCase() ?? "H"}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 text-sm truncate">{shop?.name ?? "My Shop"}</p>
                      <p className="text-xs text-slate-500 truncate">{user?.email ?? ""}</p>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full mt-1">
                        <Wifi size={9} />Online
                      </span>
                    </div>
                  </div>
                </div>

                {/* Config options */}
                <div className="px-2 py-2 space-y-0.5">

                  {/* Dark mode toggle */}
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-50 transition cursor-pointer"
                    onClick={toggleDark}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                        {dark ? <Sun size={16} /> : <Moon size={16} />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{dark ? "Light Mode" : "Dark Mode"}</p>
                        <p className="text-[10px] text-slate-400">{dark ? "Switch to light" : "Switch to dark"}</p>
                      </div>
                    </div>
                    {/* Toggle switch */}
                    <div className={`w-10 h-5 rounded-full transition-colors relative ${dark ? "bg-[#1372e6]" : "bg-slate-300"}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${dark ? "translate-x-5" : "translate-x-0.5"}`} />
                    </div>
                  </div>

                  {/* Language */}
                  <div className="px-3 py-2">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                        <Globe size={16} />
                      </div>
                      <p className="text-sm font-medium text-slate-800">Language</p>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 ml-11">
                      {LANGUAGES.map((l) => (
                        <button key={l.code} onClick={() => changeLang(l.code)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition
                            ${lang === l.code
                              ? "bg-[#EBF2FD] text-[#1372e6] border border-[#1372e6]/20"
                              : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>
                          <span>{l.flag}</span>
                          <span>{l.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Settings page link */}
                  <Link href="/settings" onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                      <Settings size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">Settings</p>
                      <p className="text-[10px] text-slate-400">Shop, profile &amp; preferences</p>
                    </div>
                  </Link>
                </div>

                {/* Logout */}
                <div className="px-2 py-2 border-t border-slate-100">
                  <button onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-50 transition group">
                    <div className="w-8 h-8 rounded-lg bg-red-50 group-hover:bg-red-100 flex items-center justify-center text-red-500 transition">
                      <LogOut size={16} />
                    </div>
                    <p className="text-sm font-medium text-red-600">Log Out</p>
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
