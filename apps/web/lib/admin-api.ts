import type { BusinessLayout } from "@/lib/business-layout";
import { authFetch } from "@/lib/session";
import { AUTH_API } from "@/lib/api-config";


async function adminRequest(endpoint: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  const res = await authFetch(`${AUTH_API}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    // authFetch has already ended the session if the server refused to renew
    // it; reaching here means the renewal couldn't be made (offline, server
    // restarting), so keep the user signed in and let them retry.
    throw new Error("Couldn't reach Higoverse. Check your connection and try again.");
  }
  if (res.status === 403) throw new Error("Admin access required.");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text;
    try {
      const body = JSON.parse(text);
      const detail = body?.detail;
      if (typeof detail === "string") message = detail;
      else if (typeof detail?.message === "string") message = detail.message;
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
  /** When they last signed in or renewed their session. */
  last_active_at?: string | null;
}

// A company's people. Keep in sync with SHOP_ROLES in
// backend/auth-service/app/api/v1/admin.py. "admin" (the platform admin) is
// never given to anyone in a company.
export const STAFF_ROLES = ["owner", "manager", "cashier", "storekeeper", "accountant"] as const;
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

/** Sets a new password for any user (signs them out everywhere). */
export async function setUserPassword(userId: string, newPassword: string): Promise<void> {
  await adminRequest(`/api/v1/admin/users/${userId}/password`, {
    method: "PATCH",
    body: JSON.stringify({ new_password: newPassword }),
  });
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

/** A user's name or email (nothing else). */
export async function updateUser(userId: string, payload: { name?: string | null; email?: string }): Promise<AdminUser> {
  const res = await adminRequest(`/api/v1/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return res?.data;
}

// ── How the companies are doing ───────────────────────────────────────────────
export type CompanyHealth = "active" | "slowing" | "new" | "dormant" | "inactive";
export const COMPANY_HEALTH: CompanyHealth[] = ["active", "slowing", "new", "dormant", "inactive"];

export interface CompanySetup {
  profile: boolean; logo: boolean; email: boolean; products: boolean; first_sale: boolean; team: boolean;
}

/** One company's use of Higoverse: counts and dates only, never money. */
export interface CompanyInsight {
  shop_id: string;
  health: CompanyHealth;
  products: number;
  sales_total: number;
  sales_30d: number;
  sales_prev_30d: number;
  sales_7d: number;
  purchases: number;
  expenses: number;
  proformas: number;
  records_30d: number;
  staff: number;
  first_sale_month: string | null;
  last_sale_at: string | null;
  last_record_at: string | null;
  last_activity_at: string | null;
  /** Sales recorded in each of the last 12 months (oldest first). */
  monthly_sales: number[];
  setup: CompanySetup;
}

export interface PlatformMonth {
  month: string; // YYYY-MM
  new_shops: number;
  new_users: number;
  sales: number;
  active_shops: number;
  total_shops: number;
}

export interface AdminInsights {
  generated_at: string;
  months: string[];
  health: Partial<Record<CompanyHealth, number>>;
  companies: CompanyInsight[];
  timeline: PlatformMonth[];
  totals: { sales_30d: number; sales_prev_30d: number; products: number; with_first_sale: number };
}

export async function getAdminInsights(): Promise<AdminInsights> {
  const res = await adminRequest("/api/v1/admin/insights");
  return res?.data;
}

export interface AuditEntry {
  id: string;
  at: string | null;
  admin_email: string | null;
  action: string;
  target_type: "shop" | "user";
  target_id: string | null;
  target_label: string | null;
  detail: Record<string, unknown>;
}

export async function getAdminAudit(opts: { limit?: number; targetId?: string } = {}): Promise<AuditEntry[]> {
  const q = new URLSearchParams({ limit: String(opts.limit ?? 300) });
  if (opts.targetId) q.set("target_id", opts.targetId);
  const res = await adminRequest(`/api/v1/admin/audit?${q}`);
  return res?.data ?? [];
}
