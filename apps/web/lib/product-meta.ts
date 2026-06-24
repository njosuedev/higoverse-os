export interface ProductMeta {
  images: string[];
  listed: boolean;
  category?: string;
}

// ── per-product metadata (images + listed flag) ────────────────────────────
const STORE_KEY = "hgv_product_meta_v1";

function readStore(): Record<string, ProductMeta> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}"); }
  catch { return {}; }
}

export function getProductMeta(id: string): ProductMeta {
  return readStore()[id] ?? { images: [], listed: false };
}

export function setProductMeta(id: string, meta: ProductMeta): void {
  const store = readStore();
  store[id] = meta;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
  catch { /* quota exceeded */ }
}

export function deleteProductMeta(id: string): void {
  const store = readStore();
  delete store[id];
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
  catch { /* ignore */ }
}

// ── shared marketplace catalog (cross-shop, stored locally) ───────────────
// When a shop publishes a product it writes a MarketplaceEntry here.
// Every user on the same device (or same browser) can read the full catalog.
export interface MarketplaceEntry {
  productId: string;
  shopId: string;
  shopName: string;
  shopLogoUrl?: string;
  shopPhone?: string;
  name: string;
  description?: string;
  category?: string;
  sellingPrice: number;
  costPrice: number;
  quantity: number;
  images: string[];
  listedAt: string; // ISO timestamp
}

const CATALOG_KEY = "hgv_marketplace_catalog_v1";

function readCatalog(): Record<string, MarketplaceEntry> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(CATALOG_KEY) ?? "{}"); }
  catch { return {}; }
}

export function getCatalog(): MarketplaceEntry[] {
  return Object.values(readCatalog());
}

export function upsertCatalogEntry(entry: MarketplaceEntry): void {
  const catalog = readCatalog();
  catalog[entry.productId] = entry;
  try { localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog)); }
  catch { /* quota */ }
}

export function removeCatalogEntry(productId: string): void {
  const catalog = readCatalog();
  delete catalog[productId];
  try { localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog)); }
  catch { /* ignore */ }
}

// ── messaging system ──────────────────────────────────────────────────────────
// Stored in localStorage so messages persist and are readable on the same device.
export interface MessageReply {
  id: string;
  text: string;
  fromShop: boolean;   // true = shopkeeper reply
  timestamp: string;
}

export interface ShopMessage {
  id: string;
  productId: string;
  productName: string;
  shopId: string;       // recipient shop
  shopName: string;
  buyerShopId: string;  // sender shop
  buyerName: string;
  text: string;
  timestamp: string;
  replies: MessageReply[];
  readByShop: boolean;
}

const MSG_KEY = "hgv_messages_v1";

function readMessages(): Record<string, ShopMessage> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(MSG_KEY) ?? "{}"); }
  catch { return {}; }
}

