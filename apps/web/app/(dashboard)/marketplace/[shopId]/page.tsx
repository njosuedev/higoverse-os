"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

const HigoMapView = dynamic(() => import("@/app/components/ui/HigoMapView"), { ssr: false });
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { listShops, updateMyShop, type Shop } from "@/lib/shop-api";
import { itemRequest } from "@/lib/product-api";
import { partnerRequest } from "@/lib/supplier-api";
import {
  ArrowLeft, Phone, Mail, MapPin, Wifi, WifiOff,
  Package, ShoppingCart, Plus, Minus, X, Loader2,
  CheckCircle, CalendarDays, ExternalLink,
  Store, UserPlus, Trash2, ShoppingBag, ChevronRight,
  Info, Globe, Eye, Send, Search, Heart, MessageSquare,
} from "lucide-react";
import {
  getProductMeta, setProductMeta, upsertCatalogEntry, removeCatalogEntry,
  getCatalog,
  getMessagesForShop, replyToMessage, markMessageRead, unreadCountForShop,
  sendMessage, getMyMessages,
  followShop, unfollowShop, isFollowingShop, getShopFollowerCount,
  decodeShopCatalog, decodeShopHumanInfo, encodeDescriptionWithCatalog, catFromText,
  formatPublicAddress, formatShortAddress, parseShopAddress,
  type ProductMeta, type MarketplaceEntry, type ShopMessage,
} from "@/lib/product-meta";
import { createOrGetConversation, openMessageStream } from "@/lib/messages-api";

/** Two-tone chime via Web Audio — plays when a shop reply arrives. */
function playChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [[880, 0], [1046.5, 0.18]].forEach(([freq, when]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + when);
      gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + when + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + 0.7);
      osc.start(ctx.currentTime + when);
      osc.stop(ctx.currentTime + when + 0.7);
    });
    setTimeout(() => ctx.close(), 2000);
  } catch { /* AudioContext unavailable */ }
}

function parseUTC(ts: string | null | undefined): Date {
  if (!ts) return new Date(0);
  const s = ts.endsWith("Z") || ts.includes("+") ? ts : ts + "Z";
  return new Date(s);
}

function shopPresence(lastSeenAt: string | null) {
  if (!lastSeenAt) return { online: false, label: "Offline", color: "text-slate-400" };
  const secs = Math.floor((Date.now() - parseUTC(lastSeenAt).getTime()) / 1000);
  if (secs < 300)   return { online: true,  label: "Online now",                           color: "text-green-600" };
  if (secs < 3600)  return { online: false, label: `Active ${Math.floor(secs / 60)}m ago`, color: "text-amber-600" };
  if (secs < 86400) return { online: false, label: `Active ${Math.floor(secs / 3600)}h ago`, color: "text-slate-500" };
  return { online: false, label: "Offline", color: "text-slate-400" };
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 }).format(n);
}

// Read shop from the marketplace cache written by the marketplace page (avoids redundant API call)
function shopFromMktCache(shopId: string): import("@/lib/shop-api").Shop | null {
  try {
    const raw = localStorage.getItem("hgv_mkt_v2");
    if (!raw) return null;
    const c = JSON.parse(raw) as { shops: import("@/lib/shop-api").Shop[]; ts: number };
    if (Date.now() - c.ts > 120_000) return null; // honour 2-min freshness
    return c.shops.find((s) => s.id === shopId) ?? null;
  } catch { return null; }
}

interface Product {
  id: string; name: string; description?: string;
  cost_price: number; selling_price: number; quantity: number;
  supplier_id?: string | null;
}

interface CartItem { product: Product; qty: number; }

type Tab = "products" | "about" | "contact" | "messages";

