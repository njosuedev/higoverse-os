"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { useShop } from "@/lib/shop-context";
import { LANGUAGES } from "@/lib/i18n";
import { settingsRequest } from "@/lib/settings-api";
import { getEffectiveRole } from "@/lib/auth";
import {
  Home, Package, Truck, ShoppingCart, BarChart3,
  Users, FileText, ChevronDown, ShieldCheck, Receipt,
  Settings, LogOut, Globe,
  Menu, X,
} from "lucide-react";

type NavItem = { key: string; href: string; icon: typeof Home };

// Business-owner IA, in the specific order requested by the shop owner.
// Settings lives in the account menu only, not the primary nav. Admin is
// visually separated (see the divider in the render below) since it's a
// distinct, privileged section rather than a regular business menu.
const BUSINESS_MENUS: NavItem[] = [
  { key: "nav.dashboard", href: "/",          icon: Home         },
  { key: "nav.inventory", href: "/items",     icon: Package      },
  { key: "nav.purchases", href: "/purchases", icon: Truck        },
  { key: "nav.partners",  href: "/partners",  icon: Users        },
  { key: "nav.sales",     href: "/sales",     icon: ShoppingCart },
  { key: "nav.proforma",  href: "/proforma",  icon: FileText     },
  { key: "nav.expenses",  href: "/expenses",  icon: Receipt      },
  { key: "nav.reports",   href: "/reports",   icon: BarChart3    },
];
const ADMIN_ITEM: NavItem = { key: "nav.admin", href: "/admin", icon: ShieldCheck };

function isActiveHref(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export default function DashboardHeader({ loading = false }: { loading?: boolean }) {
  const pathname   = usePathname();
  const router     = useRouter();
  const { lang, setLang, t } = useLanguage();
  const { user, logout, ready } = useAuth();
  const { shop } = useShop();

  const [menuOpen, setMenuOpen]         = useState(false);
  const [mobileOpen, setMobileOpen]     = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  // Close transient UI whenever the route changes
  useEffect(() => {
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

  const currentLang = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
  void currentLang;

  // Wait for auth (localStorage hydration) before committing to a role.
  const isResolving = !ready;
  const role        = isResolving ? null : getEffectiveRole(user ?? null);
  const isAdmin     = role === "ADMIN";

  // Regular business menus (everyone with dashboard access) vs. the
  // admin-only item, kept separate so the nav can render a divider between them.
  const businessMenus: NavItem[] = BUSINESS_MENUS;

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
              : <img src="/logo.png" alt="Higoverse" className="h-8 w-8 rounded-xl object-cover" />}
            <span className="hidden text-[15px] font-bold tracking-tight text-slate-900 sm:inline">Higoverse</span>
          </Link>
        </div>

        {/* ── CENTER: Nav (desktop) ── */}
        <nav className="hidden flex-1 items-stretch justify-center md:flex">
          {(loading || isResolving) ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="mx-1 my-auto h-8 w-16 flex-shrink-0 animate-pulse rounded-lg bg-slate-100" />
            ))
          ) : (
            <>
              {businessMenus.map((menu) => (
                <NavLink key={menu.href} menu={menu} pathname={pathname} t={t} />
              ))}
              {isAdmin && (
                <>
                  <div aria-hidden="true" className="mx-1 my-auto h-6 w-px flex-shrink-0 bg-slate-200" />
                  <NavLink menu={ADMIN_ITEM} pathname={pathname} t={t} />
                </>
              )}
            </>
          )}
        </nav>

        {/* ── RIGHT: account menu ── */}
        <div className="flex items-center justify-end gap-2">

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
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-green-400/30 bg-green-500/20 px-2 py-0.5 text-[10px] font-bold text-green-200">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-300" />
                            Shop Owner
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Options ── */}
                <div className="p-2">

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
                      <p className="text-sm font-medium text-slate-700">Settings</p>
                      <p className="text-[10px] leading-snug text-slate-400">Shop, profile & preferences</p>
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
                <img src="/logo.png" alt="Higoverse" className="h-8 w-8 rounded-xl object-cover" />
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
              {businessMenus.map((menu) => (
                <MobileLink key={menu.href} menu={menu} pathname={pathname} t={t} onNavigate={() => setMobileOpen(false)} />
              ))}
              {isAdmin && (
                <>
                  <div aria-hidden="true" className="my-2 border-t border-slate-100" />
                  <MobileLink menu={ADMIN_ITEM} pathname={pathname} t={t} onNavigate={() => setMobileOpen(false)} />
                </>
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

function NavLink({
  menu,
  pathname,
  t,
  onNavigate,
}: {
  menu: NavItem;
  pathname: string;
  t: (key: string) => string;
  onNavigate?: () => void;
}) {
  const Icon = menu.icon;
  const active = isActiveHref(pathname, menu.href);
  const isAdminItem = menu.href === "/admin";
  const indicatorColor = isAdminItem ? "bg-red-500" : "bg-blue-600";
  const activeText = isAdminItem ? "text-red-600" : "text-blue-600";
  const idleText = "text-slate-600 hover:text-slate-900 hover:bg-slate-50";

  return (
    <Link
      href={menu.href}
      onClick={onNavigate}
      className={`relative flex flex-shrink-0 flex-col items-center justify-center gap-0.5 px-3 py-1.5 min-w-[56px] lg:px-4 transition-colors ${
        active ? activeText : idleText
      }`}
    >
      <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
      <span className="hidden text-[10px] font-semibold leading-none md:block">{t(menu.key)}</span>
      {active && <span className={`absolute bottom-0 left-1.5 right-1.5 h-[3px] rounded-t-full ${indicatorColor}`} />}
    </Link>
  );
}

function MobileLink({
  menu,
  pathname,
  t,
  onNavigate,
}: {
  menu: NavItem;
  pathname: string;
  t: (key: string) => string;
  onNavigate?: () => void;
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
    </Link>
  );
}
