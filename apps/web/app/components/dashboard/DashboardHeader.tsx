"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { useShop } from "@/lib/shop-context";
import { useAppTheme, useThemePref } from "@/lib/theme";
import { LANGUAGES } from "@/lib/i18n";
import { settingsRequest } from "@/lib/settings-api";
import { useCanSeeFinancials, useCanUseExpenses } from "@/lib/permissions";
import { Sun, Moon, Monitor,
  Home, Package, Truck, ShoppingCart, BarChart3,
  Users, ChevronDown, Receipt,
  Settings, LogOut, Globe,
  MessageCircle, Search, UsersRound, HandCoins, CalendarCheck,
} from "lucide-react";
import {
  House, Package as PackageTab, Car, ChatCircleDots, Receipt as ReceiptTab, Storefront, type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { PAYROLL_ROLES } from "@/lib/payroll-api";
import GlobalSearch, { OPEN_SEARCH_EVENT } from "@/app/components/GlobalSearch";
import NotificationBell from "@/app/components/dashboard/NotificationBell";
import { startChat, unreadTotal, useChat } from "@/lib/chat";
import { LiveSheet, QuickAddButton, useLiveSheet } from "@/app/components/mobile/TopBarExtras";
import AdminChrome from "@/app/components/admin/AdminChrome";

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
  { key: "nav.messages",  href: "/messages",  icon: MessageCircle },
  { key: "nav.expenses",  href: "/expenses",  icon: Receipt      },
  { key: "nav.reports",   href: "/reports",   icon: BarChart3    },
  { key: "nav.payroll",   href: "/payroll",   icon: HandCoins    },
];