export default function ShopStorePage() {
  const { shopId } = useParams<{ shopId: string }>();
  const { user }   = useAuth();
  const { t }      = useLanguage();
  const router     = useRouter();

  const [shop, setShop]         = useState<Shop | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab]           = useState<Tab>("products");

  // Own-shop products
  const [products, setProducts]   = useState<Product[]>([]);
  const [prodMeta, setProdMeta]   = useState<Record<string, ProductMeta>>({});
  const [prodLoading, setProdLoading] = useState(false);
  const [prodSearch, setProdSearch]   = useState("");

  // Cart (own → own) or order form (other shop)
  const [cart, setCart]     = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);

  // Add-partner modal
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [partnerType, setPartnerType] = useState<"supplier" | "customer">("supplier");
  const [tin, setTin]         = useState("");
  const [addingPartner, setAddingPartner] = useState(false);
  const [partnerAdded, setPartnerAdded]   = useState(false);
  const [partnerError, setPartnerError]   = useState("");
  const [partnerId, setPartnerId] = useState<string | null>(null);

  // Listed products for visitors (other shops browsing)
  const [listedProducts, setListedProducts] = useState<MarketplaceEntry[]>([]);

  // Messages — shopkeeper inbox (localStorage + BroadcastChannel)
  const [messages, setMessages]       = useState<ShopMessage[]>([]);
  const [openMsgId, setOpenMsgId]     = useState<string | null>(null);
  const [replyText, setReplyText]     = useState("");
  const shopScrollRef = useRef<HTMLDivElement>(null);
  const totalUnread = messages.filter((m) => !m.readByShop).length;

  // BroadcastChannel — instant same-device cross-tab delivery
  const bcRef = useRef<BroadcastChannel | null>(null);

  // Checkout / order placement
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutNotes, setCheckoutNotes] = useState("");
  const [placingOrder, setPlacingOrder]   = useState(false);

  // Follow
  const [following, setFollowing]         = useState(false);
  const [followerCount, setFollowerCount] = useState(0);

  // Customer chat (per-product, localStorage + BroadcastChannel)
  const [chatProduct, setChatProduct]         = useState<MarketplaceEntry | null>(null);
  const [customerMsgText, setCustomerMsgText] = useState("");
  const [customerMessages, setCustomerMessages] = useState<ShopMessage[]>([]);
  const prevReplyTotal = useRef(0);
  const chatScrollRef  = useRef<HTMLDivElement>(null);
  const [contactingProductId, setContactingProductId] = useState<string | null>(null);

  const isMine = shop?.id === user?.shop_id;

  useEffect(() => {
    // Fast path: serve from marketplace cache (written by marketplace page)
    const cached = shopFromMktCache(shopId);
    if (cached) { setShop(cached); setLoading(false); }

    // Always validate / refresh from API in background
    listShops({ limit: 200 }).then((res) => {
      const found = res.items?.find((s) => s.id === shopId) ?? null;
      if (found) { setShop(found); setLoading(false); }
      else if (!cached) { setNotFound(true); setLoading(false); }
    }).catch(() => { if (!cached) { setNotFound(true); setLoading(false); } });
  }, [shopId]);

  useEffect(() => {
    if (!shopId) return;
    setFollowing(isFollowingShop(shopId));
    setFollowerCount(getShopFollowerCount(shopId));
  }, [shopId]);

  // Open BroadcastChannel once
  useEffect(() => {
    try { bcRef.current = new BroadcastChannel("hgv_chat_v1"); } catch { /* Safari private */ }
    return () => { bcRef.current?.close(); bcRef.current = null; };
  }, []);

  // Load messages when chat product changes
  useEffect(() => {
    if (!chatProduct || isMine || !user) return;
    const all = getMyMessages(user.shop_id ?? "").filter((m) => m.shopId === chatProduct.shopId);
    setCustomerMessages(all);
    prevReplyTotal.current = all.reduce((s, m) => s + m.replies.length, 0);
  }, [chatProduct, isMine, user]);

  // Customer: SSE-first real-time message delivery + BroadcastChannel + polling fallback
  useEffect(() => {
    if (!shop || isMine || !user) return;

    const refresh = () => {
      const fresh = getMyMessages(user.shop_id ?? "").filter((m) => m.shopId === shop.id);
      const total = fresh.reduce((s, m) => s + m.replies.length, 0);
      if (total > prevReplyTotal.current) playChime();
      prevReplyTotal.current = total;
      setCustomerMessages(fresh);
    };

    // BroadcastChannel for same-device tab cross-communication (instant)
    const bc = bcRef.current;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "reply" && e.data.shopId === shop.id) refresh();
    };
    bc?.addEventListener("message", onMsg);

    // SSE — server pushes reply events; fallback to 3s polling if unavailable
    let pollIv: ReturnType<typeof setInterval> | null = null;
    const sseCtrl = openMessageStream(
      (evt) => {
        // Any message event for this shop triggers a localStorage refresh
        if (!evt.conversation_id && !evt.message) return;
        refresh();
      },
      () => {
        // SSE unavailable — fall back to 3 s polling (better than 1.5 s, still responsive)
        if (!pollIv) pollIv = setInterval(refresh, 3000);
      },
    );

    // Always do one immediate refresh on mount
    refresh();

    return () => {
      sseCtrl.abort();
      if (pollIv) clearInterval(pollIv);
      bc?.removeEventListener("message", onMsg);
    };
  }, [shop, isMine, user]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [customerMessages]);

  // Load catalog products for this shop (visible to all visitors)
  useEffect(() => {
    if (!shop) return;
    // Server catalog from shop description (cross-device)
    const serverEntries: MarketplaceEntry[] = decodeShopCatalog(shop.description).map((e) => ({
      productId: e.pid, shopId: shop.id, shopName: shop.name,
      shopLogoUrl: shop.logo_url, shopPhone: shop.phone,
      name: e.n, description: e.d, category: e.cat,
      sellingPrice: e.price, costPrice: e.price,
      quantity: e.qty, images: [], listedAt: e.at,
    }));
    // Overlay with localStorage entries which carry product images
    const merged = new Map<string, MarketplaceEntry>(serverEntries.map((e) => [e.productId, e]));
    for (const e of getCatalog().filter((le) => le.shopId === shop.id)) merged.set(e.productId, e);
    setListedProducts([...merged.values()]);

    // Also fetch from product DB — authoritative source (only returns listed products)
    itemRequest("/products/marketplace?limit=200")
      .then((res) => {
        const mkItems: Array<{
          id: string; shop_id: string; name: string; description?: string;
          category?: string; images?: string; selling_price: number;
          cost_price: number; quantity: number;
        }> = res?.data?.items ?? [];

        // Build a local-images index for best-quality image merging
        const localByPid = new Map(
          getCatalog().filter((le) => le.shopId === shop.id).map((le) => [le.productId, le])
        );

        // API is authoritative: rebuild for this shop from API results only
        merged.clear();
        for (const item of mkItems) {
          if (item.shop_id !== shop.id) continue;
          const serverImgs: string[] = item.images
            ? (() => { try { return JSON.parse(item.images) as string[]; } catch { return []; } })()
            : [];
          const localImgs = localByPid.get(item.id)?.images ?? [];
          merged.set(item.id, {
            productId: item.id, shopId: shop.id, shopName: shop.name,
            shopLogoUrl: shop.logo_url ?? undefined, shopPhone: shop.phone ?? undefined,
            name: item.name, description: item.description, category: item.category,
            sellingPrice: item.selling_price, costPrice: item.cost_price,
            quantity: item.quantity,
            images: localImgs.length > 0 ? localImgs : serverImgs,
            listedAt: new Date().toISOString(),
          });
        }
        setListedProducts([...merged.values()]);
      })
      .catch(() => {});
  }, [shop]);

  // Shop inbox: poll localStorage every 1.5 s + BroadcastChannel instant refresh
  useEffect(() => {
    if (!shop || !isMine) return;

    const refresh = () => setMessages(getMessagesForShop(shop.id));
    refresh();

    const bc = bcRef.current;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "msg" && e.data.shopId === shop.id) refresh();
    };
    bc?.addEventListener("message", onMsg);

    const iv = setInterval(refresh, 1500);
    return () => { clearInterval(iv); bc?.removeEventListener("message", onMsg); };
  }, [shop, isMine]);

  // Auto-scroll shop chat panel
  useEffect(() => {
    shopScrollRef.current?.scrollTo({ top: shopScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [openMsgId, messages]);

  // Load own shop's products when viewing own store
  useEffect(() => {
    if (!shop || !isMine) return;
    setProdLoading(true);
    itemRequest("/products?page=1&limit=200")
      .then((res) => {
        const items: Product[] = Array.isArray(res?.data?.items) ? res.data.items : [];
        setProducts(items);
        const meta: Record<string, ProductMeta> = {};
        items.forEach((p) => { meta[p.id] = getProductMeta(p.id); });
        setProdMeta(meta);
      })
      .catch(() => {})
      .finally(() => setProdLoading(false));
  }, [shop, isMine]);

  // Load partner list to check if this shop is already a partner
  useEffect(() => {
    if (!shop || isMine) return;
    partnerRequest("/suppliers")
      .then((res) => {
        const partners: { id: string; name: string }[] = Array.isArray(res?.data) ? res.data : [];
        const match = partners.find((p) => p.name.toLowerCase().trim() === shop.name.toLowerCase().trim());
        if (match) { setPartnerAdded(true); setPartnerId(match.id); }
      })
      .catch(() => {});
  }, [shop, isMine]);

  const filteredProducts = products.filter((p) =>
    !prodSearch || p.name.toLowerCase().includes(prodSearch.toLowerCase())
  );

  function addToCart(product: Product) {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.product.id === product.id);
      if (idx >= 0) return prev.map((c, i) => i === idx ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { product, qty: 1 }];
    });
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((c) => c.product.id !== productId));
  }

  function changeQty(productId: string, delta: number) {
    setCart((prev) =>
      prev.flatMap((c) => {
        if (c.product.id !== productId) return [c];
        const next = c.qty + delta;
        return next <= 0 ? [] : [{ ...c, qty: next }];
      })
    );
  }

  const cartTotal   = cart.reduce((s, c) => s + c.product.selling_price * c.qty, 0);
  const cartItemCount = cart.reduce((s, c) => s + c.qty, 0);

  async function handleAddPartner() {
    if (!shop) return;
    setAddingPartner(true);
    setPartnerError("");
    try {
      const tinClean = tin.trim();
      const addr = shop.address ?? "";
      const encoded = tinClean ? (addr ? `TIN:${tinClean}|${addr}` : `TIN:${tinClean}`) : addr;
      const res = await partnerRequest("/suppliers", {
        method: "POST",
        body: JSON.stringify({ name: shop.name, phone: shop.phone ?? "", email: shop.email ?? "", address: encoded }),
      });
      const newId: string | null = res?.data?.id ?? null;
      setPartnerAdded(true);
      setPartnerId(newId);
      setShowPartnerModal(false);
    } catch (err: unknown) {
      setPartnerError(err instanceof Error ? err.message : "Failed to add partner");
    } finally {
      setAddingPartner(false);
    }
  }

  async function placeOrder() {
    if (cart.length === 0 || !shop) return;
    setPlacingOrder(true);
    const cartSnapshot = [...cart];
    const total = cartSnapshot.reduce((s, c) => s + c.product.selling_price * c.qty, 0);
    try {
      const lines = [`🛒 I'd like to order:`];
      for (const item of cartSnapshot) {
        lines.push(`• ${item.product.name} × ${item.qty} = ${fmtCurrency(item.product.selling_price * item.qty)}`);
      }
      lines.push(`Total: ${fmtCurrency(total)}`);
      if (checkoutNotes) lines.push(`\nNote: ${checkoutNotes}`);
      lines.push(`\nPlease confirm availability and arrange delivery.`);
      const conv = await createOrGetConversation({
        shop_id:       shop.id,
        shop_name:     shop.name,
        customer_name: user?.name ?? user?.email,
        first_message: lines.join("\n"),
      });
      setCart([]);
      setShowCheckout(false);
      setCheckoutNotes("");
      router.push(`/messages?conv=${conv.id}`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to open chat");
    } finally {
      setPlacingOrder(false);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f4f4f4", fontFamily: "Arial, sans-serif" }}>
        <style>{`
          @keyframes hgv-shimmer {
            0%   { background-position: -600px 0; }
            100% { background-position:  600px 0; }
          }
          .hgv-sk {
            background: linear-gradient(90deg, #ebebeb 25%, #f5f5f5 50%, #ebebeb 75%);
            background-size: 1200px 100%;
            animation: hgv-shimmer 1.4s infinite linear;
          }
        `}</style>

        {/* Header skeleton */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e8e8e8" }}>
          {/* Breadcrumb */}
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "8px 16px" }}>
            <div className="hgv-sk" style={{ height: 10, width: 140, borderRadius: 4 }} />
          </div>

          {/* Banner */}
          <div className="hgv-sk" style={{ height: 80 }} />

          {/* Shop info */}
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginTop: -30, paddingBottom: 14 }}>
              <div className="hgv-sk" style={{ width: 72, height: 72, flexShrink: 0, border: "3px solid #fff" }} />
              <div style={{ flex: 1, paddingTop: 32, display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="hgv-sk" style={{ height: 18, width: 200, borderRadius: 4 }} />
                <div className="hgv-sk" style={{ height: 11, width: 280, borderRadius: 4 }} />
                <div className="hgv-sk" style={{ height: 11, width: 180, borderRadius: 4 }} />
              </div>
              <div className="hgv-sk" style={{ width: 100, height: 32, flexShrink: 0 }} />
            </div>

            {/* Stats bar */}
            <div style={{ display: "flex", gap: 24, borderTop: "1px solid #f0f0f0", paddingTop: 10, paddingBottom: 6 }}>
              {[60, 50, 40].map((w, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div className="hgv-sk" style={{ height: 14, width: w, borderRadius: 3 }} />
                  <div className="hgv-sk" style={{ height: 10, width: 70, borderRadius: 3 }} />
                </div>
              ))}
            </div>

            {/* Tab bar */}
            <div style={{ display: "flex", gap: 4, borderTop: "1px solid #f0f0f0", paddingTop: 4 }}>
              {[70, 50, 60].map((w, i) => (
                <div key={i} className="hgv-sk" style={{ height: 36, width: w, margin: "0 4px" }} />
              ))}
            </div>
          </div>
        </div>

        {/* Content skeleton */}
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 16px" }}>

          {/* Section label */}
          <div className="hgv-sk" style={{ height: 14, width: 160, borderRadius: 4, marginBottom: 14 }} />

          {/* Product grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ background: "#fff", border: "1px solid #e8e8e8", overflow: "hidden" }}>
                <div className="hgv-sk" style={{ height: 160, width: "100%" }} />
                <div style={{ padding: "10px 10px 12px" }}>
                  <div className="hgv-sk" style={{ height: 11, width: "90%", borderRadius: 3, marginBottom: 6 }} />
                  <div className="hgv-sk" style={{ height: 11, width: "60%", borderRadius: 3, marginBottom: 10 }} />
                  <div className="hgv-sk" style={{ height: 16, width: "45%", borderRadius: 3, marginBottom: 8 }} />
                  <div className="hgv-sk" style={{ height: 28, width: "100%", borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !shop) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <Store size={40} className="text-slate-300" />
        <p className="text-slate-500 font-semibold">Shop not found</p>
        <Link href="/marketplace" className="flex items-center gap-1.5 text-sm font-semibold text-[#1372e6] hover:underline">
          <ArrowLeft size={14} /> Back to Marketplace
        </Link>
      </div>
    );
  }

  const pres      = shopPresence(shop.last_seen_at);
  const initial   = (shop.name || "?")[0].toUpperCase();
  const joinedDate = shop.created_at
    ? parseUTC(shop.created_at).toLocaleDateString([], { year: "numeric", month: "long" })
    : null;


  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", fontFamily: "Arial, sans-serif" }}>

      {/* ── STORE HEADER (Alibaba style) ─────────────────────────────────────── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e8e8e8", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>

        {/* Breadcrumb */}
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "8px 16px" }}>
          <Link href="/marketplace" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#999", textDecoration: "none" }}>
            <ArrowLeft size={11} /> Marketplace
          </Link>
          <span style={{ fontSize: 11, color: "#ccc", margin: "0 4px" }}>/</span>
          <span style={{ fontSize: 11, color: "#555" }}>{shop.name}</span>
        </div>

        {/* Store banner */}
        <div style={{ height: 80, background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)", position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, opacity: 0.15, backgroundImage: "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)", backgroundSize: "8px 8px" }} />
        </div>

        {/* Shop info row */}
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginTop: -30, paddingBottom: 12 }}>

            {/* Logo */}
            <div style={{ width: 72, height: 72, border: "3px solid #fff", background: "#ff6a00", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
              {shop.logo_url
                ? <img src={shop.logo_url} alt={shop.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>{initial}</span>}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0, paddingTop: 32 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <h1 style={{ fontSize: 18, fontWeight: 700, color: "#333", margin: 0 }}>{shop.name}</h1>
                    {isMine && <span style={{ fontSize: 9, background: "#fff5f0", color: "#ff6a00", border: "1px solid #ffbb96", padding: "1px 6px", fontWeight: 700 }}>YOUR SHOP</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: pres.online ? "#52c41a" : "#999", display: "flex", alignItems: "center", gap: 3 }}>
                      {pres.online ? <><Wifi size={10} /> Online now</> : <><WifiOff size={10} /> {pres.label}</>}
                    </span>
                    {formatShortAddress(shop.address) && (() => {
                      const { lat, lng } = parseShopAddress(shop.address);
                      const href = lat != null && lng != null
                        ? `https://www.google.com/maps?q=${lat},${lng}`
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatPublicAddress(shop.address))}`;
                      return (
                        <a href={href} target="_blank" rel="noreferrer"
                          style={{ fontSize: 11, color: "#1677ff", textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}>
                          <MapPin size={10} style={{ color: "#ff6a00" }} /> {formatShortAddress(shop.address)}
                        </a>
                      );
                    })()}
                    {joinedDate && <span style={{ fontSize: 11, color: "#999", display: "flex", alignItems: "center", gap: 3 }}><CalendarDays size={10} /> Since {joinedDate}</span>}
                  </div>
                  {(() => { const { desc } = decodeShopHumanInfo(shop.description); return desc ? <p style={{ fontSize: 11, color: "#777", margin: "4px 0 0", maxWidth: 500 }}>{desc}</p> : null; })()}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center", flexWrap: "wrap" }}>
                  {!isMine && (
                    <>
                      {/* Follow / Connect button */}
                      <button
                        onClick={() => {
                          if (following) {
                            unfollowShop(shop.id);
                            setFollowing(false);
                            setFollowerCount((n) => Math.max(0, n - 1));
                          } else {
                            followShop(shop.id, shop.name);
                            setFollowing(true);
                            setFollowerCount((n) => n + 1);
                          }
                        }}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: following ? "1px solid #f5222d" : "1px solid #d9d9d9", background: following ? "#fff5f5" : "#fff", color: following ? "#f5222d" : "#555", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
                        <Heart size={12} style={{ fill: following ? "#f5222d" : "none" }} />
                        {following ? "Following" : "Follow Shop"}
                      </button>

                      {/* Message button — only if following */}
                      {following && (
                        <button
                          onClick={async () => {
                            try {
                              const conv = await createOrGetConversation({
                                shop_id:       shop.id,
                                shop_name:     shop.name,
                                customer_name: user?.name ?? user?.email,
                              });
                              router.push(`/messages?conv=${conv.id}`);
                            } catch { /* silent */ }
                          }}
                          style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: "1px solid #1677ff", background: "#fff", color: "#1677ff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          <MessageSquare size={12} /> Message Store
                        </button>
                      )}

                      <button
                        onClick={() => !partnerAdded && setShowPartnerModal(true)}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: partnerAdded ? "1px solid #b7eb8f" : "1px solid #d9d9d9", background: partnerAdded ? "#f6ffed" : "#fff", color: partnerAdded ? "#52c41a" : "#555", fontSize: 12, fontWeight: 600, cursor: partnerAdded ? "default" : "pointer" }}>
                        {partnerAdded ? <><CheckCircle size={12} /> Partner Added</> : <><UserPlus size={12} /> Add Partner</>}
                      </button>
                    </>
                  )}
                  {isMine && (
                    <Link href="/settings" style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: "1px solid #d9d9d9", color: "#555", fontSize: 12, fontWeight: 600, textDecoration: "none", background: "#fff" }}>
                      Edit Shop
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Stats bar */}
          <div style={{ display: "flex", gap: 0, borderTop: "1px solid #f0f0f0", paddingTop: 8, paddingBottom: 4 }}>
            {[
              { label: "Status", value: pres.online ? "Online" : "Offline", color: pres.online ? "#52c41a" : "#333" },
              { label: "Followers", value: String(followerCount), color: followerCount > 0 ? "#f5222d" : "#333" },
            ].map((s, i) => (
              <div key={i} style={{ paddingRight: 20, marginRight: 20, borderRight: i < 1 ? "1px solid #e8e8e8" : "none", display: "flex", flexDirection: "column" }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: s.color, margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
                  {i === 1 && followerCount > 0 && <Heart size={11} style={{ fill: "#f5222d", color: "#f5222d" }} />}
                  {s.value}
                </p>
                <p style={{ fontSize: 10, color: "#999", margin: "1px 0 0" }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px", display: "flex", borderTop: "1px solid #f0f0f0" }}>
          {(["products", "about", "contact", ...(isMine ? ["messages"] : [])] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                border: "none", background: "transparent",
                padding: "10px 16px", fontSize: 13, cursor: "pointer",
                color: tab === t ? "#ff6a00" : "#555",
                fontWeight: tab === t ? 700 : 400,
                borderBottom: tab === t ? "2px solid #ff6a00" : "2px solid transparent",
                position: "relative",
                transition: "color 0.15s",
              }}
            >
              {t === "products" ? "Products" : t === "about" ? "About" : t === "contact" ? "Contact" : "Messages"}
              {t === "messages" && totalUnread > 0 && (
                <span style={{ position: "absolute", top: 6, right: 4, minWidth: 16, height: 16, borderRadius: 8, background: "#f5222d", color: "#fff", fontSize: 8, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
                  {totalUnread}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTENT ─────────────────────────────────────────────────────────── */}
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "12px 16px" }}>

        {/* ── PRODUCTS TAB ───────────────────────────────────────────────────── */}
        {tab === "products" && (
          <div className="space-y-4">
            {isMine ? (
              <>
                {/* Own shop: search bar — marketplace style */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1, display: "flex", border: "2px solid #ff6a00", borderRadius: 6, overflow: "hidden", boxShadow: "0 1px 4px rgba(255,106,0,0.1)" }}>
                    <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
                      <Search size={13} style={{ position: "absolute", left: 10, color: prodSearch ? "#ff6a00" : "#bbb", transition: "color 0.15s" }} />
                      <input
                        type="text"
                        value={prodSearch}
                        onChange={(e) => setProdSearch(e.target.value)}
                        onKeyDown={(e) => e.key === "Escape" && setProdSearch("")}
                        placeholder="Search your products..."
                        style={{ width: "100%", border: "none", padding: "9px 32px 9px 30px", fontSize: 13, outline: "none", background: "#fff" }}
                      />
                      {prodSearch && (
                        <button onClick={() => setProdSearch("")}
                          style={{ position: "absolute", right: 8, border: "none", background: "none", cursor: "pointer", color: "#bbb", padding: 2, display: "flex" }}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                  <Link href="/items"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "#ff6a00", color: "#fff", textDecoration: "none", fontSize: 12, fontWeight: 700, borderRadius: 6, flexShrink: 0, whiteSpace: "nowrap" }}>
                    <Plus size={12} /> Add Items
                  </Link>
                </div>

                {/* Result count bar */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, padding: "5px 10px", background: "#fff", border: "1px solid #f0f0f0", borderRadius: 6 }}>
                  <span style={{ fontSize: 12, color: "#666", display: "flex", alignItems: "center", gap: 6 }}>
                    <strong style={{ color: "#111" }}>{filteredProducts.length}</strong>
                    <span style={{ color: "#888" }}>
                      {prodSearch ? <> results for <em style={{ color: "#ff6a00", fontStyle: "normal", fontWeight: 700 }}>&ldquo;{prodSearch}&rdquo;</em></> : " products in your catalog"}
                    </span>
                    {prodSearch && (
                      <button onClick={() => setProdSearch("")}
                        style={{ fontSize: 10, color: "#ff6a00", border: "1px solid #fed7aa", background: "transparent", borderRadius: 4, padding: "1px 6px", cursor: "pointer", fontWeight: 600 }}>
                        Clear
                      </button>
                    )}
                  </span>
                  <span style={{ fontSize: 10, color: "#52c41a", fontWeight: 600 }}>
                    {Object.values(prodMeta).filter(m => m.listed).length} listed on marketplace
                  </span>
                </div>

                {prodLoading ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))", gap: 8 }}>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} style={{ background: "#fff", border: "1px solid #e8e8e8", height: 280 }} className="animate-pulse" />
                    ))}
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div style={{ background: "#fff", border: "1px solid #e8e8e8", padding: "48px 24px", textAlign: "center" }}>
                    <Package size={36} style={{ color: "#e0e0e0", margin: "0 auto 12px" }} />
                    <p style={{ fontSize: 14, fontWeight: 700, color: "#555", margin: "0 0 4px" }}>
                      {prodSearch ? "No products match your search" : "No products yet"}
                    </p>
                    <p style={{ fontSize: 12, color: "#aaa", margin: "0 0 16px" }}>
                      {prodSearch ? "Try a different keyword" : "Add items to your inventory to list them here."}
                    </p>
                    <Link href="/items"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 16px", background: "#ff6a00", color: "#fff", textDecoration: "none", fontSize: 12, fontWeight: 700, borderRadius: 6 }}>
                      Go to Items <ChevronRight size={12} />
                    </Link>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))", gap: 8 }}>
                    {filteredProducts.map((product) => (
                      <OwnProductCard
                        key={product.id}
                        product={product}
                        meta={prodMeta[product.id] ?? { images: [], listed: false }}
                        onToggleListed={() => {
                          const current = prodMeta[product.id] ?? { images: [], listed: false };
                          const updated = { ...current, listed: !current.listed };
                          setProductMeta(product.id, updated);
                          setProdMeta((prev) => {
                            const next = { ...prev, [product.id]: updated };

                            // Rebuild server description catalog from all currently-listed products
                            const catalogEntries = products
                              .filter((p) => {
                                const m = next[p.id] ?? { images: [], listed: false };
                                return m.listed && m.images.length > 0;
                              })
                              .map((p) => {
                                const m = next[p.id];
                                return {
                                  pid: p.id, n: p.name,
                                  d: p.description?.slice(0, 200),
                                  cat: m.category || catFromText(p.name, p.description),
                                  price: p.selling_price, qty: p.quantity,
                                  at: new Date().toISOString(),
                                };
                              });

                            // Fire-and-forget: sync listed flag and images to product API
                            itemRequest(`/products/${product.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ listed: updated.listed, images: JSON.stringify(updated.images) }),
                            }).catch(() => {});

                            // Fire-and-forget: update shop description catalog server-side
                            updateMyShop({
                              description: encodeDescriptionWithCatalog(shop.description, catalogEntries),
                            }).catch(() => {});

                            return next;
                          });

                          if (updated.listed) {
                            upsertCatalogEntry({
                              productId: product.id,
                              shopId: shop.id,
                              shopName: shop.name,
                              shopLogoUrl: shop.logo_url ?? undefined,
                              shopPhone: shop.phone ?? undefined,
                              name: product.name,
                              description: product.description,
                              sellingPrice: product.selling_price,
                              costPrice: product.cost_price,
                              quantity: product.quantity,
                              images: updated.images,
                              listedAt: new Date().toISOString(),
                            });
                          } else {
                            removeCatalogEntry(product.id);
                          }
                        }}
                      />
                    ))}
                    {/* Dashed "add" tile */}
                    <Link href="/items"
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, border: "1px dashed #d9d9d9", textDecoration: "none", background: "#fafafa", minHeight: 280, color: "#bbb" }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", border: "2px dashed #d9d9d9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Plus size={18} style={{ color: "#ccc" }} />
                      </div>
                      <span style={{ fontSize: 11, textAlign: "center", lineHeight: 1.5, color: "#aaa" }}>Add more<br />products</span>
                    </Link>
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#EBF2FD", border: "1px solid #A8C8F8", borderRadius: 8, marginTop: 8, fontSize: 12, color: "#1372e6" }}>
                  <Info size={13} style={{ flexShrink: 0 }} />
                  <span>This is your shop&apos;s product catalog as other businesses see it on the marketplace.</span>
                </div>
              </>
            ) : (
              <>
                {/* Listed products from this shop — marketplace card style */}
                {listedProducts.length > 0 && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#333", display: "flex", alignItems: "center", gap: 6 }}>
                        <Package size={14} style={{ color: "#ff6a00" }} />
                        Products from {shop.name}
                      </span>
                      <span style={{ background: "#fff5f0", color: "#ff6a00", border: "1px solid #ffbb96", fontSize: 10, fontWeight: 700, padding: "1px 8px" }}>
                        {listedProducts.length} listed
                      </span>
                      {!following && (
                        <span style={{ fontSize: 10, color: "#999", marginLeft: "auto" }}>
                          Follow shop to chat about products
                        </span>
                      )}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(185px, 1fr))", gap: 10 }}>
                      {listedProducts.map((entry) => {
                        const inStock  = entry.quantity > 0;
                        const isActive = chatProduct?.productId === entry.productId;
                        return (
                          <div key={entry.productId}
                            style={{
                              background: "#fff",
                              border: `1px solid ${isActive ? "#ff6a00" : "#e8e8e8"}`,
                              display: "flex", flexDirection: "column",
                              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                              borderRadius: 3, overflow: "hidden",
                              transition: "box-shadow 0.15s, border-color 0.15s",
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.11)";
                              if (!isActive) (e.currentTarget as HTMLDivElement).style.borderColor = "#ffd8b8";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)";
                              if (!isActive) (e.currentTarget as HTMLDivElement).style.borderColor = "#e8e8e8";
                            }}
                          >
                            {/* Image */}
                            <div style={{ position: "relative", aspectRatio: "1", overflow: "hidden", background: "#f7f7f7", flexShrink: 0 }}>
                              {entry.images[0]
                                ? <img src={entry.images[0]} alt={entry.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                : <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                    <Package size={32} style={{ color: "#d9d9d9" }} />
                                    <span style={{ fontSize: 9, color: "#ccc" }}>No photo</span>
                                  </div>}
                              {!inStock && (
                                <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.78)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: "#f5222d", border: "1.5px solid #f5222d", padding: "2px 10px", background: "#fff" }}>Out of Stock</span>
                                </div>
                              )}
                              {entry.images.length > 1 && (
                                <span style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.42)", color: "#fff", fontSize: 9, padding: "2px 6px", borderRadius: 10, fontWeight: 600 }}>
                                  +{entry.images.length - 1}
                                </span>
                              )}
                            </div>

                            {/* Info */}
                            <div style={{ padding: "10px 10px 0", flex: 1, display: "flex", flexDirection: "column" }}>
                              <p style={{
                                fontSize: 13, fontWeight: 500, color: "#222", margin: "0 0 6px", lineHeight: 1.5, minHeight: 39,
                                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden",
                              }}>{entry.name}</p>

                              <p style={{ fontSize: 17, fontWeight: 800, color: "#ff6a00", margin: "0 0 3px", lineHeight: 1 }}>
                                {fmtCurrency(entry.sellingPrice)}
                              </p>
                              <p style={{ fontSize: 11, color: "#aaa", margin: "0 0 10px" }}>Min. order: 1 unit</p>

                              <div style={{ borderTop: "1px solid #f0f0f0", marginTop: "auto" }} />

                              <div style={{ display: "flex", gap: 6, padding: "8px 0 10px" }}>
                                <button
                                  onClick={() => addToCart({ id: entry.productId, name: entry.name, description: entry.description, cost_price: entry.sellingPrice, selling_price: entry.sellingPrice, quantity: entry.quantity })}
                                  disabled={!inStock}
                                  style={{
                                    flex: 2, padding: "8px 0",
                                    background: inStock ? "#ff6a00" : "#f5f5f5",
                                    color: inStock ? "#fff" : "#ccc",
                                    border: "none", cursor: inStock ? "pointer" : "not-allowed",
                                    fontSize: 11, fontWeight: 700, borderRadius: 2,
                                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                                  }}>
                                  <ShoppingCart size={11} /> {inStock ? "Start Order" : "Unavailable"}
                                </button>
                                {following ? (
                                  <button
                                    disabled={contactingProductId === entry.productId}
                                    onClick={async () => {
                                      if (!shop) return;
                                      setContactingProductId(entry.productId);
                                      try {
                                        const conv = await createOrGetConversation({
                                          shop_id:       shop.id,
                                          shop_name:     shop.name,
                                          customer_name: user?.name ?? user?.email,
                                          product_id:    entry.productId,
                                          product_name:  entry.name,
                                          product_image: entry.images[0],
                                          listed_price:  entry.sellingPrice,
                                        });
                                        router.push(`/messages?conv=${conv.id}`);
                                      } catch {
                                        setContactingProductId(null);
                                      }
                                    }}
                                    style={{
                                      flex: 1, padding: "8px 0",
                                      background: contactingProductId === entry.productId ? "#e6f4ff" : "#fff",
                                      color: "#1677ff",
                                      border: "1.5px solid #1677ff",
                                      cursor: contactingProductId === entry.productId ? "not-allowed" : "pointer",
                                      fontSize: 11, fontWeight: 700, borderRadius: 2,
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                      opacity: contactingProductId === entry.productId ? 0.6 : 1,
                                    }}>
                                    <MessageSquare size={12} />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => { followShop(shop.id, shop.name); setFollowing(true); setFollowerCount((n) => n + 1); }}
                                    title="Follow to contact supplier"
                                    style={{
                                      flex: 1, padding: "8px 0",
                                      background: "#fff5f5", color: "#f5222d",
                                      border: "1.5px solid #ffa39e", cursor: "pointer",
                                      fontSize: 11, fontWeight: 700, borderRadius: 2,
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                    }}>
                                    <Heart size={12} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </>
            )}
          </div>
        )}

        {/* ── ABOUT TAB ──────────────────────────────────────────────────────── */}
        {tab === "about" && (
          <div className="space-y-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
                <Store size={14} className="text-[#1372e6]" /> About {shop.name}
              </h2>
              {(() => { const { desc } = decodeShopHumanInfo(shop.description); return desc ? (
                <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
              ) : (
                <p className="text-sm text-slate-400 italic">No description provided by this shop.</p>
              ); })()}

              <div className="mt-4 grid grid-cols-2 gap-3">
                {joinedDate && (
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold">Member Since</p>
                    <p className="text-sm font-bold text-slate-700 mt-0.5">{joinedDate}</p>
                  </div>
                )}
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold">Status</p>
                  <p className={`text-sm font-bold mt-0.5 ${pres.online ? "text-green-600" : "text-slate-400"}`}>
                    {pres.label}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold">Platform</p>
                  <p className="text-sm font-bold text-slate-700 mt-0.5">Higoverse POS</p>
                </div>
                {partnerAdded && (
                  <div className="p-3 bg-green-50 rounded-xl border border-green-200">
                    <p className="text-[9px] text-green-700 uppercase tracking-wide font-semibold">Your Relationship</p>
                    <p className="text-sm font-bold text-green-700 mt-0.5 flex items-center gap-1">
                      <CheckCircle size={12} /> Partner
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── CONTACT TAB ────────────────────────────────────────────────────── */}
        {tab === "contact" && (
          <div className="space-y-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 className="font-bold text-slate-900 text-sm mb-4 flex items-center gap-2">
                <Phone size={14} className="text-[#1372e6]" /> Contact Information
              </h2>
              <div className="space-y-3">
                {shop.phone && (
                  <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition">
                    <div className="w-9 h-9 rounded-xl bg-[#EBF2FD] flex items-center justify-center flex-shrink-0">
                      <Phone size={15} className="text-[#1372e6]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold">Phone</p>
                      <a href={`tel:${shop.phone}`} className="text-sm font-bold text-slate-800 hover:text-[#1372e6] transition">{shop.phone}</a>
                    </div>
                    <a href={`tel:${shop.phone}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition hover:opacity-90 flex-shrink-0" style={{ backgroundColor: "#1372e6" }}>
                      Call
                    </a>
                  </div>
                )}
                {formatPublicAddress(shop.address) && (() => {
                  const { lat, lng } = parseShopAddress(shop.address);
                  const hasPin = lat != null && lng != null;
                  const mapsHref = hasPin
                    ? `https://www.google.com/maps?q=${lat},${lng}`
                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatPublicAddress(shop.address))}`;
                  return (
                    <div className="space-y-0">
                      <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition">
                        <div className="w-9 h-9 rounded-xl bg-[#EBF2FD] flex items-center justify-center flex-shrink-0">
                          <MapPin size={15} className="text-[#1372e6]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold">
                            {hasPin ? "Exact Location" : "Address"}
                          </p>
                          <p className="text-sm font-bold text-slate-800 break-words">{formatPublicAddress(shop.address)}</p>
                        </div>
                        <a href={mapsHref} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-[#1372e6] bg-[#EBF2FD] hover:bg-[#D5E8FB] transition flex-shrink-0">
                          <ExternalLink size={10} /> {hasPin ? "Navigate" : "Map"}
                        </a>
                      </div>

                      {/* Higoverse embedded map — clean Leaflet, no OSM footer */}
                      {hasPin && (
                        <div className="mx-3 mb-3 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                          <HigoMapView lat={lat!} lng={lng!} height={220} zoom={17} />
                          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-t border-slate-100">
                            <span className="text-[10px] text-slate-400 flex items-center gap-1.5">
                              <MapPin size={9} className="text-[#1372e6]" />
                              <span className="font-semibold text-slate-500">Higoverse Maps</span>
                            </span>
                            <a href={mapsHref} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] font-bold text-[#1372e6] hover:underline flex items-center gap-1">
                              Open in Google Maps <ExternalLink size={9} />
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {!shop.phone && !formatPublicAddress(shop.address) && (
                  <p className="text-sm text-slate-400 italic text-center py-4">No contact details available.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── MESSAGES TAB — localStorage + BroadcastChannel real-time ───────── */}
        {tab === "messages" && isMine && (
          <div style={{ display: "flex", gap: 10, height: "calc(100vh - 260px)", minHeight: 480 }}>

            {/* Conversation list */}
            <div style={{ width: 280, flexShrink: 0, background: "#fff", border: "1px solid #e8e8e8", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#333", flex: 1 }}>
                  Inbox {totalUnread > 0 && (
                    <span style={{ marginLeft: 5, background: "#f5222d", color: "#fff", fontSize: 9, padding: "1px 6px", fontWeight: 900, borderRadius: 20 }}>
                      {totalUnread}
                    </span>
                  )}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: "#52c41a", fontWeight: 700 }}>
                  <span style={{ width: 6, height: 6, background: "#52c41a", borderRadius: "50%", display: "inline-block", animation: "pulse 2s infinite" }} />
                  Live
                </span>
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {messages.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center" }}>
                    <Package size={28} style={{ color: "#e0e0e0", margin: "0 auto 8px" }} />
                    <p style={{ fontSize: 11, color: "#aaa", lineHeight: 1.5 }}>No messages yet. When customers message you, conversations appear here.</p>
                  </div>
                ) : messages.map((msg) => (
                  <button key={msg.id}
                    onClick={() => {
                      setOpenMsgId(msg.id);
                      if (!msg.readByShop) {
                        markMessageRead(msg.id);
                        setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, readByShop: true } : m));
                      }
                    }}
                    style={{ width: "100%", display: "flex", gap: 10, padding: "10px 12px", border: "none", background: openMsgId === msg.id ? "#fff5f0" : "transparent", borderLeft: openMsgId === msg.id ? "3px solid #ff6a00" : "3px solid transparent", borderBottom: "1px solid #f8f8f8", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#ff6a00", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 900, flexShrink: 0 }}>
                      {msg.buyerName[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <p style={{ fontSize: 12, fontWeight: !msg.readByShop ? 800 : 600, color: "#333", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg.buyerName}</p>
                        <p style={{ fontSize: 9, color: "#bbb", margin: 0, flexShrink: 0 }}>{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                      <p style={{ fontSize: 10, color: "#999", margin: "1px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        Re: <strong style={{ color: "#555" }}>{msg.productName}</strong>
                      </p>
                      <p style={{ fontSize: 10, color: !msg.readByShop ? "#ff6a00" : "#aaa", margin: "1px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: !msg.readByShop ? 700 : 400 }}>
                        {msg.replies.length > 0 ? `${msg.replies.length} replies` : msg.text}
                      </p>
                    </div>
                    {!msg.readByShop && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff6a00", flexShrink: 0, marginTop: 6 }} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Chat window */}
            {openMsgId ? (() => {
              const msg = messages.find((m) => m.id === openMsgId);
              if (!msg) return null;
              return (
                <div style={{ flex: 1, background: "#fff", border: "1px solid #e8e8e8", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  {/* Header */}
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 10, background: "#fafafa", flexShrink: 0 }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#ff6a00", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 900, flexShrink: 0 }}>
                      {msg.buyerName[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#333", margin: 0 }}>{msg.buyerName}</p>
                      <p style={{ fontSize: 10, color: "#999", margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
                        <Package size={9} style={{ color: "#ff6a00" }} /> About: <strong style={{ color: "#555" }}>{msg.productName}</strong>
                      </p>
                    </div>
                  </div>

                  {/* Thread */}
                  <div ref={shopScrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10, background: "#f9f9f9" }}>
                    {/* Customer's first message */}
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#e8e8e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#555", flexShrink: 0 }}>
                        {msg.buyerName[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p style={{ fontSize: 9, color: "#bbb", margin: "0 0 3px" }}>{msg.buyerName}</p>
                        <div style={{ background: "#fff", border: "1px solid #e8e8e8", padding: "8px 12px", fontSize: 12, color: "#333", lineHeight: 1.6, maxWidth: 360, borderRadius: "12px 12px 12px 0", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
                          {msg.text}
                        </div>
                        <p style={{ fontSize: 9, color: "#bbb", margin: "3px 0 0" }}>{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    </div>

                    {/* Replies (flat, alternating) */}
                    {msg.replies.map((r) => {
                      const isShop = r.fromShop;
                      return (
                        <div key={r.id} style={{ display: "flex", justifyContent: isShop ? "flex-end" : "flex-start", gap: 8, alignItems: "flex-end" }}>
                          {!isShop && (
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#e8e8e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#555", flexShrink: 0 }}>
                              {msg.buyerName[0]?.toUpperCase()}
                            </div>
                          )}
                          <div>
                            {!isShop && <p style={{ fontSize: 9, color: "#bbb", margin: "0 0 3px" }}>{msg.buyerName}</p>}
                            <div style={{ padding: "8px 12px", fontSize: 12, lineHeight: 1.6, maxWidth: 360, background: isShop ? "#ff6a00" : "#fff", color: isShop ? "#fff" : "#333", border: isShop ? "none" : "1px solid #e8e8e8", borderRadius: isShop ? "12px 12px 0 12px" : "12px 12px 12px 0", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                              {r.text}
                            </div>
                            <p style={{ fontSize: 9, color: "#bbb", margin: "3px 0 0", textAlign: isShop ? "right" : "left" }}>
                              {new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                          {isShop && (
                            <div style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", background: "#ff6a00", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {shop.logo_url ? <img src={shop.logo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 11, fontWeight: 900, color: "#fff" }}>{initial}</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Reply input */}
                  <div style={{ borderTop: "1px solid #e8e8e8", padding: "10px 12px", background: "#fff", display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                    <input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && replyText.trim()) {
                          e.preventDefault();
                          replyToMessage(msg.id, replyText.trim(), true);
                          setReplyText("");
                          setMessages(getMessagesForShop(shop.id));
                          // Notify customer tab instantly
                          bcRef.current?.postMessage({ type: "reply", shopId: shop.id });
                        }
                      }}
                      placeholder={`Reply to ${msg.buyerName}…`}
                      style={{ flex: 1, border: "1.5px solid #e8e8e8", padding: "8px 12px", fontSize: 12, outline: "none", borderRadius: 8 }}
                    />
                    <button
                      disabled={!replyText.trim()}
                      onClick={() => {
                        if (!replyText.trim()) return;
                        replyToMessage(msg.id, replyText.trim(), true);
                        setReplyText("");
                        setMessages(getMessagesForShop(shop.id));
                        bcRef.current?.postMessage({ type: "reply", shopId: shop.id });
                      }}
                      style={{ padding: "8px 16px", background: replyText.trim() ? "#ff6a00" : "#f5f5f5", color: replyText.trim() ? "#fff" : "#ccc", border: "none", cursor: replyText.trim() ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, flexShrink: 0, borderRadius: 8 }}>
                      <Send size={13} /> Send
                    </button>
                  </div>
                </div>
              );
            })() : (
              <div style={{ flex: 1, background: "#fff", border: "1px solid #e8e8e8", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Package size={40} style={{ color: "#e0e0e0" }} />
                <p style={{ fontSize: 13, color: "#bbb" }}>Select a conversation to reply</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── CART DRAWER (own-shop order basket) ─────────────────────────────── */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCart(false)} />
          <div className="relative bg-white w-full max-w-sm flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <ShoppingCart size={15} className="text-[#1372e6]" /> Order Basket
              </h2>
              <button onClick={() => setShowCart(false)} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 transition">
                <X size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {cart.map((item) => (
                <div key={item.product.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-lg bg-[#EBF2FD] flex items-center justify-center flex-shrink-0">
                    <Package size={14} className="text-[#1372e6]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{item.product.name}</p>
                    <p className="text-[10px] text-slate-400">{fmtCurrency(item.product.selling_price)} each</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => changeQty(item.product.id, -1)} className="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition">
                      <Minus size={9} />
                    </button>
                    <span className="text-xs font-bold w-5 text-center">{item.qty}</span>
                    <button onClick={() => changeQty(item.product.id, 1)} className="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition">
                      <Plus size={9} />
                    </button>
                    <button onClick={() => removeFromCart(item.product.id)} className="w-6 h-6 rounded-lg hover:bg-red-50 flex items-center justify-center text-slate-300 hover:text-red-500 transition ml-1">
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {cart.length > 0 && (
              <div className="px-5 py-4 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">Total</span>
                  <span className="text-sm font-black text-slate-900">{fmtCurrency(cartTotal)}</span>
                </div>
                <button
                  onClick={() => { setShowCart(false); setShowCheckout(true); }}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition hover:opacity-90"
                  style={{ backgroundColor: "#1372e6" }}
                >
                  <ShoppingCart size={14} /> Checkout ({cart.length} item{cart.length !== 1 ? "s" : ""})
                </button>
              </div>
            )}
            {cart.length === 0 && (
              <div className="p-6 text-center text-slate-400">
                <ShoppingCart size={24} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs">Your basket is empty</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ADD PARTNER MODAL ────────────────────────────────────────────────── */}
      {showPartnerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <UserPlus size={15} className="text-[#1372e6]" /> Add as Partner
              </h2>
              <button onClick={() => setShowPartnerModal(false)} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 transition">
                <X size={15} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#1372e6] flex items-center justify-center text-white font-bold flex-shrink-0">
                  {shop.logo_url ? <img src={shop.logo_url} alt={shop.name} className="w-full h-full object-cover" /> : initial}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 text-sm truncate">{shop.name}</p>
                  {shop.phone && <p className="text-[10px] text-slate-400">{shop.phone}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Partner Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["supplier", "customer"] as const).map((type) => (
                    <button key={type} type="button" onClick={() => setPartnerType(type)}
                      className={`p-2.5 rounded-xl border text-left transition ${partnerType === type ? "border-[#1372e6] bg-[#EBF2FD] text-[#1372e6]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                      <p className="text-xs font-bold capitalize">{type}</p>
                      <p className="text-[9px] mt-0.5 opacity-70">
                        {type === "supplier" ? "They supply goods to you" : "They buy from you"}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {partnerType === "supplier" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">TIN / Tax ID (optional)</label>
                  <input type="text" value={tin} onChange={(e) => setTin(e.target.value)} placeholder="e.g. 123456789"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition"
                  />
                </div>
              )}
              {partnerError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{partnerError}</p>}
            </div>
            <div className="flex gap-2.5 px-5 pb-5">
              <button onClick={() => setShowPartnerModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
                Cancel
              </button>
              <button onClick={handleAddPartner} disabled={addingPartner}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition disabled:opacity-60"
                style={{ backgroundColor: "#1372e6" }}
              >
                {addingPartner ? <><Loader2 size={13} className="animate-spin" /> Adding...</> : <><UserPlus size={13} /> Add Partner</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CHECKOUT MODAL ──────────────────────────────────────────────────── */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <ShoppingCart size={15} className="text-[#1372e6]" /> Confirm Order
              </h2>
              <button onClick={() => setShowCheckout(false)} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 transition">
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600">
                <p className="font-semibold text-slate-800 mb-1">Order Summary</p>
                <p>Supplier: <span className="font-semibold">{shop.name}</span></p>
                <p>{cart.length} product{cart.length !== 1 ? "s" : ""} · {fmtCurrency(cartTotal)}</p>
              </div>

              <div className="divide-y divide-slate-50 border border-slate-100 rounded-xl overflow-hidden">
                {cart.map((item) => (
                  <div key={item.product.id} className="flex items-center justify-between px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{item.product.name}</p>
                      <p className="text-[9px] text-slate-400">× {item.qty}</p>
                    </div>
                    <p className="text-xs font-bold text-slate-800 flex-shrink-0 ml-2">
                      {fmtCurrency(item.product.selling_price * item.qty)}
                    </p>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes (optional)</label>
                <textarea
                  value={checkoutNotes}
                  onChange={(e) => setCheckoutNotes(e.target.value)}
                  placeholder="Delivery details, special requests..."
                  rows={2}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition resize-none"
                />
              </div>

              <div className="p-3 bg-[#EBF2FD] rounded-xl border border-[#A8C8F8] text-[10px] text-[#1372e6] flex items-start gap-2">
                <Info size={12} className="flex-shrink-0 mt-0.5" />
                <span>This will open a chat with {shop.name}. Confirm availability, negotiate price, and arrange delivery through messages.</span>
              </div>
            </div>

            <div className="flex gap-2.5 px-5 pb-5 border-t border-slate-100 pt-4">
              <button onClick={() => setShowCheckout(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
                Cancel
              </button>
              <button
                onClick={placeOrder}
                disabled={placingOrder}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition disabled:opacity-60"
                style={{ backgroundColor: "#1372e6" }}
              >
                {placingOrder ? <><Loader2 size={13} className="animate-spin" /> Opening chat...</> : <><MessageSquare size={13} /> Chat to Order</>}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── CUSTOMER CHAT PANEL — localStorage + BroadcastChannel ─────────── */}
      {chatProduct && !isMine && user && (() => {
        const isGeneral = chatProduct.productId === "shop-general-inquiry";
        const buyerInitial = (user.name ?? user.email ?? "B")[0]?.toUpperCase();
        const thread = customerMessages.filter(
          (m) => (isGeneral || m.productId === chatProduct.productId) && m.shopId === shop.id
        );
        const quickReplies = isGeneral
          ? ["Hello! I'm interested", "What are your hours?", "Do you deliver?", "Can we discuss pricing?"]
          : [`Is this still available?`, "Min. order quantity?", "Any discount?", "Do you deliver?"];

        const handleSend = () => {
          const text = customerMsgText.trim();
          if (!text) return;
          setCustomerMsgText("");
          // Save to localStorage and add to state in one step — zero duplication
          const saved = sendMessage({
            productId: chatProduct.productId,
            productName: chatProduct.name,
            shopId: shop.id, shopName: shop.name,
            buyerShopId: user.shop_id ?? "",
            buyerName: user.name ?? user.email ?? "Customer",
            text,
            timestamp: new Date().toISOString(),
          });
          setCustomerMessages((prev) => [...prev, saved]);
          // Notify the shop tab instantly
          bcRef.current?.postMessage({ type: "msg", shopId: shop.id });
        };

        return (
          <div style={{ position: "fixed", bottom: 0, right: 24, width: 390, height: 530, background: "#fff", boxShadow: "0 -6px 32px rgba(0,0,0,0.18)", zIndex: 60, display: "flex", flexDirection: "column", border: "1px solid #e8e8e8", fontFamily: "Arial, sans-serif" }}>

            {/* Header */}
            <div style={{ background: "#ff6a00", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {shop.logo_url
                  ? <img src={shop.logo_url} alt={shop.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontSize: 14, fontWeight: 900, color: "#fff" }}>{initial}</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#fff", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shop.name}</p>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.85)", margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#a5f3a5", display: "inline-block", animation: "pulse 2s infinite" }} />
                  Live · replies play sound
                </p>
              </div>
              <button onClick={() => setChatProduct(null)}
                style={{ border: "none", background: "rgba(255,255,255,0.2)", cursor: "pointer", color: "#fff", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                ✕
              </button>
            </div>

            {/* Product context bar */}
            {!isGeneral && (
              <div style={{ display: "flex", gap: 10, padding: "8px 12px", background: "#fff5f0", borderBottom: "1px solid #ffe0c0", flexShrink: 0 }}>
                <div style={{ width: 44, height: 44, flexShrink: 0, border: "1px solid #ffd6b3", overflow: "hidden", background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {chatProduct.images[0]
                    ? <img src={chatProduct.images[0]} alt={chatProduct.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <Package size={16} style={{ color: "#ccc" }} />}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#333", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chatProduct.name}</p>
                  <p style={{ fontSize: 14, fontWeight: 900, color: "#ff6a00", margin: "2px 0 0" }}>{fmtCurrency(chatProduct.sellingPrice)}</p>
                </div>
                {chatProduct.images.length > 1 && (
                  <div style={{ display: "flex", gap: 2, alignItems: "center", flexShrink: 0 }}>
                    {chatProduct.images.slice(1, 4).map((src, i) => (
                      <img key={i} src={src} alt="" style={{ width: 30, height: 30, objectFit: "cover", border: "1px solid #e8e8e8" }} />
                    ))}
                    {chatProduct.images.length > 4 && (
                      <span style={{ width: 30, height: 30, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#fff", fontWeight: 700 }}>
                        +{chatProduct.images.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Messages */}
            <div ref={chatScrollRef} style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 10, background: "#f9f9f9" }}>
              {thread.length === 0 && (
                <div style={{ textAlign: "center", paddingTop: 16 }}>
                  <p style={{ fontSize: 11, color: "#bbb", marginBottom: 8 }}>
                    {isGeneral ? `Ask ${shop.name} anything` : `Ask about ${chatProduct.name}`}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center" }}>
                    {quickReplies.map((q) => (
                      <button key={q} onClick={() => setCustomerMsgText(q)}
                        style={{ fontSize: 10, padding: "4px 8px", border: "1px solid #ffb899", background: customerMsgText === q ? "#fff5f0" : "#fff", color: "#ff6a00", cursor: "pointer", borderRadius: 20 }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Flat thread: first message + all replies interleaved */}
              {thread.map((m) => (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Customer's sent message */}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 7, alignItems: "flex-end" }}>
                    <div>
                      <div style={{ padding: "8px 12px", fontSize: 12, lineHeight: 1.55, maxWidth: 250, background: "#ff6a00", color: "#fff", borderRadius: "12px 12px 0 12px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
                        {m.text}
                      </div>
                      <p style={{ fontSize: 9, color: "#bbb", margin: "3px 0 0", textAlign: "right", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3 }}>
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        <CheckCircle size={8} style={{ color: "#52c41a" }} />
                      </p>
                    </div>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#ff6a00", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#fff" }}>
                      {buyerInitial}
                    </div>
                  </div>

                  {/* Shop replies */}
                  {m.replies.map((r) => (
                    <div key={r.id} style={{ display: "flex", justifyContent: r.fromShop ? "flex-start" : "flex-end", gap: 7, alignItems: "flex-end" }}>
                      {r.fromShop && (
                        <div style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", background: "#ff6a00", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {shop.logo_url ? <img src={shop.logo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 10, fontWeight: 900, color: "#fff" }}>{initial}</span>}
                        </div>
                      )}
                      <div>
                        {r.fromShop && <p style={{ fontSize: 9, color: "#bbb", margin: "0 0 3px" }}>{shop.name}</p>}
                        <div style={{ padding: "8px 12px", fontSize: 12, lineHeight: 1.55, maxWidth: 250, background: r.fromShop ? "#fff" : "#ff6a00", color: r.fromShop ? "#333" : "#fff", border: r.fromShop ? "1px solid #e8e8e8" : "none", borderRadius: r.fromShop ? "12px 12px 12px 0" : "12px 12px 0 12px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
                          {r.text}
                        </div>
                        <p style={{ fontSize: 9, color: "#bbb", margin: "3px 0 0", textAlign: r.fromShop ? "left" : "right" }}>
                          {new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Input */}
            <div style={{ borderTop: "1px solid #e8e8e8", padding: "10px 12px", background: "#fff", display: "flex", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
              <textarea
                value={customerMsgText}
                onChange={(e) => setCustomerMsgText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={`Message ${shop.name}…`}
                rows={2}
                style={{ flex: 1, border: "1.5px solid #e8e8e8", padding: "8px 10px", fontSize: 12, outline: "none", resize: "none", fontFamily: "Arial, sans-serif", borderRadius: 8 }}
              />
              <button
                disabled={!customerMsgText.trim()}
                onClick={handleSend}
                style={{ width: 40, height: 40, border: "none", background: customerMsgText.trim() ? "#ff6a00" : "#f5f5f5", color: customerMsgText.trim() ? "#fff" : "#ccc", cursor: customerMsgText.trim() ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: 8, transition: "background 0.15s" }}>
                <Send size={15} />
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function OwnProductCard({
  product,
  meta,
  onToggleListed,
}: {
  product: Product;
  meta: ProductMeta;
  onToggleListed: () => void;
}) {
  const stockLabel = product.quantity === 0 ? "Out of Stock" : `In Stock (${product.quantity})`;
  const stockColor = product.quantity === 0 ? "#f5222d" : product.quantity <= 10 ? "#fa8c16" : "#52c41a";
  const coverImg   = meta.images?.[0];

  return (
    <div style={{ background: "#fff", border: meta.listed ? "1px solid #ff6a00" : "1px solid #e8e8e8", overflow: "hidden", display: "flex", flexDirection: "column", transition: "box-shadow 0.15s" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}>

      {/* Image area */}
      <div style={{ position: "relative", aspectRatio: "1", overflow: "hidden", background: "#f7f7f7" }}>
        {coverImg ? (
          <img src={coverImg} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.3s" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLImageElement).style.transform = "scale(1.05)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLImageElement).style.transform = "scale(1)"; }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <Package size={28} style={{ color: "#d9d9d9" }} />
            <span style={{ fontSize: 9, color: "#ccc", fontWeight: 600 }}>No photo</span>
          </div>
        )}
        {meta.listed && (
          <span style={{ position: "absolute", top: 6, left: 6, background: "#ff6a00", color: "#fff", fontSize: 9, fontWeight: 800, padding: "2px 7px", display: "flex", alignItems: "center", gap: 3 }}>
            <Globe size={8} /> Listed
          </span>
        )}
        {meta.images.length > 1 && (
          <span style={{ position: "absolute", bottom: 5, right: 5, background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 9, padding: "2px 5px" }}>
            +{meta.images.length - 1}
          </span>
        )}
        {product.quantity === 0 && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#f5222d", border: "1px solid #ffa39e", padding: "2px 8px", background: "#fff" }}>Out of Stock</span>
          </div>
        )}
      </div>

      {/* Thumbnails row */}
      {meta.images.length > 1 && (
        <div style={{ display: "flex", gap: 3, padding: "5px 8px 0" }}>
          {meta.images.slice(0, 4).map((src, i) => (
            <img key={i} src={src} alt="" style={{ width: 24, height: 24, objectFit: "cover", border: "1px solid #e8e8e8", flexShrink: 0 }} />
          ))}
          {meta.images.length > 4 && (
            <div style={{ width: 24, height: 24, background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#888" }}>
              +{meta.images.length - 4}
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div style={{ padding: "8px 10px 10px", flex: 1, display: "flex", flexDirection: "column" }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: "#222", lineHeight: 1.4, margin: "0 0 2px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
          {product.name}
        </p>
        <p style={{ fontSize: 15, fontWeight: 900, color: "#ff6a00", margin: "4px 0 2px" }}>
          {fmtCurrency(product.selling_price)}
        </p>
        <p style={{ fontSize: 10, color: stockColor, fontWeight: 600, margin: "0 0 6px" }}>{stockLabel}</p>

        {/* Marketplace toggle */}
        <button
          onClick={onToggleListed}
          style={{
            marginTop: "auto", width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "6px 10px", border: meta.listed ? "1px solid #ff6a00" : "1px solid #d9d9d9",
            background: meta.listed ? "#fff5f0" : "#fafafa", cursor: "pointer", fontSize: 10, fontWeight: 700,
            color: meta.listed ? "#ff6a00" : "#888", transition: "all 0.15s",
          }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Globe size={9} />
            {meta.listed ? "On Marketplace" : "Not Listed"}
          </span>
          <div style={{ width: 26, height: 13, borderRadius: 7, background: meta.listed ? "#ff6a00" : "#d9d9d9", position: "relative", transition: "background 0.15s" }}>
            <span style={{ position: "absolute", top: 2, width: 9, height: 9, background: "#fff", borderRadius: "50%", transition: "left 0.15s", left: meta.listed ? 14 : 2 }} />
          </div>
        </button>
      </div>
    </div>
  );
}