export function sendMessage(msg: Omit<ShopMessage, "id" | "replies" | "readByShop">): ShopMessage {
  const all = readMessages();
  const full: ShopMessage = { ...msg, id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`, replies: [], readByShop: false };
  all[full.id] = full;
  try { localStorage.setItem(MSG_KEY, JSON.stringify(all)); } catch { /* quota */ }
  return full;
}

export function getMessagesForShop(shopId: string): ShopMessage[] {
  return Object.values(readMessages())
    .filter((m) => m.shopId === shopId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function getMyMessages(buyerShopId: string): ShopMessage[] {
  return Object.values(readMessages())
    .filter((m) => m.buyerShopId === buyerShopId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function replyToMessage(messageId: string, text: string, fromShop: boolean): void {
  const all = readMessages();
  if (!all[messageId]) return;
  const reply: MessageReply = {
    id: `rep_${Date.now()}`,
    text,
    fromShop,
    timestamp: new Date().toISOString(),
  };
  all[messageId].replies.push(reply);
  if (fromShop) all[messageId].readByShop = true;
  try { localStorage.setItem(MSG_KEY, JSON.stringify(all)); } catch { /* quota */ }
}

export function markMessageRead(messageId: string): void {
  const all = readMessages();
  if (!all[messageId]) return;
  all[messageId].readByShop = true;
  try { localStorage.setItem(MSG_KEY, JSON.stringify(all)); } catch { /* quota */ }
}

export function unreadCountForShop(shopId: string): number {
  return Object.values(readMessages()).filter((m) => m.shopId === shopId && !m.readByShop).length;
}

// ── cross-device catalog via shop description field ────────────────────────
// Compact entry stored server-side (no images — keeps payload small)
export interface ShopCatalogEntry {
  pid: string;   // product ID
  n: string;     // name
  d?: string;    // description (truncated)
  cat: string;   // category
  price: number; // selling price
  qty: number;   // quantity in stock
  at: string;    // ISO timestamp when listed
}

const _CAT_KW: Record<string, string[]> = {
  food:        ["food","drink","restaurant","café","cafe","bakery","juice","grocery","market","farm","rice","sugar","milk","flour","meat","fish","vegetable","beverage"],
  electronics: ["tech","electronic","phone","computer","digital","mobile","gadget","battery","cable","printer","camera","laptop","tv"],
  fashion:     ["fashion","cloth","wear","beauty","salon","boutique","tailoring","shoes","bag","jewelry","accessory","shirt","dress"],
  wholesale:   ["wholesale","bulk","distribution","import","export","supplier","trade","stock","manufacturing","supply"],
  agriculture: ["agri","farm","seed","fertilizer","crop","harvest","livestock","animal","poultry","garden"],
  health:      ["health","pharma","medicine","medical","clinic","cosmetic","skincare","wellness","pharmacy"],
  furniture:   ["furniture","wood","chair","table","sofa","bed","cabinet","decor","home","office"],
  services:    ["service","repair","print","photo","logistics","transport","consulting","delivery","cleaning"],
};

export function catFromText(name: string, desc?: string | null): string {
  const text = `${name} ${desc ?? ""}`.toLowerCase();
  for (const [cat, kws] of Object.entries(_CAT_KW))
    if (kws.some((kw) => text.includes(kw))) return cat;
  return "other";
}

// Encodes catalog into shop description field preserving existing type/desc text
export function encodeShopDescription(
  existingDescription: string | undefined | null,
  catalog: ShopCatalogEntry[],
): string {
  let base: { _t?: string; _d?: string; _c?: ShopCatalogEntry[] } = {};
  if (existingDescription) {
    try {
      const parsed = JSON.parse(existingDescription);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        base = { _t: parsed._t, _d: parsed._d };
      }
    } catch {
      if (existingDescription.includes("|")) {
        const idx = existingDescription.indexOf("|");
        base._t = existingDescription.slice(0, idx);
        base._d = existingDescription.slice(idx + 1);
      } else {
        base._d = existingDescription;
      }
    }
  }
  base._c = catalog;
  return JSON.stringify(base);
}

// Reads catalog entries from a shop's description field
export function decodeShopCatalog(
  description: string | undefined | null,
): ShopCatalogEntry[] {
  if (!description) return [];
  try {
    const parsed = JSON.parse(description);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed._c)) {
      return parsed._c as ShopCatalogEntry[];
    }
  } catch { /* old "Type|Desc" format — no catalog */ }
  return [];
}

// Extracts the human-readable business type and description from a shop's description field
export function decodeShopHumanInfo(
  description: string | undefined | null,
): { type?: string; desc?: string } {
  if (!description) return {};
  try {
    const parsed = JSON.parse(description);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { type: parsed._t, desc: parsed._d };
    }
  } catch { /* old format */ }
  if (description.includes("|")) {
    const idx = description.indexOf("|");
    return { type: description.slice(0, idx), desc: description.slice(idx + 1) };
  }
  return { desc: description };
}

// ── image compression ──────────────────────────────────────────────────────
export async function compressImage(
  file: File,
  maxPx = 700,
  quality = 0.65,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/webp", quality));
    };
    img.onerror = reject;
    img.src = objectUrl;
  });
}
