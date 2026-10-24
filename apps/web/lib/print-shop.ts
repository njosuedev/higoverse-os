"use client";

import { getMyShop } from "@/lib/shop-api";
import { decodeShopHumanInfo, formatPublicAddress } from "@/lib/product-meta";
import { prettyPhone, shopTin } from "@/lib/company";
import type { PrintShop } from "@/lib/proforma-print";

/** The company's details for the top of exported documents (as on pay slips). */
export async function getPrintShop(): Promise<PrintShop> {
  const s = await getMyShop().catch(() => null);
  if (!s) return { name: "" };
  return {
    name: s.name || "", phone: prettyPhone(s.phone), address: formatPublicAddress(s.address), logo_url: s.logo_url,
    email: s.email || decodeShopHumanInfo(s.description).email, tin: shopTin(s),
  };
}

/** The company's details as text lines: TIN, Tel · email, address. */
export function printShopLines(shop: PrintShop): string[] {
  return [
    shop.tin ? `TIN: ${shop.tin}` : "",
    [shop.phone && `Tel: ${shop.phone}`, shop.email].filter(Boolean).join("  ·  "),
    shop.address || "",
  ].filter(Boolean);
}

/** An image as a data URL with its size (for a PDF), or null when it can't be loaded. */
export async function imageForPdf(url: string | undefined): Promise<{ data: string; w: number; h: number } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string>((ok, fail) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.onerror = fail;
      r.readAsDataURL(blob);
    });
    const img = new Image();
    await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = data; });
    // Redrawn as a PNG at most 300 px wide or high: jsPDF takes PNG/JPEG
    // (not webp, svg…), and a big logo would make every export heavy.
    const w0 = img.naturalWidth || 200, h0 = img.naturalHeight || 200;
    const k = Math.min(1, 300 / Math.max(w0, h0));
    const c = document.createElement("canvas");
    c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL("image/png"), w: c.width, h: c.height };
  } catch { return null; }
}

type PdfImage = { data: string; w: number; h: number } | null;
/** Just what pdfCompanyHeader uses of a jsPDF document. */
interface PdfDoc {
  internal: { pageSize: { getWidth(): number } };
  setFont(f: string, s: string): unknown;
  setFontSize(n: number): unknown;
  setTextColor(r: number, g: number, b: number): unknown;
  setDrawColor(r: number, g: number, b: number): unknown;
  setLineWidth(n: number): unknown;
  line(x1: number, y1: number, x2: number, y2: number): unknown;
  text(s: string, x: number, y: number, o?: Record<string, unknown>): unknown;
  addImage(data: string, x: number, y: number, w: number, h: number): unknown;
}

/** Draws the company letterhead (logo, name, details), then [title] and
 *  [subtitle], at the top of a PDF page. Returns where the content starts. */
export function pdfCompanyHeader(doc: PdfDoc, shop: PrintShop, logo: PdfImage, title: string, subtitle: string): number {
  const PW = doc.internal.pageSize.getWidth();
  let x = 14;
  let y = 14;
  if (logo) {
    const box = 20;
    const k = Math.min(box / logo.w, box / logo.h);
    try { doc.addImage(logo.data, 14, 10, logo.w * k, logo.h * k); x = 14 + logo.w * k + 5; } catch { /* unreadable image: no logo */ }
  }
  if (shop.name) {
    doc.setTextColor(22, 36, 58);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(shop.name.toUpperCase(), x, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90, 98, 112);
    for (const l of printShopLines(shop)) { y += 4.2; doc.text(l, x, y, { maxWidth: PW * 0.58 - x }); }
  }
  // The report's title and period on the right.
  doc.setTextColor(19, 114, 230);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(shop.name ? 12 : 14);
  doc.text(title.toUpperCase(), PW - 14, 14, { align: "right" });
  doc.setTextColor(90, 98, 112);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(subtitle, PW - 14, 19, { align: "right" });
  doc.text(`Generated: ${new Date().toLocaleString()}`, PW - 14, 23.5, { align: "right" });
  y = Math.max(y, logo ? 30 : 24, 24) + 3;
  doc.setDrawColor(19, 114, 230);
  doc.setLineWidth(0.4);
  doc.line(14, y, PW - 14, y);
  doc.setTextColor(0, 0, 0);
  return y + 5;
}

/** A sheet with the company name and details, the title and subtitle on
 *  top, then [rows] as a table (one column per key). */
export function companySheet(
  XLSX: typeof import("xlsx"), shop: PrintShop, title: string, subtitle: string, rows: Record<string, unknown>[],
) {
  const top: string[][] = [
    ...(shop.name ? [[shop.name.toUpperCase()], ...printShopLines(shop).map((l) => [l]), []] : []),
    [title.toUpperCase()],
    [`${subtitle}  |  Generated: ${new Date().toLocaleString()}`],
    [],
  ];
  const ws = XLSX.utils.aoa_to_sheet(top);
  XLSX.utils.sheet_add_json(ws, rows, { origin: top.length });
  const cols = Math.max(1, Object.keys(rows[0] ?? {}).length);
  ws["!merges"] = top.map((_, r) => ({ s: { r, c: 0 }, e: { r, c: cols - 1 } }));
  ws["!cols"] = Object.keys(rows[0] ?? {}).map((k) => ({
    wch: Math.min(40, Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length)) + 2),
  }));
  return ws;
}

/** "Period: 2026-10-01 to 2026-10-24" (plain "to": PDF fonts have no arrow). */
export const periodText = (from: string, to: string) =>
  from || to ? `Period: ${from || "start"} to ${to || "today"}` : "Period: all time";
