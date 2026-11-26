"use client";

// Expenses not supported by EBM, ready for the RRA Tax Ledger (E-Tax ›
// Annexure download › Ledger Account). RRA counts an expense in the income
// tax declaration only if it has an EBM receipt, a withholding tax (WHT) or
// customs (DMC) declaration, or is lodged in the Tax Ledger with its
// supporting documents. Expenses marked "No EBM" (expense-service
// ebm_support = "none") are listed here with who was paid, their TIN/ID, the
// document number and why there is no EBM, then exported as:
//   - an Excel schedule (rows to copy into RRA's Ledger Account annex), and
//   - a PDF pack: the signed schedule, then every receipt photo as an annex
//     (PDF receipts are downloaded beside it, named by their row number).

import { expenseRequest } from "@/lib/expense-api";
import { companySheet, getPrintShop, imageForPdf, pdfCompanyHeader } from "@/lib/print-shop";
import { stampPdf } from "@/lib/printed-doc";

export type Support = "ebm" | "wht" | "dmc" | "none";
export const SUPPORTS: Support[] = ["ebm", "wht", "dmc", "none"];
export type NoEbmReason = "bank" | "abroad" | "government" | "unregistered" | "other";
export const NO_EBM_REASONS: NoEbmReason[] = ["unregistered", "bank", "government", "abroad", "other"];

/** English names, for the documents RRA receives. */
export const REASON_EN: Record<NoEbmReason, string> = {
  unregistered: "Supplier not registered for EBM (individual / informal)",
  bank: "Bank charges and fees",
  government: "Government institution (no EBM)",
  abroad: "Service bought abroad",
  other: "Other",
};
const METHOD_EN: Record<string, string> = { cash: "Cash", mtn: "MTN MoMo", bank: "Bank" };

export interface RraItem {
  id: string; title: string; amount: number; expense_date: string; notes?: string | null;
  category: string; payment_method?: string | null; bank_name?: string | null; receiver_phone?: string | null;
  supplier_name?: string | null; supplier_tin?: string | null; doc_ref?: string | null; no_ebm_reason?: NoEbmReason | null;
  proof_count: number; proof_names: string[]; missing: ("proof" | "supplier_name" | "reason" | "supplier_tin" | "doc_ref")[];
}

export async function loadRraLedger(from: string, to: string): Promise<{ items: RraItem[]; total: number }> {
  const res = await expenseRequest(`/expenses/rra-ledger?from_date=${from}&to_date=${to}`);
  return { items: res?.data?.items ?? [], total: Number(res?.data?.total ?? 0) };
}

const day = (s: string) => (s || "").slice(0, 10);
const money = (n: number) => Math.round(n).toLocaleString("en-US");
const paidBy = (i: RraItem) => [METHOD_EN[i.payment_method ?? ""] ?? i.payment_method ?? "", i.bank_name ?? ""].filter(Boolean).join(" · ");
const fileStem = (p: { from: string; to: string }) => `RRA_tax_ledger_${p.from}_${p.to}`;

function rows(items: RraItem[]) {
  return items.map((i, n) => ({
    "No.": n + 1,
    Date: day(i.expense_date),
    "Supplier / payee": i.supplier_name ?? "",
    "Supplier TIN / ID": i.supplier_tin ?? "",
    "Description of goods or service": i.title + (i.notes ? ` (${i.notes})` : ""),
    "Reason no EBM": i.no_ebm_reason ? REASON_EN[i.no_ebm_reason] : "",
    "Document reference": i.doc_ref ?? "",
    "Paid by": paidBy(i),
    Amount: Math.round(i.amount * 100) / 100,
    "Supporting documents": i.proof_count ? `${i.proof_count} attached (Annex ${n + 1})` : "MISSING",
  }));
}

// ── Excel ────────────────────────────────────────────────────────────────

