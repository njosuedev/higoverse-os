"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useShop } from "@/lib/shop-context";
import { listShops, updateMyShop, createShopApplication, type Shop } from "@/lib/shop-api";
import {
  getCatalog, upsertCatalogEntry, getProductMeta, compressImage, decodeShopCatalog,
  encodeShopDescription, encodeShopAddress, parseShopAddress, decodeShopHumanInfo,
  getApplicationStatus, formatPublicAddress, formatShortAddress,
  type MarketplaceEntry,
} from "@/lib/product-meta";
import { itemRequest } from "@/lib/product-api";
import {
  X, Loader2,
  CheckCircle, Phone, Package, ChevronRight,
  MapPin, MessageSquare, Send, Store, Mail,
  Rocket, ArrowRight, LayoutDashboard, CheckCircle2,
  Building2, FileText, ImagePlus, ChevronDown,
  Clock, BadgeCheck, Heart, Camera,
  Truck, Shirt, Home as HomeIcon, Leaf, Briefcase,
} from "lucide-react";
import {
  sendMessage, getMyMessages, replyToMessage,
  type ShopMessage,
} from "@/lib/product-meta";
import { warmupMsgService } from "@/lib/messages-api";
import { createSelfNotification, openNotifStream } from "@/lib/notifications-api";
import { CATEGORIES } from "@/lib/categories";
import { productSlug } from "@/lib/slug";

// ── marketplace cache (90 s TTL — instant paint for returning users) ─────────
const MKT_CACHE_KEY = "hgv_mkt_v2";
const MKT_CACHE_TTL = 90_000;

interface MktCache { shops: Shop[]; catalog: MarketplaceEntry[]; ts: number }

