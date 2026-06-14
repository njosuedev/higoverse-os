import { getToken, handleUnauthorized } from "@/lib/auth";

const SHOP_API = process.env.NEXT_PUBLIC_SHOP_API_URL || "https://higoverse-shop.vercel.app";

async function shopRequest(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${SHOP_API}${endpoint}`, { ...options, headers });

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

/** Paginated, searchable list of all active shops */
export async function listShops(params?: {
  search?: string;
  active_only?: boolean;
  page?: number;
  limit?: number;
}): Promise<ShopListResult> {
  const qs = new URLSearchParams();
  if (params?.search)                      qs.set("search",      params.search);
  if (params?.active_only !== undefined)   qs.set("active_only", String(params.active_only));
  if (params?.page)                        qs.set("page",        String(params.page));
  if (params?.limit)                       qs.set("limit",       String(params.limit));
  const res = await shopRequest(`/shops?${qs.toString()}`);
  return res?.data ?? { total: 0, page: 1, limit: 20, pages: 0, items: [] };
}

/** Current user's shop profile */
export async function getMyShop(): Promise<Shop | null> {
  const res = await shopRequest("/shops/me");
  return res?.data ?? null;
}

/** Update the current user's shop */
export async function updateMyShop(payload: ShopUpdatePayload): Promise<Shop | null> {
  const res = await shopRequest("/shops/me", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return res?.data ?? null;
}

/** Get any shop by ID */
export async function getShopById(shopId: string): Promise<Shop | null> {
  const res = await shopRequest(`/shops/${shopId}`);
  return res?.data ?? null;
}

/** Admin: toggle a shop's active status */
export async function toggleShopStatus(shopId: string): Promise<Shop | null> {
  const res = await shopRequest(`/shops/${shopId}/toggle`, { method: "POST" });
  return res?.data ?? null;
}

/** Admin: patch any shop field */
export async function adminUpdateShop(shopId: string, payload: ShopUpdatePayload & { is_active?: boolean }): Promise<Shop | null> {
  const res = await shopRequest(`/shops/${shopId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return res?.data ?? null;
}