function isActiveHref(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export default function DashboardHeader({ loading = false }: { loading?: boolean }) {
  const pathname   = usePathname();
  const { lang, setLang, t, layout } = useLanguage();
  useAppTheme();
  const [themePref, setThemePref] = useThemePref();
  const { user, logout, ready } = useAuth();
  const { shop, loading: shopLoading } = useShop();

  const [menuOpen, setMenuOpen]         = useState(false);
  const chat = useChat();
  const unread = unreadTotal(chat);
  const liveSheet = useLiveSheet();
  // Printing the page itself (Reports): always on white, whatever the theme.
  useEffect(() => {
    const root = document.documentElement;
    let was: string | undefined;
    const before = () => { was = root.dataset.theme; root.dataset.theme = "light"; };
    const after = () => { if (was) root.dataset.theme = was; };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);
  // Messages: keys, team and live unread counts once signed in to a business.
  // Car companies only: shops have no Messages.
  useEffect(() => { if (ready && user?.shop_id && layout === "car") void startChat(); }, [ready, user?.shop_id, layout]);
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
    logout(); // clears this account from the browser and reloads to /login
  }

  const currentLang = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
  void currentLang;

  // Wait for auth (localStorage hydration) before committing to a role.
  // The menu depends on the business type (cars vs shops): wait for the
  // business as well as the user, so the wrong menu never flashes.
  const isResolving = !ready || shopLoading;

  // Regular business menus (everyone with dashboard access) vs. the
  // admin-only item, kept separate so the nav can render a divider between them.
  // Car companies restock from Vehicles (stock in) — no Purchases page.
  // Car companies have no Purchases page, and keep expenses and reports
  // (company finances) from their staff.
  const canSeeFinancials = useCanSeeFinancials();
  const canUseExpenses = useCanUseExpenses();
  // The platform admin gets a frame of their own: no business menus at all.
  // Known as soon as the user is (an admin has no business to wait for).
  if (ready && user?.role === "admin") return <AdminChrome />;
  /** The logo: Home, or the top of Home when already there (as on Facebook). */
  const goHome = (e: React.MouseEvent) => {
    if (pathname !== "/") return;
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const businessMenus: NavItem[] = BUSINESS_MENUS
    .filter((m) => layout !== "car" || m.href !== "/purchases")
    // Messages and Stories are for car companies only.
    .filter((m) => layout === "car" || m.href !== "/messages")
    .filter((m) => m.href !== "/reports" || canSeeFinancials)
    .filter((m) => m.href !== "/expenses" || canUseExpenses)
    // Payroll: the owner, managers and the accountant.
    .filter((m) => m.href !== "/payroll" || PAYROLL_ROLES.includes(user?.role ?? ""));

  // Tablets and computers: Home, Vehicles / Inventory, Customers / Partners
  // and Sales across the top; everything else down the sidebar.
  const topMenus = businessMenus.filter((m) => TOP_HREFS.includes(m.href));
  const sideMenus = businessMenus.filter((m) => !TOP_HREFS.includes(m.href));

  return (
    <>
      {/* Room for the bar below, the phone's notch / status bar included. */}
      <div className="hgv-no-print h-[calc(52px+env(safe-area-inset-top))]" />

      <header className="hgv-no-print fixed top-0 left-0 right-0 z-50 flex h-[calc(52px+env(safe-area-inset-top))] items-center justify-between border-b border-border bg-paper pt-[env(safe-area-inset-top)] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:pl-[max(1rem,env(safe-area-inset-left))] sm:pr-[max(1rem,env(safe-area-inset-right))]">

        {/* ── LEFT: Logo (on phones the menu opens from the bottom bar). On
            computers it is as wide as the sidebar, whose edge it continues. ── */}
        <div className="flex items-center gap-1 self-stretch lg:w-[calc(var(--hgv-aside)-max(1rem,env(safe-area-inset-left)))] lg:shrink-0 lg:border-r lg:border-border">
          {/* The logo and name lead Home — or back to its top when already there. */}
          {/* On phones, holding the logo shows the live connection and who is online. */}
          <Link href="/" {...liveSheet.handlers} onClick={(e) => { if (!liveSheet.swallowed(e)) goHome(e); }}
            aria-label={t("nav.home")} className="flex items-center gap-2.5 rounded-press transition-opacity duration-200 hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink [-webkit-touch-callout:none]">
            {loading
              ? <div className="hgv-shimmer h-8 w-8 rounded-press" aria-hidden="true" />
              : <img src="/higoverse-logo.png" alt="Higoverse" draggable={false} className="h-8 w-8 rounded-press object-cover" />}
            <span className="text-[23px] font-black leading-none tracking-[-0.8px] text-ink md:font-display md:text-[17px] md:font-semibold md:tracking-tight md:text-text">Higoverse</span>
          </Link>
        </div>

        {/* ── Tablets and computers: the four main pages across the top (the
            rest are in the sidebar; phones use the tab bar) ── */}
        <nav aria-label={t("nav.home")} className="mx-2 hidden min-w-0 flex-1 items-stretch justify-center gap-1 self-stretch md:flex">
          {(loading || isResolving)
            ? Array.from({ length: TOP_HREFS.length }).map((_, i) => (
                <div key={i} aria-hidden="true" className="flex min-w-[72px] flex-col items-center justify-center gap-1.5 px-3">
                  <div className="hgv-shimmer h-[18px] w-[18px] rounded-md" />
                  <div className="hgv-shimmer h-2 w-12 rounded" />
                </div>
              ))
            : topMenus.map((menu) => <TopLink key={menu.href} menu={menu} pathname={pathname} t={t} />)}
        </nav>

        {/* ── RIGHT: search and account menu ── */}
        <div className="flex items-center justify-end gap-2">
          {/* Phones: "+" creates anything (new sale, product, expense…). */}
          <QuickAddButton />
          {/* Search: a quiet, rounded field (the full search opens over the page). */}
          <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
            title={t("search.hint")} aria-label={t("search.hint")}
            className="group flex h-11 w-11 items-center justify-center gap-2 rounded-full border border-transparent bg-paper-dim text-text transition-colors duration-200 hover:border-border-strong hover:text-text-muted md:h-9 md:w-auto md:justify-start md:px-2.5 md:text-text-faint lg:w-56 lg:px-3.5 xl:w-64">
            <Search size={16} className="h-[22px] w-[22px] shrink-0 md:h-4 md:w-4" />
            <span className="hidden flex-1 truncate text-left text-sm lg:inline">{t("search.short")}</span>
            <kbd className="hidden rounded-md border border-border bg-white px-1.5 py-0.5 font-sans text-[10px] font-semibold text-text-faint lg:inline">Ctrl K</kbd>
          </button>
          <GlobalSearch />
          {user?.shop_id && <NotificationBell />}

          <div ref={menuRef} className="relative hidden md:block">

            {/* Trigger */}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className={`flex items-center gap-2 rounded-press px-2 py-1.5 transition-colors duration-200 ${menuOpen ? "bg-paper-dim" : "hover:bg-paper-dim"}`}
            >
              {loading ? (
                <div className="hgv-shimmer h-8 w-8 rounded-full" aria-hidden="true" />
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
                        <span className="hgv-stamp text-[11px] text-paper/85 border-paper/40">
                          {t("common.shop_owner")}
                        </span>
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

                  {/* Appearance — System / Light / Dark (this device) */}
                  <div className="flex items-center gap-3 rounded-press px-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-press bg-paper-dim text-text-muted">
                      {themePref === "dark" ? <Moon size={15} /> : themePref === "light" ? <Sun size={15} /> : <Monitor size={15} />}
                    </div>
                    <span className="text-sm font-medium text-text">{t("theme.appearance")}</span>
                    <div role="radiogroup" aria-label={t("theme.appearance")} className="ml-auto flex shrink-0 rounded-press bg-paper-dim p-0.5">
                      {(["system", "light", "dark"] as const).map((p) => (
                        <button key={p} type="button" role="radio" aria-checked={themePref === p} title={t(`theme.${p}`)}
                          onClick={() => setThemePref(p)}
                          className={`rounded-[6px] px-2 py-1 text-[11px] font-semibold transition-colors duration-200 ${themePref === p ? "bg-white text-text shadow-sm" : "text-text-muted hover:text-text"}`}>
                          {t(`theme.${p}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Team — the owner adds up to 3 employees; everyone sees who's in it */}
                  <Link href="/team" onClick={() => setMenuOpen(false)}
                    className="group flex items-center gap-3 rounded-press px-3 py-2.5 transition-colors duration-200 hover:bg-paper-dim">
                    <div className="flex h-8 w-8 items-center justify-center rounded-press bg-paper-dim text-text-muted transition-colors duration-200 group-hover:bg-paper-deep">
                      <UsersRound size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text">{t("team.title")}</p>
                    </div>
                  </Link>

                  {/* Settings — accessible to everyone */}
                  <Link href="/settings" onClick={() => setMenuOpen(false)}
                    className="group flex items-center gap-3 rounded-press px-3 py-2.5 transition-colors duration-200 hover:bg-paper-dim">
                    <div className="flex h-8 w-8 items-center justify-center rounded-press bg-paper-dim text-text-muted transition-colors duration-200 group-hover:bg-paper-deep">
                      <Settings size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text">{t("nav.settings")}</p>
                      <p className="text-[11px] leading-snug text-text-faint">{t("nav.settings_hint")}</p>
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

      <LiveSheet open={liveSheet.open} onClose={liveSheet.close} />

      {/* ── Tablets and computers: the menu down the left side, in sections ── */}
      <aside aria-label={t("nav.open_menu")} className="hgv-aside">
        <nav className="flex flex-1 flex-col overflow-y-auto px-2 py-3 lg:px-3">
          {(loading || isResolving)
            ? Array.from({ length: sideMenus.length || 4 }).map((_, i) => (
                <div key={i} aria-hidden="true" className="flex h-10 items-center gap-3 px-3 max-lg:h-14 max-lg:flex-col max-lg:justify-center max-lg:gap-1.5 max-lg:px-1">
                  <div className="hgv-shimmer h-5 w-5 shrink-0 rounded-md" />
                  <div className="hgv-shimmer h-2.5 w-24 rounded max-lg:w-10" />
                </div>
              ))
            : (<>
                <SideGroup label={t("nav.group_business")} first>
                  {sideMenus.filter((m) => BUSINESS_SIDE.includes(m.href)).map((menu) => (
                    <SideLink key={menu.href} menu={menu} pathname={pathname} t={t} badge={menu.href === "/messages" ? unread : 0} />
                  ))}
                </SideGroup>
                {sideMenus.some((m) => FINANCE_SIDE.includes(m.href)) && (
                  <SideGroup label={t("nav.group_finance")}>
                    {sideMenus.filter((m) => FINANCE_SIDE.includes(m.href)).map((menu) => (
                      <SideLink key={menu.href} menu={menu} pathname={pathname} t={t} />
                    ))}
                  </SideGroup>
                )}
                {/* Employees: attendance, then payroll (the payroll roles only) */}
                {PAYROLL_ROLES.includes(user?.role ?? "") && (
                  <SideGroup label={t("nav.employees")}>
                    <SideLink menu={{ key: "nav.attendance", href: "/attendance", icon: CalendarCheck }} pathname={pathname} t={t} />
                    <SideLink menu={{ key: "nav.payroll", href: "/payroll", icon: HandCoins }} pathname={pathname} t={t} />
                  </SideGroup>
                )}
              </>)}
        </nav>
        {/* The account: the business, then its team and settings */}
        <div className="border-t border-border px-2 py-3 lg:px-3">
          {shop && (
            <div className="mb-2 flex items-center gap-3 rounded-press px-2 py-1.5 max-lg:justify-center max-lg:px-0">
              {shop.logo_url
                ? <img src={shop.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-press border border-border object-cover" />
                : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-press bg-ink font-display text-sm font-semibold text-paper">
                    {(shop.name?.[0] ?? "H").toUpperCase()}
                  </div>}
              <div className="min-w-0 max-lg:hidden">
                <p className="truncate text-[13px] font-semibold leading-tight text-text">{shop.name}</p>
                <p className="truncate text-[11px] leading-tight text-text-faint">{roleName(user?.role, t)}</p>
              </div>
            </div>
          )}
          <SideLink menu={{ key: "team.title", href: "/team", icon: UsersRound }} pathname={pathname} t={t} />
          <SideLink menu={{ key: "nav.settings", href: "/settings", icon: Settings }} pathname={pathname} t={t} />
        </div>
      </aside>

      {/* ── Phones: the Android app's tab bar ── */}
      <nav aria-label={t("nav.open_menu")} className="hgv-tabbar md:hidden">
        <TabLink href="/" icon={House} label={t("nav.home")} active={pathname === "/"} onClick={goHome} />
        <TabLink href="/items" icon={layout === "car" ? Car : PackageTab} label={t(layout === "car" ? "nav.vehicles" : "nav.stock")}
          active={isActiveHref(pathname, "/items")} />
        {layout === "car" && (
          <TabLink href="/messages" icon={ChatCircleDots} label={t("nav.messages")}
            active={isActiveHref(pathname, "/messages")} badge={unread} />
        )}
        <TabLink href="/sales" icon={ReceiptTab} label={t("nav.sales")} active={isActiveHref(pathname, "/sales")} />
        {/* The business, and every page opened from it (purchases, partners, reports…) */}
        <TabLink href="/business" icon={Storefront} label={t("nav.business")}
          active={!TAB_HREFS.some((h) => isActiveHref(pathname, h))} />
      </nav>

    </>
  );
}

/** The pages with their own tab in the phone's bottom bar. */
const TAB_HREFS = ["/", "/items", "/messages", "/sales"];

/** One tab, as the app draws it: an icon only (Phosphor's outline, its
 *  filled twin when open), the name read out and shown on a long press,
 *  the unread count in Facebook's red. */
function TabLink({ href, icon: Icon, label, active, badge = 0, onClick }: {
  href: string; icon: PhosphorIcon; label: string; active: boolean; badge?: number;
  onClick?: (e: React.MouseEvent) => void;
}) {
  // Held for half a second: the name shows, and letting go doesn't open it.
  const [tip, setTip] = useState(false);
  const held = useRef<{ timer?: ReturnType<typeof setTimeout>; shown: boolean }>({ shown: false });
  const press = {
    onPointerDown: () => {
      held.current.shown = false;
      held.current.timer = setTimeout(() => { held.current.shown = true; setTip(true); }, 500);
    },
    onPointerUp: () => { clearTimeout(held.current.timer); if (held.current.shown) setTimeout(() => setTip(false), 900); },
    onPointerLeave: () => { clearTimeout(held.current.timer); setTip(false); },
    onPointerCancel: () => { clearTimeout(held.current.timer); setTip(false); },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClick: (e: React.MouseEvent) => {
      if (held.current.shown) { e.preventDefault(); held.current.shown = false; return; }
      onClick?.(e);
    },
  };
  const body = (
    <span className="relative">
      {tip && <span className="hgv-tab-tip" aria-hidden="true">{label}</span>}
      <Icon size={26} weight={active ? "fill" : "regular"} />
      {badge > 0 && (
        <span className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-paper bg-[#e41e3f] px-1 text-[10px] font-bold leading-none text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </span>
  );
  const name = badge > 0 ? `${label}, ${badge}` : label;
  return (
    <Link href={href} {...press} aria-current={active ? "page" : undefined} aria-label={name} className="hgv-tab">
      {body}
    </Link>
  );
}

/** The four pages in the top bar on wider screens. */
const TOP_HREFS = ["/", "/items", "/partners", "/sales"];

/** A page in the top bar: its icon over its name on tablets, beside it on
 *  computers; the open one marked by a line along the bar's bottom edge. */
function TopLink({ menu, pathname, t }: { menu: NavItem; pathname: string; t: (key: string) => string }) {
  const Icon = menu.icon;
  const active = isActiveHref(pathname, menu.href);
  return (
    <Link href={menu.href} aria-current={active ? "page" : undefined}
      className={`group relative flex min-w-[72px] flex-col items-center justify-center gap-1 px-3 transition-colors duration-200 lg:min-w-0 lg:flex-row lg:gap-2 lg:px-4 ${
        active ? "text-ink" : "text-text-muted hover:text-text"}`}>
      <span aria-hidden="true" className={`pointer-events-none absolute inset-x-1 inset-y-1.5 rounded-press transition-colors duration-200 ${active ? "" : "group-hover:bg-paper-dim"}`} />
      <Icon size={20} strokeWidth={active ? 2.25 : 1.75} className="relative" />
      <span className="relative whitespace-nowrap text-[11px] font-semibold leading-none lg:text-[13.5px]">{t(menu.key)}</span>
      {active && <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-[3px] rounded-t-full bg-ink" />}
    </Link>
  );
}

/** Sidebar pages, by section. */
const BUSINESS_SIDE = ["/purchases", "/messages"];
const FINANCE_SIDE = ["/expenses", "/reports"];

/** A sidebar section: its name on computers, a thin line on tablets. */
function SideGroup({ label, first = false, children }: { label: string; first?: boolean; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className={first ? "" : "mt-4 max-lg:mt-2"}>
      <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-text-faint max-lg:hidden">{label}</p>
      {!first && <div aria-hidden="true" className="mx-3 mb-2 border-t border-border lg:hidden" />}
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

/** Who the signed-in person is in the business. */
function roleName(role: string | undefined, t: (key: string) => string): string {
  const known = ["owner", "admin", "manager", "accountant", "cashier", "storekeeper"];
  return role && known.includes(role) ? t(`role.${role}`) : t("common.shop_owner");
}

/** One sidebar entry: icon and name in a row on computers, the name under
 *  the icon on tablets; the open page tinted, as on LinkedIn and Facebook. */
function SideLink({ menu, pathname, t, badge = 0 }: { menu: NavItem; pathname: string; t: (key: string) => string; badge?: number }) {
  const Icon = menu.icon;
  const active = isActiveHref(pathname, menu.href);
  const admin = menu.href === "/admin";
  return (
    <Link href={menu.href} aria-current={active ? "page" : undefined} title={t(menu.key)}
      className={`relative flex h-10 items-center gap-3 rounded-press px-3 text-[13.5px] font-semibold transition-colors duration-200 max-lg:h-14 max-lg:flex-col max-lg:justify-center max-lg:gap-1 max-lg:px-0.5 max-lg:text-[10.5px] max-lg:tracking-[-0.1px] ${
        active ? (admin ? "bg-accent-soft text-accent-dark" : "bg-ink-soft text-ink") : "text-text-muted hover:bg-paper-dim hover:text-text"}`}>
      {active && <span aria-hidden="true" className={`absolute -left-2 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full lg:-left-3 ${admin ? "bg-accent-dark" : "bg-ink"}`} />}
      <span className="relative shrink-0">
        <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
        {badge > 0 && (
          <span className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-paper bg-[#e41e3f] px-1 text-[10px] font-bold leading-none text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span className="min-w-0 truncate max-lg:max-w-full max-lg:leading-none">{t(menu.key)}</span>
    </Link>
  );
}