function readMktCache(): MktCache | null {
  try {
    const raw = localStorage.getItem(MKT_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as MktCache;
    if (Date.now() - c.ts > MKT_CACHE_TTL) return null;
    return c;
  } catch { return null; }
}

function writeMktCache(shops: Shop[], catalog: MarketplaceEntry[]) {
  try {
    localStorage.setItem(MKT_CACHE_KEY, JSON.stringify({ shops, catalog, ts: Date.now() } satisfies MktCache));
  } catch { /* storage quota exceeded */ }
}

// ── helpers ──────────────────────────────────────────────────────────────────
function parseUTC(ts: string | null | undefined): Date {
  if (!ts) return new Date(0);
  const s = ts.endsWith("Z") || ts.includes("+") ? ts : ts + "Z";
  return new Date(s);
}
function isOnline(lastSeenAt: string | null, now: Date) {
  return !!lastSeenAt && (now.getTime() - parseUTC(lastSeenAt).getTime()) / 1000 < 300;
}
function fmtPrice(n: number) {
  return new Intl.NumberFormat("en-RW", {
    style: "currency", currency: "RWF", maximumFractionDigits: 0,
  }).format(n);
}
// Real tenure on the platform, derived from the shop's actual signup date.
function shopTenureLabel(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const years = (Date.now() - parseUTC(createdAt).getTime()) / (365.25 * 24 * 3600 * 1000);
  if (years < 1) return "New";
  return `${Math.floor(years)} yr${Math.floor(years) === 1 ? "" : "s"}`;
}

const CAT_KW: Record<string, string[]> = {
  food:        ["food","drink","restaurant","café","cafe","bakery","juice","grocery","market","farm","rice","sugar","milk","flour","meat","fish","vegetable","beverage"],
  electronics: ["tech","electronic","phone","computer","digital","mobile","gadget","battery","cable","printer","camera","laptop","tv"],
  fashion:     ["fashion","cloth","wear","beauty","salon","boutique","tailoring","shoes","bag","jewelry","accessory","shirt","dress"],
  wholesale:   ["wholesale","bulk","distribution","import","export","supplier","trade","stock","manufacturing","supply"],
  agriculture: ["agri","farm","seed","fertilizer","crop","harvest","livestock","animal","poultry","garden"],
  health:      ["health","pharma","medicine","medical","clinic","cosmetic","skincare","wellness","pharmacy"],
  furniture:   ["furniture","wood","chair","table","sofa","bed","cabinet","decor","home","office"],
  services:    ["service","repair","print","photo","logistics","transport","consulting","delivery","cleaning"],
};
function catOf(name: string, desc?: string | null) {
  const text = `${name} ${desc ?? ""}`.toLowerCase();
  for (const [cat, kws] of Object.entries(CAT_KW))
    if (kws.some((kw) => text.includes(kw))) return cat;
  return "other";
}

const PAGE_SIZE = 24;

// Icons for the curated CATEGORIES list (lib/categories.ts) shown in "Categories for you"
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

export default function MarketplacePage() {
  return (
    <Suspense fallback={null}>
      <MarketplacePageContent />
    </Suspense>
  );
}

function MarketplacePageContent() {
  const { user }  = useAuth();
  const { shop }  = useShop();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [shops, setShops]       = useState<Shop[]>([]);
  const [catalog, setCatalog]   = useState<MarketplaceEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [now, setNow]           = useState(new Date());
  const [page, setPage]         = useState(1);            // how many PAGE_SIZE batches shown
  const loadingMore = false; // no artificial delay — scroll triggers immediately
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [apiSynced, setApiSynced] = useState(false);
  const [onlineShopsCount, setOnlineShopsCount] = useState(0);

  // Shop application form state
  const [showShopForm, setShowShopForm] = useState(false);
  const [shopApplied, setShopApplied] = useState(false);
  const [shopForm, setShopForm] = useState({
    shop_name: "", tin: "", business_type: "", owner_name: "", phone: "", email: "",
    province: "", district: "", sector: "", address: "", description: "", logo_url: "", banner_url: "",
  });
  const [shopFormLoading, setShopFormLoading] = useState(false);
  const [shopFormError, setShopFormError] = useState("");

  const sentinelRef = useRef<HTMLDivElement>(null);
  const serverCatalogRef = useRef<MarketplaceEntry[]>([]);

  useEffect(() => {
    warmupMsgService(); // wake Render.com free-tier before user opens order modal
    if (localStorage.getItem("mp_shop_banner_dismissed") === "1") setBannerDismissed(true);
    if (localStorage.getItem("mp_shop_applied") === "1") setShopApplied(true);
    // Paint stale cache instantly so the page is never blank
    const c = readMktCache();
    if (c) {
      setShops(c.shops);
      setCatalog(c.catalog);
      preloadImgs(c.catalog);
      setOnlineShopsCount(c.shops.filter((s) => isOnline(s.last_seen_at, new Date())).length);
      setLoading(false);
    }
  }, []);

  // Auto-open shop application form from CTA links (?apply=1)
  // For rejected applications, bypass the shopApplied localStorage flag so resubmission always works
  useEffect(() => {
    if (searchParams.get("apply") !== "1") return;
    // Guests must sign in first — creating a shop requires an account.
    if (!user) { router.replace(`/login?next=${encodeURIComponent("/?apply=1")}`); return; }
    if (shop?.is_active === true) return;
    const status = getApplicationStatus(shop?.description, shop?.address, !!shop?.is_active);
    const isRejected = status === "REJECTED";
    if (!shopApplied || isRejected) {
      if (isRejected) localStorage.removeItem("mp_shop_applied");
      setShowShopForm(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user, shop?.is_active, shop?.description, shop?.address]);

  // Pre-fill the form when shop data loads (supports rejection re-edit)
  useEffect(() => {
    if (!shop) return;
    const descInfo = decodeShopHumanInfo(shop.description);
    const addrInfo = parseShopAddress(shop.address);
    setShopForm((f) => ({
      ...f,
      shop_name:     f.shop_name     || shop.name          || "",
      phone:         f.phone         || shop.phone         || "",
      logo_url:      f.logo_url      || shop.logo_url      || "",
      business_type: f.business_type || descInfo.type      || "",
      description:   f.description   || descInfo.desc      || "",
      owner_name:    f.owner_name    || descInfo.ownerName  || "",
      email:         f.email         || descInfo.email      || "",
      banner_url:    f.banner_url    || descInfo.bannerUrl  || "",
      tin:           f.tin           || addrInfo.tin        || "",
      province:      f.province      || addrInfo.province   || "",
      district:      f.district      || addrInfo.district   || "",
      sector:        f.sector        || addrInfo.sector     || "",
      address:       f.address       || addrInfo.addr       || "",
    }));
    // Detect already-applied: backend will have TIN address if they previously filled the form
    if (shop.address?.startsWith("TIN:")) setShopApplied(true);
  }, [shop?.id]);

  function dismissBanner() {
    setBannerDismissed(true);
    localStorage.setItem("mp_shop_banner_dismissed", "1");
  }

  async function submitShopApplication() {
    setShopFormError("");
    if (!shopForm.shop_name.trim())   { setShopFormError("Shop name is required."); return; }
    if (!shopForm.tin.trim())         { setShopFormError("TIN / Tax ID is required. Admin will verify it."); return; }
    if (!shopForm.business_type)      { setShopFormError("Select a business type.");  return; }
    if (!shopForm.district)           { setShopFormError("Select your district.");     return; }
    if (!shopForm.phone.trim())       { setShopFormError("Phone number is required."); return; }

    // Uniqueness checks against all known shops (excluding current user's own shop)
    const normalName  = shopForm.shop_name.trim().toLowerCase();
    const normalPhone = shopForm.phone.replace(/\s/g, "");
    if (shops.some((s) => s.id !== shop?.id && (s.name ?? "").trim().toLowerCase() === normalName)) {
      setShopFormError("A shop with this name already exists. Please choose a unique shop name.");
      return;
    }
    if (shops.some((s) => s.id !== shop?.id && (s.phone ?? "").replace(/\s/g, "") === normalPhone)) {
      setShopFormError("This phone number is already registered to another shop. Please use a different number.");
      return;
    }

    setShopFormLoading(true);
    try {
      const address = encodeShopAddress({
        tin:      shopForm.tin.trim(),
        province: shopForm.province,
        district: shopForm.district,
        sector:   shopForm.sector,
        addr:     shopForm.address.trim(),
      });
      const description = encodeShopDescription({
        type:      shopForm.business_type,
        desc:      shopForm.description.trim(),
        ownerName: shopForm.owner_name.trim(),
        email:     shopForm.email.trim(),
        bannerUrl: shopForm.banner_url || undefined,
      });
      const shopPayload = {
        name:        shopForm.shop_name.trim(),
        phone:       shopForm.phone.trim(),
        address,
        description,
        logo_url:    shopForm.logo_url || undefined,
      };

      // Customers with no shop yet → create via dedicated endpoint
      // Customers resubmitting (shop exists but inactive/rejected) → update existing shop
      if (!shop) {
        await createShopApplication(shopPayload);
      } else {
        await updateMyShop(shopPayload);
      }

      setShopApplied(true);
      localStorage.setItem("mp_shop_applied", "1");
      setShowShopForm(false);
      // Notify the user in their notifications tab
      createSelfNotification(
        "Application submitted — pending admin review",
        "Higoverse admin will review your shop details and notify you once approved. This usually takes 1–2 business days.",
      ).catch(() => {});
    } catch {
      setShopFormError("Failed to submit application. Please try again.");
    } finally {
      setShopFormLoading(false);
    }
  }

  const shopIsActive  = shop?.is_active === true;
  const appStatus     = getApplicationStatus(shop?.description, shop?.address, shopIsActive);
  const rejectionInfo = decodeShopHumanInfo(shop?.description);

  // messaging
  const [msgEntry, setMsgEntry]       = useState<MarketplaceEntry | null>(null);
  const [msgText, setMsgText]         = useState("");
  const [msgSent, setMsgSent]         = useState(false);
  const [myMessages, setMyMessages]   = useState<ShopMessage[]>([]);

  // ── data load ────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      // 1. Load shops from live auth API — source of truth for all registered shops
      let allShops: typeof shops = [];
      try {
        const shopsRes = await listShops({ limit: 200 });
        allShops = (shopsRes.items ?? []).filter((s) => s.is_active);
        setShops(allShops);
        const nowTs = new Date();
        setOnlineShopsCount(allShops.filter((s) => isOnline(s.last_seen_at, nowTs)).length);
      } catch { /* shops stay empty */ }

      // 1.5. Build server catalog from shop description fields (fast, no images)
      const serverEntries: MarketplaceEntry[] = [];
      for (const s of allShops) {
        for (const e of decodeShopCatalog(s.description)) {
          serverEntries.push({
            productId: e.pid, shopId: s.id, shopName: s.name,
            shopLogoUrl: s.logo_url, shopPhone: s.phone,
            name: e.n, description: e.d, category: e.cat,
            sellingPrice: e.price, costPrice: e.price,
            quantity: e.qty, images: [], listedAt: e.at,
          });
        }
      }
      serverCatalogRef.current = serverEntries;

      // ── PHASE 1: Paint local-cache images immediately (no API wait) ──────────
      // Merge serverEntries < getCatalog() so anything already in localStorage
      // (including base64 images from previous sessions) shows instantly.
      const activeShopIds = new Set(allShops.map((s) => s.id));
      const phase1 = new Map<string, MarketplaceEntry>(serverEntries.map((e) => [e.productId, e]));
      for (const e of getCatalog()) {
        if (activeShopIds.has(e.shopId)) phase1.set(e.productId, e);
      }
      setCatalog([...phase1.values()]);
      setLoading(false); // show UI immediately with whatever images we have locally

      // ── PHASE 2: Enrich with API images (arrives ~300-800 ms later) ──────────
      // Runs for everyone, logged in or not — /products/marketplace is a public
      // endpoint, so anonymous visitors get real photos too, not just registered users.
      const dbEntries: MarketplaceEntry[] = [];
      try {
        const mkRes = await itemRequest("/products/marketplace?limit=200");
        const mkItems: Array<{
          id: string; shop_id: string; name: string; description?: string;
          category?: string; images?: string; selling_price: number;
          cost_price: number; quantity: number;
        }> = mkRes?.data?.items ?? [];
        for (const item of mkItems) {
          const itemShop = allShops.find((s) => s.id === item.shop_id);
          if (!itemShop) continue;
          const serverImgs: string[] = item.images
            ? (() => { try { return JSON.parse(item.images) as string[]; } catch { return []; } })()
            : [];
          const localImgs = phase1.get(item.id)?.images ?? [];
          dbEntries.push({
            productId: item.id, shopId: item.shop_id,
            shopName: itemShop.name,
            shopLogoUrl: itemShop.logo_url, shopPhone: itemShop.phone,
            name: item.name, description: item.description, category: item.category,
            sellingPrice: item.selling_price, costPrice: item.cost_price,
            quantity: item.quantity,
            // prefer local (base64, already rendered) → fallback to server URL
            images: localImgs.length > 0 ? localImgs : serverImgs,
            listedAt: new Date().toISOString(),
          });
        }
      } catch { /* product service unavailable — phase1 result stands */ }

      // Re-merge with API data and update catalog
      const merged = new Map(phase1);
      for (const e of dbEntries) {
        const existing = merged.get(e.productId);
        merged.set(e.productId, { ...e, images: (existing?.images?.length ?? 0) > 0 ? existing!.images : e.images, listedAt: existing?.listedAt ?? e.listedAt });
      }
      const builtCatalog = [...merged.values()];
      setCatalog(builtCatalog);
      preloadImgs(builtCatalog);
      // Don't write cache here — wait until user-sync includes own-shop images

      // 3. Auto-sync the logged-in user's marketplace-listed products from real API
      if (user?.shop_id && shop) {
        try {
          const res = await itemRequest("/products?page=1&limit=100");
          const products: Array<{
            id: string; name: string; description?: string;
            selling_price: number; cost_price?: number; quantity: number;
          }> = res?.data?.items ?? res?.data ?? [];

          let synced = 0;
          for (const p of products) {
            const meta = getProductMeta(p.id);
            if (!meta.listed) continue;
            const resolvedCategory = meta.category || (p as { category?: string }).category || catOf(p.name, p.description);
            upsertCatalogEntry({
              productId:    p.id,
              shopId:       user.shop_id,
              shopName:     shop.name,
              shopLogoUrl:  shop.logo_url,
              shopPhone:    shop.phone,
              name:         p.name,
              description:  p.description,
              category:     resolvedCategory,
              location:     meta.location,
              sellingPrice: p.selling_price,
              costPrice:    p.cost_price ?? p.selling_price,
              quantity:     p.quantity,
              images:       meta.images,
              listedAt:     meta.listed ? (getCatalog().find(e => e.productId === p.id)?.listedAt ?? new Date().toISOString()) : new Date().toISOString(),
            });
            synced++;
          }
          // Always rebuild after sync so the catalog reflects own-shop changes.
          // Start from builtCatalog (has Phase 2 API images) then overlay localStorage.
          const activeIds = new Set(allShops.map((s) => s.id));
          const m2 = new Map<string, MarketplaceEntry>(builtCatalog.map((e) => [e.productId, e]));
          for (const e of getCatalog()) {
            if (activeIds.has(e.shopId)) {
              const existing = m2.get(e.productId);
              // Keep existing images if the catalog entry has none (prefer non-empty)
              m2.set(e.productId, { ...e, images: e.images.length > 0 ? e.images : (existing?.images ?? []) });
            }
          }
          const synced2 = [...m2.values()];
          setCatalog(synced2);
          preloadImgs(synced2);
          writeMktCache(allShops, synced2); // write cache only here — always has images
          setApiSynced(true);
        } catch {
          setApiSynced(false);
        }
      }
    };

    load();
    if (user?.shop_id) setMyMessages(getMyMessages(user.shop_id));
    const tick = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.shop_id, shop?.id]);

  // ── Real-time: SSE-driven refresh + 60s fallback polling ────────────────────
  useEffect(() => {
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let sseCtrl: AbortController | null = null;

    // Lightweight refresh: shops + marketplace products, no user-sync (done on initial load)
    async function refresh() {
      try {
        const shopsRes = await listShops({ limit: 200 });
        const freshShops = (shopsRes.items ?? []).filter((s) => s.is_active);
        setShops(freshShops);
        setOnlineShopsCount(freshShops.filter((s) => isOnline(s.last_seen_at, new Date())).length);

        const srvEntries: MarketplaceEntry[] = [];
        for (const s of freshShops) {
          for (const e of decodeShopCatalog(s.description)) {
            srvEntries.push({
              productId: e.pid, shopId: s.id, shopName: s.name,
              shopLogoUrl: s.logo_url, shopPhone: s.phone,
              name: e.n, description: e.d, category: e.cat,
              sellingPrice: e.price, costPrice: e.price,
              quantity: e.qty, images: [], listedAt: e.at,
            });
          }
        }
        serverCatalogRef.current = srvEntries;

        // Public endpoint — fetch for everyone, not just logged-in users.
        const dbEntries: MarketplaceEntry[] = [];
        try {
          const mkRes = await itemRequest("/products/marketplace?limit=200");
          const mkItems: Array<{
            id: string; shop_id: string; name: string; description?: string;
            category?: string; images?: string; selling_price: number;
            cost_price: number; quantity: number;
          }> = mkRes?.data?.items ?? [];
          for (const item of mkItems) {
            const s = freshShops.find((sh) => sh.id === item.shop_id);
            if (!s) continue;
            const imgs: string[] = item.images ? (() => { try { return JSON.parse(item.images!) as string[]; } catch { return []; } })() : [];
            dbEntries.push({
              productId: item.id, shopId: item.shop_id,
              shopName: s.name, shopLogoUrl: s.logo_url, shopPhone: s.phone,
              name: item.name, description: item.description, category: item.category,
              sellingPrice: item.selling_price, costPrice: item.cost_price,
              quantity: item.quantity, images: imgs, listedAt: new Date().toISOString(),
            });
          }
        } catch { /* product service temporarily unavailable */ }

        const activeIds = new Set(freshShops.map((s) => s.id));
        const merged = new Map<string, MarketplaceEntry>(srvEntries.map((e) => [e.productId, e]));
        for (const e of getCatalog()) {
          if (activeIds.has(e.shopId)) merged.set(e.productId, e);
        }
        for (const e of dbEntries) {
          const local = merged.get(e.productId);
          merged.set(e.productId, { ...e, images: (local?.images?.length ?? 0) > 0 ? local!.images : e.images, listedAt: local?.listedAt ?? e.listedAt });
        }
        const refreshed = [...merged.values()];
        setCatalog(refreshed);
        preloadImgs(refreshed);
        writeMktCache(freshShops, refreshed);
      } catch { /* keep showing last-known catalog until the next refresh succeeds */ }
    }

    // Schedule next fallback poll (60 s when SSE is healthy, 15 s when degraded)
    function schedulePoll(delay = 60_000) {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = setTimeout(async () => {
        await refresh();
        schedulePoll(sseCtrl && !sseCtrl.signal.aborted ? 60_000 : 15_000);
      }, delay);
    }

    // Open SSE — any server-pushed event triggers an immediate lightweight refresh
    function connectSSE() {
      sseCtrl?.abort();
      sseCtrl = openNotifStream(
        async () => {
          // Server pushed something — refresh marketplace immediately
          await refresh();
          schedulePoll(60_000);
        },
        () => {
          // SSE unavailable — fall back to 15 s polling and try reconnecting after 30 s
          schedulePoll(15_000);
          setTimeout(connectSSE, 30_000);
        },
      );
    }

    connectSSE();
    schedulePoll(60_000); // also keep a heartbeat poll as belt-and-suspenders

    return () => {
      sseCtrl?.abort();
      if (pollTimer) clearTimeout(pollTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.shop_id, shop?.id]);

  const shopMap = useMemo(() => {
    const m: Record<string, Shop> = {};
    shops.forEach((s) => { m[s.id] = s; });
    return m;
  }, [shops]);

  // ── newest-first list — the header search bar and /category pages now own filtering ──
  const allFiltered = useMemo(() =>
    [...catalog].sort((a, b) => new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime()),
    [catalog]);

  // ── paginated slice ──────────────────────────────────────────────────────
  const visible = useMemo(() => allFiltered.slice(0, page * PAGE_SIZE), [allFiltered, page]);
  const hasMore  = visible.length < allFiltered.length;

  // ── infinite scroll sentinel ─────────────────────────────────────────────
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setPage((p) => p + 1);
        }
      },
      { rootMargin: "400px" }, // pre-load next batch 400px before user reaches bottom
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, visible.length]);

  const listedPerShop = useMemo(() => {
    const m: Record<string, number> = {};
    catalog.forEach((e) => { m[e.shopId] = (m[e.shopId] ?? 0) + 1; });
    return m;
  }, [catalog]);

  const featuredSuppliers = useMemo(() =>
    shops.filter((s) => (listedPerShop[s.id] ?? 0) > 0).slice(0, 4),
    [shops, listedPerShop]);

  // Hero section content — newest listings first, independent of the in-page search/filter state below
  const heroTrending = useMemo(() =>
    [...catalog].sort((a, b) => new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime()).slice(0, 5),
    [catalog]);
  const heroCategories = useMemo(() => CATEGORIES.slice(0, 6), []);

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#f5f5f5", minHeight: "100vh" }}>

      {/* ── QUICK MODULES (Alibaba-style dashboard strip) — white band ──────── */}
      <div className="bg-white">
      <section className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-[1.1fr_1fr_1fr_1fr_1.3fr]">

          {/* Categories for you */}
          <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-3">
            <p className="mb-2 truncate text-xs font-bold text-slate-900">Categories for you</p>
            <ul className="space-y-2">
              {heroCategories.map((c) => {
                const Icon = CATEGORY_ICONS[c.key] ?? Package;
                return (
                  <li key={c.key}>
                    <Link href={`/category/${c.key}`} className="flex items-center gap-2 text-xs text-slate-600 transition hover:text-orange-600">
                      <Icon size={13} className="shrink-0 text-slate-400" />
                      <span className="flex-1 truncate">{c.label}</span>
                      <ChevronRight size={12} className="shrink-0 text-slate-300" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Popular shop */}
          <div className="hidden min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-3 sm:block">
            <p className="mb-2 truncate text-xs font-bold text-slate-900">Popular Shop</p>
            {featuredSuppliers[0] ? (
              <Link href={`/shop/${featuredSuppliers[0].id}`} className="block">
                <div className="relative mb-2 flex aspect-square w-full min-w-0 items-center justify-center overflow-hidden rounded bg-slate-50">
                  {featuredSuppliers[0].logo_url ? (
                    <img src={featuredSuppliers[0].logo_url} alt={featuredSuppliers[0].name} className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <Store size={28} className="text-slate-300" />
                  )}
                </div>
                <p className="truncate text-xs font-semibold text-slate-800">{featuredSuppliers[0].name}</p>
                <p className="truncate text-[10px] text-slate-400">{listedPerShop[featuredSuppliers[0].id] ?? 0} products</p>
              </Link>
            ) : (
              <p className="text-[11px] text-slate-400">No shops yet</p>
            )}
          </div>

          {/* Trending product */}
          <div className="hidden min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-3 sm:block">
            <p className="mb-2 truncate text-xs font-bold text-slate-900">Trending Product</p>
            {heroTrending[0] ? (
              <Link href={`/product/${productSlug(heroTrending[0].name, heroTrending[0].productId)}`} className="block">
                <div className="relative mb-2 flex aspect-square w-full min-w-0 items-center justify-center overflow-hidden rounded bg-slate-50">
                  {heroTrending[0].images[0] ? (
                    <img src={heroTrending[0].images[0]} alt={heroTrending[0].name} className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <Package size={28} className="text-slate-300" />
                  )}
                </div>
                <p className="truncate text-xs font-semibold text-slate-800">{heroTrending[0].name}</p>
                <p className="truncate text-[10px] font-bold text-orange-600">{fmtPrice(heroTrending[0].sellingPrice)}</p>
              </Link>
            ) : (
              <p className="text-[11px] text-slate-400">No products yet</p>
            )}
          </div>

          {/* Newly listed */}
          <div className="hidden min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-3 lg:block">
            <p className="mb-2 truncate text-xs font-bold text-slate-900">Newly Listed</p>
            {heroTrending[1] ? (
              <Link href={`/product/${productSlug(heroTrending[1].name, heroTrending[1].productId)}`} className="block">
                <div className="relative mb-2 flex aspect-square w-full min-w-0 items-center justify-center overflow-hidden rounded bg-slate-50">
                  {heroTrending[1].images[0] ? (
                    <img src={heroTrending[1].images[0]} alt={heroTrending[1].name} className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <Package size={28} className="text-slate-300" />
                  )}
                </div>
                <p className="truncate text-xs font-semibold text-slate-800">{heroTrending[1].name}</p>
                <p className="truncate text-[10px] font-bold text-orange-600">{fmtPrice(heroTrending[1].sellingPrice)}</p>
              </Link>
            ) : (
              <p className="text-[11px] text-slate-400">No products yet</p>
            )}
          </div>

          {/* Promo banner */}
          <Link
            href="/products"
            className="col-span-2 flex min-w-0 flex-col justify-between overflow-hidden rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 p-4 sm:col-span-4 lg:col-span-1"
          >
            <div>
              <p className="text-sm font-bold leading-snug text-white">Fast-selling products</p>
              <p className="mt-1 text-xs text-orange-50">Discover what's trending across Higoverse</p>
            </div>
            <span className="mt-3 inline-flex w-fit items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-orange-600">
              View more <ArrowRight size={12} />
            </span>
          </Link>
        </div>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recommended for your business</p>
          <div className="h-px flex-1 bg-slate-200" />
        </div>
      </section>
      </div>

      {/* ── SHOP STATUS BANNER ───────────────────────────────────────────── */}

      {/* State 0: Application REJECTED — show reason and resubmit CTA */}
      {appStatus === "REJECTED" && user?.role !== "admin" && (
        <div className="border-b-2 border-red-400 bg-gradient-to-r from-red-50 to-red-100">
          <div className="mx-auto flex max-w-7xl items-start gap-3.5 px-4 py-3.5 sm:px-6">
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-500 text-xl font-black text-white">✕</div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-sm font-extrabold text-red-800">Your shop application was rejected</p>
              {rejectionInfo.rejectionReason && (
                <div className="mb-2.5 max-w-md rounded-lg border border-red-300 bg-white px-3 py-2">
                  <p className="mb-0.5 text-xs font-bold text-red-800">Reason from admin:</p>
                  <p className="text-xs text-red-900">{rejectionInfo.rejectionReason}</p>
                </div>
              )}
              <p className="mb-3 text-xs leading-relaxed text-red-800">
                Review the feedback, update your shop details, and resubmit for another review.
              </p>
              <button
                onClick={() => {
                  if (!user) { router.push(`/login?next=${encodeURIComponent("/?apply=1")}`); return; }
                  setShowShopForm(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-5 py-2 text-xs font-bold text-white transition hover:bg-red-600"
              >
                Edit &amp; Resubmit Application
              </button>
            </div>
          </div>
        </div>
      )}

      {/* State 1: No application yet — always visible, non-dismissible */}
      {appStatus === "NONE" && user?.role !== "admin" && (
        <div className="border-b-2 border-orange-400 bg-gradient-to-r from-orange-50 to-orange-100">
          <div className="mx-auto flex max-w-7xl items-start gap-3.5 px-4 py-3.5 sm:px-6">
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-500">
              <Rocket size={20} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-sm font-extrabold text-orange-800">Want to sell on Higoverse?</p>
              <p className="mb-3.5 text-xs leading-relaxed text-orange-900">
                Fill in your shop details — including your TIN — and submit for Higoverse admin review. Once approved, your full shop dashboard appears and your products go live on the marketplace.
              </p>
              <div className="mb-3.5 flex flex-wrap gap-1.5">
                {[
                  { n: 1, label: "Fill shop application" },
                  { n: 2, label: "Admin review & TIN verify" },
                  { n: 3, label: "Access dashboard & sell" },
                ].map((step) => (
                  <div key={step.n} className="flex items-center gap-1.5 rounded-full border border-orange-200 bg-white px-2.5 py-1">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[9px] font-black text-white">{step.n}</span>
                    <span className="text-[11px] font-semibold text-orange-900">{step.label}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  if (!user) { router.push(`/login?next=${encodeURIComponent("/?apply=1")}`); return; }
                  setShowShopForm(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-orange-600"
              >
                <Store size={14} /> Create my shop <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* State 3: Shop verified — quick access */}
      {!bannerDismissed && shopIsActive && (
        <div className="border-b border-emerald-200 bg-emerald-50">
          <div className="mx-auto flex max-w-7xl items-center gap-2.5 px-4 py-2.5 sm:px-6">
            <BadgeCheck size={16} className="shrink-0 text-emerald-600" />
            <p className="flex-1 text-xs font-semibold text-emerald-800">
              <strong>{shop?.name}</strong> is verified and active on the marketplace.
            </p>
            <Link href="/dashboard" className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-700">
              <LayoutDashboard size={12} /> Shop Dashboard
            </Link>
            <button onClick={dismissBanner} className="flex text-emerald-600 transition hover:text-emerald-800">
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ── BODY ─────────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">

        {/* ── MAIN ───────────────────────────────────────────────────────── */}
        <main className="min-w-0">

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {Array.from({ length: PAGE_SIZE }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : allFiltered.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {visible.map((entry, idx) => (
                  <LazyProductCard
                    key={entry.productId}
                    priority={idx < 8}
                    entry={entry}
                    shop={shopMap[entry.shopId]}
                    isMine={entry.shopId === user?.shop_id}
                    online={shopMap[entry.shopId] ? isOnline(shopMap[entry.shopId].last_seen_at, now) : false}
                  />
                ))}
              </div>

              {/* Scroll sentinel */}
              <div ref={sentinelRef} className="h-px" />

              {/* Load-more skeleton row */}
              {loadingMore && (
                <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
              )}

              {!hasMore && allFiltered.length > PAGE_SIZE && (
                <p className="py-5 text-center text-xs text-slate-300">
                  All {allFiltered.length} products loaded
                </p>
              )}
            </>
          )}
        </main>
      </div>

      {/* ── CHAT NOW PANEL (Alibaba style) ───────────────────────────────── */}
      {msgEntry && (() => {
        const thread = myMessages.filter((m) => m.productId === msgEntry.productId && m.shopId === msgEntry.shopId);
        const shopInitial = msgEntry.shopName[0]?.toUpperCase() ?? "S";
        const buyerInitial = (user?.name ?? user?.email ?? "B")[0]?.toUpperCase();
        return (
          <div style={{ position: "fixed", bottom: 0, right: 24, width: 360, height: 480, background: "#fff", boxShadow: "0 -2px 20px rgba(0,0,0,0.15)", zIndex: 60, display: "flex", flexDirection: "column", border: "1px solid #e8e8e8" }}>

            {/* Header */}
            <div style={{ background: "#ff6a00", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#fff", flexShrink: 0 }}>
                {shopInitial}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#fff", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msgEntry.shopName}</p>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", margin: 0, display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#a5f3a5", display: "inline-block" }} /> Online
                </p>
              </div>
              <button onClick={() => setMsgEntry(null)}
                style={{ border: "none", background: "rgba(255,255,255,0.2)", cursor: "pointer", color: "#fff", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                ✕
              </button>
            </div>

            {/* Product context bar */}
            <div style={{ display: "flex", gap: 8, padding: "8px 12px", background: "#fff5f0", borderBottom: "1px solid #ffe0c0", flexShrink: 0 }}>
              {msgEntry.images[0]
                ? <img src={msgEntry.images[0]} alt={msgEntry.name} style={{ width: 36, height: 36, objectFit: "cover", flexShrink: 0, border: "1px solid #e8e8e8" }} />
                : <div style={{ width: 36, height: 36, background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Package size={14} style={{ color: "#ccc" }} /></div>}
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#333", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msgEntry.name}</p>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#ff6a00", margin: "1px 0 0" }}>{fmtPrice(msgEntry.sellingPrice)}</p>
              </div>
            </div>

            {/* Messages area */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 10, background: "#f9f9f9" }}>
              {thread.length === 0 && !msgSent && (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <p style={{ fontSize: 11, color: "#bbb" }}>Start a conversation with {msgEntry.shopName}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center", marginTop: 10 }}>
                    {["Is this available?", "Minimum order?", "Bulk discount?", "Do you deliver?"].map((q) => (
                      <button key={q} onClick={() => setMsgText(q)}
                        style={{ fontSize: 10, padding: "4px 8px", border: "1px solid #ffb899", background: msgText === q ? "#fff5f0" : "#fff", color: "#ff6a00", cursor: "pointer" }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Thread messages */}
              {thread.map((m) => (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* Buyer's original message */}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, alignItems: "flex-end" }}>
                    <div>
                      <div style={{ background: "#ff6a00", color: "#fff", padding: "7px 10px", fontSize: 12, lineHeight: 1.5, maxWidth: 220 }}>
                        {m.text}
                      </div>
                      <p style={{ fontSize: 9, color: "#bbb", margin: "2px 0 0", textAlign: "right" }}>
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#ff6a00", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: "#fff", flexShrink: 0 }}>
                      {buyerInitial}
                    </div>
                  </div>

                  {/* Replies */}
                  {m.replies.map((r) => (
                    <div key={r.id} style={{ display: "flex", justifyContent: r.fromShop ? "flex-start" : "flex-end", gap: 6, alignItems: "flex-end" }}>
                      {r.fromShop && (
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#555", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: "#fff", flexShrink: 0 }}>
                          {shopInitial}
                        </div>
                      )}
                      <div>
                        <div style={{ background: r.fromShop ? "#fff" : "#ff6a00", color: r.fromShop ? "#333" : "#fff", border: r.fromShop ? "1px solid #e8e8e8" : "none", padding: "7px 10px", fontSize: 12, lineHeight: 1.5, maxWidth: 220 }}>
                          {r.text}
                        </div>
                        <p style={{ fontSize: 9, color: "#bbb", margin: "2px 0 0", textAlign: r.fromShop ? "left" : "right" }}>
                          {new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      {!r.fromShop && (
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#ff6a00", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: "#fff", flexShrink: 0 }}>
                          {buyerInitial}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}

              {msgSent && (
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, alignItems: "flex-end" }}>
                  <div>
                    <div style={{ background: "#ff6a00", color: "#fff", padding: "7px 10px", fontSize: 12, lineHeight: 1.5, maxWidth: 220 }}>
                      {msgText || "Message sent"}
                    </div>
                    <p style={{ fontSize: 9, color: "#bbb", margin: "2px 0 0", textAlign: "right", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3 }}>
                      <CheckCircle size={9} style={{ color: "#52c41a" }} /> Sent
                    </p>
                  </div>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#ff6a00", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: "#fff", flexShrink: 0 }}>
                    {buyerInitial}
                  </div>
                </div>
              )}
            </div>

            {/* Input row */}
            <div style={{ borderTop: "1px solid #e8e8e8", padding: "8px 10px", background: "#fff", display: "flex", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
              <textarea
                value={msgSent ? "" : msgText}
                disabled={msgSent}
                onChange={(e) => setMsgText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && msgText.trim() && !msgSent) {
                    e.preventDefault();
                    if (!user) return;
                    sendMessage({
                      productId: msgEntry.productId,
                      productName: msgEntry.name,
                      shopId: msgEntry.shopId,
                      shopName: msgEntry.shopName,
                      buyerShopId: user.shop_id ?? "",
                      buyerName: user.name ?? user.email ?? "Buyer",
                      text: msgText.trim(),
                      timestamp: new Date().toISOString(),
                    });
                    setMsgSent(true);
                    if (user?.shop_id) setMyMessages(getMyMessages(user.shop_id));
                  }
                }}
                placeholder={msgSent ? "Message sent ✓" : `Message ${msgEntry.shopName}...`}
                rows={1}
                style={{ flex: 1, border: "1px solid #e8e8e8", padding: "7px 10px", fontSize: 12, outline: "none", resize: "none", fontFamily: "Arial, sans-serif", borderRadius: 0, background: msgSent ? "#f9f9f9" : "#fff", color: "#333" }}
              />
              <button
                disabled={!msgText.trim() || msgSent}
                onClick={() => {
                  if (!msgText.trim() || msgSent || !user) return;
                  sendMessage({
                    productId: msgEntry.productId,
                    productName: msgEntry.name,
                    shopId: msgEntry.shopId,
                    shopName: msgEntry.shopName,
                    buyerShopId: user.shop_id ?? "",
                    buyerName: user.name ?? user.email ?? "Buyer",
                    text: msgText.trim(),
                    timestamp: new Date().toISOString(),
                  });
                  setMsgSent(true);
                  if (user?.shop_id) setMyMessages(getMyMessages(user.shop_id));
                }}
                style={{ width: 36, height: 36, border: "none", background: msgText.trim() && !msgSent ? "#ff6a00" : "#f5f5f5", color: msgText.trim() && !msgSent ? "#fff" : "#ccc", cursor: msgText.trim() && !msgSent ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Send size={14} />
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── SHOP APPLICATION MODAL ───────────────────────────────────────── */}
      {showShopForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowShopForm(false); }}
        >
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            {/* Header */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#ff6a00", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Store size={20} style={{ color: "#fff" }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 16, fontWeight: 800, color: "#111", margin: 0 }}>
                  {appStatus === "REJECTED" ? "Edit & Resubmit Application" : "Shop Application"}
                </p>
                <p style={{ fontSize: 11, color: "#888", margin: 0 }}>Fill in your shop details for Higoverse admin review</p>
              </div>
              <button onClick={() => setShowShopForm(false)} style={{ border: "none", background: "#f5f5f5", cursor: "pointer", color: "#666", width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={14} />
              </button>
            </div>

            {/* Form */}
            <div style={{ padding: "20px 24px" }}>
              {shopFormError && (
                <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#be123c", display: "flex", alignItems: "center", gap: 8 }}>
                  <X size={13} /> {shopFormError}
                </div>
              )}

              {/* Rejection notice */}
              {appStatus === "REJECTED" && rejectionInfo.rejectionReason && (
                <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#7f1d1d", margin: "0 0 4px" }}>Previous rejection reason:</p>
                  <p style={{ fontSize: 12, color: "#991b1b", margin: 0 }}>{rejectionInfo.rejectionReason}</p>
                </div>
              )}

              {/* Admin review notice */}
              <div style={{ background: "#fffbe6", border: "1px solid #ffe58f", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#7c5e00", display: "flex", gap: 10, alignItems: "flex-start" }}>
                <Clock size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Your application will be reviewed by the Higoverse admin. Once verified, you&apos;ll receive shop dashboard access. Make sure your TIN is correct — we verify it with RRA.</span>
              </div>

              {/* ─ Section: Shop Information ─ */}
              <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 12px" }}>Shop Information</p>

              {/* Shop name */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                  Shop Name <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <div style={{ position: "relative" }}>
                  <Store size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
                  <input
                    value={shopForm.shop_name}
                    onChange={(e) => setShopForm((f) => ({ ...f, shop_name: e.target.value }))}
                    placeholder="e.g. Kigali Electronics Shop"
                    style={{ width: "100%", padding: "10px 12px 10px 34px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              {/* Business type */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                  Business Type <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <div style={{ position: "relative" }}>
                  <Building2 size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
                  <select
                    value={shopForm.business_type}
                    onChange={(e) => setShopForm((f) => ({ ...f, business_type: e.target.value }))}
                    style={{ width: "100%", padding: "10px 34px 10px 34px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", appearance: "none", background: "#fff", color: shopForm.business_type ? "#111" : "#9ca3af" }}
                  >
                    <option value="">Select business type</option>
                    <option value="Retail Shop">Retail Shop</option>
                    <option value="Wholesale / Distribution">Wholesale / Distribution</option>
                    <option value="Restaurant / Food">Restaurant / Food</option>
                    <option value="Electronics">Electronics</option>
                    <option value="Fashion & Apparel">Fashion &amp; Apparel</option>
                    <option value="Agriculture & Farming">Agriculture &amp; Farming</option>
                    <option value="Health & Pharmacy">Health &amp; Pharmacy</option>
                    <option value="Furniture & Home">Furniture &amp; Home</option>
                    <option value="Vehicles">Vehicles</option>
                    <option value="Gas & Accessories">Gas &amp; Accessories</option>
                    <option value="Spare Parts">Spare Parts</option>
                    <option value="Constructions">Constructions</option>
                    <option value="Services">Services</option>
                    <option value="Other">Other</option>
                  </select>
                  <ChevronDown size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", pointerEvents: "none" }} />
                </div>
              </div>

              {/* TIN */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                  TIN / Tax Identification Number <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <div style={{ position: "relative" }}>
                  <FileText size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
                  <input
                    value={shopForm.tin}
                    onChange={(e) => setShopForm((f) => ({ ...f, tin: e.target.value.replace(/\D/g, "").slice(0, 15) }))}
                    placeholder="e.g. 123456789"
                    type="text"
                    inputMode="numeric"
                    style={{ width: "100%", padding: "10px 12px 10px 34px", border: shopForm.tin ? "1.5px solid #ff6a00" : "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "monospace", letterSpacing: 1 }}
                  />
                </div>
                <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>Your Rwanda Revenue Authority (RRA) tax number. Admin verifies this before approval.</p>
              </div>

              {/* ─ Section: Owner Information ─ */}
              <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, margin: "16px 0 12px" }}>Owner Information</p>

              {/* 2-column: Owner name + Phone */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Owner Name</label>
                  <input
                    value={shopForm.owner_name}
                    onChange={(e) => setShopForm((f) => ({ ...f, owner_name: e.target.value }))}
                    placeholder="Full name"
                    style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                    Phone Number <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    value={shopForm.phone}
                    onChange={(e) => setShopForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+250 7XX XXX XXX"
                    type="tel"
                    style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              {/* Email */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Business Email</label>
                <div style={{ position: "relative" }}>
                  <Mail size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
                  <input
                    value={shopForm.email}
                    onChange={(e) => setShopForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="shop@example.com"
                    type="email"
                    style={{ width: "100%", padding: "10px 12px 10px 34px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              {/* ─ Section: Location ─ */}
              <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, margin: "16px 0 12px" }}>Location</p>

              {/* 2-column: Province + District */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Province</label>
                  <div style={{ position: "relative" }}>
                    <select
                      value={shopForm.province}
                      onChange={(e) => setShopForm((f) => ({ ...f, province: e.target.value, district: "" }))}
                      style={{ width: "100%", padding: "10px 28px 10px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", appearance: "none", background: "#fff", color: shopForm.province ? "#111" : "#9ca3af", boxSizing: "border-box" }}
                    >
                      <option value="">Select province</option>
                      <option value="Kigali City">Kigali City</option>
                      <option value="Northern Province">Northern Province</option>
                      <option value="Southern Province">Southern Province</option>
                      <option value="Eastern Province">Eastern Province</option>
                      <option value="Western Province">Western Province</option>
                    </select>
                    <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", pointerEvents: "none" }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                    District <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <select
                      value={shopForm.district}
                      onChange={(e) => setShopForm((f) => ({ ...f, district: e.target.value }))}
                      style={{ width: "100%", padding: "10px 28px 10px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", appearance: "none", background: "#fff", color: shopForm.district ? "#111" : "#9ca3af", boxSizing: "border-box" }}
                    >
                      <option value="">Select district</option>
                      {shopForm.province === "Kigali City" && <>
                        <option>Gasabo</option><option>Kicukiro</option><option>Nyarugenge</option>
                      </>}
                      {shopForm.province === "Northern Province" && <>
                        <option>Burera</option><option>Gakenke</option><option>Gicumbi</option><option>Musanze</option><option>Rulindo</option>
                      </>}
                      {shopForm.province === "Southern Province" && <>
                        <option>Gisagara</option><option>Huye</option><option>Kamonyi</option><option>Muhanga</option><option>Nyamagabe</option><option>Nyanza</option><option>Nyaruguru</option><option>Ruhango</option>
                      </>}
                      {shopForm.province === "Eastern Province" && <>
                        <option>Bugesera</option><option>Gatsibo</option><option>Kayonza</option><option>Kirehe</option><option>Ngoma</option><option>Nyagatare</option><option>Rwamagana</option>
                      </>}
                      {shopForm.province === "Western Province" && <>
                        <option>Karongi</option><option>Ngororero</option><option>Nyabihu</option><option>Nyamasheke</option><option>Rubavu</option><option>Rusizi</option><option>Rutsiro</option>
                      </>}
                      {!shopForm.province && ["Nyarugenge","Gasabo","Kicukiro","Bugesera","Gatsibo","Kayonza","Kirehe","Ngoma","Nyagatare","Rwamagana","Burera","Gakenke","Gicumbi","Musanze","Rulindo","Gisagara","Huye","Kamonyi","Muhanga","Nyamagabe","Nyanza","Ruhango","Karongi","Ngororero","Nyabihu","Nyamasheke","Rubavu","Rusizi","Rutsiro"].map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", pointerEvents: "none" }} />
                  </div>
                </div>
              </div>

              {/* 2-column: Sector + Business Address */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Sector</label>
                  <input
                    value={shopForm.sector}
                    onChange={(e) => setShopForm((f) => ({ ...f, sector: e.target.value }))}
                    placeholder="e.g. Kimironko"
                    style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Street / Building</label>
                  <input
                    value={shopForm.address}
                    onChange={(e) => setShopForm((f) => ({ ...f, address: e.target.value }))}
                    placeholder="e.g. KG 123 St"
                    style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              {/* ─ Section: Shop Profile ─ */}
              <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, margin: "16px 0 12px" }}>Shop Profile</p>

              {/* Description */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                  About Your Shop
                </label>
                <textarea
                  value={shopForm.description}
                  onChange={(e) => setShopForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Briefly describe your products, services, or what makes your shop unique..."
                  rows={3}
                  style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
                />
              </div>

              {/* Logo + Banner upload */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
                {/* Logo */}
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Shop Logo</label>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    {shopForm.logo_url ? (
                      <img src={shopForm.logo_url} alt="Logo" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                    ) : (
                      <div style={{ width: 64, height: 64, borderRadius: 10, border: "2px dashed #d1d5db", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb" }}>
                        <ImagePlus size={22} style={{ color: "#9ca3af" }} />
                      </div>
                    )}
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", border: "1.5px solid #e5e7eb", borderRadius: 7, fontSize: 11, fontWeight: 600, color: "#374151", cursor: "pointer", background: "#fff" }}>
                      <ImagePlus size={12} /> {shopForm.logo_url ? "Change" : "Upload"}
                      <input type="file" accept="image/*" style={{ display: "none" }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file) return;
                          const c = await compressImage(file, 400);
                          setShopForm((f) => ({ ...f, logo_url: c })); e.target.value = "";
                        }} />
                    </label>
                    {shopForm.logo_url && <button onClick={() => setShopForm((f) => ({ ...f, logo_url: "" }))} style={{ border: "none", background: "none", cursor: "pointer", color: "#9ca3af", fontSize: 11 }}>Remove</button>}
                  </div>
                </div>

                {/* Banner */}
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Shop Banner</label>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    {shopForm.banner_url ? (
                      <img src={shopForm.banner_url} alt="Banner" style={{ width: "100%", height: 64, objectFit: "cover", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                    ) : (
                      <div style={{ width: "100%", height: 64, borderRadius: 10, border: "2px dashed #d1d5db", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb" }}>
                        <ImagePlus size={22} style={{ color: "#9ca3af" }} />
                      </div>
                    )}
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", border: "1.5px solid #e5e7eb", borderRadius: 7, fontSize: 11, fontWeight: 600, color: "#374151", cursor: "pointer", background: "#fff" }}>
                      <ImagePlus size={12} /> {shopForm.banner_url ? "Change" : "Upload"}
                      <input type="file" accept="image/*" style={{ display: "none" }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file) return;
                          const c = await compressImage(file, 1200, 0.7);
                          setShopForm((f) => ({ ...f, banner_url: c })); e.target.value = "";
                        }} />
                    </label>
                    {shopForm.banner_url && <button onClick={() => setShopForm((f) => ({ ...f, banner_url: "" }))} style={{ border: "none", background: "none", cursor: "pointer", color: "#9ca3af", fontSize: 11 }}>Remove</button>}
                  </div>
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={submitShopApplication}
                disabled={shopFormLoading}
                style={{ width: "100%", padding: "12px 0", background: shopFormLoading ? "#fed7aa" : "#ff6a00", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: shopFormLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                {shopFormLoading
                  ? <><Loader2 size={15} style={{ animation: "spin 0.8s linear infinite" }} /> Submitting...</>
                  : <><CheckCircle2 size={15} /> {appStatus === "REJECTED" ? "Resubmit Application" : "Submit Application"}</>}
              </button>
              <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 10 }}>
                Higoverse admin will review your application and respond within 1–2 business days.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ReplyBox ──────────────────────────────────────────────────────────────────
function ReplyBox({ messageId, fromShop, onSent }: { messageId: string; fromShop: boolean; onSent: () => void }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) {
            setSending(true);
            replyToMessage(messageId, text.trim(), fromShop);
            setText("");
            setSending(false);
            onSent();
          }
        }}
        placeholder="Reply... (Enter to send)"
        style={{ flex: 1, border: "1px solid #e8e8e8", padding: "5px 8px", fontSize: 11, outline: "none" }}
      />
      <button
        disabled={!text.trim() || sending}
        onClick={() => {
          if (!text.trim()) return;
          replyToMessage(messageId, text.trim(), fromShop);
          setText("");
          onSent();
        }}
        style={{ padding: "5px 10px", background: "#1677ff", color: "#fff", border: "none", cursor: text.trim() ? "pointer" : "not-allowed", opacity: text.trim() ? 1 : 0.4 }}>
        <Send size={11} />
      </button>
    </div>
  );
}

// ── Lazy reveal wrapper ───────────────────────────────────────────────────────
// Skeleton shows until the card enters viewport AND its image fully downloads.
// The real card renders off-screen while downloading so the browser can fetch
// in parallel; once ready it swaps in with a fade-up animation.
function LazyProductCard(props: React.ComponentProps<typeof ProductCard> & { priority?: boolean }) {
  const pid        = props.entry.productId;
  const ref        = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  // Initialise from module-level cache so remounts never regress to skeleton
  const [ready, setReady]   = useState(() => _readyCardIds.has(pid));

  useEffect(() => {
    if (ready) return; // already revealed — skip observer entirely
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } },
      { rootMargin: "600px 0px" }, // pre-fetch images well before card is visible
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ready]);

  const handleReady = useCallback(() => {
    _readyCardIds.add(pid); // persist across remounts
    const el = ref.current;
    const delay = el ? Math.min(el.getBoundingClientRect().left / window.innerWidth, 1) * 55 : 0;
    setTimeout(() => setReady(true), delay);
  }, [pid]);

  // Already revealed on a previous render — show immediately, no wrapper needed
  if (ready) return <ProductCard {...props} onReady={undefined} />;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <SkeletonCard />
      {inView && (
        <div style={{ position: "absolute", inset: 0, opacity: 0, pointerEvents: "none" }}>
          <ProductCard {...props} onReady={handleReady} />
        </div>
      )}
    </div>
  );
}

// ── Skeleton card — matches new card shape exactly ───────────────────────────
function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="hgv-shimmer aspect-square" />
      <div className="flex flex-col gap-1.5 p-2.5">
        <div className="hgv-shimmer h-3 w-[90%] rounded" />
        <div className="hgv-shimmer h-3 w-[65%] rounded" />
        <div className="hgv-shimmer mt-0.5 h-4 w-[50%] rounded" />
        <div className="hgv-shimmer h-2 w-[70%] rounded" />
        <div className="hgv-shimmer h-2 w-[45%] rounded" />
        <div className="mt-0.5 flex items-center gap-1.5 border-t border-slate-100 pt-2">
          <div className="hgv-shimmer h-6 w-6 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-1">
            <div className="hgv-shimmer h-2.5 w-[75%] rounded" />
            <div className="hgv-shimmer h-2 w-[50%] rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-5 py-16 text-center">
      <Package size={48} className="mx-auto mb-4 text-slate-200" />
      <p className="mb-1.5 text-base font-semibold text-slate-600">No products listed yet</p>
      <p className="mx-auto mb-5 max-w-sm text-xs leading-relaxed text-slate-400">
        Go to Items, upload at least 3 product photos, then enable Share on Marketplace.
      </p>
      <Link href="/items" className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-5 py-2 text-xs font-bold text-white transition hover:bg-orange-600">
        <Package size={13} /> Go to Items
      </Link>
    </div>
  );
}

// ── Module-level caches — survive React remounts caused by catalog refreshes ──
// Without these, every catalog poll resets component state → skeleton flash loop.
const _failedImgUrls  = new Set<string>(); // image URLs that 404'd
const _loadedImgUrls  = new Set<string>(); // image URLs fully downloaded
const _readyCardIds   = new Set<string>(); // product IDs whose card has been revealed

/** Kick off background downloads for the first N product images so they're in
 *  the browser cache by the time their cards scroll into view. */
function preloadImgs(catalog: MarketplaceEntry[], n = 16) {
  if (typeof window === "undefined") return;
  catalog.slice(0, n).forEach((entry) => {
    const url = entry.images.find((u) => !_failedImgUrls.has(u) && !_loadedImgUrls.has(u));
    if (!url) return;
    const img = new window.Image();
    img.onload = () => _loadedImgUrls.add(url);
    img.onerror = () => _failedImgUrls.add(url);
    img.src = url;
  });
}


// ── Product card ──────────────────────────────────────────────────────────────
function ProductCard({ entry, shop, isMine, online, onReady, priority }: {
  entry: MarketplaceEntry;
  shop: Shop | undefined;
  isMine: boolean;
  online: boolean;
  onReady?: () => void;
  priority?: boolean;
}) {
  const [, _forceImg] = useState(0);
  const cover       = entry.images.find((u) => !_failedImgUrls.has(u));
  // Initialise from module-level cache — survives catalog refresh remounts
  const [imgLoaded, setImgLoaded] = useState(() => !!cover && _loadedImgUrls.has(cover));
  const inStock     = entry.quantity > 0;
  const logoInitial = (entry.shopName[0] ?? "?").toUpperCase();

  // Signal parent (LazyProductCard) when we know what to show.
  // Use ref so this fires once even if component remounts.
  const readyFired = useRef(false);
  useEffect(() => {
    if (readyFired.current || !onReady) return;
    // Already loaded (from cache) or no image → signal immediately
    if (!cover || _loadedImgUrls.has(cover)) { readyFired.current = true; onReady(); }
  }, [cover, onReady]);

  const category = entry.category ?? catOf(entry.name, entry.description);

  return (
    <Link
      href={`/product/${productSlug(entry.name, entry.productId)}`}
      className="group relative flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      {/* ── Image / no-photo area ── */}
      <div className="relative aspect-square shrink-0 overflow-hidden">
        {cover ? (
          <div className="absolute inset-0">
            {!imgLoaded && <div className="hgv-shimmer absolute inset-0" />}
            <img
              src={cover}
              alt={entry.name}
              loading="eager"
              decoding={priority ? "sync" : "async"}
              fetchPriority={priority ? "high" : "auto"}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => {
                _loadedImgUrls.add(cover); // persist — survives remounts
                setImgLoaded(true);
                if (!readyFired.current && onReady) { readyFired.current = true; onReady(); }
              }}
              onError={() => {
                _failedImgUrls.add(cover);
                _forceImg((n) => n + 1);
                if (!readyFired.current && onReady) { readyFired.current = true; onReady(); }
              }}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-slate-300">
            <Package size={32} />
          </div>
        )}

        {/* Top-left badges */}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {isMine && (
            <span className="rounded bg-orange-500 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide text-white">YOURS</span>
          )}
          {!inStock && (
            <span className="rounded bg-red-500/90 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">Out of stock</span>
          )}
        </div>

        {/* Gallery indicator — bottom-left camera badge */}
        {cover && (
          <span className="absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow">
            <Camera size={12} />
          </span>
        )}

        {/* Online dot */}
        {online && (
          <span className="absolute bottom-2 right-2 h-2 w-2 rounded-full border-2 border-white bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.3)]" title="Shop is online" />
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex flex-1 flex-col gap-1 p-2.5">

        {/* Product name */}
        <p className="line-clamp-2 min-h-[2.4em] text-xs leading-snug text-slate-700">
          {entry.name}
        </p>

        {/* Price */}
        <span className="text-base font-bold leading-none text-slate-900">
          {fmtPrice(entry.sellingPrice)}
        </span>

        {/* Min order */}
        <p className="text-[10px] font-medium text-slate-600">
          Min. 1 unit · {category.charAt(0).toUpperCase() + category.slice(1)}
        </p>

        {/* Verified + tenure */}
        {shop && (
          <p className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
            <BadgeCheck size={11} /> Verified
            {shopTenureLabel(shop.created_at) && <span className="font-normal text-slate-400">· {shopTenureLabel(shop.created_at)}</span>}
          </p>
        )}

        {/* Supplier row — always at bottom */}
        <div className="mt-auto flex items-center gap-1.5 border-t border-slate-100 pt-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-orange-500 to-pink-600 shadow-sm">
            {shop?.logo_url && !_failedImgUrls.has(shop.logo_url)
              ? <img src={shop.logo_url} alt={entry.shopName} loading="lazy" decoding="async"
                  onError={() => { _failedImgUrls.add(shop!.logo_url!); _forceImg((n) => n + 1); }}
                  className="h-full w-full object-cover" />
              : <span className="text-[9px] font-black text-white">{logoInitial}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-slate-600">
              {entry.shopName}
            </p>
            {formatShortAddress(shop?.address) && (
              <p className="flex items-center gap-0.5 truncate text-[10px] text-slate-400">
                <MapPin size={8} className="shrink-0 text-slate-300" />
                {formatShortAddress(shop?.address)}
              </p>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
