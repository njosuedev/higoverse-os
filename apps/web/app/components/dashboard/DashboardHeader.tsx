"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import LogoutButton from "@/app/components/LogoutButton";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { LANGUAGES } from "@/lib/i18n";
import { settingsRequest } from "@/lib/settings-api";
import {
  Home, Package, Truck, ShoppingCart,
  BarChart3, Users, Settings, FileText, ChevronDown,
  ShieldCheck, Receipt, Sparkles, Cog,
} from "lucide-react";

export default function DashboardHeader({ loading = false }: { loading?: boolean }) {
  const pathname = usePathname();
  const { lang, setLang, t } = useLanguage();
  const { user } = useAuth();
  const [langOpen, setLangOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setLangOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  async function changeLang(code: typeof lang) {
    setLang(code);
    setLangOpen(false);
    settingsRequest("/settings", { method: "PUT", body: JSON.stringify({ language: code }) }).catch(() => {});
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
    { key: "nav.advisor",   href: "/advisor",    icon: Sparkles },
    ...(user?.role === "admin"
      ? [{ key: "nav.admin", href: "/admin", icon: ShieldCheck }]
      : []),
  ];

  return (
    <>
      {/* Spacer so page content clears the fixed header */}
      <div className="h-[60px]" />

      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 shadow-sm h-[60px]"
        style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr" }}>

        {/* ── LEFT: Logo ─────────────────────────────── */}
        <div className="flex items-center px-4">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition">
            {loading
              ? <div className="w-8 h-8 rounded-xl bg-slate-200 animate-pulse" />
              : <img src="/higoverse.png" alt="Higoverse" className="w-8 h-8 rounded-xl object-cover" />}
            <span className="font-bold text-[15px] text-slate-900 hidden sm:inline tracking-tight">Higoverse</span>
          </Link>
        </div>

        {/* ── CENTER: Nav tabs — truly centered ──────── */}
        <nav className="flex items-stretch overflow-x-auto scrollbar-hide">
          {menus.map((menu) => {
            const Icon = menu.icon;
            const active = menu.href === "/" ? pathname === "/" : pathname.startsWith(menu.href);
            const isAdmin   = menu.href === "/admin";
            const isAdvisor = menu.href === "/advisor";
            const indicatorColor = isAdmin ? "bg-red-500" : "bg-[#1372e6]";
            const activeText     = isAdmin ? "text-red-600" : "text-[#1372e6]";
            const idleText       = isAdvisor ? "text-[#1372e6]" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50";

            if (loading) {
              return <div key={menu.href} className="w-16 mx-1 my-auto h-8 bg-slate-100 animate-pulse rounded-lg flex-shrink-0" />;
            }

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

        {/* ── RIGHT: Controls ─────────────────────────── */}
        <div className="flex items-center justify-end gap-2 px-4">

          {/* Online pill */}
          <div className="hidden md:flex items-center gap-1.5 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            {loading ? <div className="h-3 w-10 bg-slate-200 animate-pulse rounded" /> : t("common.online")}
          </div>

          {/* Settings */}
          {!loading && (
            <Link href="/settings"
              className={`p-1.5 rounded-lg transition
                ${pathname === "/settings" ? "text-[#1372e6] bg-[#EBF2FD]" : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"}`}>
              <Cog size={18} />
            </Link>
          )}

          {/* Language switcher */}
          {!loading && (
            <div ref={dropRef} className="relative">
              <button onClick={() => setLangOpen((o) => !o)}
                className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-2.5 py-1.5 transition">
                <span>{currentLang.flag}</span>
                <span className="hidden sm:inline">{currentLang.code.toUpperCase()}</span>
                <ChevronDown size={10} className={`transition-transform ${langOpen ? "rotate-180" : ""}`} />
              </button>
              {langOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 min-w-[160px] overflow-hidden">
                  {LANGUAGES.map((l) => (
                    <button key={l.code} onClick={() => changeLang(l.code)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition hover:bg-slate-50
                        ${lang === l.code ? "bg-[#EBF2FD] text-[#1372e6] font-semibold" : "text-slate-700"}`}>
                      <span>{l.flag}</span>
                      <span>{l.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Logout */}
          {loading
            ? <div className="h-8 w-20 bg-slate-200 animate-pulse rounded-lg" />
            : <LogoutButton />}
        </div>

      </header>
    </>
  );
}
