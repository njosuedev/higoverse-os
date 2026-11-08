// RRA EBM receipts (sale-service /ebm). A sale signed by RRA's VSDC comes
// back with the receipt counter, internal data, signature, SDC ID and MRC that
// the printed receipt must show (lib/receipt-print.ts).

import { authFetch } from "@/lib/session";
import { SALE_API } from "@/lib/api-config";
import { qrSvg } from "@/lib/doc-qr";
import type { ReceiptLine } from "@/lib/receipt-print";
import type { EbmReceipt } from "@/lib/ebm-receipt-print";

export interface EbmConfig {
  enabled: boolean; auto_issue: boolean; report_stock: boolean;
  tin: string | null; bhf_id: string; device_serial: string | null;
  default_item_class: string | null; default_tax_type: string;
  /** Country the goods come from (RRA code, e.g. RW, CN): the start of item codes. */
  default_origin: string;
  taxpayer_name: string | null; branch_name: string | null;
  device_id: string | null; sdc_id: string | null; mrc_no: string | null;
  connected: boolean; connected_at: string | null; last_invoice_no: number;
  last_error: string | null;
  /** The invoicing system's version RRA certifies, e.g. "Higoverse CIS 1.0.0". */
  cis_version: string;
  /** This server has a VSDC to talk to. */
  server_ready: boolean;
  /** On, connected and the server is set up: sales can be signed. */
  ready: boolean;
}

export interface EbmCodes {
  tax_types: Record<string, string>;
  item_types: Record<string, string>;
  refund_reasons: Record<string, string>;
}

export interface EbmTax { label: string; rate: number; taxable: number; tax: number }

export interface EbmInvoice {
  id: string; invoice_no: number; original_invoice_no: number | null;
  receipt_type: "S" | "R"; label: "NS" | "NR";
  status: "pending" | "signed" | "failed" | "void";
  error: string | null; attempts: number; can_discard: boolean;
  customer_tin: string | null; customer_name: string | null; customer_phone: string | null;
  payment_code: string; payment_label: string;
  total_amount: number; total_tax: number;
  taxes: Record<"A" | "B" | "C" | "D", EbmTax>;
  lines: { name: string; item_code: string; tax_type: string; quantity: number; unit_price: number; total: number; tax: number }[];
  receipt_no: number | null; total_receipt_no: number | null;
  internal_data: string | null; signature: string | null;
  internal_data_grouped: string; signature_grouped: string;
  sdc_id: string | null; mrc_no: string | null;
  /** yyyyMMddHHmmss, Kigali time, as RRA's VSDC stamped it. */
  signed_at_rra: string | null; signed_at: string | null;
  qr_text: string | null;
  cashier: string | null;
  refunded_by: string | null; refunded: boolean;
  refund_reason: string | null; refund_reason_label: string | null;
  refund_note: string | null; refund_recipient: string | null;
  /** yyyyMMddHHmmss when Higoverse issued it (the CIS time on the receipt). */
  issued_at_cis: string | null;
  items_count: number;
  stock_status: "sent" | "failed" | "skipped" | null; stock_error: string | null;
  sale_ids: string[]; created_at: string | null;
}

export interface EbmItem { product_id: string; item_code: string; item_class: string; item_type: string; tax_type: string; origin: string; registered: boolean }
export interface EbmItemClass { code: string; name: string; level: number | null; tax_type: string | null }
export interface EbmSaleStatus { id: string; invoice_no: number; status: EbmInvoice["status"]; refunded: boolean }
export interface EbmVsdcStatus { ok: boolean; reason: string | null }
export interface EbmCashMove { id: string; kind: "deposit" | "withdrawal"; amount: number; note: string | null; by: string | null; at: string | null }

/** One side (NS sales or NR refunds) of an X/Z report. */
export interface EbmReportSide {
  count: number; total: number; items: number; total_tax: number;
  taxes: { type: string; label: string; rate: number; taxable: number; tax: number }[];
  by_payment: Record<string, number>;
}
/** X or Z daily report (CIS spec §18–19). */
export interface EbmDailyReport {
  kind: "X" | "Z"; number: number; day?: string; closed_by?: string | null; closed_at?: string | null;
  trade_name: string | null; tin: string | null; branch: string; mrc: string | null; sdc_id: string | null; cis: string;
  from: string; to: string;
  sales: EbmReportSide; refunds: EbmReportSide; net_total: number; items_sold: number; items_refunded?: number;
  opening_deposit: number; deposits: { count: number; amount: number }; withdrawals: { count: number; amount: number };
  copies: Record<"CS" | "CR", { count: number; amount: number }>;
  training: { count: number; amount: number }; proforma: { count: number; amount: number };
  discounts: number; reductions: number; incomplete_sales: number;
}
export interface EbmPluReport {
  kind: "PLU"; trade_name: string | null; tin: string | null; cis: string; from: string; to: string;
  items: { item_code: string; name: string | null; unit_price: number; tax_type: string; tax_rate: number; quantity: number; amount: number; remaining: number | null }[];
}

