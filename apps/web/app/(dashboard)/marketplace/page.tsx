"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { listShops, type Shop } from "@/lib/shop-api";
import { getCatalog, type MarketplaceEntry } from "@/lib/product-meta";
import { partnerRequest } from "@/lib/supplier-api";
import { purchaseRequest } from "@/lib/purchase-api";
import {
  Search, X, ShoppingCart, Plus, Minus, Loader2,
  CheckCircle, Phone, Package, ChevronRight, Star,
  MapPin, MessageSquare, Send, Clock, Store, Mail,
} from "lucide-react";
import {
  sendMessage, getMyMessages, replyToMessage,
  type ShopMessage,
} from "@/lib/product-meta";

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
  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [detailEntry, setDetailEntry] = useState<MarketplaceEntry | null>(null);
  const [detailImg, setDetailImg]     = useState(0);
  const [orderModal, setOrderModal]   = useState<OrderModal | null>(null);
  const [ordering, setOrdering]       = useState(false);
  const [orderDone, setOrderDone]     = useState(false);
  const [orderError, setOrderError]   = useState("");

  // messaging
  const [msgEntry, setMsgEntry]       = useState<MarketplaceEntry | null>(null);
  const [msgText, setMsgText]         = useState("");
  const [msgSent, setMsgSent]         = useState(false);
  const [myMessages, setMyMessages]   = useState<ShopMessage[]>([]);

  // ── data load ────────────────────────────────────────────────────────────
  useEffect(() => {
    listShops({ limit: 200 }).then((r) => setShops(r.items ?? [])).catch(() => {});
    setCatalog(getCatalog().filter((e) => e.images.length >= 3));
    setLoading(false);
    if (user?.shop_id) setMyMessages(getMyMessages(user.shop_id));
    const tick = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(tick);
  }, []);

  // ── debounced search ─────────────────────────────────────────────────────
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (rawSearch !== search) setSearching(true);
    searchTimerRef.current = setTimeout(() => {
      setSearch(rawSearch);
      setSearching(false);
      setPage(1);
    }, 350);
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

  // ── filtered full list ───────────────────────────────────────────────────
  const allFiltered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return catalog.filter((e) => {
      if (cat !== "all" && catOf(e.name, e.description) !== cat) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.shopName.toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [catalog, search, cat]);

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
      let supplierId: string | undefined;
      try {
        const pRes = await partnerRequest("/suppliers");
        const list: { id: string; name: string }[] = Array.isArray(pRes?.data) ? pRes.data : [];
        const ex = list.find((p) => p.name.toLowerCase().trim() === orderModal.entry.shopName.toLowerCase().trim());
        if (ex) { supplierId = ex.id; }
        else {
          const np = await partnerRequest("/suppliers", {
            method: "POST",
            body: JSON.stringify({ name: orderModal.entry.shopName, phone: orderModal.entry.shopPhone ?? "", email: "", address: "" }),
          });
          supplierId = np?.data?.id;
        }
      } catch { /* proceed without */ }
      await purchaseRequest("/purchases", {
        method: "POST",
        body: JSON.stringify({
          product_name: orderModal.entry.name,
          quantity_added: orderModal.qty,
          cost_price: orderModal.entry.sellingPrice,
          selling_price: orderModal.entry.sellingPrice,
          supplier_id: supplierId ?? undefined,
        }),
      });
      setOrderDone(true);
    } catch (err: unknown) {
      setOrderError(err instanceof Error ? err.message : "Failed to place order");
    } finally { setOrdering(false); }
  }

  const openOrder = useCallback((entry: MarketplaceEntry, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOrderModal({ entry, shop: shopMap[entry.shopId], qty: 1 });
    setOrderDone(false); setOrderError("");
  }, [shopMap]);

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#f4f4f4", minHeight: "100vh", fontFamily: "Arial, sans-serif" }}>

      {/* ── SEARCH BAR ───────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e5e5", position: "sticky", top: 0, zIndex: 40, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>

          {/* Search input */}
          <div style={{ flex: 1, display: "flex", border: "2px solid #ff6a00", overflow: "hidden" }}>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="mp-cat-select"
              style={{ border: "none", borderRight: "1px solid #ddd", background: "#f5f5f5", padding: "0 10px", fontSize: 11, color: "#555", cursor: "pointer", outline: "none", flexShrink: 0 }}
            >
              {ALL_CATS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
              <Search size={13} style={{ position: "absolute", left: 10, color: searching ? "#ff6a00" : "#bbb", transition: "color 0.2s", flexShrink: 0 }} />
              <input
                type="text"
                value={rawSearch}
                onChange={(e) => setRawSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setRawSearch("")}
                placeholder="Search products, suppliers, categories..."
                style={{ width: "100%", border: "none", padding: "9px 32px 9px 32px", fontSize: 13, outline: "none", background: "#fff" }}
              />
              {rawSearch && (
                <button
                  onClick={() => { setRawSearch(""); }}
                  style={{ position: "absolute", right: 8, border: "none", background: "none", cursor: "pointer", color: "#aaa", padding: 2, display: "flex" }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <button style={{ background: "#ff6a00", color: "#fff", border: "none", padding: "0 22px", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0, letterSpacing: 0.3 }}>
              Search
            </button>
          </div>

          {/* Stats */}
          <div className="mp-stats" style={{ flexShrink: 0, textAlign: "right" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#333" }}>{catalog.length} Products</div>
            <div style={{ fontSize: 10, color: "#999" }}>{shops.length} shops</div>
          </div>
        </div>

        {/* Category nav strip */}
        <div style={{ borderTop: "1px solid #f0f0f0" }}>
          <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 16px", display: "flex", overflowX: "auto" }} className="mp-subnav">
            {ALL_CATS.map((c) => (
              <button
                key={c.key}
                onClick={() => setCat(c.key)}
                style={{
                  border: "none", background: "transparent", padding: "7px 14px",
                  fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                  color: cat === c.key ? "#ff6a00" : "#555",
                  fontWeight: cat === c.key ? 700 : 400,
                  borderBottom: cat === c.key ? "2px solid #ff6a00" : "2px solid transparent",
                  transition: "color 0.15s",
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── BODY ─────────────────────────────────────────────────────────── */}
      <div className="mp-body" style={{ maxWidth: 1400, margin: "0 auto", padding: "10px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>

        {/* ── SIDEBAR ────────────────────────────────────────────────────── */}
        <aside className="mp-sidebar" style={{ width: 168, flexShrink: 0 }}>
          <div style={{ background: "#fff", border: "1px solid #e8e8e8", marginBottom: 8 }}>
            <div style={{ padding: "10px 12px 6px", borderBottom: "1px solid #f0f0f0" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#333" }}>Product Category</span>
            </div>
            {ALL_CATS.map((c) => (
              <button
                key={c.key}
                onClick={() => setCat(c.key)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", border: "none",
                  background: cat === c.key ? "#fff5f0" : "transparent",
                  padding: "7px 12px", fontSize: 12, cursor: "pointer", textAlign: "left",
                  color: cat === c.key ? "#ff6a00" : "#555",
                  fontWeight: cat === c.key ? 700 : 400,
                  borderLeft: cat === c.key ? "3px solid #ff6a00" : "3px solid transparent",
                  transition: "background 0.15s",
                }}
              >
                <span>{c.label}</span>
                {cat === c.key && <ChevronRight size={11} style={{ color: "#ff6a00" }} />}
              </button>
            ))}
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
                const initial = (s.name || "?")[0].toUpperCase();
                const online  = isOnline(s.last_seen_at, now);
                const listed  = listedPerShop[s.id] ?? 0;
                return (
                  <Link key={s.id} href={`/marketplace/${s.id}`}
                    style={{ background: "#fff", border: "1px solid #e8e8e8", textDecoration: "none", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
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
                      <p style={{ fontSize: 10, color: "#ff6a00", margin: "2px 0 0", fontWeight: 600 }}>View Store →</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Result bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "#666", display: "flex", alignItems: "center", gap: 6 }}>
              {searching ? (
                <><Loader2 size={11} style={{ color: "#ff6a00", animation: "spin 0.8s linear infinite" }} /> Searching...</>
              ) : (
                <><strong style={{ color: "#333" }}>{allFiltered.length}</strong>
                  {search ? <> results for &ldquo;{search}&rdquo;</> : " products available"}
                  {allFiltered.length !== visible.length && <span style={{ color: "#999" }}> · showing {visible.length}</span>}
                </>
              )}
            </span>
            <Link href="/items" style={{ fontSize: 11, color: "#1677ff", textDecoration: "none" }}>
              + List your products
            </Link>
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
                  const online  = isOnline(s.last_seen_at, now);
                  const isMine  = s.id === user?.shop_id;
                  const initial = (s.name || "?")[0].toUpperCase();
                  const listed  = listedPerShop[s.id] ?? 0;
                  return (
                    <Link key={s.id} href={`/marketplace/${s.id}`}
                      style={{ background: "#fff", border: `1px solid ${isMine ? "#ffbb96" : "#e8e8e8"}`, textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 12px", gap: 6 }}>
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
                      <span style={{ fontSize: 11, color: "#1677ff" }}>View Store</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </main>
      </div>

      {/* ── DETAIL MODAL ──────────────────────────────────────────────────── */}
      {detailEntry && (() => {
        const dShop = shopMap[detailEntry.shopId];
        const dOnline = dShop ? isOnline(dShop.last_seen_at, now) : false;
        const isMine = detailEntry.shopId === user?.shop_id;
        const listedCount = listedPerShop[detailEntry.shopId] ?? 0;
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "#fff", width: "100%", maxWidth: 580, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, paddingRight: 12 }}>{detailEntry.name}</span>
                <button onClick={() => setDetailEntry(null)} style={{ border: "none", background: "#f5f5f5", cursor: "pointer", padding: "4px 10px", fontSize: 14, color: "#666" }}>✕</button>
              </div>

              <div style={{ overflowY: "auto", flex: 1 }}>
                {/* Main image */}
                <div style={{ height: 260, background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  {detailEntry.images[detailImg]
                    ? <img src={detailEntry.images[detailImg]} alt={detailEntry.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    : <Package size={56} style={{ color: "#ddd" }} />}
                  {detailEntry.quantity === 0 && (
                    <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#f5222d", border: "1px solid #f5222d", padding: "4px 12px", background: "#fff" }}>Out of Stock</span>
                    </div>
                  )}
                </div>

                {/* Thumbnails */}
                {detailEntry.images.length > 1 && (
                  <div style={{ display: "flex", gap: 6, padding: "8px 16px", borderBottom: "1px solid #f0f0f0", overflowX: "auto" }}>
                    {detailEntry.images.map((src, i) => (
                      <button key={i} onClick={() => setDetailImg(i)}
                        style={{ flexShrink: 0, width: 48, height: 48, border: i === detailImg ? "2px solid #ff6a00" : "1px solid #e8e8e8", background: "none", cursor: "pointer", padding: 0, overflow: "hidden" }}>
                        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Price */}
                  <div>
                    <p style={{ fontSize: 24, fontWeight: 700, color: "#ff6a00", margin: "0 0 2px" }}>{fmtPrice(detailEntry.sellingPrice)}</p>
                    <p style={{ fontSize: 11, color: "#999", margin: 0 }}>Price per unit · Min. order: 1 piece</p>
                  </div>

                  {/* Description */}
                  {detailEntry.description && (
                    <p style={{ fontSize: 12, color: "#555", margin: 0, lineHeight: 1.7, background: "#fafafa", padding: "8px 10px", border: "1px solid #f0f0f0" }}>
                      {detailEntry.description}
                    </p>
                  )}

                  {/* Stats grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    <div style={{ padding: "8px 10px", background: "#f9f9f9", border: "1px solid #f0f0f0", textAlign: "center" }}>
                      <p style={{ fontSize: 9, color: "#999", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: 0.5 }}>Stock</p>
                      <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: detailEntry.quantity === 0 ? "#f5222d" : detailEntry.quantity <= 10 ? "#fa8c16" : "#52c41a" }}>
                        {detailEntry.quantity === 0 ? "None" : detailEntry.quantity}
                      </p>
                      {detailEntry.quantity > 0 && <p style={{ fontSize: 9, color: "#aaa", margin: 0 }}>units</p>}
                    </div>
                    <div style={{ padding: "8px 10px", background: "#f9f9f9", border: "1px solid #f0f0f0", textAlign: "center" }}>
                      <p style={{ fontSize: 9, color: "#999", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: 0.5 }}>Products</p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#333", margin: 0 }}>{listedCount}</p>
                      <p style={{ fontSize: 9, color: "#aaa", margin: 0 }}>listed</p>
                    </div>
                    <div style={{ padding: "8px 10px", background: "#f9f9f9", border: "1px solid #f0f0f0", textAlign: "center" }}>
                      <p style={{ fontSize: 9, color: "#999", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: 0.5 }}>Status</p>
                      <p style={{ fontSize: 11, fontWeight: 700, margin: 0, color: dOnline ? "#52c41a" : "#aaa" }}>{dOnline ? "● Online" : "○ Offline"}</p>
                    </div>
                  </div>

                  {/* Seller card */}
                  <div style={{ border: "1px solid #e8e8e8", padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", overflow: "hidden", background: "#ff6a00", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {dShop?.logo_url
                        ? <img src={dShop.logo_url} alt={detailEntry.shopName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <span style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>{detailEntry.shopName[0]?.toUpperCase()}</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "#333", margin: 0 }}>{detailEntry.shopName}</p>
                        {isMine && <span style={{ fontSize: 9, background: "#fff5f0", color: "#ff6a00", padding: "1px 6px", fontWeight: 700 }}>Your Shop</span>}
                        <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9 }}>
                          <Star size={9} style={{ color: "#fa8c16", fill: "#fa8c16" }} />
                          <Star size={9} style={{ color: "#fa8c16", fill: "#fa8c16" }} />
                          <Star size={9} style={{ color: "#fa8c16", fill: "#fa8c16" }} />
                          <Star size={9} style={{ color: "#fa8c16", fill: "#fa8c16" }} />
                          <Star size={9} style={{ color: "#e8e8e8", fill: "#e8e8e8" }} />
                          <span style={{ fontSize: 9, color: "#999", marginLeft: 2 }}>Verified Supplier</span>
                        </span>
                      </div>
                      {/* Location */}
                      {dShop?.address && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dShop.address)}`}
                          target="_blank" rel="noreferrer"
                          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#1677ff", textDecoration: "none", marginTop: 4 }}
                        >
                          <MapPin size={11} style={{ color: "#ff6a00", flexShrink: 0 }} />
                          {dShop.address}
                        </a>
                      )}
                      {/* Phone */}
                      {detailEntry.shopPhone && (
                        <a href={`tel:${detailEntry.shopPhone}`} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#333", textDecoration: "none", marginTop: 3 }}>
                          <Phone size={10} style={{ color: "#52c41a", flexShrink: 0 }} />
                          {detailEntry.shopPhone}
                        </a>
                      )}
                      {/* Email */}
                      {dShop?.email && (
                        <a href={`mailto:${dShop.email}`} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#333", textDecoration: "none", marginTop: 3 }}>
                          <Mail size={10} style={{ color: "#1677ff", flexShrink: 0 }} />
                          {dShop.email}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Thread: existing replies for this product from me */}
                  {(() => {
                    const thread = myMessages.filter((m) => m.productId === detailEntry.productId);
                    if (thread.length === 0) return null;
                    return (
                      <div style={{ border: "1px solid #e8e8e8", background: "#fafafa" }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: "#999", padding: "6px 10px", margin: 0, borderBottom: "1px solid #f0f0f0", textTransform: "uppercase", letterSpacing: 0.5 }}>Your Conversation</p>
                        <div style={{ maxHeight: 180, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                          {thread.map((m) => (
                            <div key={m.id}>
                              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                <div style={{ background: "#ff6a00", color: "#fff", padding: "5px 10px", fontSize: 11, maxWidth: "80%", lineHeight: 1.5 }}>
                                  {m.text}
                                  <p style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", margin: "2px 0 0", textAlign: "right" }}>
                                    {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  </p>
                                </div>
                              </div>
                              {m.replies.map((r) => (
                                <div key={r.id} style={{ display: "flex", justifyContent: r.fromShop ? "flex-start" : "flex-end", marginTop: 4 }}>
                                  <div style={{ background: r.fromShop ? "#fff" : "#ff6a00", color: r.fromShop ? "#333" : "#fff", border: r.fromShop ? "1px solid #e8e8e8" : "none", padding: "5px 10px", fontSize: 11, maxWidth: "80%", lineHeight: 1.5 }}>
                                    {r.fromShop && <p style={{ fontSize: 9, color: "#999", margin: "0 0 2px", fontWeight: 700 }}>{detailEntry.shopName}</p>}
                                    {r.text}
                                  </div>
                                </div>
                              ))}
                              {/* Reply to conversation */}
                              {m.replies.length > 0 && (
                                <ReplyBox messageId={m.id} fromShop={false} onSent={() => {
                                  if (user?.shop_id) setMyMessages(getMyMessages(user.shop_id));
                                }} />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Footer actions */}
              <div style={{ borderTop: "1px solid #f0f0f0", padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <Link href={`/marketplace/${detailEntry.shopId}`} onClick={() => setDetailEntry(null)}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "9px", border: "1px solid #d9d9d9", color: "#555", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                    <Store size={13} /> View Store
                  </Link>
                  {!isMine && (
                    <button
                      onClick={() => { setMsgEntry(detailEntry); setMsgText(""); setMsgSent(false); }}
                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "9px", border: "1px solid #1677ff", background: "#fff", color: "#1677ff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      <MessageSquare size={13} /> Text Seller
                    </button>
                  )}
                  <button
                    onClick={() => { setDetailEntry(null); openOrder(detailEntry); }}
                    disabled={detailEntry.quantity === 0}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "9px", border: "none", background: "#ff6a00", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: detailEntry.quantity === 0 ? 0.4 : 1 }}>
                    <ShoppingCart size={13} /> Start Order
                  </button>
                </div>
                {detailEntry.shopPhone && (
                  <a href={`tel:${detailEntry.shopPhone}`}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px", background: "#f6ffed", border: "1px solid #b7eb8f", color: "#52c41a", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                    <Phone size={13} /> Call {detailEntry.shopName} directly
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── ORDER MODAL ──────────────────────────────────────────────────── */}
      {orderModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", width: "100%", maxWidth: 400 }}>
            {orderDone ? (
              <div style={{ padding: 40, textAlign: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#f6ffed", border: "1px solid #b7eb8f", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <CheckCircle size={28} style={{ color: "#52c41a" }} />
                </div>
                <p style={{ fontSize: 16, fontWeight: 700, color: "#333", margin: "0 0 6px" }}>Order Placed!</p>
                <p style={{ fontSize: 12, color: "#999", margin: "0 0 6px" }}>Purchase record created in your system.</p>
                <p style={{ fontSize: 12, color: "#555", margin: "0 0 20px" }}>Contact <strong>{orderModal.entry.shopName}</strong> to arrange delivery &amp; payment.</p>
                {orderModal.entry.shopPhone && (
                  <a href={`tel:${orderModal.entry.shopPhone}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", background: "#f6ffed", border: "1px solid #b7eb8f", color: "#52c41a", textDecoration: "none", fontSize: 12, fontWeight: 700, marginBottom: 16 }}>
                    <Phone size={12} /> Call {orderModal.entry.shopName}
                  </a>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setOrderModal(null)} style={{ flex: 1, padding: "8px", border: "1px solid #d9d9d9", background: "#fff", cursor: "pointer", fontSize: 12, color: "#555" }}>
                    Continue Shopping
                  </button>
                  <Link href="/purchases" onClick={() => setOrderModal(null)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "8px", background: "#ff6a00", color: "#fff", textDecoration: "none", fontSize: 12, fontWeight: 700 }}>
                    View Purchases
                  </Link>
                </div>
              </div>
            ) : (
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
                  <p style={{ fontSize: 10, color: "#aaa", margin: 0, lineHeight: 1.5 }}>A purchase record will be created in your system. Contact the supplier to arrange delivery and payment.</p>
                </div>
                <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #f0f0f0" }}>
                  <button onClick={() => setOrderModal(null)} style={{ flex: 1, padding: "8px", border: "1px solid #d9d9d9", background: "#fff", cursor: "pointer", fontSize: 12, color: "#555" }}>Cancel</button>
                  <button onClick={placeOrder} disabled={ordering || orderModal.entry.quantity === 0}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px", border: "none", background: "#ff6a00", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: orderModal.entry.quantity === 0 ? 0.4 : 1 }}>
                    {ordering ? <><Loader2 size={12} className="animate-spin" /> Placing...</> : <><CheckCircle size={12} /> Confirm Order</>}
                  </button>
                </div>
              </>
            )}
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
                      buyerShopId: user.shop_id,
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
                    buyerShopId: user.shop_id,
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
  const [hovered, setHovered] = useState(false);
  const cover = entry.images[0];

  return (
    <div
      onClick={onDetail}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ background: "#fff", border: "1px solid #e8e8e8", cursor: "pointer", display: "flex", flexDirection: "column", position: "relative" }}
    >
      {/* Image */}
      <div style={{ aspectRatio: "1", overflow: "hidden", background: "#f5f5f5", position: "relative" }}>
        {cover
          ? <img src={cover} alt={entry.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : (
            <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Package size={32} style={{ color: "#ddd" }} />
              <span style={{ fontSize: 9, color: "#ccc" }}>No image</span>
            </div>
          )}
        {entry.images.length > 1 && (
          <span style={{ position: "absolute", bottom: 4, right: 4, fontSize: 9, background: "rgba(0,0,0,0.38)", color: "#fff", padding: "1px 5px" }}>
            +{entry.images.length - 1}
          </span>
        )}
        {entry.quantity === 0 && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.72)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#f5222d", border: "1px solid #f5222d", padding: "2px 8px", background: "#fff" }}>Out of Stock</span>
          </div>
        )}
        {isMine && (
          <span style={{ position: "absolute", top: 4, left: 4, fontSize: 8, background: "#ff6a00", color: "#fff", padding: "1px 5px", fontWeight: 700 }}>YOURS</span>
        )}
        {/* Verified badge */}
        <div style={{ position: "absolute", top: 4, right: 4, display: "flex", alignItems: "center", gap: 2, background: "rgba(255,255,255,0.92)", padding: "1px 4px", border: "1px solid #ffe7ba" }}>
          <Star size={7} style={{ color: "#fa8c16", fill: "#fa8c16" }} />
          <span style={{ fontSize: 7, color: "#fa8c16", fontWeight: 700 }}>Verified</span>
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: "8px 10px 0", flex: 1, display: "flex", flexDirection: "column" }}>
        <p style={{ fontSize: 12, color: "#333", margin: "0 0 5px", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
          {highlight(entry.name, searchQ)}
        </p>
        <p style={{ fontSize: 15, fontWeight: 700, color: "#ff6a00", margin: "0 0 2px", lineHeight: 1 }}>
          {fmtPrice(entry.sellingPrice)}
        </p>
        <p style={{ fontSize: 10, color: "#999", margin: "0 0 6px" }}>
          Min. order: 1 piece &nbsp;·&nbsp; {entry.quantity > 0 ? `${entry.quantity} in stock` : "Out of stock"}
        </p>

        {/* Supplier row */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, paddingTop: 6, borderTop: "1px solid #f5f5f5" }}>
          <div style={{ width: 14, height: 14, borderRadius: "50%", overflow: "hidden", background: "#ff6a00", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {shop?.logo_url
              ? <img src={shop.logo_url} alt={entry.shopName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span style={{ fontSize: 7, fontWeight: 900, color: "#fff" }}>{entry.shopName[0]?.toUpperCase()}</span>}
          </div>
          <p style={{ fontSize: 10, color: "#777", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {highlight(entry.shopName, searchQ)}
          </p>
          {online && <span style={{ fontSize: 8, color: "#52c41a", flexShrink: 0 }}>● Live</span>}
        </div>

        {/* Order button — always rendered, opacity controls visibility to prevent layout shift */}
        <button
          onClick={onOrder}
          disabled={entry.quantity === 0}
          style={{
            marginTop: 8, marginBottom: 8, padding: "6px",
            background: entry.quantity === 0 ? "#f5f5f5" : "#ff6a00",
            color: entry.quantity === 0 ? "#ccc" : "#fff",
            border: "none",
            cursor: entry.quantity === 0 ? "not-allowed" : "pointer",
            fontSize: 11, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4, width: "100%",
            opacity: hovered ? 1 : 0,
            // height preserved so card doesn't shift
            pointerEvents: hovered ? "auto" : "none",
          }}
        >
          <ShoppingCart size={11} /> Start Order
        </button>
      </div>
    </div>
  );
}