export async function exportRraExcel(items: RraItem[], p: { from: string; to: string; currency: string }) {
  const XLSX = await import("xlsx");
  const shop = await getPrintShop();
  const total = items.reduce((s, i) => s + i.amount, 0);
  const sub = `Period ${p.from} to ${p.to}  |  ${items.length} expenses  |  Total ${money(total)} ${p.currency}  |  For E-Tax › Annexure download › Ledger Account`;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, companySheet(XLSX, shop, "Expenses not supported by EBM", sub, rows(items)), "RRA Tax Ledger");
  const byReason = NO_EBM_REASONS.map((r) => {
    const list = items.filter((i) => (i.no_ebm_reason ?? "other") === r);
    return { "Reason no EBM": REASON_EN[r], Expenses: list.length, Amount: list.reduce((s, i) => s + i.amount, 0) };
  }).filter((r) => r.Expenses);
  byReason.push({ "Reason no EBM": "TOTAL", Expenses: items.length, Amount: total });
  XLSX.utils.book_append_sheet(wb, companySheet(XLSX, shop, "Summary by reason", sub, byReason), "Summary");
  XLSX.writeFile(wb, `${fileStem(p)}.xlsx`);
}

// ── PDF pack ─────────────────────────────────────────────────────────────

/** A receipt photo as a JPEG for the PDF, at most 1600 px (readable, not huge). */
async function photoForPdf(dataUrl: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const img = new Image();
    await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = dataUrl; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext("2d");
    if (!g) return null;
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL("image/jpeg", 0.82), w: c.width, h: c.height };
  } catch { return null; }
}