/** Calls /ebm…; a refusal throws the server's own message (e.g. RRA's). */
async function ebm<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const res = await authFetch(`${SALE_API}/ebm${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const d = body?.detail;
    throw new Error(typeof d === "string" ? d : Array.isArray(d) ? d.map((x) => x?.msg).filter(Boolean).join(". ") : `EBM error ${res.status}`);
  }
  return body as T;
}

const post = (body?: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body ?? {}) });

export const ebmApi = {
  config: () => ebm<{ data: EbmConfig; codes: EbmCodes }>("/config"),
  saveConfig: (patch: Partial<EbmConfig>) => ebm<{ data: EbmConfig }>("/config", { method: "PUT", body: JSON.stringify(patch) }),
  connect: () => ebm<{ data: EbmConfig }>("/config/connect", post()),
  itemClasses: (q: string) => ebm<{ data: EbmItemClass[]; cached: number }>(`/item-classes?q=${encodeURIComponent(q)}`),
  syncItemClasses: () => ebm<{ data: { count: number } }>("/item-classes/sync", post()),
  taxpayer: (tin: string) => ebm<{ data: { tin: string; name: string | null } }>(`/customers/${encodeURIComponent(tin)}`),
  items: () => ebm<{ data: EbmItem[] }>("/items"),
  saveItem: (productId: string, patch: Partial<Pick<EbmItem, "item_class" | "tax_type" | "item_type" | "origin">>) =>
    ebm<{ data: EbmItem }>(`/items/${encodeURIComponent(productId)}`, { method: "PUT", body: JSON.stringify(patch) }),
  issue: (saleIds: string[], customer?: { customer_tin?: string; customer_name?: string; customer_phone?: string }) =>
    ebm<{ success: boolean; data: EbmInvoice }>("/invoices", post({ sale_ids: saleIds, ...customer })),
  bySale: (saleId: string) => ebm<{ data: EbmInvoice | null }>(`/invoices/by-sale/${encodeURIComponent(saleId)}`),
  get: (id: string) => ebm<{ data: EbmInvoice }>(`/invoices/${encodeURIComponent(id)}`),
  lookup: (saleIds: string[]) => ebm<{ data: Record<string, EbmSaleStatus> }>("/invoices/lookup", post({ sale_ids: saleIds })),
  retry: (id: string) => ebm<{ success: boolean; data: EbmInvoice }>(`/invoices/${encodeURIComponent(id)}/retry`, post()),
  refund: (id: string, reason: string, note: string, recipient: string) =>
    ebm<{ success: boolean; data: EbmInvoice }>(`/invoices/${encodeURIComponent(id)}/refund`, post({ reason, note, recipient })),
  /** Sales recorded since EBM was turned on that RRA hasn't signed. */
  unsigned: () => ebm<{ data: { count: number; sale_ids: string[] } }>("/unsigned"),
  /** Sends every unsigned sale to RRA (50 per call). */
  signPending: () => ebm<{ data: { signed: number; failed: number; left: number; errors: string[] } }>("/sign-pending", post()),
  /** Whether RRA's VSDC can sign right now (checked before every sale). */
  status: () => ebm<{ data: EbmVsdcStatus }>("/status"),
  /** Records a reprint (COPY), counted on X/Z reports. */
  logCopy: (id: string) => ebm<{ data: { label: string } }>(`/invoices/${encodeURIComponent(id)}/copy`, post()),
  cash: (day?: string) => ebm<{ data: EbmCashMove[] }>(`/cash${day ? `?day=${day}` : ""}`),
  addCash: (kind: "deposit" | "withdrawal", amount: number, note?: string) => ebm<{ data: EbmCashMove }>("/cash", post({ kind, amount, note })),
  xReport: () => ebm<{ data: EbmDailyReport }>("/reports/x"),
  closeDay: (day?: string) => ebm<{ data: EbmDailyReport }>("/reports/z", post(day ? { day } : {})),
  zReports: () => ebm<{ data: { number: number; day: string; net_total: number; created_at: string | null }[] }>("/reports/z"),
  zReport: (n: number) => ebm<{ data: EbmDailyReport }>(`/reports/z/${n}`),
  plu: (from: string, to: string) => ebm<{ data: EbmPluReport }>(`/reports/plu?from_date=${from}&to_date=${to}`),
  stock: (day: string) => ebm<{ data: { day: string; items: { product_id: string; name: string; quantity: number }[] } }>(`/reports/stock?day=${day}`),
  discard: (id: string) => ebm<{ data: EbmInvoice }>(`/invoices/${encodeURIComponent(id)}/discard`, post()),
};

/** "20261108143005" → "08/11/2026" and "14:30:05" (CIS spec §7.24.2: Date: dd/mm/yyyy Time: hh:mm:ss). */
export function ebmDateTime(stamp: string | null | undefined): { date: string; time: string } {
  const s = stamp || "";
  if (s.length < 14) return { date: "", time: "" };
  return { date: `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`, time: `${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}` };
}

/** The EBM part of a printed receipt, from RRA's answer. `copy` marks a reprint. */
export function ebmReceiptOf(inv: EbmInvoice, sellerTin: string | null | undefined, copy = false): EbmReceipt {
  const { date, time } = ebmDateTime(inv.signed_at_rra);
  const cis = ebmDateTime(inv.issued_at_cis);
  return {
    label: inv.label,
    sellerTin: sellerTin || null,
    customerTin: inv.customer_tin,
    customerPhone: inv.customer_phone,
    invoiceNo: inv.invoice_no,
    originalInvoiceNo: inv.original_invoice_no,
    receiptNo: inv.receipt_no,
    totalReceiptNo: inv.total_receipt_no,
    internalData: inv.internal_data_grouped,
    signature: inv.signature_grouped,
    sdcId: inv.sdc_id,
    mrcNo: inv.mrc_no,
    cashier: inv.cashier,
    date, time,
    cisDate: cis.date, cisTime: cis.time,
    taxes: inv.taxes,
    totalTax: inv.total_tax,
    copy,
    qrSvg: qrSvg(inv.qr_text),
  };
}

/** The receipt's item lines as RRA has them (with each line's tax type). */
export const ebmLinesOf = (inv: EbmInvoice): ReceiptLine[] =>
  inv.lines.map((l) => ({ name: l.name, quantity: Number(l.quantity), unitPrice: Number(l.unit_price), total: Number(l.total), tax: l.tax_type, code: l.item_code }));
