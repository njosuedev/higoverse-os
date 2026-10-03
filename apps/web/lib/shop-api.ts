import { getToken } from "@/lib/auth";
import { authFetch } from "@/lib/session";
import { AUTH_API } from "@/lib/api-config";

// Shops live in auth-service's shop_db — call auth-service directly

async function authShopRequest(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  const res = await authFetch(`${AUTH_API}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    // Shop endpoints 401 for plenty of authenticated-but-shopless accounts
    // (e.g. no shop yet) — that's not a session expiry, so don't force a
    // global logout here the way auth-api/admin-api do for explicit actions.
    // Callers (heartbeat, ShopProvider) already treat a failure as "no shop".
    if (!token) return null;
    throw new Error("Session expired. Please log in again.");
  }
  // 404 = user has no shop yet (admin accounts, pure customers) — not an error
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Shop API error: ${res.status} ${text}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export interface Shop {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  description?: string;
  logo_url?: string;
  /** Admin-assigned UI template — see lib/business-layout.ts. */
  layout?: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  last_seen_at: string | null;
}

export interface ShopListResult {
  total: number;
  page: number;
  limit: number;
  pages: number;
  items: Shop[];
}

export interface ShopUpdatePayload {
  name?: string;
  phone?: string;
  address?: string;
  description?: string;
  logo_url?: string;
}

/** Paginated list of active shops — auth-service is the source of truth */
export async function listShops(params?: {
  search?: string;
  active_only?: boolean;
  page?: number;
  limit?: number;
}): Promise<ShopListResult> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  const res = await authShopRequest(`/api/v1/shops${query ? `?${query}` : ""}`);
  let items: Shop[] = Array.isArray(res?.data) ? res.data : [];
  const total: number = typeof res?.total === "number" ? res.total : items.length;

  // Client-side search — the backend doesn't support it yet.
  if (params?.search) {
    const q = params.search.toLowerCase();
    items = items.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.address?.toLowerCase().includes(q)
    );
  }

  const limit = res?.limit ?? params?.limit ?? Math.max(items.length, 100);
  return {
    total,
    page: res?.page ?? 1,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    items,
  };
}

// Session-level cache — avoids repeat 404s when navigating between pages.
// undefined = not fetched yet | null = fetched, no shop | Shop = fetched, has shop
let _myShopCache: Shop | null | undefined = undefined;

export function clearMyShopCache() { _myShopCache = undefined; }

/** Current user's shop profile */
export async function getMyShop(): Promise<Shop | null> {
  if (_myShopCache !== undefined) return _myShopCache;
  const res = await authShopRequest("/api/v1/shop");
  _myShopCache = (res?.data ?? null) as Shop | null;
  return _myShopCache;
}

/** Update the current user's shop */
export async function updateMyShop(payload: ShopUpdatePayload): Promise<Shop | null> {
  const res = await authShopRequest("/api/v1/shop", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  const updated = res?.data ?? null;
  _myShopCache = updated; // keep cache fresh after update
  return updated;
}

/** Ping the server to mark this shop as recently active (call every ~2 min while logged in) */
export async function sendHeartbeat(): Promise<void> {
  try {
    await authShopRequest("/api/v1/shop/heartbeat", { method: "PATCH" });
  } catch {
    // heartbeat failures are silent — don't disrupt the user
  }
}

/** Clear last_seen_at so other shops see this shop as OFFLINE immediately after logout.
 *  Must be called BEFORE clearAuth() so the token is still available. */
export async function sendOffline(): Promise<void> {
  try {
    await authShopRequest("/api/v1/shop/heartbeat", { method: "DELETE", keepalive: true });
  } catch {
    // If the DELETE endpoint doesn't exist, try clearing via update
    try {
      await authShopRequest("/api/v1/shop", {
        method: "PATCH",
        keepalive: true,
        body: JSON.stringify({ last_seen_at: null }),
      });
    } catch {
      // Both failed — presence will expire naturally in ~5 minutes
    }
  }
}

/** Get any active shop by its full ID — a single indexed lookup instead of
 *  fetching every shop and scanning for a match. */
export async function getShopById(shopId: string): Promise<Shop | null> {
  const res = await authShopRequest(`/api/v1/shops/${shopId}`);
  return res?.data ?? null;
}
