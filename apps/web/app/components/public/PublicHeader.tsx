"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useShop } from "@/lib/shop-context";
import { getEffectiveRole } from "@/lib/auth";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { getPublicProducts, getPublicShops, type PublicProduct } from "@/lib/marketplace-public";
import type { Shop } from "@/lib/shop-api";
import {
  Home, LayoutGrid, Store, Package, Info, Phone,
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

// Cycles through real example queries in the search placeholder — informative
// (shows what's actually searchable) and gives the bar a bit of life when idle.
const SEARCH_PLACEHOLDER_EXAMPLES = [
  "wireless earbuds",
  "office chairs",
  "verified suppliers",
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
  const [catMenuOpen, setCatMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const menuRef = useRef<HTMLDivElement>(null);
  const catMenuRef = useRef<HTMLDivElement>(null);

  // ── Search suggestions: recent terms, live product/supplier matches ──
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [suggestProducts, setSuggestProducts] = useState<PublicProduct[] | null>(null);
  const [suggestShops, setSuggestShops] = useState<Shop[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const productsLoaded = useRef(false);
  const shopsLoaded = useRef(false);
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
    if (user && !shopsLoaded.current) {
      shopsLoaded.current = true;
      getPublicShops().then(setSuggestShops);
    }
  }, [user]);

  // Pre-warm real product data on mount so "Popular categories" reflects actual
  // marketplace stock the first time the search bar opens, not a generic fallback.
  useEffect(() => { loadSuggestData(); }, [loadSuggestData]);

  const isResolving = !ready || shopLoading;
  const role = isResolving ? null : getEffectiveRole(user ?? null, shop?.is_active === true);
  const isBusiness = role === "SHOP_OWNER" || role === "ADMIN";

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (catMenuRef.current && !catMenuRef.current.contains(e.target as Node)) setCatMenuOpen(false);
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) setSuggestOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
    setCatMenuOpen(false);
    setSuggestOpen(false);
  }, [pathname]);

  function goTo(href: string) {
    setSuggestOpen(false);
    router.push(href);
  }

  function runSearch(term: string) {
    const q = term.trim();
    if (q) setRecentSearches(saveRecentSearch(q));
    if (category !== "all") {
      goTo(q ? `/search?q=${encodeURIComponent(q)}&cat=${category}` : `/category/${category}`);
    } else {
      goTo(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
    }
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

    (suggestShops ?? [])
      .filter((s) => (s.name ?? "").toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((s) => {
        list.push({
          key: `s-${s.id}`,
          href: `/shop/${s.id}`,
          render: (active) => (
            <div className={`flex items-center gap-3 rounded-xl px-3 py-2 transition ${active ? "bg-orange-50" : "hover:bg-slate-50"}`}>
              {s.logo_url ? (
                <img src={s.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-full border border-slate-200 object-cover" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-500">
                  <Store size={15} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-700">{highlightMatch(s.name, trimmedQuery)}</p>
                <p className="truncate text-xs text-slate-400">Supplier{s.address ? ` · ${s.address}` : ""}</p>
              </div>
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
  }, [trimmedQuery, suggestProducts, suggestShops, categoriesWithListings]);

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
              <span className="hidden items-center gap-1.5 border-l border-slate-700 pl-4 md:flex">
                <ShieldCheck size={12} className="text-orange-400" /> Buy safely from verified suppliers
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/suppliers" className="transition hover:text-white">Verified Suppliers</Link>
              <Link href="/products" className="hidden transition hover:text-white sm:inline">All Products</Link>
              <Link href="/contact" className="transition hover:text-white">Help Center</Link>
              {!isResolving && !user && (
                <Link href="/register" className="font-semibold text-orange-400 transition hover:text-orange-300">Sell on Higoverse</Link>
              )}
              <span className="hidden items-center gap-1 border-l border-slate-700 pl-4 md:flex">
                <Globe size={12} /> EN
              </span>
            </div>
          </div>
        </div>

        {/* ── Row 1: logo + search + account ── */}
        <div className="border-b border-slate-100">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2.5 px-4 py-2 sm:px-6 lg:grid lg:flex-nowrap lg:grid-cols-[auto_1fr_auto]">
            <div className="flex shrink-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setMobileOpen((o) => !o)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
                aria-label="Open menu"
              >
                <Menu size={16} />
              </button>

              <Link href="/" className="flex shrink-0 items-center gap-1.5 transition hover:opacity-80">
                <img src="/higoverse.png" alt="Higoverse" className="h-6 w-6 rounded-lg object-cover" />
                <span className="hidden text-[13px] font-bold tracking-tight text-slate-900 sm:inline">Higoverse</span>
              </Link>
            </div>

            {/* Search bar — wraps to its own full-width row on mobile, truly centered on desktop */}
            <div ref={searchWrapRef} className="relative order-3 w-full lg:order-none lg:mx-auto lg:w-full lg:max-w-2xl">
              <form onSubmit={submitSearch} className="w-full">
                <div
                  className={`flex h-8 w-full items-stretch overflow-hidden rounded-full bg-white shadow-sm ring-1 transition-all duration-200 ${
                    searchFocused ? "scale-[1.015] shadow-md ring-2 ring-orange-400" : "ring-slate-200 hover:ring-slate-300"
                  }`}
                >
                  <div className="relative hidden shrink-0 sm:block">
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      aria-label="Category"
                      className="h-full appearance-none rounded-l-full border-r border-slate-200 bg-slate-50 py-1 pl-3 pr-6 text-[11px] font-medium text-slate-600 outline-none transition hover:bg-slate-100"
                    >
                      <option value="all">All categories</option>
                      {CATEGORIES.map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={10} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>

                  <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-3">
                    <Search
                      size={13}
                      className={`hidden shrink-0 transition-colors duration-200 sm:block ${searchFocused ? "text-orange-400" : "text-slate-300"}`}
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
                      className="min-w-0 flex-1 bg-transparent text-[11px] text-slate-800 outline-none placeholder:text-slate-400"
                    />
                    {query ? (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        aria-label="Clear search"
                        className="flex shrink-0 items-center justify-center rounded-full p-1 text-slate-300 transition hover:bg-slate-100 hover:text-slate-500"
                      >
                        <X size={12} />
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
                    className="m-1 flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-orange-500 px-3 text-[11px] font-bold text-white transition hover:bg-orange-600 active:scale-[0.97] sm:px-4"
                  >
                    <Search size={12} className="sm:hidden" />
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
          <div className="mx-auto hidden max-w-7xl items-center gap-2 px-4 pb-1.5 text-[11px] text-slate-400 sm:px-6 lg:flex">
            <span className="font-medium text-slate-500">Popular:</span>
            {CATEGORIES.slice(0, 6).map((c) => (
              <Link
                key={c.key}
                href={`/category/${c.key}`}
                className="rounded-full px-2 py-0.5 transition hover:bg-slate-100 hover:text-slate-700"
              >
                {c.label}
              </Link>
            ))}
          </div>
        </div>

        {/* ── Row 2: secondary nav (desktop only) ── */}
        <div className="hidden border-b border-slate-100 lg:block">
          <div className="mx-auto flex h-8 max-w-7xl items-center justify-between px-4 text-[11px] sm:px-6">
            <nav className="flex items-center gap-4">
              <div ref={catMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setCatMenuOpen((o) => !o)}
                  className={`flex items-center gap-1 font-semibold transition ${
                    catMenuOpen || isActive(pathname, CATEGORIES_LINK.href) ? "text-orange-600" : "text-slate-700 hover:text-slate-900"
                  }`}
                >
                  <LayoutGrid size={11} /> {CATEGORIES_LINK.label}
                  <ChevronDown size={10} className={`transition-transform ${catMenuOpen ? "rotate-180" : ""}`} />
                </button>

                {catMenuOpen && (
                  <div className="absolute left-0 top-full z-50 mt-2 w-[26rem] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                    <div className="grid grid-cols-2 gap-0.5">
                      {CATEGORIES.map((c) => {
                        const Icon = CATEGORY_ICONS[c.key] ?? Package;
                        return (
                          <Link
                            key={c.key}
                            href={`/category/${c.key}`}
                            onClick={() => setCatMenuOpen(false)}
                            className="flex items-start gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-orange-50 hover:text-orange-600"
                          >
                            <Icon size={15} className="mt-0.5 shrink-0 text-slate-400" />
                            <span className="whitespace-nowrap">{c.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                    <Link
                      href="/categories"
                      onClick={() => setCatMenuOpen(false)}
                      className="mt-1 flex items-center justify-center rounded-xl border-t border-slate-100 px-3 py-2 text-xs font-semibold text-orange-600 hover:bg-orange-50"
                    >
                      Browse all categories →
                    </Link>
                  </div>
                )}
              </div>
              <span className="h-2.5 w-px bg-slate-200" />
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
