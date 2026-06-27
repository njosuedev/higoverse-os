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

const STORAGE_KEY = "hgv_proformas_v1";

function readAll(): Proforma[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: Proforma[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function genId() {
  return `pf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function listProformas(params?: { page?: number; limit?: number; search?: string }): Promise<ProformaListResult> {
  let items = readAll().sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (params?.search) {
    const q = params.search.toLowerCase();
    items = items.filter(
      (p) =>
        p.invoice_no.toLowerCase().includes(q) ||
        p.customer.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q),
    );
  }
  return { items, total: items.length, page: 1, limit: items.length };
}

export async function getProforma(id: string): Promise<Proforma | null> {
  return readAll().find((p) => p.id === id) ?? null;
}

export async function createProforma(payload: ProformaPayload): Promise<Proforma> {
  const proforma: Proforma = {
    ...payload,
    id: genId(),
    created_at: new Date().toISOString(),
  };
  writeAll([...readAll(), proforma]);
  return proforma;
}

export async function updateProforma(id: string, payload: Partial<ProformaPayload>): Promise<Proforma | null> {
  const all = readAll();
  const idx = all.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const updated: Proforma = { ...all[idx], ...payload, id, updated_at: new Date().toISOString() };
  all[idx] = updated;
  writeAll(all);
  return updated;
}

export async function deleteProforma(id: string): Promise<boolean> {
  const all = readAll();
  const filtered = all.filter((p) => p.id !== id);
  if (filtered.length === all.length) return false;
  writeAll(filtered);
  return true;
}
