import { saleRequest } from "@/lib/sale-api";

export type ProformaStatus = "draft" | "sent" | "accepted" | "expired";

export interface ProformaLine {
  product_name: string;
  qty: number;
  unit_price: number;
}

export interface Proforma {
  id: string;
  invoice_no: string;
  date: string;
  valid_until: string;
  customer: string;
  customer_phone: string;
  customer_address: string;
  notes: string;
  lines: ProformaLine[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  grand_total: number;
  currency: string;
  status: ProformaStatus;
  created_at: string;
  updated_at?: string;
}

export type ProformaPayload = Omit<Proforma, "id" | "created_at" | "updated_at">;

export interface ProformaListResult {
  items: Proforma[];
  total: number;
  page: number;
  limit: number;
}

export async function listProformas(params?: { page?: number; limit?: number; search?: string }): Promise<ProformaListResult> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.search) qs.set("search", params.search);

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

export async function updateProforma(id: string, payload: Partial<ProformaPayload>): Promise<Proforma | null> {
  const res = await saleRequest(`/proforma/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  return res?.data ?? null;
}

export async function deleteProforma(id: string): Promise<boolean> {
  const res = await saleRequest(`/proforma/${id}`, { method: "DELETE" });
  return res?.success ?? false;
}
