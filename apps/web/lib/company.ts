// A company's identity details as forms edit them: phone, TIN, the address
// text (its map pin kept aside) and the description text (inside the JSON
// the description field stores). Mirrors backend/auth-service/app/core/company.py.

import { formatPublicAddress, parseShopAddress } from "@/lib/product-meta";

/** TIN: exactly 9 digits (Rwanda Revenue Authority). Returns an i18n key or null. */
export function tinError(value: string, required = true): string | null {
  const v = value.replace(/[\s-]/g, "");
  if (!v) return required ? "company.err_tin_required" : null;
  return /^\d{9}$/.test(v) ? null : "company.err_tin";
}

export const cleanTin = (value: string) => value.replace(/[\s-]/g, "");

/** The phone in international form (+250…), or null when it isn't valid. */
export function normalizePhone(value: string): string | null {
  const raw = value.trim();
  if (!raw || !/^\+?[\d\s().-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  let intl: string;
  if (raw.startsWith("+")) intl = digits;
  else if (digits.startsWith("250") && digits.length === 12) intl = digits;
  else if (digits.startsWith("0")) intl = "250" + digits.slice(1);
  else intl = "250" + digits;
  if (intl.startsWith("250")) {
    // Mobile 072/073/078/079 or a fixed line 02X.
    if (!/^(7[2389]\d{7}|2\d{8})$/.test(intl.slice(3))) return null;
  } else if (intl.length < 8 || intl.length > 15) return null;
  return "+" + intl;
}

export function phoneError(value: string): string | null {
  if (!value.trim()) return "company.err_phone_required";
  return normalizePhone(value) ? null : "company.err_phone";
}

/** "+250 788 123 456" — easier to read than the stored +250788123456. */
export function prettyPhone(value: string | null | undefined): string {
  const v = (value || "").trim();
  const m = /^\+250(\d{3})(\d{3})(\d{3})$/.exec(v);
  return m ? `+250 ${m[1]} ${m[2]} ${m[3]}` : v;
}

/** The shop's TIN: its own field, else one an older shop kept in its address. */
export function shopTin(shop: { tin?: string | null; address?: string | null } | null | undefined): string {
  return shop?.tin || parseShopAddress(shop?.address).tin || "";
}

/** The address as people read it, and its map pin (kept when the text is edited). */
export function splitAddress(raw: string | null | undefined): { text: string; lat: number | null; lng: number | null } {
  const { lat, lng } = parseShopAddress(raw);
  return { text: formatPublicAddress(raw), lat, lng };
}

/** Back to the stored form: the text, with the map pin if there was one. */
export function joinAddress(text: string, lat: number | null, lng: number | null): string {
  const t = text.trim();
  return lat != null && lng != null ? `${t}|Lat:${lat.toFixed(6)}|Lng:${lng.toFixed(6)}` : t;
}

/** Puts the description text back into the stored JSON, keeping its other keys. */
export function mergeDescription(rawStored: string | null | undefined, text: string): string {
  try {
    const parsed = rawStored ? JSON.parse(rawStored) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return JSON.stringify({ ...parsed, _d: text });
    }
  } catch { /* stored as plain text */ }
  return text;
}

// ── Bank account (Settings → Bank account; printed on every proforma) ──────

export interface BankAccount {
  /** Set by the server once saved; proformas refer to accounts by it. */
  id?: string;
  bank_name: string; bank_account: string; bank_holder: string;
  /** The account a new proforma starts with. */
  is_default?: boolean;
}

/** Banks most Rwandan businesses use; any other name can be typed. */
export const RWANDA_BANKS = [
  "Bank of Kigali", "Equity Bank", "I&M Bank", "BPR Bank", "Access Bank", "Ecobank", "NCBA Bank",
  "GT Bank", "Cogebanque", "AB Bank", "Unguka Bank", "Zigama CSS", "Urwego Bank", "BRD",
];

/** Field → i18n key of the problem. All three are needed when `required`. */
export function bankErrors(b: BankAccount, required: boolean): Partial<Record<keyof BankAccount, string>> {
  const e: Partial<Record<keyof BankAccount, string>> = {};
  const name = b.bank_name.trim(), acc = b.bank_account.trim(), holder = b.bank_holder.trim();
  const any = !!(name || acc || holder);
  if (!required && !any) return e;
  if (name.length < 2) e.bank_name = "bank.err_name";
  const digits = acc.replace(/\D/g, "");
  if (!acc) e.bank_account = "bank.err_account_required";
  else if (!/^[0-9][0-9 -]*[0-9]$/.test(acc) || digits.length < 6 || digits.length > 30) e.bank_account = "bank.err_account";
  if (holder.length < 2) e.bank_holder = "bank.err_holder";
  return e;
}

export const bankComplete = (b: BankAccount | null | undefined) =>
  !!b && !!b.bank_name.trim() && !!b.bank_account.trim() && !!b.bank_holder.trim();

/** As printed on the proforma ("Bank account" row). */
export function bankText(b: BankAccount, t: (k: string) => string): string {
  return `${b.bank_name.trim()} · ${t("bank.account_no")}: ${b.bank_account.trim()}\n${t("bank.holder")}: ${b.bank_holder.trim()}`;
}
