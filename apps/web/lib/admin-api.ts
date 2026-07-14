import { getToken, handleUnauthorized } from "@/lib/auth";

const AUTH_API = process.env.NEXT_PUBLIC_AUTH_API || "https://auth-esys.vercel.app";

async function adminRequest(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${AUTH_API}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired. Please log in again.");
  }
  if (res.status === 403) throw new Error("Admin access required.");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Admin API error: ${res.status} ${text}`);
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
  address?: string;
  description?: string;
  logo_url?: string;
  is_active: boolean;
  owner_email: string | null;
  user_count: number;
  created_at: string | null;
  updated_at: string | null;
  last_seen_at: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  shop_id: string | null;
  shop_name: string | null;
  created_at: string | null;
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

export async function toggleShop(shopId: string): Promise<AdminShop> {
  const res = await adminRequest(`/api/v1/admin/shops/${shopId}/toggle`, { method: "PATCH" });
  return res?.data;
}

export async function deleteShop(shopId: string): Promise<void> {
  await adminRequest(`/api/v1/admin/shops/${shopId}`, { method: "DELETE" });
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const res = await adminRequest("/api/v1/admin/users");
  return res?.data ?? [];
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

/**
 * Reject a shop application with a reason.
 * Marks the shop's description with rejection status — does NOT delete the user.
 * The applicant remains a CUSTOMER and can resubmit.
 */
export async function rejectApplication(shopId: string, reason: string, currentDescription?: string): Promise<AdminShop> {
  let obj: Record<string, unknown> = {};
  try { if (currentDescription) obj = JSON.parse(currentDescription) as Record<string, unknown>; } catch { /* ignore */ }
  obj._s = "REJECTED";
  obj._r = reason || "Application did not meet requirements";
  const newDesc = JSON.stringify(obj);
  const res = await adminRequest(`/api/v1/admin/shops/${shopId}`, {
    method: "PATCH",
    body: JSON.stringify({ description: newDesc }),
  });
  return res?.data ?? ({ id: shopId, description: newDesc } as AdminShop);
}
