"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useShop } from "@/lib/shop-context";
import { getEffectiveRole } from "@/lib/auth";
import { CATEGORIES } from "@/lib/categories";
import {
  Home, LayoutGrid, Store, Package, Info, Phone,
  LayoutDashboard, ShoppingCart, BarChart3, Sparkles,
  Search, Menu, X, ChevronDown, LogOut, Settings, User,
} from "lucide-react";

const CATEGORIES_LINK = { label: "All categories", href: "/categories", icon: LayoutGrid };

const PUBLIC_LINKS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Verified Suppliers", href: "/suppliers", icon: Store },
  { label: "Products", href: "/products", icon: Package },
  { label: "About us", href: "/about", icon: Info },
  { label: "Contact", href: "/contact", icon: Phone },
];

const BUSINESS_LINKS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Inventory", href: "/items", icon: Package },
  { label: "Sales", href: "/sales", icon: ShoppingCart },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "AI Advisor", href: "/advisor", icon: Sparkles },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export default function PublicHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready } = useAuth();
  const { shop, loading: shopLoading } = useShop();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const menuRef = useRef<HTMLDivElement>(null);

  const isResolving = !ready || shopLoading;
  const role = isResolving ? null : getEffectiveRole(user ?? null, shop?.is_active === true);
  const isBusiness = role === "SHOP_OWNER" || role === "ADMIN";

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (category !== "all") {
      router.push(q ? `/search?q=${encodeURIComponent(q)}&cat=${category}` : `/category/${category}`);
    } else {
      router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
    }
  }

  return (
    <>
      <header className="sticky top-0 z-50 bg-white shadow-sm">
        {/* ── Row 0: slim utility strip ── */}
        <div className="hidden border-b border-slate-100 bg-slate-50 sm:block">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-1.5 text-[11px] text-slate-500 sm:px-6">
            <span className="flex items-center gap-1.5">🇷🇼 Deliver to Rwanda</span>
            <div className="flex items-center gap-4">
              <Link href="/suppliers" className="transition hover:text-orange-600">Verified Suppliers</Link>
              <Link href="/contact" className="transition hover:text-orange-600">Help Center</Link>
              {!isResolving && !user && (
                <Link href="/register" className="transition hover:text-orange-600">Sell on Higoverse</Link>
              )}
            </div>
          </div>
        </div>

        {/* ── Row 1: logo + search + account ── */}
        <div className="border-b border-slate-100">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>

            <Link href="/" className="flex shrink-0 items-center gap-2 transition hover:opacity-80">
              <img src="/higoverse.png" alt="Higoverse" className="h-8 w-8 rounded-xl object-cover" />
              <span className="hidden text-[16px] font-bold tracking-tight text-slate-900 sm:inline">Higoverse</span>
            </Link>

            {/* Search bar — wraps to its own full-width row on mobile */}
            <form onSubmit={submitSearch} className="order-3 w-full lg:order-none lg:w-auto lg:flex-1 lg:max-w-2xl">
              <div className="flex h-10 w-full items-stretch gap-1.5">
                <div className="flex flex-1 items-center overflow-hidden rounded-full border border-slate-300 bg-white focus-within:border-orange-400">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    aria-label="Category"
                    className="hidden shrink-0 border-r border-slate-200 bg-slate-50 py-2 pl-3 pr-6 text-xs font-medium text-slate-600 outline-none sm:block"
                  >
                    <option value="all">All categories</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search products, suppliers, or categories..."
                    className="min-w-0 flex-1 px-4 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={submitSearch}
                    aria-label="Search"
                    className="flex h-full w-11 shrink-0 items-center justify-center bg-slate-800 text-white transition hover:bg-slate-900"
                  >
                    <Search size={16} />
                  </button>
                </div>
                <button
                  type="submit"
                  className="shrink-0 whitespace-nowrap rounded-full bg-orange-500 px-6 text-sm font-bold text-white transition hover:bg-orange-600"
                >
                  Search
                </button>
              </div>
            </form>

            <div className="ml-auto flex items-center gap-2">
              {isBusiness && (
                <Link
                  href="/dashboard"
                  className="hidden items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 md:flex"
                >
                  <LayoutDashboard size={16} />
                  Dashboard
                </Link>
              )}

              {!isResolving && !user && (
                <>
                  <Link
                    href="/login"
                    className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Login
                  </Link>
                  <Link
                    href="/register"
                    className="whitespace-nowrap rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600"
                  >
                    Create account
                  </Link>
                </>
              )}

              {!isResolving && user && (
                <div ref={menuRef} className="relative">
                  <button
                    onClick={() => setMenuOpen((o) => !o)}
                    className={`flex items-center gap-2 rounded-xl px-2 py-1.5 transition ${menuOpen ? "bg-slate-100" : "hover:bg-slate-100"}`}
                  >
                    {shop?.logo_url ? (
                      <img src={shop.logo_url} alt={shop.name} className="h-8 w-8 rounded-full border border-slate-200 object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
                        {user?.name?.[0]?.toUpperCase() ?? "H"}
                      </div>
                    )}
                    <ChevronDown size={14} className={`hidden text-slate-500 transition-transform sm:block ${menuOpen ? "rotate-180" : ""}`} />
                  </button>

                  {menuOpen && (
                    <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl">
                      {isBusiness && (
                        <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                          <LayoutDashboard size={16} /> Dashboard
                        </Link>
                      )}
                      <Link href="/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                        <Settings size={16} /> Account & Settings
                      </Link>
                      <LogoutMenuItem />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Row 2: secondary nav (desktop only) ── */}
        <div className="hidden border-b border-slate-100 lg:block">
          <div className="mx-auto flex h-10 max-w-7xl items-center justify-between px-4 text-xs sm:px-6">
            <nav className="flex items-center gap-5">
              <Link
                href={CATEGORIES_LINK.href}
                className={`flex items-center gap-1.5 font-semibold transition ${
                  isActive(pathname, CATEGORIES_LINK.href) ? "text-orange-600" : "text-slate-700 hover:text-slate-900"
                }`}
              >
                <LayoutGrid size={13} /> {CATEGORIES_LINK.label}
              </Link>
              <span className="h-3 w-px bg-slate-200" />
              {PUBLIC_LINKS.filter((l) => l.href !== "/").map((link) => {
                const active = isActive(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`font-medium transition ${active ? "text-orange-600" : "text-slate-500 hover:text-slate-900"}`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            {isBusiness && (
              <nav className="flex items-center gap-4 text-slate-400">
                {BUSINESS_LINKS.map((link) => (
                  <Link key={link.href} href={link.href} className="font-medium transition hover:text-slate-700">
                    {link.label}
                  </Link>
                ))}
              </nav>
            )}
          </div>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
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
              {[...PUBLIC_LINKS, CATEGORIES_LINK].map((link) => {
                const Icon = link.icon;
                const active = isActive(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                      active ? "bg-orange-50 text-orange-600" : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Icon size={18} />
                    {link.label}
                  </Link>
                );
              })}
              {isBusiness && (
                <>
                  <div className="mt-3 border-t border-slate-100 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Business
                  </div>
                  {BUSINESS_LINKS.map((link) => {
                    const Icon = link.icon;
                    const active = isActive(pathname, link.href);
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                          active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <Icon size={18} />
                        {link.label}
                      </Link>
                    );
                  })}
                </>
              )}
              {!isResolving && !user && (
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                  <Link href="/login" className="flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700">
                    <User size={16} className="mr-2" /> Login
                  </Link>
                  <Link href="/register" className="flex items-center justify-center rounded-xl bg-orange-500 px-3 py-2.5 text-sm font-semibold text-white">
                    Create account
                  </Link>
                </div>
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

function LogoutMenuItem() {
  const { logout } = useAuth();
  const router = useRouter();
  return (
    <button
      onClick={() => {
        logout();
        router.replace("/");
      }}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-500 transition hover:bg-red-50"
    >
      <LogOut size={16} /> Log Out
    </button>
  );
}
