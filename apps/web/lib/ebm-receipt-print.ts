// RRA EBM data on Higoverse's own receipt and A4 invoice (lib/receipt-print):
// what RRA's "Technical Specification of CIS for VSDC" (v1.0, March 2018)
// requires on every receipt — §4 minimum content, §7.22–7.29 tax lines / SDC
// block / item counter / RRA logo, §11 COPY marking, §13.1 sale (NS), §14.1
// refund (NR), §15.1 copy. RRA's labels stay in English, as on every EBM
// receipt. Pure helpers; the layouts live in receipt-print.ts.

import type { ReceiptData } from "./receipt-print";

/** What RRA's VSDC signed, plus the CIS's own receipt number and time. */
export interface EbmReceipt {
  label: "NS" | "NR";
  sellerTin?: string | null;
  customerTin?: string | null;
  customerPhone?: string | null;
  /** The CIS receipt number (invcNo) and, for refunds, the sale's. */
  invoiceNo: number;
  originalInvoiceNo?: number | null;
  /** RRA's counters: per receipt type / all receipts. */
  receiptNo: number | null;
  totalReceiptNo: number | null;
  /** Internal data and signature, already in groups of four. */
  internalData: string;
  signature: string;
  sdcId: string | null;
  mrcNo: string | null;
  cashier?: string | null;
  /** dd/mm/yyyy and hh:mm:ss: stamped by the VSDC, and by Higoverse (CIS). */
  date: string;
  time: string;
  cisDate?: string;
  cisTime?: string;
  taxes: Record<string, { label: string; rate: number; taxable: number; tax: number }>;
  totalTax: number;
  /** A reprint (§7.18): marked COPY, "THIS IS NOT AN OFFICIAL RECEIPT". */
  copy?: boolean;
  /** RRA's data as a QR code (SVG). */
  qrSvg?: string | null;
}

/** The RRA emblem printed on every receipt (§7.29), from the app's own files. */
export const RRA_LOGO = "/rra-emblem.png";

/** Absolute URL of a public file (the print frame has no base URL of its own). */
export const ebmAbs = (path: string) => (typeof window !== "undefined" ? new URL(path, window.location.origin).href : path);

/** Two decimals, dot separator, thousands grouped (§24.4.1 data format). */
export const ebmDec = (n: unknown) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Everything the layouts print from RRA's signature. */
export function ebmParts(r: ReceiptData) {
  const e = r.ebm!;
  const refund = e.label === "NR";
  // Refunds contain only negative amounts (§14); zero stays 0.00.
  const sgn = (n: unknown) => `${refund && Number(n) ? "-" : ""}${ebmDec(n)}`;
  const total = r.lines.reduce((s, l) => s + (Number(l.total) || 0), 0);
  // §7.22: every rate above 0 always; §7.23: a 0 rate only when used.
  const taxLines = ["A", "B", "C", "D"].flatMap((k) => {
    const x = e.taxes[k];
    if (!x || !(Number(x.rate) > 0 || Number(x.taxable) !== 0)) return [];
    const rows: [string, string][] = [[`TOTAL ${x.label}`, sgn(x.taxable)]];
    if (Number(x.rate) > 0) rows.push([`TOTAL TAX ${k}`, sgn(x.tax)]);
    return rows;
  });
  // The SDC block (§7.24–7.26), then the CIS's own number, time and MRC.
  const sdc = [
    `Date: ${e.date}  Time: ${e.time}`,
    `SDC ID: ${e.sdcId || ""}`,
    `RECEIPT NUMBER: ${e.receiptNo ?? ""}/${e.totalReceiptNo ?? ""} ${e.label}`,
  ];
  const cis = [
    `RECEIPT NUMBER: ${e.invoiceNo}`,
    `DATE: ${e.cisDate || e.date}  TIME: ${e.cisTime || e.time}`,
    `MRC: ${e.mrcNo || ""}`,
  ];
  return { e, refund, sgn, total, taxLines, items: r.lines.length, sdc, cis };
}
