import { getToken } from "@/lib/auth";

const SALES_API = process.env.NEXT_PUBLIC_SALES_API || "https://higoverse-sales.vercel.app";

async function proformaRequest(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${SALES_API}${endpoint}`, { ...options, headers });
  } catch {
    return null;
  }

  if (res.status === 401) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Proforma API error: ${res.status} ${text}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

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

export interface ProformaPayload {
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
}

export interface ProformaListResult {
  items: Proforma[];
  total: number;
  page: number;
  limit: number;
}

export async function listProformas(params?: { page?: number; limit?: number; search?: string }): Promise<ProformaListResult> {
  const q = new URLSearchParams({
    page: String(params?.page ?? 1),
    limit: String(params?.limit ?? 50),
    ...(params?.search ? { search: params.search } : {}),
  });
  const res = await proformaRequest(`/proformas?${q}`);
  return res?.data ?? { items: [], total: 0, page: 1, limit: 50 };
}

export async function getProforma(id: string): Promise<Proforma | null> {
  const res = await proformaRequest(`/proformas/${id}`);
  return res?.data ?? null;
}

export async function createProforma(payload: ProformaPayload): Promise<Proforma | null> {
  const res = await proformaRequest("/proformas", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res?.data ?? null;
}

export async function updateProforma(id: string, payload: Partial<ProformaPayload>): Promise<Proforma | null> {
  const res = await proformaRequest(`/proformas/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return res?.data ?? null;
}

export async function deleteProforma(id: string): Promise<boolean> {
  const res = await proformaRequest(`/proformas/${id}`, { method: "DELETE" });
  return res !== null;
}
