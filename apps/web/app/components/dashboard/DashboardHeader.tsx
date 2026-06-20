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
  BarChart3, Users, Settings, FileText, ChevronDown, ShieldCheck, Receipt,
} from "lucide-react";

interface DashboardHeaderProps {
  title?: string;
  loading?: boolean;
}

export default function DashboardHeader({
  title = "Higoverse",
  loading = false,
}: DashboardHeaderProps) {
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
    ...(user?.role === "admin" ? [{ key: "nav.admin", href: "/admin", icon: ShieldCheck, active: "bg-red-600 text-white", idle: "text-slate-600 hover:bg-slate-100 border border-red-200" }] : []),
  ];

  return (
    <div className="h-[78px]">
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4">

        {/* TOP BAR */}
        <div className="h-12 flex items-center justify-between">

          {/* LOGO */}
          <Link href="/" className="flex items-center gap-2">
            {loading ? (
              <div className="w-8 h-8 rounded-lg bg-slate-200 animate-pulse" />
            ) : (
              <img src="/higoverse.png" alt="Higoverse" className="w-8 h-8 rounded-lg object-cover" />
            )}
            {loading ? (
              <div className="h-4 w-24 bg-slate-200 animate-pulse rounded" />
            ) : (
              <span className="font-semibold text-sm text-slate-900">{title}</span>
            )}
          </Link>

          {/* RIGHT SIDE */}
          <div className="flex items-center gap-3">

            {/* ONLINE STATUS */}
            <div className="hidden md:flex items-center gap-1.5 text-green-600 text-xs font-medium">
              <Activity size={13} />
              {loading ? (
                <div className="h-3 w-10 bg-slate-200 animate-pulse rounded" />
              ) : (
                t("common.online")
              )}
            </div>

            {/* LANGUAGE SWITCHER */}
            {!loading && (
              <div ref={dropRef} className="relative">
                <button
                  onClick={() => setLangOpen((o) => !o)}
                  className="flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-1.5 transition"
                >
                  <span>{currentLang.flag}</span>
                  <span className="hidden sm:inline">{currentLang.code.toUpperCase()}</span>
                  <ChevronDown size={11} className={`transition-transform ${langOpen ? "rotate-180" : ""}`} />
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

        {/* NAVIGATION */}
        <nav className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-hide">
          {menus.map((menu) => {
            const Icon = menu.icon;
            const active =
              menu.href === "/"
                ? pathname === "/"
                : pathname.startsWith(menu.href);

            if (loading) {
              return (
                <div key={menu.href} className="h-7 w-24 bg-slate-200 animate-pulse rounded-lg mx-1" />
              );
            }

            return (
              <Link
                key={menu.href}
                href={menu.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${active ? menu.active : menu.idle}`}
              >
                <Icon size={14} />
                {t(menu.key)}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
    </div>
  );
}
