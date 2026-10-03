"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { useShop } from "@/lib/shop-context";
import { LANGUAGES } from "@/lib/i18n";
import { settingsRequest } from "@/lib/settings-api";
import { getEffectiveRole } from "@/lib/auth";
import { useCanSeeFinancials } from "@/lib/permissions";
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
  const { lang, setLang, t, layout } = useLanguage();
  const { user, logout, ready } = useAuth();
  const { shop, loading: shopLoading } = useShop();

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
    logout(); // clears this account from the browser and reloads to /login
  }

  const currentLang = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
  void currentLang;

  // Wait for auth (localStorage hydration) before committing to a role.
  // The menu depends on the business type (cars vs shops): wait for the
  // business as well as the user, so the wrong menu never flashes.
  const isResolving = !ready || shopLoading;
  const role        = isResolving ? null : getEffectiveRole(user ?? null);
  const isAdmin     = role === "ADMIN";

  // Regular business menus (everyone with dashboard access) vs. the
  // admin-only item, kept separate so the nav can render a divider between them.
  // Car companies restock from Vehicles (stock in) — no Purchases page.
  // Car companies have no Purchases page, and keep expenses and reports
  // (company finances) from their staff.
  const canSeeFinancials = useCanSeeFinancials();
  const businessMenus: NavItem[] = BUSINESS_MENUS
    .filter((m) => layout !== "car" || m.href !== "/purchases")
    .filter((m) => canSeeFinancials || (m.href !== "/expenses" && m.href !== "/reports"));

  return (
    <>
      <div className="h-[60px]" />

      <header className="fixed top-0 left-0 right-0 z-50 flex h-[60px] items-center justify-between border-b border-border bg-paper px-3 sm:px-4">

        {/* ── LEFT: Logo + mobile hamburger ── */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-press text-text-muted hover:bg-paper-dim md:hidden"
            aria-label={t("nav.open_menu")}
          >
            <Menu size={20} />
          </button>
          <Link href="/" className="flex items-center gap-2.5 transition-opacity duration-200 hover:opacity-80">
            {loading
              ? <div className="h-8 w-8 animate-pulse rounded-press bg-paper-deep" />
              : <img src="/higoverse-logo.png" alt="Higoverse" className="h-8 w-8 rounded-press object-cover" />}
            <span className="hidden font-display text-[17px] font-semibold tracking-tight text-text sm:inline">Higoverse</span>
          </Link>
        </div>

        {/* ── CENTER: Nav (desktop) ── */}
        <nav className="hgv-nav-scroll mx-2 hidden min-w-0 flex-1 items-stretch justify-center-safe overflow-x-auto md:flex">
          {(loading || isResolving) ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="mx-1 my-auto h-8 w-16 flex-shrink-0 animate-pulse rounded-press bg-paper-dim" />
            ))
          ) : (
            <>
              {businessMenus.map((menu) => (
                <NavLink key={menu.href} menu={menu} pathname={pathname} t={t} />
              ))}
              {isAdmin && (
                <>
                  <div aria-hidden="true" className="mx-1 my-auto h-6 w-px flex-shrink-0 bg-border" />
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
              className={`flex items-center gap-2 rounded-press px-2 py-1.5 transition-colors duration-200 ${menuOpen ? "bg-paper-dim" : "hover:bg-paper-dim"}`}
            >
              {loading ? (
                <div className="h-8 w-8 animate-pulse rounded-full bg-paper-deep" />
              ) : shop?.logo_url ? (
                <img src={shop.logo_url} alt={shop.name} className="h-8 w-8 rounded-full border border-border object-cover" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink font-display text-xs font-semibold text-paper">
                  {user?.name?.[0]?.toUpperCase() ?? shop?.name?.[0]?.toUpperCase() ?? "H"}
                </div>
              )}
              <ChevronDown size={14} className={`hidden text-text-muted transition-transform duration-200 sm:block ${menuOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-[300px] overflow-hidden rounded-data border border-border bg-white shadow-[0_16px_40px_-12px_rgb(0_0_0_/_0.3)]">

                {/* ── Profile header ── */}
                <div className="hgv-surface !border-0 !border-b !border-border px-4 pb-5 pt-5">
                  <div className="flex items-center gap-3.5">
                    <div className="relative shrink-0">
                      {shop?.logo_url ? (
                        <img src={shop.logo_url} alt={shop.name} className="h-[52px] w-[52px] rounded-data object-cover ring-2 ring-white/30" />
                      ) : (
                        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-data bg-white/15 font-display text-xl font-semibold text-paper ring-2 ring-white/25">
                          {(user?.name?.[0] ?? shop?.name?.[0] ?? "H").toUpperCase()}
                        </div>
                      )}
                      <span className="absolute -bottom-1 -right-1 h-[14px] w-[14px] rounded-full border-2 border-ink bg-success" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold leading-snug text-paper">
                        {user?.name ?? shop?.name ?? t("common.user")}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-paper/60">{user?.email ?? ""}</p>
                      <div className="mt-2">
                        {isAdmin ? (
                          <span className="hgv-stamp text-[9px] text-accent border-accent/60">
                            {t("nav.admin")}
                          </span>
                        ) : (
                          <span className="hgv-stamp text-[9px] text-paper/85 border-paper/40">
                            {t("common.shop_owner")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Options ── */}
                <div className="p-2">

                  {/* Language */}
                  <div className="flex items-center gap-3 rounded-press px-3 py-2.5 transition-colors duration-200 hover:bg-paper-dim">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-press bg-paper-dim text-text-muted">
                      <Globe size={15} />
                    </div>
                    <span className="text-sm font-medium text-text">{t("settings.language_section")}</span>
                    <div className="relative ml-auto shrink-0">
                      <select
                        value={lang}
                        onChange={(e) => changeLang(e.target.value as typeof lang)}
                        className="cursor-pointer appearance-none rounded-press border-0 bg-paper-dim py-1.5 pl-2 pr-6 text-[11px] font-semibold text-text outline-none transition-colors duration-200 hover:bg-paper-deep"
                      >
                        {LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.flag} {l.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={11} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-text-faint" />
                    </div>
                  </div>

                  {/* Settings — accessible to everyone */}
                  <Link href="/settings" onClick={() => setMenuOpen(false)}
                    className="group flex items-center gap-3 rounded-press px-3 py-2.5 transition-colors duration-200 hover:bg-paper-dim">
                    <div className="flex h-8 w-8 items-center justify-center rounded-press bg-paper-dim text-text-muted transition-colors duration-200 group-hover:bg-paper-deep">
                      <Settings size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text">{t("nav.settings")}</p>
                      <p className="text-[10px] leading-snug text-text-faint">{t("nav.settings_hint")}</p>
                    </div>
                    <ChevronDown size={13} className="ml-auto shrink-0 -rotate-90 text-text-faint transition-colors duration-200 group-hover:text-text-muted" />
                  </Link>
                </div>

                {/* ── Logout ── */}
                <div className="border-t border-border px-2 pb-2 pt-1">
                  <button onClick={handleLogout}
                    className="group flex w-full items-center gap-3 rounded-press px-3 py-2.5 transition-colors duration-200 hover:bg-accent-soft">
                    <div className="flex h-8 w-8 items-center justify-center rounded-press bg-accent-soft text-accent-dark transition-colors duration-200 group-hover:bg-[#f9d6d8]">
                      <LogOut size={15} />
                    </div>
                    <span className="text-sm font-semibold text-accent-dark">{t("common.logout")}</span>
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
          <div className="absolute inset-0 bg-ink-dark/45" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-white shadow-[0_0_40px_-8px_rgb(0_0_0_/_0.4)]">
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <div className="flex items-center gap-2.5">
                <img src="/higoverse-logo.png" alt="Higoverse" className="h-8 w-8 rounded-press object-cover" />
                <span className="font-display text-[16px] font-semibold tracking-tight text-text">Higoverse</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-press text-text-faint hover:bg-paper-dim"
                aria-label={t("nav.close_menu")}
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
                  <div aria-hidden="true" className="my-2 border-t border-border" />
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
  const activeText = isAdminItem ? "text-accent-dark" : "text-ink";
  const underlineColor = isAdminItem ? "bg-accent" : "bg-ink";
  const idleText = "text-text-muted hover:text-text hover:bg-paper-dim";

  return (
    <Link
      href={menu.href}
      onClick={onNavigate}
      className={`relative flex flex-shrink-0 flex-col items-center justify-center gap-0.5 px-2 py-1.5 min-w-[56px] lg:px-3 xl:px-4 transition-colors duration-200 ${
        active ? activeText : idleText
      }`}
    >
      <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
      <span className="hidden whitespace-nowrap text-[10px] font-semibold leading-none md:block">{t(menu.key)}</span>
      {active && <span className={`absolute bottom-0 left-2.5 right-2.5 h-[2px] ${underlineColor}`} />}
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
      className={`flex items-center gap-3 rounded-press px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
        active ? "bg-ink-soft text-ink" : "text-text-muted hover:bg-paper-dim"
      }`}
    >
      <Icon size={18} />
      <span className="flex-1">{t(menu.key)}</span>
    </Link>
  );
}
