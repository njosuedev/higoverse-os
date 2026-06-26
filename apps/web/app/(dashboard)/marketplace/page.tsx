"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useShop } from "@/lib/shop-context";
import { listShops, updateMyShop, createShopApplication, type Shop } from "@/lib/shop-api";
import {
  getCatalog, upsertCatalogEntry, getProductMeta, compressImage, decodeShopCatalog,
  encodeShopDescription, encodeShopAddress, parseShopAddress, decodeShopHumanInfo,
  getApplicationStatus,
  type MarketplaceEntry,
} from "@/lib/product-meta";
import { itemRequest } from "@/lib/product-api";
import {
  Search, X, ShoppingCart, Plus, Minus, Loader2,
  CheckCircle, Phone, Package, ChevronRight, Star,
  MapPin, MessageSquare, Send, Store, Mail,
  Rocket, ArrowRight, LayoutDashboard, CheckCircle2,
  Wifi, Building2, FileText, ImagePlus, ChevronDown,
  Clock, BadgeCheck, Heart, Users,
} from "lucide-react";
import {
  sendMessage, getMyMessages, replyToMessage,
  followShop, unfollowShop, isFollowingShop, getFollowedShops, getShopFollowerCount,
  type ShopMessage,
} from "@/lib/product-meta";
import { createOrGetConversation } from "@/lib/messages-api";
import { createSelfNotification } from "@/lib/notifications-api";

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
// highlight matched query inside text
function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "#fff3cd", padding: 0, fontWeight: 700 }}>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

// ── categories ────────────────────────────────────────────────────────────────
const ALL_CATS = [
  { key: "all",         label: "All Products"     },
  { key: "food",        label: "Food & Drinks"     },
  { key: "electronics", label: "Electronics"       },
  { key: "fashion",     label: "Fashion & Apparel" },
  { key: "wholesale",   label: "Wholesale & Bulk"  },
  { key: "agriculture", label: "Agriculture"       },
  { key: "health",      label: "Health & Beauty"   },
  { key: "furniture",   label: "Furniture & Decor" },
  { key: "services",    label: "Services"          },
  { key: "other",       label: "Other"             },
];

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

interface OrderModal { entry: MarketplaceEntry; shop: Shop | undefined; qty: number; }

