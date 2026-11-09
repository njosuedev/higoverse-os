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
  target_type: "shop" | "user" | "client";
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

// ── Higoverse's own tax clients (platform admin only) ──────────────────────

export interface TaxClient {
  id: string;
  name: string;
  /** The person we deal with at the client. */
  delegate: string | null;
  /** International form, +250… */
  phone: string | null;
  /** RRA TIN, 9 digits. */
  tin: string | null;
  notes: string | null;
  /** Agreed monthly fee (Rwf); the client's contract is made with it. */
  monthly_fee?: number | null;
  /** How many contracts the client has (every client must have one). */
  contracts?: number;
  created_at: string | null;
  updated_at: string | null;
}

export type TaxClientInput = Pick<TaxClient, "name" | "delegate" | "phone" | "tin" | "notes" | "monthly_fee">;

export async function getTaxClients(): Promise<TaxClient[]> {
  const res = await adminRequest("/api/v1/admin/tax-clients");
  return res?.data ?? [];
}

export async function createTaxClient(payload: TaxClientInput): Promise<TaxClient> {
  const res = await adminRequest("/api/v1/admin/tax-clients", { method: "POST", body: JSON.stringify(payload) });
  return res.data;
}

export async function updateTaxClient(id: string, payload: Partial<TaxClientInput>): Promise<TaxClient> {
  const res = await adminRequest(`/api/v1/admin/tax-clients/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  return res.data;
}

export async function deleteTaxClient(id: string): Promise<void> {
  await adminRequest(`/api/v1/admin/tax-clients/${id}`, { method: "DELETE" });
}

/** Adds many at once; rows whose TIN is already on the list come back in `skipped`. */
export async function importTaxClients(rows: TaxClientInput[]): Promise<{ added: number; skipped: string[] }> {
  const res = await adminRequest("/api/v1/admin/tax-clients/import", { method: "POST", body: JSON.stringify({ rows }) });
  return res.data;
}

// ── Tax advisory contracts with those clients (platform admin only) ───────

/** Higoverse's side as printed on a contract (kept in the database). */
export interface TaxContractCompany {
  name?: string; tin?: string; representative?: string; title?: string;
  phone?: string; phone2?: string; email?: string; website?: string; address?: string;
  momo_code?: string; bank_name?: string; bank_account?: string;
}

export interface TaxContract {
  id: string;
  client_id: string | null;
  contract_date: string;   // YYYY-MM-DD
  start_date: string;
  client_name: string;
  client_tin: string | null;
  client_phone: string | null;
  client_representative: string | null;
  monthly_fee: number;
  payment_day: number;
  notes: string | null;
  company: TaxContractCompany;
  created_by: string | null;
  created_at: string | null;
  /** For the printed contract's QR. */
  doc_code?: string;
}

export type TaxContractInput = Omit<TaxContract, "id" | "created_by" | "created_at" | "doc_code">;

export async function getTaxContracts(clientId?: string): Promise<TaxContract[]> {
  const res = await adminRequest(`/api/v1/admin/tax-contracts${clientId ? `?client_id=${encodeURIComponent(clientId)}` : ""}`);
  return res?.data ?? [];
}

/** Higoverse's side as on the last contract (empty before the first). */
export async function getTaxContractCompany(): Promise<TaxContractCompany> {
  const res = await adminRequest("/api/v1/admin/tax-contracts/company");
  return res?.data ?? {};
}

export async function createTaxContract(payload: TaxContractInput): Promise<TaxContract> {
  const res = await adminRequest("/api/v1/admin/tax-contracts", { method: "POST", body: JSON.stringify(payload) });
  return res.data;
}

export async function updateTaxContract(id: string, payload: TaxContractInput): Promise<TaxContract> {
  const res = await adminRequest(`/api/v1/admin/tax-contracts/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  return res.data;
}

export async function deleteTaxContract(id: string): Promise<void> {
  await adminRequest(`/api/v1/admin/tax-contracts/${id}`, { method: "DELETE" });
}

/** A contract for every client that has none (with their agreed fee); clients with no fee are named. */
export async function fillMissingTaxContracts(): Promise<{ made: number; no_fee: string[] }> {
  const res = await adminRequest("/api/v1/admin/tax-contracts/fill-missing", { method: "POST" });
  return res.data;
}

// ── Income from tax clients: expected (agreed fees) and real (payments) ───

export interface TaxPayment {
  id: string; client_id: string; period: string; amount: number; paid_on: string;
  method: "cash" | "mtn" | "bank" | null; reference: string | null; notes: string | null;
  created_by: string | null; created_at: string | null;
}

export interface TaxIncome {
  period: string;
  expected: number;
  received: number;
  outstanding: number;
  clients_expected: number;
  clients_paid: number;
  clients: { client_id: string; expected: number; received: number; status: "paid" | "partial" | "unpaid" | "none" }[];
  history: { period: string; expected: number; received: number }[];
}

export async function getTaxIncome(period: string, months = 6): Promise<TaxIncome> {
  const res = await adminRequest(`/api/v1/admin/tax-income?period=${period}&months=${months}`);
  return res.data;
}

export async function getTaxPayments(clientId: string): Promise<TaxPayment[]> {
  const res = await adminRequest(`/api/v1/admin/tax-payments?client_id=${encodeURIComponent(clientId)}`);
  return res?.data ?? [];
}

/** What a client owes for a month: the expected fee, what's paid, what's left. */
export async function getTaxPaymentBalance(clientId: string, period: string): Promise<{ period: string; expected: number; paid: number; left: number }> {
  const res = await adminRequest(`/api/v1/admin/tax-payments/balance?client_id=${encodeURIComponent(clientId)}&period=${period}`);
  return res.data;
}

export async function recordTaxPayment(p: Omit<TaxPayment, "id" | "created_by" | "created_at">): Promise<TaxPayment> {
  const res = await adminRequest("/api/v1/admin/tax-payments", { method: "POST", body: JSON.stringify(p) });
  return res.data;
}

export async function deleteTaxPayment(id: string): Promise<void> {
  await adminRequest(`/api/v1/admin/tax-payments/${id}`, { method: "DELETE" });
}
