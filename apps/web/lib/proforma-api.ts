import { saleRequest } from "@/lib/sale-api";

/**
 * draft → approved (by the owner or a manager) → sold (the customer decided
 * to buy and the sales were recorded). "sent" and "accepted" are older
 * statuses: shown as draft and approved.
 */
export type ProformaStatus = "draft" | "sent" | "accepted" | "approved" | "sold" | "expired";

/** Roles that may approve a proforma (APPROVER_ROLES in sale-service). */
export const PROFORMA_APPROVER_ROLES = new Set(["owner", "admin", "manager"]);

/** The status as the app shows it (older statuses folded in). */
export function proformaStage(s: ProformaStatus): "draft" | "approved" | "sold" | "expired" {
  if (s === "accepted" || s === "approved") return "approved";
  if (s === "sold" || s === "expired") return s;
  return "draft";
}

export interface ProformaLine {
  product_name: string;
  qty: number;
  unit_price: number;
  /** Set when picked from stock; only such lines can become a sale. */
  product_id?: string | null;
  // Vehicle details (car companies)
  car_type?: string | null;
  year?: string | null;
  color?: string | null;
  mileage?: string | null;
  energy?: string | null;
  chassis_no?: string | null;
  plate_no?: string | null;
  condition?: string | null;
}

export interface Proforma {
  id: string;
  invoice_no: string;
  date: string;
  valid_until: string;
  salesperson: string;
  customer_id?: string | null;
  customer: string;
  customer_phone: string;
  customer_address: string;
  customer_id_no: string;
  customer_tin: string;
  customer_email: string;
  customer_country: string;
  customer_company: string;
  notes: string;
  lines: ProformaLine[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  grand_total: number;
  currency: string;
  payment_method: string;
  bank_details: string;
  deposit_amount: number;
  terms: string;
  status: ProformaStatus;
  approved_by?: string;
  approved_at?: string | null;
  sold_at?: string | null;
  sale_ids?: string[];
  created_at: string;
  updated_at?: string;
}

export type ProformaPayload = Omit<
  Proforma,
  "id" | "created_at" | "updated_at" | "status" | "approved_by" | "approved_at" | "sold_at" | "sale_ids"
>;

export interface ProformaListResult {
  items: Proforma[];
  total: number;
  page: number;
  limit: number;
}

export async function listProformas(params?: { page?: number; limit?: number; search?: string; status?: string }): Promise<ProformaListResult> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.search) qs.set("search", params.search);
  if (params?.status) qs.set("status", params.status);

  const res = await saleRequest(`/proforma${qs.toString() ? `?${qs}` : ""}`);
  return res?.data ?? { items: [], total: 0, page: 1, limit: params?.limit ?? 100 };
}

export async function getProforma(id: string): Promise<Proforma | null> {
  const res = await saleRequest(`/proforma/${id}`);
  return res?.data ?? null;
}

export async function createProforma(payload: ProformaPayload): Promise<Proforma> {
  const res = await saleRequest("/proforma", { method: "POST", body: JSON.stringify(payload) });
  return res.data;
}

export async function updateProforma(
  id: string, payload: Partial<ProformaPayload> & { status?: "draft" | "expired" },
): Promise<Proforma | null> {
  const res = await saleRequest(`/proforma/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  return res?.data ?? null;
}

export async function approveProforma(id: string): Promise<Proforma> {
  const res = await saleRequest(`/proforma/${id}/approve`, { method: "POST" });
  return res.data;
}

/** The customer decided to buy: records the sales and marks it sold. */
export async function sellProforma(
  id: string, body: { payment_method: string; amount_paid?: number; customer_id?: string },
): Promise<Proforma> {
  const res = await saleRequest(`/proforma/${id}/sell`, { method: "POST", body: JSON.stringify(body) });
  return res.data;
}

export async function deleteProforma(id: string): Promise<boolean> {
  const res = await saleRequest(`/proforma/${id}`, { method: "DELETE" });
  return res?.success ?? false;
}
