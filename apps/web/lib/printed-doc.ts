// The QR code on every list Higoverse prints as a PDF (expenses, income,
// sales, purchases, stock, partners…). The list is noted once on the server
// (sale-service POST /sales/printed), which gives a signed code (kind "D",
// lib/doc-qr.ts): scanned in the Higoverse app it says the document is
// genuine, from this business, and what it held. The code is drawn after the
// last table, on a new page if there's no room.

import QRCode from "qrcode";
import { saleRequest } from "@/lib/sale-api";

export interface PrintedMeta {
  /** expenses, income, sales, purchases, inventory, partners… */
  kind: string;
  title: string;
  period_from?: string | null;
  period_to?: string | null;
  records?: number | null;
  total?: number | null;
  currency?: string | null;
}

/** The parts of jsPDF used here (works whatever unit the document uses). */
interface PdfDoc {
  internal: { pageSize: { getWidth(): number; getHeight(): number }; scaleFactor: number };
  getNumberOfPages(): number;
  setPage(n: number): unknown;
  addPage(): unknown;
  addImage(data: string, format: string, x: number, y: number, w: number, h: number): unknown;
  setFontSize(n: number): unknown;
  setTextColor(r: number, g?: number, b?: number): unknown;
  setFont(name: string, style?: string): unknown;
  text(text: string | string[], x: number, y: number, opts?: Record<string, unknown>): unknown;
}

/** Notes the list and draws its QR code; the PDF still saves if this fails. */
export async function stampPdf(doc: PdfDoc, meta: PrintedMeta): Promise<void> {
  let code: string | null = null;
  try {
    const res = await saleRequest("/sales/printed", { method: "POST", body: JSON.stringify(meta) });
    code = res?.data?.code ?? null;
  } catch { /* printed without a QR */ }
  if (!code) return;
  let png: string;
  try { png = await QRCode.toDataURL(code, { errorCorrectionLevel: "M", margin: 1, width: 300 }); }
  catch { return; }

  const mm = (n: number) => (n * 72) / 25.4 / doc.internal.scaleFactor;   // millimetres → the document's unit
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const size = mm(24), left = mm(14), bottom = mm(14);
  doc.setPage(doc.getNumberOfPages());
  const after = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY;
  let y = (after ?? H - bottom - size - mm(10)) + mm(6);
  if (y + size > H - bottom) { doc.addPage(); y = mm(16); }
  doc.addImage(png, "PNG", left, y, size, size);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(30, 30, 30);
  doc.text("Higoverse document check", left + size + mm(3), y + mm(7));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(90, 90, 90);
  doc.text(["Scan this code in the Higoverse app to confirm", "this document is genuine and from this business."],
    left + size + mm(3), y + mm(11.5), { maxWidth: W - left - size - mm(20) });
}
