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
  Activity, LayoutDashboard, Package, Truck, ShoppingCart,
  BarChart3, Users, Settings, FileText, ChevronDown, ShieldCheck, Receipt, Sparkles,
} from "lucide-react";

interface DashboardHeaderProps {
  loading?: boolean;
}

export default function DashboardHeader({
  loading = false,
}: DashboardHeaderProps) {
  const title = "Higoverse";
  const pathname = usePathname();
  const { lang, setLang, t } = useLanguage();
  const { user } = useAuth();
  const [langOpen, setLangOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setLangOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function changeLang(code: typeof lang) {
    setLang(code);
    setLangOpen(false);
    // Persist to settings (best-effort)
    settingsRequest("/settings", { method: "PUT", body: JSON.stringify({ language: code }) }).catch(() => {});
  }

  const currentLang = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  const menus = [
    { key: "nav.home",      href: "/",                   icon: LayoutDashboard, active: "bg-[#1372e6] text-white",  idle: "text-slate-600 hover:bg-slate-100" },
    { key: "nav.items",     href: "/items",     icon: Package,         active: "bg-[#1372e6] text-white",  idle: "text-slate-600 hover:bg-slate-100" },
    { key: "nav.partners",  href: "/partners",  icon: Users,           active: "bg-[#1372e6] text-white", idle: "text-slate-600 hover:bg-slate-100" },
    { key: "nav.purchases", href: "/purchases", icon: Truck,           active: "bg-[#1372e6] text-white", idle: "text-slate-600 hover:bg-slate-100" },
    { key: "nav.sales",     href: "/sales",     icon: ShoppingCart,    active: "bg-[#1372e6] text-white", idle: "text-slate-600 hover:bg-slate-100" },
    { key: "nav.proforma",  href: "/proforma",  icon: FileText,        active: "bg-[#1372e6] text-white", idle: "text-slate-600 hover:bg-slate-100" },
    { key: "nav.expenses",  href: "/expenses",  icon: Receipt,         active: "bg-[#1372e6] text-white", idle: "text-slate-600 hover:bg-slate-100" },
    { key: "nav.reports",   href: "/reports",   icon: BarChart3,       active: "bg-[#1372e6] text-white", idle: "text-slate-600 hover:bg-slate-100" },
    { key: "nav.settings",  href: "/settings",  icon: Settings,        active: "bg-[#1372e6] text-white", idle: "text-slate-600 hover:bg-slate-100" },
    { key: "nav.advisor",   href: "/advisor",   icon: Sparkles,        active: "bg-gradient-to-r from-violet-500 to-purple-600 text-white", idle: "text-violet-600 hover:bg-violet-50 border border-violet-200" },
    ...(user?.role === "admin" ? [{ key: "nav.admin", href: "/admin", icon: ShieldCheck, active: "bg-red-600 text-white", idle: "text-slate-600 hover:bg-slate-100 border border-red-200" }] : []),
  ];

  return (
    <div className="h-[90px]">
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4">

        {/* TOP ROW — logo + actions */}
        <div className="h-[46px] flex items-center justify-between">

          {/* LOGO */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            {loading ? (
              <div className="w-8 h-8 rounded-xl bg-slate-200 animate-pulse" />
            ) : (
              <img src="/higoverse.png" alt="Higoverse" className="w-8 h-8 rounded-xl object-cover" />
            )}
            {loading ? (
              <div className="h-4 w-24 bg-slate-200 animate-pulse rounded" />
            ) : (
              <span className="font-bold text-sm text-slate-900 hidden sm:inline">{title}</span>
            )}
          </Link>

          {/* RIGHT ACTIONS */}
          <div className="flex items-center gap-2">

            {/* ONLINE STATUS */}
            <div className="hidden md:flex items-center gap-1.5 text-xs font-semibold text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {loading ? <div className="h-3 w-10 bg-slate-200 animate-pulse rounded" /> : t("common.online")}
            </div>

            {/* LANGUAGE SWITCHER */}
            {!loading && (
              <div ref={dropRef} className="relative">
                <button
                  onClick={() => setLangOpen((o) => !o)}
                  className="flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-2.5 py-1.5 transition"
                >
                  <span>{currentLang.flag}</span>
                  <span className="hidden sm:inline">{currentLang.code.toUpperCase()}</span>
                  <ChevronDown size={10} className={`transition-transform ${langOpen ? "rotate-180" : ""}`} />
                </button>
                {langOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 min-w-40 overflow-hidden">
                    {LANGUAGES.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => changeLang(l.code)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition hover:bg-slate-50 ${lang === l.code ? "bg-[#EBF2FD] text-[#1372e6] font-semibold" : "text-slate-700"}`}
                      >
                        <span>{l.flag}</span>
                        <span>{l.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* LOGOUT */}
            {loading ? (
              <div className="h-8 w-20 bg-slate-200 animate-pulse rounded-lg" />
            ) : (
              <LogoutButton />
            )}
          </div>
        </div>

        {/* FACEBOOK-STYLE NAV TABS */}
        <nav className="flex items-stretch overflow-x-auto scrollbar-hide">
          {menus.map((menu) => {
            const Icon = menu.icon;
            const active =
              menu.href === "/"
                ? pathname === "/"
                : pathname.startsWith(menu.href);

            const isAdvisor = menu.href === "/advisor";
            const isAdmin   = menu.href === "/admin";

            if (loading) {
              return <div key={menu.href} className="h-[44px] w-20 mx-1 my-auto bg-slate-100 animate-pulse rounded-lg" />;
            }

            const textColor = active
              ? isAdvisor ? "text-violet-600" : isAdmin ? "text-red-600" : "text-[#1372e6]"
              : isAdvisor ? "text-violet-500" : "text-slate-500";

            const hoverBg = active
              ? ""
              : isAdvisor ? "hover:bg-violet-50" : "hover:bg-slate-100";

            const indicatorColor = isAdvisor
              ? "bg-violet-500"
              : isAdmin ? "bg-red-500" : "bg-[#1372e6]";

            return (
              <Link
                key={menu.href}
                href={menu.href}
                className={`relative flex items-center gap-1.5 px-3 sm:px-4 h-[44px] text-xs font-semibold whitespace-nowrap flex-shrink-0 rounded-t-lg transition-colors ${textColor} ${hoverBg}`}
              >
                <Icon size={16} className="flex-shrink-0" />
                <span>{t(menu.key)}</span>

                {/* Active blue underline — the Facebook signature */}
                {active && (
                  <div className={`absolute bottom-0 left-1 right-1 h-[3px] rounded-t-full ${indicatorColor}`} />
                )}
              </Link>
            );
          })}
        </nav>

      </div>
    </header>
    </div>
  );
}
