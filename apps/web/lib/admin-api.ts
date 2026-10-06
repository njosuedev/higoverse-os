import type { BusinessLayout } from "@/lib/business-layout";
import { authFetch, expireSession } from "@/lib/session";
import { AUTH_API } from "@/lib/api-config";


async function adminRequest(endpoint: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  const res = await authFetch(`${AUTH_API}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    expireSession();
    throw new Error("Session expired. Please log in again.");
  }
  if (res.status === 403) throw new Error("Admin access required.");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text;
    try {
      const body = JSON.parse(text);
      const detail = body?.detail;
      if (typeof detail === "string") message = detail;
      // Pydantic prefixes its own checks with "Value error, ".
      else if (Array.isArray(detail) && detail[0]?.msg) message = detail.map((d) => String(d.msg).replace(/^Value error, /, "")).join("; ");
    } catch { /* not JSON, use raw text */ }
    throw new Error(message || `Admin API error: ${res.status}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export interface AdminStats {
  total_users: number;
  active_users: number;
  inactive_users: number;
  total_shops: number;
  active_shops: number;
  inactive_shops: number;
  online_shops: number;
}

export interface AdminShop {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  /** RRA TIN, 9 digits (older shops: read from their address). */
  tin?: string | null;
  address?: string;
  description?: string;
  logo_url?: string;
  layout?: string;
  is_active: boolean;
  email_verified: boolean;
  owner_email: string | null;
  user_count: number;
  created_at: string | null;
  updated_at: string | null;
  last_seen_at: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  permissions?: string[];
  is_active: boolean;
  shop_id: string | null;
  shop_name: string | null;
  created_at: string | null;
}

// Keep in sync with STAFF_ROLES in backend/auth-service/app/api/v1/admin.py
export const STAFF_ROLES = ["admin", "owner", "manager", "cashier", "storekeeper", "accountant"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export interface CreateShopPayload {
  shop_name: string;
  phone: string;
  tin: string;
  owner_email?: string;
  owner_password?: string;
  owner_name?: string;
  address?: string;
  description?: string;
  logo_url?: string;
  layout?: BusinessLayout;
}

export async function createShop(payload: CreateShopPayload): Promise<{ shop_id: string; shop_name: string; owner_email: string }> {
  const res = await adminRequest("/api/v1/admin/shops", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res?.data;
}

export async function getAdminStats(): Promise<AdminStats> {
  const res = await adminRequest("/api/v1/admin/stats");
  return res?.data;
}

export async function getAdminShops(): Promise<AdminShop[]> {
  const res = await adminRequest("/api/v1/admin/shops");
  const all: AdminShop[] = res?.data ?? [];
  // Hide shops whose owner email was scrambled (user deleted) or whose own email was scrambled
  return all.filter(
    (s) =>
      !s.owner_email?.startsWith("_deleted_") &&
      !s.email?.startsWith("_deleted_"),
  );
}

export interface UpdateShopPayload {
  name?: string;
  phone?: string;
  tin?: string;
  address?: string;
  description?: string;
  logo_url?: string;
  layout?: BusinessLayout;
}

export async function updateShop(shopId: string, payload: UpdateShopPayload): Promise<AdminShop> {
  const res = await adminRequest(`/api/v1/admin/shops/${shopId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return res?.data;
}

export async function toggleShop(shopId: string): Promise<AdminShop> {
  const res = await adminRequest(`/api/v1/admin/shops/${shopId}/toggle`, { method: "PATCH" });
  return res?.data;
}

export async function verifyShopEmail(shopId: string): Promise<AdminShop> {
  const res = await adminRequest(`/api/v1/admin/shops/${shopId}/verify-email`, { method: "PATCH" });
  return res?.data;
}

export async function deleteShop(shopId: string): Promise<void> {
  await adminRequest(`/api/v1/admin/shops/${shopId}`, { method: "DELETE" });
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const res = await adminRequest("/api/v1/admin/users");
  return res?.data ?? [];
}

export interface CreateShopUserPayload {
  shop_id: string;
  email: string;
  password: string;
  name?: string;
  role: StaffRole;
}

export async function createShopUser(payload: CreateShopUserPayload): Promise<AdminUser> {
  const res = await adminRequest("/api/v1/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res?.data;
}

export async function toggleUser(userId: string): Promise<AdminUser> {
  const res = await adminRequest(`/api/v1/admin/users/${userId}/toggle`, { method: "PATCH" });
  return res?.data;
}

export async function updateUserRole(userId: string, role: string): Promise<AdminUser> {
  const res = await adminRequest(`/api/v1/admin/users/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
  return res?.data;
}

export async function deleteUser(userId: string): Promise<void> {
  await adminRequest(`/api/v1/admin/users/${userId}`, { method: "DELETE" });
}

export async function clearUserEmail(userId: string): Promise<void> {
  await adminRequest(`/api/v1/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ email: `_deleted_${Date.now()}_${userId.slice(0, 8)}@removed.invalid` }),
  });
}
