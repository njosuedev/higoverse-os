"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useShop } from "@/lib/shop-context";
import { getEffectiveRole } from "@/lib/auth";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { getPublicProducts, type PublicProduct } from "@/lib/marketplace-public";
import { useCart } from "@/lib/hooks/useCart";
import { cartCount } from "@/lib/cart";
import {
  Home, LayoutGrid, Package, Info, Phone,
  LayoutDashboard, ShoppingCart, BarChart3, Sparkles,
  Search, Menu, X, ChevronDown, LogOut, Settings, User,
  MapPin, Globe, ShieldCheck, Truck, Shirt, Heart,
  Home as HomeIcon, Leaf, Building2, Briefcase, Clock, ImageOff,
} from "lucide-react";

const RECENT_SEARCHES_KEY = "hgv_recent_searches";
const MAX_RECENT_SEARCHES = 6;

function loadRecentSearches(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(term: string): string[] {
  const next = [term, ...loadRecentSearches().filter((s) => s.toLowerCase() !== term.toLowerCase())].slice(0, MAX_RECENT_SEARCHES);
  try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  return next;
}

function fmtRWF(n: number) {
  return new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 }).format(n);
}

/** Bolds the first occurrence of `query` inside `text` for suggestion rows. */
function highlightMatch(text: string, query: string) {
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i === -1 || !query) return text;
  return (
    <>
      {text.slice(0, i)}
      <strong className="font-bold text-slate-900">{text.slice(i, i + query.length)}</strong>
      {text.slice(i + query.length)}
    </>
  );
}

interface Suggestion {
  key: string;
  href: string;
  render: (active: boolean) => React.ReactNode;
}

const CATEGORIES_LINK = { label: "All categories", href: "/categories", icon: LayoutGrid };

// Icons for the curated CATEGORIES list (lib/categories.ts) — used in the category flyout
const CATEGORY_ICONS: Record<string, typeof Package> = {
  electronics: Package,
  vehicles: Truck,
  fashion: Shirt,
  health: Heart,
  furniture: HomeIcon,
  agriculture: Leaf,
  construction: Building2,
  business: Briefcase,
  food: Package,
  wholesale: Package,
  other: Package,
};

const PUBLIC_LINKS = [
  { label: "Home", href: "/", icon: Home },
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

// Cycles through real example queries in the search placeholder — informative
// (shows what's actually searchable) and gives the bar a bit of life when idle.
const SEARCH_PLACEHOLDER_EXAMPLES = [
  "wireless earbuds",
  "office chairs",
  "fresh produce",
  "laptop accessories",
];

function useRotatingPlaceholder(examples: string[], intervalMs = 2600) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % examples.length), intervalMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examples.length, intervalMs]);
  return examples[index];
}