function download(dataUrl: string, name: string) {
  const a = document.createElement("a");
  a.href = dataUrl; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

export async function exportRraPdf(
  items: RraItem[],
  p: { from: string; to: string; currency: string; preparedBy: string; onProgress?: (done: number, all: number) => void },
): Promise<{ separateFiles: number }> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const shop = await getPrintShop();
  const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
  const ink: [number, number, number] = [22, 36, 58];
  const total = items.reduce((s, i) => s + i.amount, 0);

  const startY = pdfCompanyHeader(doc, shop, await imageForPdf(shop.logo_url), "Expenses not supported by EBM",
    `RRA Tax Ledger  |  Period ${p.from} to ${p.to}  |  ${items.length} expenses  |  ${p.currency}`);
  const body = rows(items).map((r) => [r["No."], r.Date, r["Supplier / payee"], r["Supplier TIN / ID"] || "-",
    r["Description of goods or service"], r["Reason no EBM"], r["Document reference"] || "-", r["Paid by"] || "-",
    money(r.Amount), r["Supporting documents"]]);
  autoTable(doc, {
    startY,
    head: [["No.", "Date", "Supplier / payee", "TIN / ID", "Description", "Reason no EBM", "Doc. ref.", "Paid by", `Amount (${p.currency})`, "Documents"]],
    body,
    foot: [["", "", "", "", "", "", "", "TOTAL", money(total), ""]],
    styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
    headStyles: { fillColor: ink, textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: ink, textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 9 }, 1: { cellWidth: 18 }, 8: { halign: "right", cellWidth: 24 }, 9: { cellWidth: 28 } },
    didParseCell: (d) => { if (d.section === "body" && d.column.index === 9 && d.cell.raw === "MISSING") d.cell.styles.textColor = [200, 30, 30]; },
    margin: { left: 10, right: 10 },
  });

  // Totals by reason, then the declaration and signatures.
  type Doc = { lastAutoTable?: { finalY?: number } };
  let y = ((doc as unknown as Doc).lastAutoTable?.finalY ?? startY) + 6;
  const byReason = NO_EBM_REASONS.map((r) => {
    const list = items.filter((i) => (i.no_ebm_reason ?? "other") === r);
    return [REASON_EN[r], String(list.length), money(list.reduce((s, i) => s + i.amount, 0))];
  }).filter((r) => r[1] !== "0");
  if (y > PH - 70) { doc.addPage(); y = 16; }
  autoTable(doc, {
    startY: y, head: [["Reason no EBM", "Expenses", `Amount (${p.currency})`]], body: byReason,
    styles: { fontSize: 7.5, cellPadding: 1.5 }, headStyles: { fillColor: [235, 242, 253], textColor: ink, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } }, margin: { left: 10 }, tableWidth: 130,
  });
  y = ((doc as unknown as Doc).lastAutoTable?.finalY ?? y) + 8;
  if (y > PH - 40) { doc.addPage(); y = 16; }
  doc.setFontSize(8); doc.setTextColor(40, 40, 40); doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(
    `We declare that the expenses listed above were incurred for the business${shop.name ? ` of ${shop.name}` : ""}${shop.tin ? ` (TIN ${shop.tin})` : ""} ` +
    `during the period ${p.from} to ${p.to}, that no EBM receipt, withholding tax or customs declaration exists for them, and that the ` +
    "supporting documents in the annex are true copies of the originals kept by the business.", PW - 20), 10, y);
  y += 14;
  const sign = (x: number, role: string, name: string) => {
    doc.setFont("helvetica", "bold"); doc.text(role, x, y);
    doc.setFont("helvetica", "normal");
    doc.text(`Name: ${name || "...................................................."}`, x, y + 7);
    doc.text("Signature: ...........................................", x, y + 14);
    doc.text("Date: ......................................................", x, y + 21);
  };
  sign(10, "Prepared by (Accountant)", p.preparedBy);
  sign(PW / 2, "Approved by (Owner / Managing Director)", "");

  // Annexes: every document, under its row number.
  let separateFiles = 0;
  for (let n = 0; n < items.length; n++) {
    const it = items[n];
    p.onProgress?.(n, items.length);
    if (!it.proof_count) continue;
    let files: { name: string; type: string; data: string }[] = [];
    try { files = (await expenseRequest(`/expenses/${it.id}/proof`))?.data?.files ?? []; } catch { files = []; }
    for (let f = 0; f < files.length; f++) {
      const file = files[f];
      doc.addPage();
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...ink);
      doc.text(`Annex ${n + 1}${files.length > 1 ? `.${f + 1}` : ""}  ·  ${day(it.expense_date)}  ·  ${money(it.amount)} ${p.currency}`, 10, 12);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(90, 98, 112);
      doc.text(`${it.supplier_name ?? ""}${it.supplier_tin ? ` (TIN/ID ${it.supplier_tin})` : ""}  ·  ${it.title}${it.doc_ref ? `  ·  Ref. ${it.doc_ref}` : ""}`, 10, 17, { maxWidth: PW - 20 });
      const photo = file.type.startsWith("image/") ? await photoForPdf(file.data) : null;
      if (photo) {
        const k = Math.min((PW - 20) / photo.w, (PH - 30) / photo.h);
        doc.addImage(photo.data, "JPEG", (PW - photo.w * k) / 2, 22, photo.w * k, photo.h * k);
      } else {
        const name = `${fileStem(p)}_annex_${n + 1}${files.length > 1 ? `-${f + 1}` : ""}.pdf`;
        if (file.type === "application/pdf") { download(file.data, name); separateFiles++; }
        doc.setFontSize(10); doc.setTextColor(40, 40, 40);
        doc.text(file.type === "application/pdf"
          ? `This document is a PDF, provided with this pack as the file "${name}" (original name: ${file.name}).`
          : `Document "${file.name}" could not be included.`, 10, 32, { maxWidth: PW - 20 });
      }
    }
  }
  p.onProgress?.(items.length, items.length);
  await stampPdf(doc, { kind: "rra_ledger", title: "Expenses not supported by EBM (RRA Tax Ledger)",
    period_from: p.from, period_to: p.to, records: items.length, total, currency: p.currency });
  doc.save(`${fileStem(p)}.pdf`);
  return { separateFiles };
}
