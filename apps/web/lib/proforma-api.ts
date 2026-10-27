import { saleRequest } from "@/lib/sale-api";

/**
 * pending → sold. A proforma is pending as soon as it's made (stored as
 * "approved", its name before): a car company's needs the customer's first
 * deposit and puts its cars on pending for them. "draft" and "sent" are only
 * on proformas made before, put on pending with approveProforma; "accepted"
 * is an older name for pending.
 */
export type ProformaStatus = "draft" | "sent" | "accepted" | "approved" | "sold" | "expired";

/** Roles that may remove a deposit recorded by mistake (APPROVER_ROLES in sale-service). */
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

/** A deposit / booking payment received on a proforma (counts as paid at the sale). */
export interface Deposit {
  id?: string;
  amount: number;
  method: "cash" | "mtn" | "airtel" | "bank" | "card";
  /** YYYY-MM-DD, never in the future. */
  date: string;
  reference?: string;
  by?: string;
  at?: string;
}
export const DEPOSIT_METHODS = ["cash", "mtn", "airtel", "bank", "card"] as const;

/** What's been paid in deposits, and what's left. */
export function depositTotals(p: { grand_total: number; deposits?: Deposit[] | null; deposit_amount?: number | null }) {
  // Proformas made before deposits were itemised only have `deposit_amount`.
  const paid = p.deposits?.length
    ? p.deposits.reduce((a, d) => a + (Number(d.amount) || 0), 0)
    : Number(p.deposit_amount) || 0;
  return { paid, balance: Math.max(0, (Number(p.grand_total) || 0) - paid) };
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
  /** Which of the company's bank accounts (Settings) are printed. */
  bank_account_ids?: string[];
  /** The total of `deposits` (computed by the server). */
  deposit_amount: number;
  deposits?: Deposit[];
  terms: string;
  status: ProformaStatus;
  approved_by?: string;
  approved_at?: string | null;
  sold_at?: string | null;
  sale_ids?: string[];
  created_at: string;
  updated_at?: string;
  /** The signed code in the printed proforma's QR (lib/doc-qr.ts). */
  doc_code?: string;
}

export type ProformaPayload = Omit<
  Proforma,
  "id" | "created_at" | "updated_at" | "status" | "approved_by" | "approved_at" | "sold_at" | "sale_ids" | "deposits" | "doc_code"
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

export async function createProforma(payload: ProformaPayload & { deposits?: Deposit[] }): Promise<Proforma> {
  const res = await saleRequest("/proforma", { method: "POST", body: JSON.stringify(payload) });
  return res.data;
}

export async function updateProforma(
  id: string, payload: Partial<ProformaPayload> & { status?: "draft" | "expired" },
): Promise<Proforma | null> {
  const res = await saleRequest(`/proforma/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  return res?.data ?? null;
}

/** Puts a proforma made before (a draft) on pending; a car company's needs a deposit. */
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

/** Records a deposit / booking payment (a pending car proforma's goes on its cars too). */
export async function addDeposit(id: string, d: Omit<Deposit, "id" | "by" | "at">): Promise<Proforma> {
  const res = await saleRequest(`/proforma/${id}/deposits`, { method: "POST", body: JSON.stringify(d) });
  return res.data;
}

/** Removes a deposit recorded by mistake (owner, admin or manager). */
export async function removeDeposit(id: string, depositId: string): Promise<Proforma> {
  const res = await saleRequest(`/proforma/${id}/deposits/${depositId}`, { method: "DELETE" });
  return res.data;
}

export async function deleteProforma(id: string): Promise<boolean> {
  const res = await saleRequest(`/proforma/${id}`, { method: "DELETE" });
  return res?.success ?? false;
}