export default function PublicHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready } = useAuth();
  const { shop, loading: shopLoading } = useShop();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Search suggestions: recent terms, live product/supplier matches ──
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [suggestProducts, setSuggestProducts] = useState<PublicProduct[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const productsLoaded = useRef(false);
  const placeholderExample = useRotatingPlaceholder(SEARCH_PLACEHOLDER_EXAMPLES);

  useEffect(() => { setRecentSearches(loadRecentSearches()); }, []);

  // "/" focuses the search bar from anywhere on the page — a common power-user shortcut.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if (e.key === "/" && !isTyping) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const loadSuggestData = useCallback(() => {
    if (!productsLoaded.current) {
      productsLoaded.current = true;
      getPublicProducts().then(setSuggestProducts);
    }
  }, []);

  // Pre-warm real product data on mount so "Popular categories" reflects actual
  // marketplace stock the first time the search bar opens, not a generic fallback.
  useEffect(() => { loadSuggestData(); }, [loadSuggestData]);

  const isResolving = !ready || shopLoading;
  const role = isResolving ? null : getEffectiveRole(user ?? null, shop?.is_active === true);
  const isBusiness = role === "SHOP_OWNER" || role === "ADMIN";
  const cartItems = useCart();
  const cartQty = cartCount(cartItems);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) setSuggestOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
    setSuggestOpen(false);
  }, [pathname]);

  function goTo(href: string) {
    setSuggestOpen(false);
    router.push(href);
  }

  function runSearch(term: string) {
    const q = term.trim();
    if (q) setRecentSearches(saveRecentSearch(q));
    goTo(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    runSearch(query);
  }

  const trimmedQuery = query.trim();

  // Only suggest categories that actually have listed products in the live
  // marketplace catalog — not every curated category, whether stocked or not.
  const categoriesWithListings = useMemo(() => {
    if (!suggestProducts) return null;
    return new Set(suggestProducts.map((p) => p.category));
  }, [suggestProducts]);

  const popularCategories = useMemo(() => {
    if (!categoriesWithListings) return CATEGORIES.slice(0, 8);
    const stocked = CATEGORIES.filter((c) => categoriesWithListings.has(c.key));
    return (stocked.length > 0 ? stocked : CATEGORIES).slice(0, 8);
  }, [categoriesWithListings]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!trimmedQuery) return [];
    const q = trimmedQuery.toLowerCase();
    const list: Suggestion[] = [];

    (suggestProducts ?? [])
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 5)
      .forEach((p) => {
        list.push({
          key: `p-${p.id}`,
          href: `/product/${p.slug}`,
          render: (active) => (
            <div className={`flex items-center gap-3 rounded-xl px-3 py-2 transition ${active ? "bg-orange-50" : "hover:bg-slate-50"}`}>
              {p.images[0] ? (
                <img src={p.images[0]} alt="" className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 object-cover" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                  <ImageOff size={15} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-700">{highlightMatch(p.name, trimmedQuery)}</p>
                <p className="text-xs text-slate-400">{categoryLabel(p.category)}</p>
              </div>
              <span className="shrink-0 text-sm font-bold text-slate-900">{fmtRWF(p.price)}</span>
            </div>
          ),
        });
      });

    CATEGORIES.filter((c) => c.label.toLowerCase().includes(q) && (!categoriesWithListings || categoriesWithListings.has(c.key)))
      .slice(0, 4)
      .forEach((c) => {
        list.push({
          key: `c-${c.key}`,
          href: `/category/${c.key}`,
          render: (active) => (
            <div className={`flex items-center gap-3 rounded-xl px-3 py-2 transition ${active ? "bg-orange-50" : "hover:bg-slate-50"}`}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                <Search size={14} />
              </div>
              <p className="text-sm text-slate-600">
                {highlightMatch(c.label, trimmedQuery)} <span className="text-slate-400">in Categories</span>
              </p>
            </div>
          ),
        });
      });

    return list;
  }, [trimmedQuery, suggestProducts, categoriesWithListings]);

  useEffect(() => { setActiveIndex(-1); }, [trimmedQuery]);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && suggestions.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setSuggestOpen(false);
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Enter" && activeIndex >= 0 && suggestions[activeIndex]) {
      e.preventDefault();
      goTo(suggestions[activeIndex].href);
    }
  }

  return (
    <>
      <header className="sticky top-0 z-50 bg-white shadow-sm">
        {/* ── Row 0: slim utility strip ── */}
        <div className="hidden bg-slate-900 sm:block">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-1.5 text-[11px] text-slate-300 sm:px-6">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <MapPin size={12} className="text-orange-400" /> Deliver to Rwanda
              </span>
              <a href="tel:+250790885174" className="hidden items-center gap-1.5 border-l border-slate-700 pl-4 transition hover:text-white md:flex">
                <Phone size={12} className="text-orange-400" /> Call to order: +250 790 885 174
              </a>
              <span className="hidden items-center gap-1.5 border-l border-slate-700 pl-4 lg:flex">
                <ShieldCheck size={12} className="text-orange-400" /> Quality guaranteed on every order
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/products" className="hidden transition hover:text-white sm:inline">All Products</Link>
              <Link href="/contact" className="transition hover:text-white">Help Center</Link>
              <span className="hidden items-center gap-1 border-l border-slate-700 pl-4 md:flex">
                <Globe size={12} /> EN
              </span>
            </div>
          </div>
        </div>

        {/* ── Single row: logo + big search + account ── */}
        <div className="border-b border-slate-100">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:flex-nowrap">
            <div className="flex shrink-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setMobileOpen((o) => !o)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
                aria-label="Open menu"
              >
                <Menu size={18} />
              </button>

              <Link href="/" className="flex shrink-0 items-center gap-2 transition hover:opacity-80">
                <img src="/higoverse.png" alt="Higoverse" className="h-8 w-8 rounded-lg object-cover" />
                <span className="hidden text-base font-extrabold tracking-tight text-slate-900 sm:inline">Higoverse</span>
              </Link>
            </div>

            {/* Search bar — wraps to its own full-width row on mobile, fills remaining width on desktop */}
            <div ref={searchWrapRef} className="relative order-3 w-full lg:order-none lg:flex-1">
              <form onSubmit={submitSearch} className="w-full">
                <div
                  className={`flex h-11 w-full items-stretch overflow-hidden rounded-full bg-white shadow-sm ring-1 transition-all duration-200 ${
                    searchFocused ? "shadow-md ring-2 ring-orange-400" : "ring-slate-200 hover:ring-slate-300"
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2 pl-4">
                    <Search
                      size={16}
                      className={`shrink-0 transition-colors duration-200 ${searchFocused ? "text-orange-400" : "text-slate-300"}`}
                    />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onFocus={() => { setSearchFocused(true); setSuggestOpen(true); loadSuggestData(); }}
                      onBlur={() => setSearchFocused(false)}
                      onKeyDown={handleSearchKeyDown}
                      placeholder={`Search for ${placeholderExample}...`}
                      role="combobox"
                      aria-expanded={suggestOpen}
                      aria-autocomplete="list"
                      autoComplete="off"
                      className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                    />
                    {query ? (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        aria-label="Clear search"
                        className="flex shrink-0 items-center justify-center rounded-full p-1 text-slate-300 transition hover:bg-slate-100 hover:text-slate-500"
                      >
                        <X size={14} />
                      </button>
                    ) : (
                      <kbd className="hidden shrink-0 items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 sm:flex">
                        /
                      </kbd>
                    )}
                  </div>

                  <button
                    type="submit"
                    aria-label="Search"
                    className="m-1.5 flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-orange-500 px-5 text-sm font-bold text-white transition hover:bg-orange-600 active:scale-[0.97]"
                  >
                    <Search size={14} className="sm:hidden" />
                    <span className="hidden sm:inline">Search</span>
                  </button>
                </div>
              </form>

              {/* Live suggestions: recent terms + popular categories when idle, matches while typing */}
              {suggestOpen && (
                <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                  {!trimmedQuery ? (
                    <>
                      {recentSearches.length > 0 && (
                        <div className="mb-1">
                          <div className="flex items-center justify-between px-2 py-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Recent searches</span>
                            <button
                              type="button"
                              onClick={() => { setRecentSearches([]); localStorage.removeItem(RECENT_SEARCHES_KEY); }}
                              className="text-[11px] font-medium text-slate-400 hover:text-orange-600"
                            >
                              Clear
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5 px-2 pb-2">
                            {recentSearches.map((term) => (
                              <button
                                key={term}
                                type="button"
                                onClick={() => runSearch(term)}
                                className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-orange-50 hover:text-orange-600"
                              >
                                <Clock size={11} /> {term}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Popular categories</p>
                        <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                          {popularCategories.map((c) => {
                            const Icon = CATEGORY_ICONS[c.key] ?? Package;
                            return (
                              <button
                                key={c.key}
                                type="button"
                                onClick={() => goTo(`/category/${c.key}`)}
                                className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-orange-50 hover:text-orange-600"
                              >
                                <Icon size={12} /> {c.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  ) : suggestions.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-slate-400">
                      {suggestProducts === null ? "Searching…" : (
                        <>No quick matches for &ldquo;{trimmedQuery}&rdquo; — press Enter to search all listings.</>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {suggestions.map((s, i) => (
                        <Link key={s.key} href={s.href} onClick={() => setSuggestOpen(false)}>
                          {s.render(i === activeIndex)}
                        </Link>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => runSearch(query)}
                    className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border-t border-slate-100 px-3 py-2.5 text-xs font-semibold text-orange-600 hover:bg-orange-50"
                  >
                    <Search size={12} />
                    {trimmedQuery ? <>See all results for &ldquo;{trimmedQuery}&rdquo;</> : "See all listings"} →
                  </button>
                </div>
              )}
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:ml-0">
              <Link
                href="/cart"
                aria-label="Cart"
                className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
              >
                <ShoppingCart size={19} />
                {cartQty > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
                    {cartQty > 99 ? "99+" : cartQty}
                  </span>
                )}
              </Link>

              {isBusiness && (
                <Link
                  href="/dashboard"
                  className="hidden items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200 md:flex"
                >
                  <LayoutDashboard size={13} />
                  Dashboard
                </Link>
              )}

              {!isResolving && !user && (
                <>
                  <Link
                    href="/login"
                    className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Login
                  </Link>
                  <Link
                    href="/register"
                    className="whitespace-nowrap rounded-lg bg-orange-500 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-orange-600"
                  >
                    Create account
                  </Link>
                </>
              )}

              {!isResolving && user && (
                <div ref={menuRef} className="relative">
                  <button
                    onClick={() => setMenuOpen((o) => !o)}
                    className={`flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition ${menuOpen ? "bg-slate-100" : "hover:bg-slate-100"}`}
                  >
                    {shop?.logo_url ? (
                      <img src={shop.logo_url} alt={shop.name} className="h-6 w-6 rounded-full border border-slate-200 object-cover" />
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                        {user?.name?.[0]?.toUpperCase() ?? "H"}
                      </div>
                    )}
                    <ChevronDown size={12} className={`hidden text-slate-500 transition-transform sm:block ${menuOpen ? "rotate-180" : ""}`} />
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
              <Link
                href="/cart"
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive(pathname, "/cart") ? "bg-orange-50 text-orange-600" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <ShoppingCart size={18} />
                Cart
                {cartQty > 0 && (
                  <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">
                    {cartQty > 99 ? "99+" : cartQty}
                  </span>
                )}
              </Link>
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
