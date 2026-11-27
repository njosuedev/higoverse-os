// The car rental agreement as a Word document (.docx): the same content as
// the printed one (lib/rental-print.ts, agreementDoc), in the company's own
// wording, as ordinary editable text, so it can be changed in Word before
// it is signed. A blank not filled from the rental is a line of underscores.
//
// The `docx` library is loaded only when someone downloads one.

import type * as Docx from "docx";
import { pngOf, qrPng } from "./proforma-docx";
import type { PrintShop } from "./proforma-print";
import type { Rental } from "./rental-api";
import { agreementDoc, type AgreementLang, type AgreementSeg, type AgreementTemplates } from "./rental-print";

const PAGE_W = 11906, PAGE_H = 16838;   // A4, twentieths of a point
const MM = 56.7;                        // twentieths of a point per mm
const FONT = "Times New Roman";
const SIZE = 24;                        // 12 pt, in half-points

/** Builds the .docx file for a rental agreement. */
export async function rentalAgreementDocx(
  r: Rental, shop: PrintShop, lang: AgreementLang, template?: AgreementTemplates | null,
): Promise<Blob> {
  const d = await import("docx");
  const {
    AlignmentType, BorderStyle, Document, ImageRun, LevelFormat, Packer, Paragraph, Table, TableCell, TableLayoutType,
    TableRow, TextRun, WidthType,
  } = d;
  const doc = agreementDoc(r, shop, lang, template);
  const w = doc.words;

  const [logo, qr] = await Promise.all([
    shop.logo_url ? pngOf(shop.logo_url) : Promise.resolve(null),
    r.doc_code ? qrPng(r.doc_code) : Promise.resolve(null),
  ]);

  const run = (text: string, o: { bold?: boolean; size?: number; color?: string } = {}) =>
    new TextRun({ text, bold: o.bold, size: o.size ?? SIZE, color: o.color, font: FONT });
  const runs = (segs: AgreementSeg[], o: { bold?: boolean; size?: number } = {}) =>
    segs.map((s) => ("blank" in s
      ? run("_".repeat(Math.max(6, Math.round(s.blank / 2.2))), o)
      : run(s.text, { ...o, bold: o.bold || s.bold })));
  const para = (children: Docx.ParagraphChild[], o: { before?: number; after?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; keepNext?: boolean } = {}) =>
    new Paragraph({ children, alignment: o.align, keepNext: o.keepNext, spacing: { before: o.before ?? 0, after: o.after ?? 80, line: 300 } });

  // Company header: logo, name, TIN, phone, address; the rental number on the right.
  const head: Docx.Paragraph[] = [];
  if (logo) {
    const h = 80, wd = Math.min(150, Math.round((logo.w / logo.h) * h));
    head.push(para([new ImageRun({ type: "png", data: logo.data, transformation: { width: wd, height: Math.round((wd / (logo.w / logo.h))) } })], { after: 60 }));
  }
  head.push(para([run(shop.name || "", { bold: true, size: 26 })], { after: 20 }));
  if (shop.tin) head.push(para([run(`${w.tinL}: `, { bold: true }), run(shop.tin)], { after: 0 }));
  if (shop.phone) head.push(para([run(`${w.telL}: `, { bold: true }), run(shop.phone)], { after: 0 }));
  if (shop.address) head.push(para([run(`${w.addrL}: `, { bold: true }), run(shop.address)], { after: 0 }));
  head.push(para([run(r.rental_no, { size: 19, color: "444444" })], { align: AlignmentType.RIGHT, before: 120, after: 0 }));

  const body: Docx.Paragraph[] = [para(runs(doc.title, { bold: true, size: 26 }), { before: 200, after: 200 })];
  let lists = 0;
  for (const b of doc.body) {
    if (b.kind === "h2") body.push(para(runs(b.segs, { bold: true }), { before: 240, after: 60, keepNext: true }));
    else if (b.kind === "p") body.push(para(runs(b.segs)));
    else {
      const instance = ++lists;
      for (const item of b.items) {
        body.push(new Paragraph({
          children: runs(item),
          spacing: { after: 40, line: 300 },
          ...(b.kind === "ul" ? { bullet: { level: 0 } } : { numbering: { reference: "agreement-num", level: 0, instance } }),
        }));
      }
    }
  }

  // Signatures: the company (left) and the renter (right).
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
  const contentW = PAGE_W - Math.round(40 * MM);
  const colW = Math.round(contentW / 2);
  const line = (label: string, value?: string | null, mm = 50) =>
    para([run(`${label}: `), value?.trim() ? run(value.trim(), { bold: true }) : run("_".repeat(Math.round(mm / 2.2)))], { after: 140 });
  const col = (children: Docx.Paragraph[]) => new TableCell({
    children, width: { size: colW, type: WidthType.DXA }, borders: noBorders,
    margins: { top: 60, bottom: 60, left: 0, right: 200 },
  });
  const sign = new Table({
    layout: TableLayoutType.FIXED, width: { size: contentW, type: WidthType.DXA }, columnWidths: [colW, colW], borders: noBorders,
    rows: [new TableRow({ cantSplit: true, children: [
      col([
        para([run(w.lessor, { bold: true })], { after: 0 }), para([run(shop.name || "")], { after: 160 }),
        line(w.name, null, 52), line(w.signStamp, null, 40), line(w.date, null, 56),
      ]),
      col([
        para([run(w.renterRole, { bold: true })], { after: 0 }), para([run(r.customer || "")], { after: 160 }),
        line(w.idNo, r.customer_id_no, 44), line(w.telL, r.customer_phone, 46), line(w.addrL, r.customer_address, 48),
        line(w.sign, null, 56), line(w.date, null, 58),
      ]),
    ] })],
  });
  const tail: Docx.Paragraph[] = qr ? [
    para([new ImageRun({ type: "png", data: qr, transformation: { width: 90, height: 90 } })], { align: AlignmentType.CENTER, before: 400, after: 20 }),
    para([run(w.qr, { size: 16, color: "555555" })], { align: AlignmentType.CENTER }),
  ] : [];

  const file = new Document({
    creator: shop.name,
    title: `${doc.title.map((s) => ("blank" in s ? "" : s.text)).join("")} ${r.rental_no}`.trim(),
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    numbering: { config: [{
      reference: "agreement-num",
      levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
    }] },
    sections: [{
      properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: Math.round(18 * MM), bottom: Math.round(16 * MM), left: Math.round(20 * MM), right: Math.round(20 * MM) } } },
      children: [...head, ...body, para([], { after: 120 }), sign, ...tail],
    }],
  });
  return Packer.toBlob(file);
}

/** Builds the .docx and saves it as "<title> <rental number>.docx". */
export async function downloadRentalAgreementDocx(...args: Parameters<typeof rentalAgreementDocx>): Promise<void> {
  const [r, shop, lang, template] = args;
  const blob = await rentalAgreementDocx(r, shop, lang, template);
  const title = agreementDoc(r, shop, lang, template).title.map((s) => ("blank" in s ? "" : s.text)).join("").trim();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${title || "Rental agreement"} ${r.rental_no}.docx`.replace(/[\\/:*?"<>|]+/g, "-");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
