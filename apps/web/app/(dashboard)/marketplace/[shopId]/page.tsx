"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { listShops, type Shop } from "@/lib/shop-api";
import { itemRequest } from "@/lib/product-api";
import { partnerRequest } from "@/lib/supplier-api";
import { purchaseRequest } from "@/lib/purchase-api";
import {
  ArrowLeft, Phone, Mail, MapPin, Wifi, WifiOff,
  Package, ShoppingCart, Plus, Minus, X, Loader2,
  CheckCircle, Star, CalendarDays, ExternalLink,
  Store, UserPlus, Trash2, ShoppingBag, ChevronRight,
  TrendingUp, Info, Globe, Eye, Send, Search,
} from "lucide-react";
import {
  getProductMeta, setProductMeta, upsertCatalogEntry, removeCatalogEntry,
  getCatalog, getMessagesForShop, replyToMessage, markMessageRead, unreadCountForShop,
  decodeShopCatalog, decodeShopHumanInfo,
  type ProductMeta, type MarketplaceEntry, type ShopMessage,
} from "@/lib/product-meta";

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

  // Messages (shopkeeper inbox)
  const [messages, setMessages]   = useState<ShopMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [openMsgId, setOpenMsgId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  // Checkout / order placement
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutNotes, setCheckoutNotes] = useState("");
  const [placingOrder, setPlacingOrder]   = useState(false);
  const [orderSuccess, setOrderSuccess]   = useState(false);

  const isMine = shop?.id === user?.shop_id;

  useEffect(() => {
    listShops({ limit: 200 }).then((res) => {
      const found = res.items?.find((s) => s.id === shopId) ?? null;
      setShop(found);
      if (!found) setNotFound(true);
      setLoading(false);
    }).catch(() => { setNotFound(true); setLoading(false); });
  }, [shopId]);

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
  }, [shop]);

  // Load messages for shopkeeper
  useEffect(() => {
    if (!shop || !isMine) return;
    const msgs = getMessagesForShop(shop.id);
    setMessages(msgs);
    setUnreadCount(unreadCountForShop(shop.id));
  }, [shop, isMine]);

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
    if (cart.length === 0) return;
    setPlacingOrder(true);
    try {
      for (const item of cart) {
        await purchaseRequest("/purchases", {
          method: "POST",
          body: JSON.stringify({
            product_name: item.product.name,
            quantity_added: item.qty,
            cost_price: item.product.selling_price,
            selling_price: item.product.selling_price,
            supplier_id: partnerId ?? undefined,
            notes: checkoutNotes || undefined,
          }),
        });
      }
      setOrderSuccess(true);
      setCart([]);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to place order");
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

  const listedCount = listedProducts.length;

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
                    <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}>
                      {[1,2,3,4].map((i) => <Star key={i} size={10} style={{ color: "#fa8c16", fill: "#fa8c16" }} />)}
                      <Star size={10} style={{ color: "#e8e8e8", fill: "#e8e8e8" }} />
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: pres.online ? "#52c41a" : "#999", display: "flex", alignItems: "center", gap: 3 }}>
                      {pres.online ? <><Wifi size={10} /> Online now</> : <><WifiOff size={10} /> {pres.label}</>}
                    </span>
                    {shop.address && (
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.address)}`} target="_blank" rel="noreferrer"
                        style={{ fontSize: 11, color: "#1677ff", textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}>
                        <MapPin size={10} style={{ color: "#ff6a00" }} /> {shop.address}
                      </a>
                    )}
                    {joinedDate && <span style={{ fontSize: 11, color: "#999", display: "flex", alignItems: "center", gap: 3 }}><CalendarDays size={10} /> Since {joinedDate}</span>}
                  </div>
                  {(() => { const { desc } = decodeShopHumanInfo(shop.description); return desc ? <p style={{ fontSize: 11, color: "#777", margin: "4px 0 0", maxWidth: 500 }}>{desc}</p> : null; })()}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                  {!isMine && (
                    <button
                      onClick={() => !partnerAdded && setShowPartnerModal(true)}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: partnerAdded ? "1px solid #b7eb8f" : "1px solid #d9d9d9", background: partnerAdded ? "#f6ffed" : "#fff", color: partnerAdded ? "#52c41a" : "#555", fontSize: 12, fontWeight: 600, cursor: partnerAdded ? "default" : "pointer" }}>
                      {partnerAdded ? <><CheckCircle size={12} /> Partner Added</> : <><UserPlus size={12} /> Add Partner</>}
                    </button>
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
              { label: "Products Listed", value: listedCount },
              { label: "Status", value: pres.online ? "Online" : "Offline" },
              { label: "Response", value: "Fast" },
            ].map((s, i) => (
              <div key={i} style={{ paddingRight: 20, marginRight: 20, borderRight: i < 2 ? "1px solid #e8e8e8" : "none" }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: i === 1 && pres.online ? "#52c41a" : "#333", margin: 0 }}>{s.value}</p>
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
              {t === "messages" && unreadCount > 0 && (
                <span style={{ position: "absolute", top: 6, right: 4, minWidth: 16, height: 16, borderRadius: 8, background: "#f5222d", color: "#fff", fontSize: 8, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
                  {unreadCount}
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
                          setProdMeta((prev) => ({ ...prev, [product.id]: updated }));
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
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))", gap: 8 }}>
                      {listedProducts.map((entry) => (
                        <div key={entry.productId}
                          style={{ background: "#fff", border: "1px solid #e8e8e8", overflow: "hidden", display: "flex", flexDirection: "column", transition: "box-shadow 0.15s" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}>
                          <div style={{ position: "relative", aspectRatio: "1", overflow: "hidden", background: "#f7f7f7" }}>
                            {entry.images[0]
                              ? <img src={entry.images[0]} alt={entry.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Package size={28} style={{ color: "#d9d9d9" }} /></div>}
                            {entry.quantity === 0 && (
                              <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ fontSize: 9, fontWeight: 700, color: "#f5222d", border: "1px solid #ffa39e", padding: "2px 8px", background: "#fff" }}>Out of Stock</span>
                              </div>
                            )}
                            {entry.images.length > 1 && (
                              <span style={{ position: "absolute", bottom: 5, right: 5, background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 9, padding: "2px 5px" }}>
                                +{entry.images.length - 1}
                              </span>
                            )}
                          </div>
                          <div style={{ padding: "8px 10px 10px" }}>
                            <p style={{ fontSize: 12, fontWeight: 600, color: "#222", lineHeight: 1.4, margin: "0 0 4px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>{entry.name}</p>
                            <p style={{ fontSize: 15, fontWeight: 900, color: "#ff6a00", margin: "0 0 2px" }}>{fmtCurrency(entry.sellingPrice)}</p>
                            <p style={{ fontSize: 10, color: entry.quantity > 0 ? "#52c41a" : "#f5222d", margin: "0 0 8px", fontWeight: 600 }}>
                              {entry.quantity > 0 ? `${entry.quantity} in stock` : "Out of stock"}
                            </p>
                            <button
                              onClick={() => addToCart({ id: entry.productId, name: entry.name, description: entry.description, cost_price: entry.sellingPrice, selling_price: entry.sellingPrice, quantity: entry.quantity })}
                              disabled={entry.quantity === 0}
                              style={{ width: "100%", padding: "7px 0", background: entry.quantity === 0 ? "#f5f5f5" : "#ff6a00", color: entry.quantity === 0 ? "#ccc" : "#fff", border: "none", cursor: entry.quantity === 0 ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                              <ShoppingCart size={11} /> Add to Cart
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Order request form */}
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <ShoppingBag size={14} className="text-[#1372e6]" />
                        Order from {shop.name}
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">Request products and create a purchase order in your system</p>
                    </div>
                    {cartItemCount > 0 && (
                      <button
                        onClick={() => setShowCart(true)}
                        className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white transition hover:opacity-90 shadow"
                        style={{ backgroundColor: "#1372e6" }}
                      >
                        <ShoppingCart size={13} />
                        Basket ({cartItemCount})
                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full text-[8px] font-black text-white flex items-center justify-center">
                          {cartItemCount}
                        </span>
                      </button>
                    )}
                  </div>

                  <OrderRequestForm
                    shopName={shop.name}
                    cart={cart}
                    onAdd={addToCart}
                    onRemove={removeFromCart}
                    onChangeQty={changeQty}
                    onCheckout={() => {
                      if (!partnerAdded) { setShowPartnerModal(true); return; }
                      setShowCheckout(true);
                    }}
                    cartTotal={cartTotal}
                    partnerAdded={partnerAdded}
                  />
                </div>

                {!partnerAdded && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                    <Info size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-amber-800">Add this shop as a partner first</p>
                      <p className="text-xs text-amber-700 mt-0.5">To place orders, add {shop.name} as a supplier partner so purchases are properly linked.</p>
                      <button
                        onClick={() => setShowPartnerModal(true)}
                        className="mt-2 flex items-center gap-1.5 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 px-3 py-1.5 rounded-lg transition"
                      >
                        <UserPlus size={11} /> Add as Supplier Partner
                      </button>
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
                {shop.email && (
                  <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition">
                    <div className="w-9 h-9 rounded-xl bg-[#EBF2FD] flex items-center justify-center flex-shrink-0">
                      <Mail size={15} className="text-[#1372e6]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold">Email</p>
                      <a href={`mailto:${shop.email}`} className="text-sm font-bold text-slate-800 hover:text-[#1372e6] transition truncate block">{shop.email}</a>
                    </div>
                    <a href={`mailto:${shop.email}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition hover:opacity-90 flex-shrink-0" style={{ backgroundColor: "#1372e6" }}>
                      Email
                    </a>
                  </div>
                )}
                {shop.address && (
                  <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition">
                    <div className="w-9 h-9 rounded-xl bg-[#EBF2FD] flex items-center justify-center flex-shrink-0">
                      <MapPin size={15} className="text-[#1372e6]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold">Address</p>
                      <p className="text-sm font-bold text-slate-800 break-words">{shop.address}</p>
                    </div>
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.address)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-[#1372e6] bg-[#EBF2FD] hover:bg-[#D5E8FB] transition flex-shrink-0">
                      <ExternalLink size={10} /> Map
                    </a>
                  </div>
                )}
                {!shop.phone && !shop.email && !shop.address && (
                  <p className="text-sm text-slate-400 italic text-center py-4">No contact details available.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── MESSAGES TAB — Alibaba chat style ───────────────────────────── */}
        {tab === "messages" && isMine && (
          <div style={{ display: "flex", gap: 10, height: "calc(100vh - 260px)", minHeight: 480 }}>

            {/* Conversation list */}
            <div style={{ width: 280, flexShrink: 0, background: "#fff", border: "1px solid #e8e8e8", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#333" }}>
                  Messages {unreadCount > 0 && <span style={{ background: "#f5222d", color: "#fff", fontSize: 9, padding: "1px 5px", fontWeight: 900 }}>{unreadCount}</span>}
                </span>
                <button onClick={() => { setMessages(getMessagesForShop(shop.id)); setUnreadCount(unreadCountForShop(shop.id)); }}
                  style={{ border: "none", background: "none", cursor: "pointer", fontSize: 10, color: "#1677ff" }}>
                  Refresh
                </button>
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {messages.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center" }}>
                    <Package size={28} style={{ color: "#e0e0e0", margin: "0 auto 8px" }} />
                    <p style={{ fontSize: 11, color: "#aaa", lineHeight: 1.5 }}>No messages yet. When customers contact you, conversations appear here.</p>
                  </div>
                ) : messages.map((msg) => (
                  <button key={msg.id}
                    onClick={() => {
                      setOpenMsgId(msg.id);
                      if (!msg.readByShop) {
                        markMessageRead(msg.id);
                        setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, readByShop: true } : m));
                        setUnreadCount((n) => Math.max(0, n - 1));
                      }
                    }}
                    style={{ width: "100%", display: "flex", gap: 10, padding: "10px 12px", border: "none", background: openMsgId === msg.id ? "#fff5f0" : "transparent", borderLeft: openMsgId === msg.id ? "3px solid #ff6a00" : "3px solid transparent", borderBottom: "1px solid #f8f8f8", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#ff6a00", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 900, flexShrink: 0 }}>
                      {msg.buyerName[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "#333", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg.buyerName}</p>
                        <p style={{ fontSize: 9, color: "#bbb", margin: 0, flexShrink: 0 }}>{new Date(msg.timestamp).toLocaleDateString([], { month: "short", day: "numeric" })}</p>
                      </div>
                      <p style={{ fontSize: 10, color: "#999", margin: "1px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        Re: <strong style={{ color: "#555" }}>{msg.productName}</strong>
                      </p>
                      <p style={{ fontSize: 10, color: "#aaa", margin: "1px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg.text}</p>
                    </div>
                    {!msg.readByShop && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff6a00", flexShrink: 0, marginTop: 4 }} />}
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
                  {/* Chat header */}
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 10, background: "#fafafa" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#ff6a00", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 900, flexShrink: 0 }}>
                      {msg.buyerName[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#333", margin: 0 }}>{msg.buyerName}</p>
                      <p style={{ fontSize: 10, color: "#999", margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
                        <Package size={9} style={{ color: "#ff6a00" }} /> About: <strong style={{ color: "#555" }}>{msg.productName}</strong>
                      </p>
                    </div>
                  </div>

                  {/* Messages */}
                  <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 10, background: "#f9f9f9" }}>
                    {/* Customer's original message */}
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#e8e8e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#555", flexShrink: 0 }}>
                        {msg.buyerName[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p style={{ fontSize: 9, color: "#bbb", margin: "0 0 3px" }}>{msg.buyerName}</p>
                        <div style={{ background: "#fff", border: "1px solid #e8e8e8", padding: "8px 12px", fontSize: 12, color: "#333", lineHeight: 1.6, maxWidth: 360, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
                          {msg.text}
                        </div>
                        <p style={{ fontSize: 9, color: "#bbb", margin: "3px 0 0" }}>{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    </div>

                    {/* Replies */}
                    {msg.replies.map((r) => (
                      <div key={r.id} style={{ display: "flex", justifyContent: r.fromShop ? "flex-end" : "flex-start", gap: 8, alignItems: "flex-end" }}>
                        {!r.fromShop && (
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#e8e8e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#555", flexShrink: 0 }}>
                            {msg.buyerName[0]?.toUpperCase()}
                          </div>
                        )}
                        <div>
                          {!r.fromShop && <p style={{ fontSize: 9, color: "#bbb", margin: "0 0 3px" }}>{msg.buyerName}</p>}
                          <div style={{
                            padding: "8px 12px", fontSize: 12, lineHeight: 1.6, maxWidth: 360,
                            background: r.fromShop ? "#ff6a00" : "#fff",
                            color: r.fromShop ? "#fff" : "#333",
                            border: r.fromShop ? "none" : "1px solid #e8e8e8",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                          }}>
                            {r.text}
                          </div>
                          <p style={{ fontSize: 9, color: "#bbb", margin: "3px 0 0", textAlign: r.fromShop ? "right" : "left" }}>
                            {new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        {r.fromShop && (
                          <div style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", background: "#ff6a00", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {shop.logo_url ? <img src={shop.logo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 11, fontWeight: 900, color: "#fff" }}>{initial}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Reply input */}
                  <div style={{ borderTop: "1px solid #e8e8e8", padding: "10px 12px", background: "#fff", display: "flex", gap: 8, alignItems: "flex-end" }}>
                    <input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && replyText.trim()) {
                          replyToMessage(msg.id, replyText.trim(), true);
                          setReplyText("");
                          setMessages(getMessagesForShop(shop.id));
                        }
                      }}
                      placeholder={`Reply to ${msg.buyerName}...`}
                      style={{ flex: 1, border: "1px solid #e8e8e8", padding: "8px 12px", fontSize: 12, outline: "none", resize: "none", fontFamily: "Arial, sans-serif" }}
                    />
                    <button
                      onClick={() => {
                        if (!replyText.trim()) return;
                        replyToMessage(msg.id, replyText.trim(), true);
                        setReplyText("");
                        setMessages(getMessagesForShop(shop.id));
                      }}
                      disabled={!replyText.trim()}
                      style={{ padding: "8px 16px", background: replyText.trim() ? "#ff6a00" : "#f5f5f5", color: replyText.trim() ? "#fff" : "#ccc", border: "none", cursor: replyText.trim() ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                      <Send size={13} /> Send
                    </button>
                  </div>
                </div>
              );
            })() : (
              <div style={{ flex: 1, background: "#fff", border: "1px solid #e8e8e8", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Package size={40} style={{ color: "#e0e0e0" }} />
                <p style={{ fontSize: 13, color: "#bbb" }}>Select a conversation to start chatting</p>
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
      {showCheckout && !orderSuccess && (
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
                <span>These items will be added as purchase records in your system. Contact {shop.name} separately to arrange delivery and payment.</span>
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
                {placingOrder ? <><Loader2 size={13} className="animate-spin" /> Placing...</> : <><CheckCircle size={13} /> Place Order</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ORDER SUCCESS ────────────────────────────────────────────────────── */}
      {orderSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={28} className="text-green-600" />
            </div>
            <h2 className="font-black text-slate-900 text-lg mb-1">Order Placed!</h2>
            <p className="text-slate-500 text-xs mb-1">Your purchase records have been created.</p>
            <p className="text-slate-400 text-xs mb-5">Contact <span className="font-semibold">{shop.name}</span> to arrange delivery and payment.</p>
            <div className="flex gap-2.5">
              <button onClick={() => setOrderSuccess(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
                Stay Here
              </button>
              <Link href="/purchases" className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1.5 transition hover:opacity-90" style={{ backgroundColor: "#1372e6" }}>
                <TrendingUp size={13} /> View Purchases
              </Link>
            </div>
          </div>
        </div>
      )}
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

interface OrderRequestFormProps {
  shopName: string;
  cart: CartItem[];
  onAdd: (product: Product) => void;
  onRemove: (id: string) => void;
  onChangeQty: (id: string, delta: number) => void;
  onCheckout: () => void;
  cartTotal: number;
  partnerAdded: boolean;
}

function OrderRequestForm({ shopName, cart, onAdd, onChangeQty, onCheckout, cartTotal, partnerAdded }: OrderRequestFormProps) {
  const [items, setItems] = useState<{ name: string; qty: string; price: string }[]>([
    { name: "", qty: "1", price: "" },
  ]);

  function addLine() { setItems((prev) => [...prev, { name: "", qty: "1", price: "" }]); }
  function removeLine(i: number) { setItems((prev) => prev.filter((_, idx) => idx !== i)); }
  function update(i: number, field: "name" | "qty" | "price", val: string) {
    setItems((prev) => prev.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  }

  function addToBasket(i: number) {
    const row = items[i];
    if (!row.name.trim() || !row.price) return;
    const syntheticProduct: Product = {
      id: `req-${Date.now()}-${i}`,
      name: row.name.trim(),
      cost_price: Number(row.price),
      selling_price: Number(row.price),
      quantity: Number(row.qty) || 1,
    };
    onAdd(syntheticProduct);
    setItems((prev) => prev.map((r, idx) => idx === i ? { name: "", qty: "1", price: "" } : r));
  }

  const cartItemCount = cart.reduce((s, c) => s + c.qty, 0);

  return (
    <div className="p-4 space-y-4">
      {/* Request form */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-700">Add items to request from {shopName}:</p>
        {items.map((row, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              type="text"
              value={row.name}
              onChange={(e) => update(i, "name", e.target.value)}
              placeholder="Product name"
              className="flex-1 border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition"
            />
            <input
              type="number"
              value={row.qty}
              onChange={(e) => update(i, "qty", e.target.value)}
              min="1"
              className="w-14 border border-slate-200 rounded-lg px-2 py-2 text-xs text-slate-800 text-center focus:outline-none focus:ring-2 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition"
              placeholder="Qty"
            />
            <input
              type="number"
              value={row.price}
              onChange={(e) => update(i, "price", e.target.value)}
              min="0"
              className="w-20 border border-slate-200 rounded-lg px-2 py-2 text-xs text-slate-800 text-center focus:outline-none focus:ring-2 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition"
              placeholder="Price"
            />
            <button
              onClick={() => addToBasket(i)}
              disabled={!row.name.trim() || !row.price}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0 disabled:opacity-40 transition"
              style={{ backgroundColor: "#1372e6" }}
              title="Add to basket"
            >
              <Plus size={13} />
            </button>
            {items.length > 1 && (
              <button onClick={() => removeLine(i)} className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-slate-300 hover:text-red-500 flex-shrink-0 transition">
                <X size={13} />
              </button>
            )}
          </div>
        ))}
        <button onClick={addLine} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#1372e6] hover:underline">
          <Plus size={11} /> Add another item
        </button>
      </div>

      {/* Basket preview */}
      {cart.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 flex items-center justify-between">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Basket ({cartItemCount} items)</p>
            <p className="text-[10px] font-black text-slate-800">{fmtCurrency(cartTotal)}</p>
          </div>
          <div className="divide-y divide-slate-50">
            {cart.map((item) => (
              <div key={item.product.id} className="flex items-center gap-2 px-3 py-2">
                <p className="flex-1 text-xs font-semibold text-slate-700 truncate">{item.product.name}</p>
                <div className="flex items-center gap-1">
                  <button onClick={() => onChangeQty(item.product.id, -1)} className="w-5 h-5 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition">
                    <Minus size={8} />
                  </button>
                  <span className="text-xs font-bold w-5 text-center">{item.qty}</span>
                  <button onClick={() => onChangeQty(item.product.id, 1)} className="w-5 h-5 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition">
                    <Plus size={8} />
                  </button>
                </div>
                <p className="text-xs font-bold text-slate-700 w-16 text-right">{fmtCurrency(item.product.selling_price * item.qty)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {cart.length > 0 && (
        <button
          onClick={onCheckout}
          className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition hover:opacity-90 shadow"
          style={{ backgroundColor: "#1372e6" }}
        >
          <ShoppingCart size={14} />
          {partnerAdded ? `Place Order · ${fmtCurrency(cartTotal)}` : "Add as Partner to Order"}
        </button>
      )}
    </div>
  );
}
