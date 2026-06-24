import { getToken, handleUnauthorized } from "@/lib/auth";

// Shops live in auth-service's shop_db — call auth-service directly
const AUTH_API = process.env.NEXT_PUBLIC_AUTH_API || "https://higoverse-auth.vercel.app";

async function authShopRequest(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${AUTH_API}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    handleUnauthorized();
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
  const res = await authShopRequest("/api/v1/shops");
  let items: Shop[] = Array.isArray(res?.data) ? res.data : [];

  // Client-side search (auth-service returns all active shops in one call)
  if (params?.search) {
    const q = params.search.toLowerCase();
    items = items.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.address?.toLowerCase().includes(q)
    );
  }

  return {
    total: items.length,
    page: 1,
    limit: Math.max(items.length, 100),
    pages: 1,
    items,
  };
}

/** Current user's shop profile */
export async function getMyShop(): Promise<Shop | null> {
  const res = await authShopRequest("/api/v1/shop");
  return res?.data ?? null;
}

/** Update the current user's shop */
export async function updateMyShop(payload: ShopUpdatePayload): Promise<Shop | null> {
  const res = await authShopRequest("/api/v1/shop", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return res?.data ?? null;
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
    await authShopRequest("/api/v1/shop/heartbeat", { method: "DELETE" });
  } catch {
    // If the DELETE endpoint doesn't exist, try clearing via update
    try {
      await authShopRequest("/api/v1/shop", {
        method: "PATCH",
        body: JSON.stringify({ last_seen_at: null }),
      });
    } catch {
      // Both failed — presence will expire naturally in ~5 minutes
    }
  }
}

/** Get any shop by ID */
export async function getShopById(shopId: string): Promise<Shop | null> {
  const res = await authShopRequest(`/api/v1/shops`);
  const items: Shop[] = Array.isArray(res?.data) ? res.data : [];
  return items.find((s) => s.id === shopId) ?? null;
}
