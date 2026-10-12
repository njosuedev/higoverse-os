"use client";

import { useSyncExternalStore } from "react";

// Settings → Printing. What receipts show is the business's choice (saved on
// the server, settings-service print_settings); the paper is this device's,
// since each computer or phone prints on its own printer.

export interface PrintSettings {
  showLogo: boolean;
  showAddress: boolean;
  showPhone: boolean;
  /** The receipt's closing line; empty uses the standard "Thank you". */
  receiptFooter: string;
  /** A QR code with the receipt's details. */
  showQr: boolean;
}

export const PRINT_DEFAULTS: PrintSettings = { showLogo: true, showAddress: true, showPhone: true, receiptFooter: "", showQr: true };

/** The server's print_settings ({show_logo, …}) as PrintSettings. */
export function printSettingsFrom(raw: unknown): PrintSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const flag = (k: string, d: boolean) => (typeof r[k] === "boolean" ? (r[k] as boolean) : d);
  return {
    showLogo: flag("show_logo", true),
    showAddress: flag("show_address", true),
    showPhone: flag("show_phone", true),
    receiptFooter: typeof r.receipt_footer === "string" ? r.receipt_footer : "",
    showQr: flag("show_qr", true),
  };
}

/** PrintSettings in the server's shape. */
export const printSettingsBody = (p: PrintSettings) => ({
  show_logo: p.showLogo, show_address: p.showAddress, show_phone: p.showPhone, receipt_footer: p.receiptFooter.trim() || null,
  show_qr: p.showQr,
});

// ── This device's receipt paper ──
export type ReceiptPaper = "80" | "58" | "a4";
const PAPER_KEY = "hgv_receipt_paper";
const listeners = new Set<() => void>();

function readPaper(): ReceiptPaper {
  try {
    const v = localStorage.getItem(PAPER_KEY);
    return v === "58" || v === "a4" ? v : "80";
  } catch { return "80"; }
}

export function setReceiptPaper(p: ReceiptPaper) {
  try { localStorage.setItem(PAPER_KEY, p); } catch { /* private mode: this visit only */ }
  listeners.forEach((l) => l());
}

/** The receipt paper chosen on this device (80 mm thermal by default). */
export function useReceiptPaper(): ReceiptPaper {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    readPaper,
    () => "80",
  );
}

export { readPaper as receiptPaper };