export default function MarketplacePage() {
  const { user }  = useAuth();
  const { shop }  = useShop();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [shops, setShops]       = useState<Shop[]>([]);
  const [catalog, setCatalog]   = useState<MarketplaceEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [rawSearch, setRawSearch] = useState("");
  const [search, setSearch]     = useState("");           // debounced
  const [searching, setSearching] = useState(false);
  const [cat, setCat]           = useState("all");
  const [now, setNow]           = useState(new Date());
  const [page, setPage]         = useState(1);            // how many PAGE_SIZE batches shown
  const [loadingMore, setLoadingMore] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [apiSynced, setApiSynced] = useState(false);
  const [onlineShopsCount, setOnlineShopsCount] = useState(0);
  const [sort, setSort] = useState<"newest"|"price_asc"|"price_desc"|"name_az"|"stock">("newest");
  const [liveConnected, setLiveConnected] = useState(false);

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
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverCatalogRef = useRef<MarketplaceEntry[]>([]);

  useEffect(() => {
    if (localStorage.getItem("mp_shop_banner_dismissed") === "1") setBannerDismissed(true);
    if (localStorage.getItem("mp_shop_applied") === "1") setShopApplied(true);
  }, []);

  // Auto-open shop application form from CTA links (?apply=1)
  // For rejected applications, bypass the shopApplied localStorage flag so resubmission always works
  useEffect(() => {
    if (searchParams.get("apply") !== "1") return;
    if (shop?.is_active === true) return;
    const status = getApplicationStatus(shop?.description, shop?.address, !!shop?.is_active);
    const isRejected = status === "REJECTED";
    if (!shopApplied || isRejected) {
      if (isRejected) localStorage.removeItem("mp_shop_applied");
      setShowShopForm(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, shop?.is_active, shop?.description, shop?.address]);

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

  const [detailEntry, setDetailEntry] = useState<MarketplaceEntry | null>(null);
  const [detailImg, setDetailImg]     = useState(0);
  const [orderModal, setOrderModal]   = useState<OrderModal | null>(null);
  const [ordering, setOrdering]       = useState(false);
  const [orderError, setOrderError]   = useState("");

  // messaging
  const [msgEntry, setMsgEntry]       = useState<MarketplaceEntry | null>(null);
  const [msgText, setMsgText]         = useState("");
  const [msgSent, setMsgSent]         = useState(false);
  const [myMessages, setMyMessages]   = useState<ShopMessage[]>([]);
  const [contactingProductId, setContactingProductId] = useState<string | null>(null);

  // follow
  const [followedShopIds, setFollowedShopIds] = useState<Set<string>>(new Set());

  // ── data load ────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      // 1. Load shops from live auth API — source of truth for all registered shops
      let allShops: typeof shops = [];
      try {
        const shopsRes = await listShops({ limit: 500 });
        allShops = (shopsRes.items ?? []).filter((s) => s.is_active);
        setShops(allShops);
        const now = new Date();
        const onlineNow = allShops.filter((s) => {
          if (!s.last_seen_at) return false;
          const d = new Date(s.last_seen_at.endsWith("Z") ? s.last_seen_at : s.last_seen_at + "Z");
          return (now.getTime() - d.getTime()) / 1000 < 300;
        });
        setOnlineShopsCount(onlineNow.length);
      } catch { /* shops stay empty */ }

      // 1.5. Build server catalog from each shop's description field
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

      // 1.75. Fetch /marketplace from product DB — primary source with real images (cross-shop)
      const dbEntries: MarketplaceEntry[] = [];
      if (user) {
        try {
          const mkRes = await itemRequest("/products/marketplace?limit=500");
          const mkItems: Array<{
            id: string; shop_id: string; name: string; description?: string;
            category?: string; images?: string; selling_price: number;
            cost_price: number; quantity: number;
          }> = mkRes?.data?.items ?? [];
          for (const item of mkItems) {
            const itemShop = allShops.find((s) => s.id === item.shop_id);
            if (!itemShop) continue; // skip products from disabled or unknown shops
            const rawImgs = item.images;
            const imgs: string[] = rawImgs ? (() => { try { return JSON.parse(rawImgs) as string[]; } catch { return []; } })() : [];
            dbEntries.push({
              productId: item.id, shopId: item.shop_id,
              shopName: itemShop.name,
              shopLogoUrl: itemShop.logo_url, shopPhone: itemShop.phone,
              name: item.name, description: item.description, category: item.category,
              sellingPrice: item.selling_price, costPrice: item.cost_price,
              quantity: item.quantity, images: imgs,
              listedAt: new Date().toISOString(),
            });
          }
        } catch { /* product service unavailable — fall through to localStorage */ }
      }

      // 2. Merge: server catalog (fallback, no images) < localStorage (has images) < API (authoritative metadata + images)
      const activeShopIds = new Set(allShops.map((s) => s.id));
      const merged = new Map<string, MarketplaceEntry>(serverEntries.map((e) => [e.productId, e]));
      for (const e of getCatalog()) {
        if (activeShopIds.has(e.shopId)) merged.set(e.productId, e);
      }
      for (const e of dbEntries) {
        const local = merged.get(e.productId);
        merged.set(e.productId, { ...e, images: (local?.images?.length ?? 0) > 0 ? local!.images : e.images, listedAt: local?.listedAt ?? e.listedAt });
      }
      setCatalog([...merged.values()]);
      setLoading(false);

      // 3. Auto-sync the logged-in user's marketplace-listed products from real API
      if (user?.shop_id && shop) {
        try {
          const res = await itemRequest("/products?page=1&limit=500");
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
              sellingPrice: p.selling_price,
              costPrice:    p.cost_price ?? p.selling_price,
              quantity:     p.quantity,
              images:       meta.images,
              listedAt:     meta.listed ? (getCatalog().find(e => e.productId === p.id)?.listedAt ?? new Date().toISOString()) : new Date().toISOString(),
            });
            synced++;
          }
          if (synced > 0) {
            const activeIds = new Set(allShops.map((s) => s.id));
            const m2 = new Map<string, MarketplaceEntry>(serverCatalogRef.current.map((e) => [e.productId, e]));
            for (const e of getCatalog()) {
              if (activeIds.has(e.shopId)) m2.set(e.productId, e);
            }
            setCatalog([...m2.values()]);
          }
          setApiSynced(true);
          setLiveConnected(true);
        } catch {
          setApiSynced(false);
        }
      }
    };

    load();
    if (user?.shop_id) setMyMessages(getMyMessages(user.shop_id));
    setFollowedShopIds(new Set(getFollowedShops().map((f) => f.shopId)));
    const tick = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.shop_id, shop?.id]);

  // ── WebSocket-style live polling (10 s interval) ─────────────────────────
  useEffect(() => {
    let retries = 0;

    async function poll() {
      try {
        // Refresh online shops list
        const shopsRes = await listShops({ limit: 500 });
        const allShops = (shopsRes.items ?? []).filter((s) => s.is_active);
        setShops(allShops);
        const nowTs = new Date();
        setOnlineShopsCount(allShops.filter((s) => {
          if (!s.last_seen_at) return false;
          const d = new Date(s.last_seen_at.endsWith("Z") ? s.last_seen_at : s.last_seen_at + "Z");
          return (nowTs.getTime() - d.getTime()) / 1000 < 300;
        }).length);
        // Rebuild server catalog from refreshed shop descriptions
        const pollServerEntries: MarketplaceEntry[] = [];
        for (const s of allShops) {
          for (const e of decodeShopCatalog(s.description)) {
            pollServerEntries.push({
              productId: e.pid, shopId: s.id, shopName: s.name,
              shopLogoUrl: s.logo_url, shopPhone: s.phone,
              name: e.n, description: e.d, category: e.cat,
              sellingPrice: e.price, costPrice: e.price,
              quantity: e.qty, images: [], listedAt: e.at,
            });
          }
        }
        serverCatalogRef.current = pollServerEntries;

        // Fetch fresh /marketplace from product DB (has images)
        const pollDbEntries: MarketplaceEntry[] = [];
        if (user) {
          try {
            const mkRes = await itemRequest("/products/marketplace?limit=500");
            const mkItems: Array<{
              id: string; shop_id: string; name: string; description?: string;
              category?: string; images?: string; selling_price: number;
              cost_price: number; quantity: number;
            }> = mkRes?.data?.items ?? [];
            for (const item of mkItems) {
              const s = allShops.find((sh) => sh.id === item.shop_id);
              if (!s) continue; // skip products from disabled or unknown shops
              const rawImgs = item.images;
              const imgs: string[] = rawImgs ? (() => { try { return JSON.parse(rawImgs) as string[]; } catch { return []; } })() : [];
              pollDbEntries.push({
                productId: item.id, shopId: item.shop_id,
                shopName: s.name,
                shopLogoUrl: s.logo_url, shopPhone: s.phone,
                name: item.name, description: item.description, category: item.category,
                sellingPrice: item.selling_price, costPrice: item.cost_price,
                quantity: item.quantity, images: imgs,
                listedAt: new Date().toISOString(),
              });
            }
          } catch { /* skip */ }
        }

        // Merge: server catalog < localStorage < API (inclusive, with image overlay)
        const pollActiveShopIds = new Set(allShops.map((s) => s.id));
        const pollMerged = new Map<string, MarketplaceEntry>(pollServerEntries.map((e) => [e.productId, e]));
        for (const e of getCatalog()) {
          if (pollActiveShopIds.has(e.shopId)) pollMerged.set(e.productId, e);
        }
        for (const e of pollDbEntries) {
          const local = pollMerged.get(e.productId);
          pollMerged.set(e.productId, { ...e, images: (local?.images?.length ?? 0) > 0 ? local!.images : e.images, listedAt: local?.listedAt ?? e.listedAt });
        }
        setCatalog([...pollMerged.values()]);

        // Re-sync current user's products
        if (user?.shop_id && shop) {
          const res = await itemRequest("/products?page=1&limit=500");
          const products: Array<{ id: string; name: string; description?: string; category?: string; selling_price: number; cost_price?: number; quantity: number; }> = res?.data?.items ?? res?.data ?? [];
          let changed = false;
          for (const p of products) {
            const meta = getProductMeta(p.id);
            if (!meta.listed) continue;
            const resolvedCategory = meta.category || p.category || catOf(p.name, p.description);
            upsertCatalogEntry({
              productId: p.id, shopId: user.shop_id, shopName: shop.name,
              shopLogoUrl: shop.logo_url, shopPhone: shop.phone,
              name: p.name, description: p.description, category: resolvedCategory,
              sellingPrice: p.selling_price, costPrice: p.cost_price ?? p.selling_price,
              quantity: p.quantity, images: meta.images,
              listedAt: getCatalog().find(e => e.productId === p.id)?.listedAt ?? new Date().toISOString(),
            });
            changed = true;
          }
          if (changed) {
            const pm = new Map<string, MarketplaceEntry>(serverCatalogRef.current.map((e) => [e.productId, e]));
            for (const e of getCatalog()) {
              if (pollActiveShopIds.has(e.shopId)) pm.set(e.productId, e);
            }
            for (const e of pollDbEntries) {
              const local = pm.get(e.productId);
              pm.set(e.productId, { ...e, images: (local?.images?.length ?? 0) > 0 ? local!.images : e.images, listedAt: local?.listedAt ?? e.listedAt });
            }
            setCatalog([...pm.values()]);
          }
        }

        setLiveConnected(true);
        retries = 0;
      } catch {
        retries++;
        if (retries >= 3) setLiveConnected(false);
      }
    }

    // Start polling after initial load delay
    const interval = setInterval(poll, 10_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.shop_id, shop?.id]);

  // ── instant search (80 ms debounce feels immediate) ───────────────────────
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (rawSearch !== search) setSearching(true);
    searchTimerRef.current = setTimeout(() => {
      setSearch(rawSearch);
      setSearching(false);
      setPage(1);
    }, 80);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSearch]);

  // reset page on cat/search change
  useEffect(() => { setPage(1); }, [cat, search]);

  const shopMap = useMemo(() => {
    const m: Record<string, Shop> = {};
    shops.forEach((s) => { m[s.id] = s; });
    return m;
  }, [shops]);

  // ── category counts (from stored category field) ────────────────────────
  const catCounts = useMemo(() => {
    const m: Record<string, number> = { all: catalog.length };
    catalog.forEach((e) => {
      const c = e.category || catOf(e.name, e.description);
      m[c] = (m[c] ?? 0) + 1;
    });
    return m;
  }, [catalog]);

  // ── filtered + sorted list ───────────────────────────────────────────────
  const allFiltered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = catalog.filter((e) => {
      const ecat = e.category || catOf(e.name, e.description);
      if (cat !== "all" && ecat !== cat) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.shopName.toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q) ||
        (e.category ?? "").toLowerCase().includes(q)
      );
    });
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "price_asc":  return a.sellingPrice - b.sellingPrice;
        case "price_desc": return b.sellingPrice - a.sellingPrice;
        case "name_az":    return a.name.localeCompare(b.name);
        case "stock":      return b.quantity - a.quantity;
        default:           return new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime();
      }
    });
  }, [catalog, search, cat, sort]);

  // ── paginated slice ──────────────────────────────────────────────────────
  const visible = useMemo(() => allFiltered.slice(0, page * PAGE_SIZE), [allFiltered, page]);
  const hasMore  = visible.length < allFiltered.length;

  // ── infinite scroll sentinel ─────────────────────────────────────────────
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setLoadingMore(true);
          setTimeout(() => { setPage((p) => p + 1); setLoadingMore(false); }, 400);
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, visible.length]);

  const filteredShops = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return shops;
    return shops.filter((s) =>
      (s.name ?? "").toLowerCase().includes(q) ||
      (s.address ?? "").toLowerCase().includes(q),
    );
  }, [shops, search]);

  const listedPerShop = useMemo(() => {
    const m: Record<string, number> = {};
    catalog.forEach((e) => { m[e.shopId] = (m[e.shopId] ?? 0) + 1; });
    return m;
  }, [catalog]);

  const featuredSuppliers = useMemo(() =>
    shops.filter((s) => (listedPerShop[s.id] ?? 0) > 0).slice(0, 4),
    [shops, listedPerShop]);

  // ── order ────────────────────────────────────────────────────────────────
  async function placeOrder() {
    if (!orderModal) return;
    setOrdering(true); setOrderError("");
    try {
      const entry = orderModal.entry;
      const qty   = orderModal.qty;
      const total = entry.sellingPrice * qty;
      const conv = await createOrGetConversation({
        shop_id:       entry.shopId,
        shop_name:     entry.shopName,
        customer_name: user?.name ?? user?.email,
        product_id:    entry.productId,
        product_name:  entry.name,
        product_image: entry.images[0],
        listed_price:  entry.sellingPrice,
        first_message: [
          `🛒 I'd like to order:`,
          `• ${entry.name} × ${qty} = ${fmtPrice(total)}`,
          `Listed price: ${fmtPrice(entry.sellingPrice)} each`,
          ``,
          `Please confirm availability and arrange delivery.`,
        ].join("\n"),
      });
      setOrderModal(null);
      router.push(`/messages?conv=${conv.id}`);
    } catch (err: unknown) {
      setOrderError(err instanceof Error ? err.message : "Failed to open chat");
    } finally { setOrdering(false); }
  }

  const openOrder = useCallback((entry: MarketplaceEntry, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOrderModal({ entry, shop: shopMap[entry.shopId], qty: 1 });
    setOrderError("");
  }, [shopMap]);

  function toggleFollow(shopId: string, shopName: string, e?: React.MouseEvent) {
    e?.preventDefault(); e?.stopPropagation();
    if (followedShopIds.has(shopId)) {
      unfollowShop(shopId);
      setFollowedShopIds((prev) => { const next = new Set(prev); next.delete(shopId); return next; });
    } else {
      followShop(shopId, shopName);
      setFollowedShopIds((prev) => new Set([...prev, shopId]));
    }
  }

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#f4f4f4", minHeight: "100vh", fontFamily: "Arial, sans-serif" }}>

      {/* ── SEARCH BAR ───────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e5e5", position: "sticky", top: 0, zIndex: 40, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>

          {/* Search input */}
          <div style={{ flex: 1, display: "flex", border: "2px solid #ff6a00", borderRadius: 6, overflow: "hidden", boxShadow: "0 1px 4px rgba(255,106,0,0.1)" }}>
            <select
              value={cat}
              onChange={(e) => { setCat(e.target.value); setPage(1); }}
              className="mp-cat-select"
              style={{ border: "none", borderRight: "1px solid #e8e8e8", background: "#f8f8f8", padding: "0 10px", fontSize: 11, color: "#444", cursor: "pointer", outline: "none", flexShrink: 0, fontWeight: 500 }}
            >
              {ALL_CATS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}{catCounts[c.key] ? ` (${catCounts[c.key]})` : ""}
                </option>
              ))}
            </select>
            <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
              {searching
                ? <Loader2 size={13} style={{ position: "absolute", left: 10, color: "#ff6a00", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
                : <Search size={13} style={{ position: "absolute", left: 10, color: rawSearch ? "#ff6a00" : "#bbb", transition: "color 0.15s", flexShrink: 0 }} />}
              <input
                type="text"
                value={rawSearch}
                onChange={(e) => setRawSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setRawSearch("")}
                placeholder="Search products, shops, categories..."
                style={{ width: "100%", border: "none", padding: "9px 34px 9px 32px", fontSize: 13, outline: "none", background: "#fff" }}
              />
              {rawSearch && (
                <button onClick={() => setRawSearch("")}
                  style={{ position: "absolute", right: 8, border: "none", background: "none", cursor: "pointer", color: "#bbb", padding: 2, display: "flex", borderRadius: "50%" }}>
                  <X size={13} />
                </button>
              )}
            </div>
            <button
              onClick={() => setSearch(rawSearch)}
              style={{ background: "#ff6a00", color: "#fff", border: "none", padding: "0 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0, letterSpacing: 0.3 }}>
              Search
            </button>
          </div>

          {/* Sort dropdown */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              style={{ appearance: "none", border: "1.5px solid #e8e8e8", borderRadius: 6, background: "#fff", padding: "7px 28px 7px 10px", fontSize: 11, color: "#444", cursor: "pointer", outline: "none", fontWeight: 500 }}
            >
              <option value="newest">Newest first</option>
              <option value="price_asc">Price: low → high</option>
              <option value="price_desc">Price: high → low</option>
              <option value="name_az">Name: A → Z</option>
              <option value="stock">Most in stock</option>
            </select>
            <ChevronDown size={11} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "#999", pointerEvents: "none" }} />
          </div>

          {/* Live status + stats */}
          <div className="mp-stats" style={{ flexShrink: 0, textAlign: "right" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end", marginBottom: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#333" }}>{catalog.length}</span>
              <span style={{ fontSize: 11, color: "#888" }}>products</span>
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, background: liveConnected ? "#f6ffed" : "#fafafa", border: `1px solid ${liveConnected ? "#b7eb8f" : "#e8e8e8"}`, color: liveConnected ? "#52c41a" : "#bbb", padding: "1px 6px", borderRadius: 10, fontWeight: 700 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: liveConnected ? "#52c41a" : "#ccc", display: "inline-block", animation: liveConnected ? "pulse 2s infinite" : "none" }} />
                {liveConnected ? "Live" : "Syncing"}
              </span>
            </div>
            <div style={{ fontSize: 10, color: "#bbb" }}>
              {shops.length} shops
              {onlineShopsCount > 0 && <span style={{ color: "#52c41a", fontWeight: 600 }}> · {onlineShopsCount} online</span>}
            </div>
          </div>
        </div>

        {/* Category nav strip with counts */}
        <div style={{ borderTop: "1px solid #f0f0f0" }}>
          <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 16px", display: "flex", overflowX: "auto" }} className="mp-subnav">
            {ALL_CATS.map((c) => {
              const count = catCounts[c.key] ?? 0;
              const active = cat === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => { setCat(c.key); setPage(1); }}
                  style={{
                    border: "none", background: "transparent", padding: "7px 12px",
                    fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                    color: active ? "#ff6a00" : "#555",
                    fontWeight: active ? 700 : 400,
                    borderBottom: active ? "2px solid #ff6a00" : "2px solid transparent",
                    transition: "color 0.15s",
                    display: "flex", alignItems: "center", gap: 4,
                  }}
                >
                  {c.label}
                  {count > 0 && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 8,
                      background: active ? "#ff6a00" : "#f0f0f0",
                      color: active ? "#fff" : "#888",
                      minWidth: 16, textAlign: "center",
                    }}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── SHOP STATUS BANNER ───────────────────────────────────────────── */}

      {/* State 0: Application REJECTED — show reason and resubmit CTA */}
      {appStatus === "REJECTED" && user?.role !== "admin" && (
        <div style={{ background: "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)", borderBottom: "2px solid #ef4444" }}>
          <div style={{ maxWidth: 1400, margin: "0 auto", padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
              <span style={{ fontSize: 22, color: "#fff", fontWeight: 900 }}>✕</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 800, color: "#991b1b", margin: "0 0 4px" }}>Your shop application was rejected</p>
              {rejectionInfo.rejectionReason && (
                <div style={{ background: "#fff", border: "1px solid #fca5a5", borderRadius: 8, padding: "8px 12px", marginBottom: 10, maxWidth: 540 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#7f1d1d", margin: "0 0 2px" }}>Reason from admin:</p>
                  <p style={{ fontSize: 12, color: "#991b1b", margin: 0 }}>{rejectionInfo.rejectionReason}</p>
                </div>
              )}
              <p style={{ fontSize: 12, color: "#7f1d1d", margin: "0 0 12px", lineHeight: 1.5 }}>
                Review the feedback, update your shop details, and resubmit for another review.
              </p>
              <button
                onClick={() => { setShowShopForm(true); }}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 20px", background: "#ef4444", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, borderRadius: 6, cursor: "pointer" }}
              >
                Edit &amp; Resubmit Application
              </button>
            </div>
          </div>
        </div>
      )}

      {/* State 1: No application yet — always visible, non-dismissible */}
      {appStatus === "NONE" && user?.role !== "admin" && (
        <div style={{ background: "linear-gradient(135deg, #fff7ed 0%, #fff3e0 100%)", borderBottom: "2px solid #ff6a00" }}>
          <div style={{ maxWidth: 1400, margin: "0 auto", padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#ff6a00", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
              <Rocket size={20} style={{ color: "#fff" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 800, color: "#c2410c", margin: "0 0 4px" }}>Want to sell on Higoverse?</p>
              <p style={{ fontSize: 12, color: "#78350f", margin: "0 0 12px", lineHeight: 1.5 }}>
                Fill in your shop details — including your TIN — and submit for Higoverse admin review. Once approved, your full shop dashboard appears and your products go live on the marketplace.
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {[
                  { n: 1, label: "Fill shop application" },
                  { n: 2, label: "Admin review & TIN verify" },
                  { n: 3, label: "Access dashboard & sell" },
                ].map((step) => (
                  <div key={step.n} style={{ display: "flex", alignItems: "center", gap: 5, background: "#fff", border: "1px solid #fed7aa", borderRadius: 20, padding: "4px 10px" }}>
                    <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#ff6a00", color: "#fff", fontSize: 9, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{step.n}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#7c2d12" }}>{step.label}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowShopForm(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 20px", background: "#ff6a00", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, borderRadius: 6, cursor: "pointer", boxShadow: "0 2px 8px rgba(255,106,0,0.3)" }}
              >
                <Store size={14} /> Create my shop <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>
      )}


      {/* State 3: Shop verified — quick access */}
      {!bannerDismissed && shopIsActive && (
        <div style={{ background: "#f0fdf4", borderBottom: "1px solid #86efac" }}>
          <div style={{ maxWidth: 1400, margin: "0 auto", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <BadgeCheck size={16} style={{ color: "#16a34a", flexShrink: 0 }} />
            <p style={{ fontSize: 12, color: "#15803d", margin: 0, fontWeight: 600, flex: 1 }}>
              <strong>{shop?.name}</strong> is verified and active on the marketplace.
            </p>
            <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", background: "#16a34a", color: "#fff", textDecoration: "none", fontSize: 11, fontWeight: 700, borderRadius: 6 }}>
              <LayoutDashboard size={12} /> Shop Dashboard
            </Link>
            <button onClick={dismissBanner} style={{ border: "none", background: "none", cursor: "pointer", color: "#16a34a", padding: 4, display: "flex" }}>
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ── BODY ─────────────────────────────────────────────────────────── */}
      <div className="mp-body" style={{ maxWidth: 1400, margin: "0 auto", padding: "10px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>

        {/* ── SIDEBAR ────────────────────────────────────────────────────── */}
        <aside className="mp-sidebar" style={{ width: 168, flexShrink: 0 }}>
          <div style={{ background: "#fff", border: "1px solid #e8e8e8", marginBottom: 8 }}>
            <div style={{ padding: "10px 12px 6px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#333" }}>Categories</span>
              <span style={{ fontSize: 10, color: "#bbb" }}>{catalog.length} total</span>
            </div>
            {ALL_CATS.map((c) => {
              const count = catCounts[c.key] ?? 0;
              const active = cat === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => { setCat(c.key); setPage(1); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", border: "none",
                    background: active ? "#fff5f0" : "transparent",
                    padding: "6px 12px", fontSize: 12, cursor: "pointer", textAlign: "left",
                    color: active ? "#ff6a00" : count === 0 ? "#ccc" : "#555",
                    fontWeight: active ? 700 : 400,
                    borderLeft: active ? "3px solid #ff6a00" : "3px solid transparent",
                    transition: "background 0.12s",
                  }}
                >
                  <span>{c.label}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8,
                    background: active ? "#ff6a00" : count > 0 ? "#f0f0f0" : "transparent",
                    color: active ? "#fff" : "#999", minWidth: 18, textAlign: "center",
                  }}>{count > 0 ? count : ""}</span>
                </button>
              );
            })}
          </div>

          <div style={{ background: "#fff", border: "1px solid #e8e8e8" }}>
            <div style={{ padding: "10px 12px 6px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#333" }}>Suppliers</span>
              <span style={{ fontSize: 10, color: "#999" }}>{shops.length}</span>
            </div>
            {shops.slice(0, 10).map((s) => {
              const online  = isOnline(s.last_seen_at, now);
              const initial = (s.name || "?")[0].toUpperCase();
              const listed  = listedPerShop[s.id] ?? 0;
              return (
                <Link key={s.id} href={`/marketplace/${s.id}`}
                  className="mp-supplier-row"
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", textDecoration: "none", borderBottom: "1px solid #f8f8f8" }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", overflow: "hidden", background: "#ff6a00", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {s.logo_url
                      ? <img src={s.logo_url} alt={s.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: 8, fontWeight: 900, color: "#fff" }}>{initial}</span>}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 11, color: "#333", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {highlight(s.name ?? "", search)}
                    </p>
                    <p style={{ fontSize: 9, color: "#999", margin: 0 }}>
                      {listed > 0 ? `${listed} products` : "No listings"}
                      {online && <span style={{ color: "#52c41a", marginLeft: 4 }}>● live</span>}
                    </p>
                  </div>
                </Link>
              );
            })}
            {shops.length > 10 && (
              <div style={{ padding: "7px 12px" }}>
                <span style={{ fontSize: 11, color: "#ff6a00" }}>+{shops.length - 10} more</span>
              </div>
            )}
          </div>
        </aside>

        {/* ── MAIN ───────────────────────────────────────────────────────── */}
        <main style={{ flex: 1, minWidth: 0 }}>

          {/* Featured suppliers */}
          {featuredSuppliers.length > 0 && !search && cat === "all" && (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(featuredSuppliers.length, 4)}, 1fr)`, gap: 8, marginBottom: 10 }}>
              {featuredSuppliers.map((s) => {
                const initial    = (s.name || "?")[0].toUpperCase();
                const online     = isOnline(s.last_seen_at, now);
                const listed     = listedPerShop[s.id] ?? 0;
                const isFollowed = followedShopIds.has(s.id);
                const isMine     = s.id === user?.shop_id;
                return (
                  <div key={s.id} style={{ position: "relative", background: "#fff", border: `1px solid ${isFollowed ? "#ffb3b3" : "#e8e8e8"}`, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", transition: "border-color 0.15s" }}>
                    {!isMine && (
                      <button
                        onClick={(e) => toggleFollow(s.id, s.name ?? "", e)}
                        style={{ position: "absolute", top: 6, right: 6, border: "none", background: "none", cursor: "pointer", padding: 2 }}>
                        <Heart size={13} style={{ color: isFollowed ? "#f5222d" : "#d9d9d9", fill: isFollowed ? "#f5222d" : "none", transition: "all 0.15s" }} />
                      </button>
                    )}
                    <Link href={`/marketplace/${s.id}`} style={{ display: "contents", textDecoration: "none" }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", background: "#ff6a00", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {s.logo_url
                          ? <img src={s.logo_url} alt={s.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <span style={{ fontSize: 14, fontWeight: 900, color: "#fff" }}>{initial}</span>}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "#333", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</p>
                        <p style={{ fontSize: 10, color: "#999", margin: "2px 0 0" }}>
                          {listed} product{listed !== 1 ? "s" : ""}
                          {online && <span style={{ color: "#52c41a", marginLeft: 6 }}>● Online</span>}
                        </p>
                        <p style={{ fontSize: 10, color: isFollowed ? "#f5222d" : "#ff6a00", margin: "2px 0 0", fontWeight: 600 }}>
                          {isFollowed ? "❤ Following" : "View Store →"}
                        </p>
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Marketplace stats + result bar ────────────────────────────────── */}
          {!search && cat === "all" && !loading && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
              {[
                { label: "Products listed", value: catalog.length, icon: <Package size={14} style={{ color: "#ff6a00" }} />, color: "#ff6a00" },
                { label: "Active shops", value: Object.keys(listedPerShop).length, icon: <Store size={14} style={{ color: "#1372e6" }} />, color: "#1372e6" },
                { label: "Shops online now", value: onlineShopsCount, icon: <Wifi size={14} style={{ color: "#52c41a" }} />, color: "#52c41a" },
              ].map((s, i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid #e8e8e8", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${s.color}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {s.icon}
                  </div>
                  <div>
                    <p style={{ fontSize: 18, fontWeight: 800, color: "#222", margin: 0, lineHeight: 1 }}>{s.value}</p>
                    <p style={{ fontSize: 10, color: "#999", margin: "2px 0 0" }}>{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Result bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, padding: "6px 10px", background: "#fff", border: "1px solid #f0f0f0", borderRadius: 6 }}>
            <span style={{ fontSize: 12, color: "#666", display: "flex", alignItems: "center", gap: 6 }}>
              {searching ? (
                <><Loader2 size={11} style={{ color: "#ff6a00", animation: "spin 0.7s linear infinite" }} />
                  <span style={{ color: "#ff6a00", fontWeight: 600 }}>Searching...</span></>
              ) : (
                <>
                  <strong style={{ color: "#111", fontSize: 13 }}>{allFiltered.length}</strong>
                  <span style={{ color: "#888" }}>
                    {search
                      ? <> results for <em style={{ color: "#ff6a00", fontStyle: "normal", fontWeight: 700 }}>&ldquo;{search}&rdquo;</em></>
                      : cat !== "all"
                        ? <> in <strong style={{ color: "#333" }}>{ALL_CATS.find(c => c.key === cat)?.label}</strong></>
                        : " products listed on marketplace"}
                  </span>
                  {allFiltered.length !== visible.length && (
                    <span style={{ color: "#bbb", fontSize: 11 }}>· showing {visible.length}</span>
                  )}
                  {(search || cat !== "all") && (
                    <button onClick={() => { setRawSearch(""); setCat("all"); }}
                      style={{ fontSize: 10, color: "#ff6a00", border: "1px solid #fed7aa", background: "transparent", borderRadius: 4, padding: "1px 6px", cursor: "pointer", fontWeight: 600 }}>
                      Clear filters
                    </button>
                  )}
                </>
              )}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3, color: liveConnected ? "#52c41a" : "#bbb" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: liveConnected ? "#52c41a" : "#ddd", display: "inline-block", animation: liveConnected ? "pulse 2s infinite" : "none" }} />
                {liveConnected ? "Live" : "Syncing"}
              </span>
              {shopIsActive && (
                <Link href="/items" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#ff6a00", textDecoration: "none", fontWeight: 700, padding: "4px 10px", border: "1px solid #ffb38a", borderRadius: 4 }}>
                  <Plus size={10} /> List a product
                </Link>
              )}
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="mp-grid" style={{ display: "grid", gap: 8 }}>
              {Array.from({ length: PAGE_SIZE }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : allFiltered.length === 0 ? (
            <EmptyState hasItems={catalog.length > 0} onClear={() => { setRawSearch(""); setCat("all"); }} />
          ) : (
            <>
              <div className="mp-grid" style={{ display: "grid", gap: 8 }}>
                {visible.map((entry) => (
                  <ProductCard
                    key={entry.productId}
                    entry={entry}
                    shop={shopMap[entry.shopId]}
                    isMine={entry.shopId === user?.shop_id}
                    online={shopMap[entry.shopId] ? isOnline(shopMap[entry.shopId].last_seen_at, now) : false}
                    searchQ={search}
                    onDetail={() => { setDetailEntry(entry); setDetailImg(0); }}
                    onOrder={(e) => openOrder(entry, e)}
                  />
                ))}

                {/* "List your product" dashed tile */}
                <Link href="/items" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, border: "1px dashed #d9d9d9", textDecoration: "none", background: "#fafafa", minHeight: 260, color: "#bbb" }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", border: "2px dashed #d9d9d9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Plus size={18} style={{ color: "#ccc" }} />
                  </div>
                  <span style={{ fontSize: 11, textAlign: "center", lineHeight: 1.5, color: "#aaa" }}>List your<br />products here</span>
                </Link>
              </div>

              {/* Scroll sentinel */}
              <div ref={sentinelRef} style={{ height: 1 }} />

              {/* Load-more skeleton row */}
              {loadingMore && (
                <div className="mp-grid" style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
              )}

              {!hasMore && allFiltered.length > PAGE_SIZE && (
                <p style={{ textAlign: "center", fontSize: 11, color: "#bbb", padding: "20px 0 8px" }}>
                  All {allFiltered.length} products loaded
                </p>
              )}
            </>
          )}

          {/* Suppliers section */}
          {filteredShops.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>All Suppliers</span>
                <span style={{ fontSize: 11, color: "#999" }}>{filteredShops.length} registered</span>
              </div>
              <div className="mp-grid" style={{ display: "grid", gap: 8 }}>
                {filteredShops.map((s) => {
                  const online      = isOnline(s.last_seen_at, now);
                  const isMine      = s.id === user?.shop_id;
                  const initial     = (s.name || "?")[0].toUpperCase();
                  const listed      = listedPerShop[s.id] ?? 0;
                  const isFollowed  = followedShopIds.has(s.id);
                  const followerCnt = getShopFollowerCount(s.id);
                  return (
                    <div key={s.id} style={{ position: "relative", background: "#fff", border: `1px solid ${isMine ? "#ffbb96" : isFollowed ? "#ff6a00" : "#e8e8e8"}`, display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 12px", gap: 6, transition: "border-color 0.15s" }}>
                      {/* Follow / like heart button */}
                      {!isMine && (
                        <button
                          onClick={(e) => toggleFollow(s.id, s.name ?? "", e)}
                          title={isFollowed ? "Unfollow shop" : "Follow shop"}
                          style={{ position: "absolute", top: 8, right: 8, border: "none", background: "none", cursor: "pointer", padding: 3, display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          <Heart size={15} style={{ color: isFollowed ? "#f5222d" : "#d9d9d9", fill: isFollowed ? "#f5222d" : "none", transition: "all 0.15s" }} />
                        </button>
                      )}

                      <Link href={`/marketplace/${s.id}`} style={{ display: "contents", textDecoration: "none" }}>
                        <div style={{ width: 44, height: 44, borderRadius: "50%", overflow: "hidden", background: "#ff6a00", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {s.logo_url
                            ? <img src={s.logo_url} alt={s.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <span style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>{initial}</span>}
                        </div>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "#333", margin: 0, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>
                          {highlight(s.name ?? "", search)}
                        </p>
                        {listed > 0 && <p style={{ fontSize: 10, color: "#ff6a00", margin: 0 }}>{listed} products</p>}
                        {s.address && <p style={{ fontSize: 10, color: "#999", margin: 0, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>{s.address}</p>}
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: online ? "#52c41a" : "#d9d9d9" }} />
                          <span style={{ fontSize: 10, color: online ? "#52c41a" : "#999" }}>{online ? "Online" : "Offline"}</span>
                          {isMine && <span style={{ fontSize: 9, background: "#fff5f0", color: "#ff6a00", padding: "1px 5px", fontWeight: 700, marginLeft: 4 }}>You</span>}
                        </div>
                        {followerCnt > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: "#f5222d" }}>
                            <Heart size={8} style={{ fill: "#f5222d" }} />
                            <span>{followerCnt} {followerCnt === 1 ? "follower" : "followers"}</span>
                          </div>
                        )}
                        <span style={{ fontSize: 11, color: isFollowed ? "#ff6a00" : "#1677ff", fontWeight: isFollowed ? 700 : 400 }}>
                          {isFollowed ? "✓ Connected" : "View Store"}
                        </span>
                      </Link>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </main>
      </div>

      {/* ── DETAIL MODAL — Alibaba-style full product page ────────────────── */}
      {detailEntry && (() => {
        const dShop      = shopMap[detailEntry.shopId];
        const dOnline    = dShop ? isOnline(dShop.last_seen_at, now) : false;
        const isMine     = detailEntry.shopId === user?.shop_id;
        const listedCount = listedPerShop[detailEntry.shopId] ?? 0;
        const inStock    = detailEntry.quantity > 0;
        const category   = detailEntry.category || catOf(detailEntry.name, detailEntry.description);
        const cleanAddr  = (dShop?.address ?? "").replace(/^TIN:[^|]+\|/, "").trim();
        const related    = catalog
          .filter((e) => e.shopId === detailEntry.shopId && e.productId !== detailEntry.productId)
          .slice(0, 6);

        return (
          <div
            onClick={(e) => { if (e.target === e.currentTarget) setDetailEntry(null); }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, overflowY: "auto", padding: "20px 12px 40px" }}
          >
            <div style={{ maxWidth: 980, margin: "0 auto", fontFamily: "Arial, sans-serif" }}>

              {/* Breadcrumb bar */}
              <div style={{ background: "#fff", padding: "9px 16px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#999", flexWrap: "wrap" }}>
                  <span style={{ cursor: "pointer", color: "#1677ff" }} onClick={() => setDetailEntry(null)}>Marketplace</span>
                  <ChevronRight size={12} />
                  <span style={{ textTransform: "capitalize", cursor: "pointer", color: "#1677ff" }}
                    onClick={() => { setCat(category); setDetailEntry(null); }}>{category}</span>
                  <ChevronRight size={12} />
                  <span style={{ color: "#333" }}>{detailEntry.name.slice(0, 50)}{detailEntry.name.length > 50 ? "…" : ""}</span>
                </div>
                <button onClick={() => setDetailEntry(null)}
                  style={{ border: "1px solid #e8e8e8", background: "#fff", cursor: "pointer", padding: "5px 14px", fontSize: 12, color: "#555", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                  <X size={12} /> Close
                </button>
              </div>

              {/* ── Top section: image + info ── */}
              <div style={{ background: "#fff", display: "flex", gap: 0, marginBottom: 8 }}>

                {/* LEFT — image gallery */}
                <div style={{ width: 400, flexShrink: 0, padding: 20, borderRight: "1px solid #f0f0f0" }}>
                  {/* Main image */}
                  <div style={{ width: "100%", aspectRatio: "1", background: "#f7f7f7", border: "1px solid #eee", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative", marginBottom: 10 }}>
                    {detailEntry.images[detailImg]
                      ? <img src={detailEntry.images[detailImg]} alt={detailEntry.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      : <Package size={72} style={{ color: "#ddd" }} />}
                    {!inStock && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.78)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#f5222d", border: "1.5px solid #f5222d", padding: "4px 16px", background: "#fff" }}>Out of Stock</span>
                      </div>
                    )}
                    {isMine && (
                      <span style={{ position: "absolute", top: 8, left: 8, fontSize: 10, background: "#ff6a00", color: "#fff", padding: "2px 8px", fontWeight: 700 }}>YOURS</span>
                    )}
                  </div>
                  {/* Thumbnails */}
                  {detailEntry.images.length > 1 && (
                    <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
                      {detailEntry.images.map((src, i) => (
                        <button key={i} onClick={() => setDetailImg(i)}
                          style={{ flexShrink: 0, width: 60, height: 60, border: i === detailImg ? "2px solid #ff6a00" : "1.5px solid #e8e8e8", background: "none", cursor: "pointer", padding: 0, overflow: "hidden" }}>
                          <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* RIGHT — product details */}
                <div style={{ flex: 1, minWidth: 0, padding: "20px 20px 20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

                  {/* Title */}
                  <h1 style={{ fontSize: 17, fontWeight: 600, color: "#1a1a1a", margin: 0, lineHeight: 1.55 }}>
                    {detailEntry.name}
                  </h1>

                  {/* Stars + status */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ display: "flex", gap: 2 }}>
                      {[1,2,3,4].map((i) => <Star key={i} size={13} style={{ color: "#fa8c16", fill: "#fa8c16" }} />)}
                      <Star size={13} style={{ color: "#d9d9d9", fill: "#d9d9d9" }} />
                    </div>
                    <span style={{ fontSize: 12, color: "#888" }}>Verified Supplier</span>
                    {dOnline && (
                      <span style={{ fontSize: 10, color: "#52c41a", background: "#f6ffed", border: "1px solid #b7eb8f", padding: "1px 8px", borderRadius: 10, fontWeight: 700 }}>● Online now</span>
                    )}
                  </div>

                  {/* Price block */}
                  <div style={{ background: "#fff9f5", border: "1px solid #fde8d5", padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                      <span style={{ fontSize: 30, fontWeight: 800, color: "#ff6a00", lineHeight: 1 }}>
                        {fmtPrice(detailEntry.sellingPrice)}
                      </span>
                      <span style={{ fontSize: 13, color: "#bbb" }}>/ unit</span>
                    </div>
                    <p style={{ fontSize: 12, color: "#999", margin: "6px 0 0" }}>
                      Min. order: 1 unit &nbsp;·&nbsp; Price may vary with quantity
                    </p>
                  </div>

                  {/* Key attributes table */}
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 8px" }}>Product Details</p>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <tbody>
                        {([
                          ["Category",     category],
                          cleanAddr && ["Location", cleanAddr],
                          ["Availability", inStock ? `In Stock` : "Out of Stock"],
                          ["Min. Order",   "1 unit"],
                          ["Supply",       `${listedCount} product${listedCount !== 1 ? "s" : ""} from this supplier`],
                        ] as (string[] | false)[]).filter(Boolean).map((row, i) => {
                          const [k, v] = row as string[];
                          return (
                            <tr key={i} style={{ borderTop: "1px solid #f0f0f0" }}>
                              <td style={{ padding: "7px 0", color: "#aaa", width: 120, verticalAlign: "top", fontWeight: 400 }}>{k}</td>
                              <td style={{ padding: "7px 0", color: k === "Availability" ? (inStock ? "#52c41a" : "#f5222d") : "#333", fontWeight: 500, textTransform: "capitalize" }}>{v}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Description */}
                  {detailEntry.description && (
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 8px" }}>Description</p>
                      <p style={{ fontSize: 13, color: "#555", margin: 0, lineHeight: 1.8, background: "#fafafa", padding: "12px 14px", border: "1px solid #f0f0f0" }}>
                        {detailEntry.description}
                      </p>
                    </div>
                  )}

                  {/* Spacer */}
                  <div style={{ flex: 1 }} />

                  {/* Action buttons */}
                  <div style={{ display: "flex", gap: 10 }}>
                    {!isMine && (
                      followedShopIds.has(detailEntry.shopId) ? (
                        <button
                          disabled={contactingProductId === detailEntry.productId}
                          onClick={async () => {
                            setContactingProductId(detailEntry.productId);
                            try {
                              const conv = await createOrGetConversation({
                                shop_id:       detailEntry.shopId,
                                shop_name:     detailEntry.shopName,
                                customer_name: user?.name ?? user?.email,
                                product_id:    detailEntry.productId,
                                product_name:  detailEntry.name,
                                product_image: detailEntry.images[0],
                                listed_price:  detailEntry.sellingPrice,
                              });
                              setDetailEntry(null);
                              router.push(`/messages?conv=${conv.id}`);
                            } catch {
                              setContactingProductId(null);
                            }
                          }}
                          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px", border: "1.5px solid #ff6a00", background: "#fff", color: "#ff6a00", fontSize: 13, fontWeight: 700, cursor: contactingProductId === detailEntry.productId ? "not-allowed" : "pointer", opacity: contactingProductId === detailEntry.productId ? 0.6 : 1 }}>
                          {contactingProductId === detailEntry.productId ? <Loader2 size={15} className="animate-spin" /> : <MessageSquare size={15} />} Contact Supplier
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleFollow(detailEntry.shopId, detailEntry.shopName)}
                          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px", border: "1.5px solid #ff6a00", background: "#fff", color: "#ff6a00", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                          <Heart size={15} /> Follow Supplier
                        </button>
                      )
                    )}
                    <button
                      onClick={() => { setDetailEntry(null); openOrder(detailEntry); }}
                      disabled={!inStock}
                      style={{ flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px", border: "none", background: inStock ? "#ff6a00" : "#f0f0f0", color: inStock ? "#fff" : "#bbb", fontSize: 14, fontWeight: 700, cursor: inStock ? "pointer" : "not-allowed" }}>
                      <ShoppingCart size={16} /> {inStock ? "Start Order" : "Out of Stock"}
                    </button>
                  </div>

                  {/* Call link */}
                  {detailEntry.shopPhone && (
                    <a href={`tel:${detailEntry.shopPhone}`}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px", background: "#f6ffed", border: "1px solid #b7eb8f", color: "#389e0d", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                      <Phone size={13} /> Call {detailEntry.shopName} directly — {detailEntry.shopPhone}
                    </a>
                  )}
                </div>
              </div>

              {/* ── Supplier card ── */}
              <div style={{ background: "#fff", padding: "16px 20px", marginBottom: 8, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", overflow: "hidden", background: "#ff6a00", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {dShop?.logo_url
                    ? <img src={dShop.logo_url} alt={detailEntry.shopName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span style={{ fontSize: 20, fontWeight: 900, color: "#fff" }}>{detailEntry.shopName[0]?.toUpperCase()}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#222" }}>{detailEntry.shopName}</span>
                    {isMine && <span style={{ fontSize: 10, background: "#fff5f0", color: "#ff6a00", padding: "2px 8px", fontWeight: 700 }}>Your Shop</span>}
                    <span style={{ fontSize: 11, color: "#888", display: "flex", alignItems: "center", gap: 3 }}>
                      {[1,2,3,4].map((i) => <Star key={i} size={10} style={{ color: "#fa8c16", fill: "#fa8c16" }} />)}
                      <Star size={10} style={{ color: "#d9d9d9", fill: "#d9d9d9" }} />
                      Verified Supplier
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 16, marginTop: 4, flexWrap: "wrap" }}>
                    {cleanAddr && (
                      <span style={{ fontSize: 12, color: "#888", display: "flex", alignItems: "center", gap: 4 }}>
                        <MapPin size={12} style={{ color: "#ff6a00", flexShrink: 0 }} />{cleanAddr}
                      </span>
                    )}
                    {detailEntry.shopPhone && (
                      <a href={`tel:${detailEntry.shopPhone}`} style={{ fontSize: 12, color: "#333", display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
                        <Phone size={12} style={{ color: "#52c41a" }} />{detailEntry.shopPhone}
                      </a>
                    )}
                    {dShop?.email && (
                      <a href={`mailto:${dShop.email}`} style={{ fontSize: 12, color: "#333", display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
                        <Mail size={12} style={{ color: "#1677ff" }} />{dShop.email}
                      </a>
                    )}
                  </div>
                </div>
                <Link href={`/marketplace/${detailEntry.shopId}`} onClick={() => setDetailEntry(null)}
                  style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, padding: "9px 18px", border: "1.5px solid #e8e8e8", color: "#555", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                  <Store size={13} /> View Store
                </Link>
              </div>

              {/* ── Other recommendations ── */}
              {related.length > 0 && (
                <div style={{ background: "#fff", padding: "16px 20px" }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#222", margin: "0 0 14px", paddingBottom: 10, borderBottom: "1px solid #f0f0f0" }}>
                    Other products from {detailEntry.shopName}
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                    {related.map((rel) => (
                      <div key={rel.productId}
                        onClick={() => { setDetailEntry(rel); setDetailImg(0); }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#ffb38a"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 10px rgba(0,0,0,0.08)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#e8e8e8"; (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
                        style={{ border: "1px solid #e8e8e8", cursor: "pointer", background: "#fff", transition: "border-color 0.15s, box-shadow 0.15s" }}
                      >
                        <div style={{ aspectRatio: "1", background: "#f7f7f7", overflow: "hidden" }}>
                          {rel.images[0]
                            ? <img src={rel.images[0]} alt={rel.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Package size={28} style={{ color: "#ddd" }} /></div>}
                        </div>
                        <div style={{ padding: "8px 10px" }}>
                          <p style={{ fontSize: 12, color: "#333", margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{rel.name}</p>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#ff6a00", margin: 0 }}>{fmtPrice(rel.sellingPrice)}</p>
                          <p style={{ fontSize: 10, color: "#aaa", margin: "2px 0 0" }}>Min. 1 unit</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── ORDER MODAL ──────────────────────────────────────────────────── */}
      {orderModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", width: "100%", maxWidth: 400 }}>
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>Start Order</span>
                <button onClick={() => setOrderModal(null)} style={{ border: "none", background: "#f5f5f5", cursor: "pointer", padding: "4px 8px", fontSize: 12 }}>✕</button>
              </div>
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 12, padding: "10px 12px", background: "#f9f9f9", border: "1px solid #f0f0f0" }}>
                  {orderModal.entry.images[0]
                    ? <img src={orderModal.entry.images[0]} alt={orderModal.entry.name} style={{ width: 56, height: 56, objectFit: "cover", border: "1px solid #e8e8e8", flexShrink: 0 }} />
                    : <div style={{ width: 56, height: 56, background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Package size={20} style={{ color: "#ccc" }} /></div>}
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#333", margin: "0 0 3px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>{orderModal.entry.name}</p>
                    <p style={{ fontSize: 11, color: "#999", margin: "0 0 3px" }}>{orderModal.entry.shopName}</p>
                    <p style={{ fontSize: 16, fontWeight: 700, color: "#ff6a00", margin: 0 }}>{fmtPrice(orderModal.entry.sellingPrice)}</p>
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#333", margin: "0 0 8px" }}>Quantity</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <button onClick={() => setOrderModal((m) => m ? { ...m, qty: Math.max(1, m.qty - 1) } : null)}
                      style={{ width: 32, height: 32, border: "1px solid #d9d9d9", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Minus size={12} />
                    </button>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#333", width: 32, textAlign: "center" }}>{orderModal.qty}</span>
                    <button onClick={() => setOrderModal((m) => m ? { ...m, qty: Math.min(m.entry.quantity || 9999, m.qty + 1) } : null)}
                      style={{ width: 32, height: 32, border: "1px solid #d9d9d9", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Plus size={12} />
                    </button>
                    <div style={{ marginLeft: "auto", textAlign: "right" }}>
                      <p style={{ fontSize: 10, color: "#999", margin: 0 }}>Total</p>
                      <p style={{ fontSize: 16, fontWeight: 700, color: "#ff6a00", margin: 0 }}>{fmtPrice(orderModal.entry.sellingPrice * orderModal.qty)}</p>
                    </div>
                  </div>
                </div>
                {orderError && <p style={{ fontSize: 11, color: "#f5222d", background: "#fff2f0", border: "1px solid #ffa39e", padding: "6px 10px", margin: 0 }}>{orderError}</p>}
                <p style={{ fontSize: 10, color: "#aaa", margin: 0, lineHeight: 1.5 }}>This will open a chat with the shop. Confirm availability, negotiate, and arrange delivery through messages.</p>
              </div>
              <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #f0f0f0" }}>
                <button onClick={() => setOrderModal(null)} style={{ flex: 1, padding: "8px", border: "1px solid #d9d9d9", background: "#fff", cursor: "pointer", fontSize: 12, color: "#555" }}>Cancel</button>
                <button onClick={placeOrder} disabled={ordering || orderModal.entry.quantity === 0}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px", border: "none", background: "#ff6a00", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: orderModal.entry.quantity === 0 ? 0.4 : 1 }}>
                  {ordering ? <><Loader2 size={12} className="animate-spin" /> Opening chat...</> : <><MessageSquare size={12} /> Chat to Order</>}
                </button>
              </div>
            </>
          </div>
        </div>
      )}

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

      <style>{`
        .mp-supplier-row:hover { background: #fff5f0; }
        .mp-subnav { scrollbar-width: none; }
        .mp-subnav::-webkit-scrollbar { display: none; }

        /* Responsive grid — fills width, no fixed column count */
        .mp-grid { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); }

        @keyframes shimmer {
          0%   { background-position: -600px 0; }
          100% { background-position:  600px 0; }
        }
        .mp-shimmer {
          background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
          background-size: 600px 100%;
          animation: shimmer 1.4s infinite linear;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

        @media (max-width: 767px) {
          .mp-sidebar   { display: none !important; }
          .mp-body      { padding: 8px !important; }
          .mp-grid      { grid-template-columns: repeat(2, 1fr) !important; }
          .mp-cat-select{ display: none !important; }
          .mp-stats     { display: none !important; }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .mp-sidebar { width: 150px !important; }
          .mp-grid    { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (min-width: 1024px) and (max-width: 1279px) {
          .mp-grid { grid-template-columns: repeat(4, 1fr) !important; }
        }
        @media (min-width: 1280px) {
          .mp-grid { grid-template-columns: repeat(auto-fill, minmax(175px, 1fr)) !important; }
        }
      `}</style>

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

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{ background: "#fff", border: "1px solid #e8e8e8", overflow: "hidden" }}>
      <div className="mp-shimmer" style={{ aspectRatio: "1" }} />
      <div style={{ padding: "8px 10px 10px" }}>
        <div className="mp-shimmer" style={{ height: 11, borderRadius: 2, marginBottom: 6 }} />
        <div className="mp-shimmer" style={{ height: 11, borderRadius: 2, width: "70%", marginBottom: 8 }} />
        <div className="mp-shimmer" style={{ height: 16, borderRadius: 2, width: "55%", marginBottom: 6 }} />
        <div className="mp-shimmer" style={{ height: 9, borderRadius: 2, width: "80%", marginBottom: 10 }} />
        <div style={{ paddingTop: 6, borderTop: "1px solid #f5f5f5", display: "flex", gap: 6, alignItems: "center" }}>
          <div className="mp-shimmer" style={{ width: 14, height: 14, borderRadius: "50%", flexShrink: 0 }} />
          <div className="mp-shimmer" style={{ height: 9, borderRadius: 2, flex: 1 }} />
        </div>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ hasItems, onClear }: { hasItems: boolean; onClear: () => void }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e8e8e8", padding: "64px 20px", textAlign: "center" }}>
      <Package size={52} style={{ color: "#e0e0e0", margin: "0 auto 16px" }} />
      <p style={{ fontSize: 15, fontWeight: 600, color: "#555", margin: "0 0 6px" }}>
        {hasItems ? "No products match your search" : "No products listed yet"}
      </p>
      <p style={{ fontSize: 12, color: "#aaa", margin: "0 0 20px", maxWidth: 340, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
        {hasItems
          ? "Try clearing filters or searching with different keywords."
          : "Go to Items, upload at least 3 product photos, then enable Share on Marketplace."}
      </p>
      {hasItems ? (
        <button onClick={onClear} style={{ padding: "8px 20px", border: "1px solid #d9d9d9", background: "#fff", cursor: "pointer", fontSize: 12, color: "#555" }}>
          Clear filters
        </button>
      ) : (
        <Link href="/items" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 20px", background: "#ff6a00", color: "#fff", textDecoration: "none", fontSize: 12, fontWeight: 700 }}>
          <Package size={13} /> Go to Items
        </Link>
      )}
    </div>
  );
}

// Module-level cache so image error state survives card remounts during poll updates
const _failedImgUrls = new Set<string>();

// ── Product card ──────────────────────────────────────────────────────────────
function ProductCard({ entry, shop, isMine, online, searchQ, onDetail, onOrder }: {
  entry: MarketplaceEntry;
  shop: Shop | undefined;
  isMine: boolean;
  online: boolean;
  searchQ: string;
  onDetail: () => void;
  onOrder: (e: React.MouseEvent) => void;
}) {
  const [, _forceImg] = useState(0);
  const cover   = entry.images.find((u) => !_failedImgUrls.has(u));
  const inStock = entry.quantity > 0;
  const initial = (entry.shopName[0] ?? "?").toUpperCase();

  return (
    <div
      onClick={onDetail}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.11)";
        (e.currentTarget as HTMLDivElement).style.borderColor = "#ffd8b8";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)";
        (e.currentTarget as HTMLDivElement).style.borderColor = "#e8e8e8";
      }}
      style={{
        background: "#fff", border: "1px solid #e8e8e8", cursor: "pointer",
        display: "flex", flexDirection: "column", position: "relative",
        transition: "box-shadow 0.18s, border-color 0.18s",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)", borderRadius: 3,
        overflow: "hidden",
      }}
    >
      {/* Image */}
      <div style={{ position: "relative", aspectRatio: "1", overflow: "hidden", background: "#f7f7f7", flexShrink: 0 }}>
        {cover
          ? <img
              src={cover}
              alt={entry.name}
              loading="lazy"
              decoding="async"
              onError={() => { _failedImgUrls.add(cover); _forceImg((n) => n + 1); }}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          : <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Package size={36} style={{ color: "#ddd" }} />
              <span style={{ fontSize: 10, color: "#ccc" }}>No image</span>
            </div>}

        {/* Multi-image pill */}
        {entry.images.length > 1 && (
          <span style={{ position: "absolute", top: 6, right: 6, fontSize: 9, background: "rgba(0,0,0,0.42)", color: "#fff", padding: "2px 6px", borderRadius: 10, fontWeight: 600 }}>
            +{entry.images.length - 1}
          </span>
        )}

        {/* Out-of-stock overlay */}
        {!inStock && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.78)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#f5222d", border: "1.5px solid #f5222d", padding: "3px 10px", background: "#fff", borderRadius: 2 }}>Out of Stock</span>
          </div>
        )}

        {/* "YOURS" badge */}
        {isMine && (
          <span style={{ position: "absolute", top: 6, left: 6, fontSize: 9, background: "#ff6a00", color: "#fff", padding: "2px 7px", fontWeight: 700, borderRadius: 2 }}>YOURS</span>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: "10px 10px 0", flex: 1, display: "flex", flexDirection: "column" }}>

        {/* Product name — 2-line clamp */}
        <p style={{
          fontSize: 13, fontWeight: 500, color: "#222", margin: "0 0 6px", lineHeight: 1.5, minHeight: 39,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden",
        }}>
          {highlight(entry.name, searchQ)}
        </p>

        {/* Price */}
        <p style={{ fontSize: 17, fontWeight: 800, color: "#ff6a00", margin: "0 0 3px", lineHeight: 1 }}>
          {fmtPrice(entry.sellingPrice)}
        </p>

        {/* Min order — Alibaba-style */}
        <p style={{ fontSize: 11, color: "#aaa", margin: "0 0 10px" }}>Min. order: 1 unit</p>

        {/* Divider */}
        <div style={{ borderTop: "1px solid #f0f0f0", marginTop: "auto" }} />

        {/* Supplier row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 0 8px" }}>
          <div style={{
            width: 20, height: 20, borderRadius: "50%", overflow: "hidden", background: "#ff6a00",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            {shop?.logo_url && !_failedImgUrls.has(shop.logo_url)
              ? <img src={shop.logo_url} alt={entry.shopName}
                  loading="lazy" decoding="async"
                  onError={() => { _failedImgUrls.add(shop!.logo_url!); _forceImg((n) => n + 1); }}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span style={{ fontSize: 8, fontWeight: 900, color: "#fff" }}>{initial}</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 11, color: "#555", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
              {highlight(entry.shopName, searchQ)}
            </p>
            {shop?.address && (
              <p style={{ fontSize: 10, color: "#bbb", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 2 }}>
                <MapPin size={8} style={{ flexShrink: 0 }} />
                {shop.address.split(",")[0].replace(/^TIN:[^|]+\|/, "").trim()}
              </p>
            )}
          </div>
          {online && (
            <span style={{ fontSize: 9, color: "#52c41a", flexShrink: 0, fontWeight: 700, background: "#f6ffed", border: "1px solid #b7eb8f", padding: "1px 6px", borderRadius: 10 }}>
              ● Live
            </span>
          )}
        </div>
      </div>

      {/* CTA button */}
      <button
        onClick={onOrder}
        disabled={!inStock}
        style={{
          margin: "0 10px 10px",
          padding: "8px 0",
          background: inStock ? "#ff6a00" : "#f5f5f5",
          color: inStock ? "#fff" : "#bbb",
          border: "none",
          cursor: inStock ? "pointer" : "not-allowed",
          fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          flexShrink: 0, borderRadius: 2,
        }}
      >
        <ShoppingCart size={12} /> {inStock ? "Start Order" : "Unavailable"}
      </button>
    </div>
  );
}
