import { getToken, handleUnauthorized } from "@/lib/auth";

const AUTH_API = process.env.NEXT_PUBLIC_AUTH_API || "http://localhost:8000";

export async function authRequest(endpoint: string, options: RequestInit = {}) {
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
    throw new Error(`Auth API error: ${res.status} ${text}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export interface ShopProfile {
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

export async function getMyShop(): Promise<ShopProfile | null> {
  const res = await authRequest("/api/v1/shop");
  return res?.data ?? null;
}

export async function updateMyShop(data: Partial<Pick<ShopProfile, "name" | "phone" | "address" | "description">>): Promise<ShopProfile | null> {
  const res = await authRequest("/api/v1/shop", {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return res?.data ?? null;
}

export async function listShops(): Promise<ShopProfile[]> {
  const res = await authRequest("/api/v1/shops");
  return res?.data ?? [];
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await authRequest("/api/v1/auth/change-password", {
    method: "PUT",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}
