import { getToken, handleUnauthorized } from "@/lib/auth";

// Shops live in auth-service's shop_db — call auth-service directly
const AUTH_API = process.env.NEXT_PUBLIC_AUTH_API || "http://localhost:8000";

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
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
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

/** Get any shop by ID */
export async function getShopById(shopId: string): Promise<Shop | null> {
  const res = await authShopRequest(`/api/v1/shops`);
  const items: Shop[] = Array.isArray(res?.data) ? res.data : [];
  return items.find((s) => s.id === shopId) ?? null;
}
