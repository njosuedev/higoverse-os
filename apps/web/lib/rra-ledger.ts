"use client";

// The expense book on paper, for RRA and for the business's own files: all
// the year's expenses, as one PDF (the schedule, then every supporting
// document as an annex) or one Excel workbook (the expenses, the RRA Tax
// Ledger sheet and the totals).
//
// RRA counts an expense in the income tax declaration only if it has an EBM
// receipt, a withholding tax (WHT) or customs (DMC) declaration, or is lodged
// in the RRA Tax Ledger (E-Tax › Annexure download › Ledger Account) with its
// supporting documents: each row says which, and for one without EBM who was
// paid, their TIN/ID, the document number and why there is no EBM. Every row
// carries the expense's internal reference (001, 002…, given by
// expense-service), and an empty cell reads "N/A". PDF receipts can't be
// placed inside a PDF made in the browser: they are listed for download
// beside it (browsers block a page that starts several downloads at once).

import { expenseRequest } from "@/lib/expense-api";
import { getPrintShop, imageForPdf, pdfCompanyHeader } from "@/lib/print-shop";
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
const SUPPORT_EN: Record<Support, string> = { ebm: "EBM receipt", wht: "Withholding tax", dmc: "Customs (DMC)", none: "No EBM" };
const CATEGORY_EN: Record<string, string> = {
  rent: "Rent", utilities: "Utilities", salaries: "Salaries", supplies: "Supplies", maintenance: "Repairs & maintenance",
  marketing: "Marketing", transport: "Transport", taxes: "Taxes & licenses", other: "Other",
};
const METHOD_EN: Record<string, string> = { cash: "Cash", mtn: "MTN MoMo", bank: "Bank" };
export const NA = "N/A";
const na = (v: unknown) => (v === null || v === undefined || String(v).trim() === "" ? NA : String(v));

/** An expense as the expense service sends it (the fields used here). */
export interface BookExpense {
  id: string; voucher_no?: string | null; title: string; amount: number; expense_date: string; notes?: string | null;
  category: string; payment_method?: string | null; bank_name?: string | null; direction?: string | null;
  ebm_support?: Support | null; supplier_name?: string | null; supplier_tin?: string | null; doc_ref?: string | null;
  no_ebm_reason?: NoEbmReason | null; has_proof?: boolean;
}
export interface RraItem extends BookExpense {
  proof_count: number; proof_names: string[]; missing: ("proof" | "supplier_name" | "reason" | "supplier_tin" | "doc_ref")[];
}

export async function loadRraLedger(from: string, to: string): Promise<{ items: RraItem[]; total: number }> {
  const res = await expenseRequest(`/expenses/rra-ledger?from_date=${from}&to_date=${to}`);
  return { items: res?.data?.items ?? [], total: Number(res?.data?.total ?? 0) };
}

/** What is selected on the Expenses page: the downloads follow it exactly. */
export interface Selection {
  from: string; to: string;            // "" = no limit
  category: string; scope: string; support: string; search: string;
}

/** The selected expenses (money spent, not money received), oldest first. */
export async function loadExpenses(sel: Selection): Promise<BookExpense[]> {
  const all: BookExpense[] = [];
  for (let page = 1; page < 50; page++) {
    const q = new URLSearchParams({ page: String(page), limit: "500" });
    if (sel.from) q.set("from_date", sel.from);
    if (sel.to) q.set("to_date", sel.to);
    if (sel.category) q.set("category", sel.category);
    if (sel.scope) q.set("scope", sel.scope);
    if (sel.support) q.set("support", sel.support);
    const res = await expenseRequest(`/expenses?${q}`);
    const items: BookExpense[] = res?.data?.items ?? [];
    all.push(...items);
    if (items.length < 500) break;
  }
  const s = sel.search.trim().toLowerCase();
  return all
    .filter((e) => e.direction !== "in")
    .filter((e) => !s || [e.title, e.category, e.notes ?? "", e.voucher_no ?? ""].some((v) => v.toLowerCase().includes(s)))
    .sort((a, b) => a.expense_date.localeCompare(b.expense_date) || (a.voucher_no ?? "").localeCompare(b.voucher_no ?? ""));
}

/** The period printed on the documents: the selected dates, or the first and
 *  last expense when no date is chosen. */
export function periodOf(sel: Selection, items: BookExpense[]) {
  const days = items.map((i) => (i.expense_date || "").slice(0, 10)).filter(Boolean).sort();
  const today = new Date().toISOString().slice(0, 10);
  return { from: sel.from || days[0] || today, to: sel.to || days[days.length - 1] || today };
}

/** The filters in words, for the documents ("" when only dates are chosen). */
export function filtersText(sel: Selection): string {
  const parts: string[] = [];
  if (sel.category) parts.push(`Category: ${CATEGORY_EN[sel.category] ?? sel.category}`);
  if (sel.scope) parts.push(sel.scope === "abroad" ? "Abroad" : "In Rwanda");
  if (sel.support) parts.push(`RRA support: ${SUPPORT_EN[sel.support as Support] ?? sel.support}`);
  if (sel.search.trim()) parts.push(`Search: "${sel.search.trim()}"`);
  return parts.join("  |  ");
}

const day = (s: string) => (s || "").slice(0, 10);
const money = (n: number) => Math.round(n).toLocaleString("en-US");
const paidBy = (i: BookExpense) => [METHOD_EN[i.payment_method ?? ""] ?? i.payment_method ?? "", i.bank_name ?? ""].filter(Boolean).join(" · ");
/** No EBM: marked so, or never marked (salaries and taxes aside), as expense-service counts it. */
export const isNoEbm = (i: BookExpense) =>
  i.ebm_support === "none" || (!i.ebm_support && i.category !== "salaries" && i.category !== "taxes");
const supportOf = (i: BookExpense) => {
  if (i.ebm_support && i.ebm_support !== "none") return SUPPORT_EN[i.ebm_support];
  if (!isNoEbm(i)) return NA;
  return `No EBM${i.no_ebm_reason ? `: ${REASON_EN[i.no_ebm_reason]}` : ""}`;
};
const hasDocs = (i: BookExpense) => ("proof_count" in i ? (i as RraItem).proof_count > 0 : !!i.has_proof);

type Kind = "rra" | "all";
const TITLE: Record<Kind, string> = { rra: "Expenses not supported by EBM", all: "Expenses and supporting documents" };
const stemOf = (k: Kind, p: { from: string; to: string }) => `${k === "rra" ? "RRA_tax_ledger" : "Expenses_with_documents"}_${p.from}_${p.to}`;

/** One row per expense, in the order of the annexes. */
function rows(kind: Kind, items: BookExpense[]) {
  return items.map((i, n) => {
    const base = {
      "No.": n + 1,
      "Internal ref.": na(i.voucher_no),
      Date: day(i.expense_date),
      "Description": i.title + (i.notes ? ` (${i.notes})` : ""),
    };
    const rest = kind === "rra" ? {
      "Supplier / payee": na(i.supplier_name),
      "Supplier TIN / ID": na(i.supplier_tin),
      "Reason no EBM": i.no_ebm_reason ? REASON_EN[i.no_ebm_reason] : NA,
    } : {
      Category: CATEGORY_EN[i.category] ?? i.category,
      "RRA support": supportOf(i),
      "Paid to": na(i.supplier_name),
      "TIN / ID": na(i.supplier_tin),
    };
    return {
      ...base, ...rest,
      "Document reference": na(i.doc_ref),
      "Paid by": na(paidBy(i)),
      Amount: Math.round(i.amount * 100) / 100,
      "Supporting documents": hasDocs(i) ? `Annex ${n + 1}` : (kind === "rra" ? "MISSING" : NA),
    };
  });
}

/** Totals by reason (RRA pack) or by category (all expenses). */
function summary(kind: Kind, items: BookExpense[]) {
  const groups = new Map<string, { n: number; total: number }>();
  for (const i of items) {
    const k = kind === "rra" ? REASON_EN[i.no_ebm_reason ?? "other"] : (CATEGORY_EN[i.category] ?? i.category);
    const g = groups.get(k) ?? { n: 0, total: 0 };
    g.n++; g.total += i.amount; groups.set(k, g);
  }
  return [...groups.entries()].sort((a, b) => b[1].total - a[1].total);
}

// ── Excel ────────────────────────────────────────────────────────────────
//
// Clean tables, no company block on top: each sheet starts with its header
// row (bold, white on dark blue, frozen, with filters), amounts are numbers
// ("#,##0"), rows are lightly striped, N/A is grey, a bold TOTAL closes the
// table. Above it, a banner: the company (name, logo, TIN, phone, email,
// address), the report's title, and the period, filters, count, total and
// date. Sheets: Expenses, RRA Tax Ledger (no EBM, for E-Tax), Summary.

type XlsxCell = string | number;

async function exportExcel(kind: Kind, items: BookExpense[], p: { from: string; to: string; currency: string; filters?: string }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Higoverse";
  wb.created = new Date();
  const INK = "FF16243A", BLUE = "FF0A66C2", SOFT = "FFEBF2FD", STRIPE = "FFF7F9FC", LINE = "FFDDE3EC";
  const thin = { style: "thin" as const, color: { argb: LINE } };
  const shop = await getPrintShop();
  const logo = await imageForPdf(shop.logo_url);      // a PNG data URL, or null
  const logoId = logo ? wb.addImage({ base64: logo.data, extension: "png" }) : null;
  const total = items.reduce((s, i) => s + i.amount, 0);
  const contact = [shop.tin && `TIN: ${shop.tin}`, shop.phone && `Tel: ${shop.phone}`, shop.email, shop.address].filter(Boolean).join("     |     ");
  const generated = new Date().toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const HEAD_ROW = 6;                                   // the table's header row, under the banner

  /** One sheet: the company banner, a styled header row, the rows, then a TOTAL row. */
  const table = (name: string, title: string, head: string[], body: XlsxCell[][],
    opts: { widths: number[]; money: number[]; total?: XlsxCell[]; count: number; sum: number }) => {
    const ws = wb.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: HEAD_ROW, showGridLines: false }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: `${HEAD_ROW}:${HEAD_ROW}` },
      headerFooter: { oddFooter: `&L${(shop.name || "").replace(/&/g, "&&")}${shop.tin ? `  |  TIN ${shop.tin}` : ""}&RPage &P of &N` },
    });
    ws.columns = head.map((_, i) => ({ width: opts.widths[i] ?? 14 }));
    const last = head.length;
    const band = (row: number, text: string, style: { size: number; bold?: boolean; color: string; fill: string; height: number; italic?: boolean }) => {
      ws.mergeCells(row, 1, row, last);
      const c = ws.getCell(row, 1);
      c.value = text;
      c.font = { size: style.size, bold: style.bold, italic: style.italic, color: { argb: style.color }, name: "Calibri" };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.fill } };
      // Wrapped onto more lines when longer than the table is wide (Summary).
      const width = opts.widths.slice(0, last).reduce((s, w) => s + w, 0);
      const lines = Math.max(1, Math.ceil((text.length * (style.size / 10)) / Math.max(width, 1)));
      c.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: lines > 1 };
      ws.getRow(row).height = style.height + (lines - 1) * style.size * 1.4;
    };
    // The company, then the report.
    band(1, (shop.name || "Company").toUpperCase(), { size: 18, bold: true, color: "FFFFFFFF", fill: INK, height: 34 });
    band(2, contact || " ", { size: 10, bold: true, color: "FFFFFFFF", fill: BLUE, height: 22 });
    band(3, title.toUpperCase(), { size: 13, bold: true, color: INK, fill: SOFT, height: 24 });
    band(4, `Period: ${p.from} to ${p.to}${p.filters ? `     |     ${p.filters}` : ""}     |     ${opts.count} expenses     |     Total: ${money(opts.sum)} ${p.currency}     |     Generated: ${generated}`,
      { size: 9.5, color: "FF475569", fill: SOFT, height: 20, italic: true });
    ws.getRow(5).height = 8;
    if (logoId !== null && logo) {
      const h = 52, w = Math.round((logo.w / logo.h) * h);
      ws.addImage(logoId, { tl: { col: Math.max(last - 1, 1), row: 0.15 }, ext: { width: w, height: h } });
    }
    ws.getRow(HEAD_ROW).values = head;
    const hr = ws.getRow(HEAD_ROW);
    hr.height = 24;
    hr.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      c.border = { top: thin, bottom: thin, left: thin, right: thin };
    });
    body.forEach((values, r) => {
      const row = ws.addRow(values);
      row.eachCell({ includeEmpty: true }, (c, col) => {
        c.border = { top: thin, bottom: thin, left: thin, right: thin };
        c.alignment = { vertical: "top", wrapText: true };
        if (r % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } };
        if (opts.money.includes(col - 1)) { c.numFmt = "#,##0"; c.alignment = { vertical: "top", horizontal: "right" }; }
        if (c.value === NA) c.font = { color: { argb: "FF9AA0AA" } };
        if (c.value === "MISSING") c.font = { bold: true, color: { argb: "FFC81E1E" } };
      });
    });
    if (opts.total) {
      const row = ws.addRow(opts.total);
      row.eachCell({ includeEmpty: true }, (c, col) => {
        c.font = { bold: true, color: { argb: INK } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT } };
        c.border = { top: { style: "medium", color: { argb: INK } }, bottom: thin, left: thin, right: thin };
        if (opts.money.includes(col - 1)) { c.numFmt = "#,##0"; c.alignment = { horizontal: "right" }; }
      });
    }
    ws.autoFilter = { from: { row: HEAD_ROW, column: 1 }, to: { row: HEAD_ROW + body.length, column: head.length } };
    return ws;
  };

  /** The expense rows as cells (documents: attached or not, no annex numbers). */
  const sheetOf = (k: Kind, list: BookExpense[]) => {
    const r = rows(k, list);
    const cols = Object.keys(r[0] ?? rows(k, [{ id: "", title: "", amount: 0, expense_date: "", category: "other" }])[0]);
    const head = cols.map((c) => (c === "Amount" ? `Amount (${p.currency})` : c === "Supporting documents" ? "Supporting document" : c));
    const body = r.map((row) => cols.map((c) => {
      const v = (row as Record<string, unknown>)[c];
      if (c === "Supporting documents") return typeof v === "string" && v.startsWith("Annex") ? "Attached" : String(v);
      return typeof v === "number" ? v : String(v);
    }));
    const widthOf: Record<string, number> = {
      "No.": 6, "Internal ref.": 11, Date: 12, Description: 42, Category: 20, "RRA support": 30, "Paid to": 26, "TIN / ID": 16,
      "Supplier / payee": 26, "Supplier TIN / ID": 16, "Reason no EBM": 34, "Document reference": 20, "Paid by": 16,
      Amount: 16, "Supporting documents": 18,
    };
    const amountCol = cols.indexOf("Amount");
    const total = cols.map((c, i) => (c === "Amount" ? list.reduce((s, x) => s + x.amount, 0) : i === amountCol - 1 ? "TOTAL" : ""));
    const sum = list.reduce((s, x) => s + x.amount, 0);
    return { head, body, widths: cols.map((c) => widthOf[c] ?? 14), money: [amountCol], total, count: list.length, sum };
  };

  const main = sheetOf(kind, items);
  table(kind === "rra" ? "RRA Tax Ledger" : "Expenses", kind === "rra" ? TITLE.rra : "Expense book", main.head, main.body, main);
  if (kind === "all") {
    // The expenses without EBM on their own sheet, ready for E-Tax › Ledger Account.
    const noEbm = sheetOf("rra", items.filter(isNoEbm));
    table("RRA Tax Ledger", "RRA Tax Ledger: expenses not supported by EBM (E-Tax › Ledger Account)", noEbm.head, noEbm.body, noEbm);
  }
  // Summary: by category, then by RRA support.
  const byCat = summary("all", items).map(([k, g]) => [k, g.n, g.total] as XlsxCell[]);
  const ws = table("Summary", "Summary by category and RRA support", ["Category", "Expenses", `Amount (${p.currency})`], byCat,
    { widths: [40, 14, 22], money: [2], total: ["TOTAL", items.length, total], count: items.length, sum: total });
  const support = new Map<string, { n: number; total: number }>();
  for (const i of items) {
    const k = i.ebm_support && i.ebm_support !== "none" ? SUPPORT_EN[i.ebm_support] : isNoEbm(i) ? "No EBM (RRA Tax Ledger)" : "Not applicable (salaries, taxes)";
    const g = support.get(k) ?? { n: 0, total: 0 }; g.n++; g.total += i.amount; support.set(k, g);
  }
  ws.addRow([]);
  const h2 = ws.addRow(["RRA support", "Expenses", `Amount (${p.currency})`]);
  h2.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    c.border = { top: thin, bottom: thin, left: thin, right: thin };
  });
  [...support.entries()].sort((a, b) => b[1].total - a[1].total).forEach(([k, g], r) => {
    const row = ws.addRow([k, g.n, g.total]);
    row.eachCell((c, col) => {
      c.border = { top: thin, bottom: thin, left: thin, right: thin };
      if (r % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } };
      if (col === 3) c.numFmt = "#,##0";
    });
  });

  const file = `${stemOf(kind, p)}.xlsx`;
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = file;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return file;
}

export const exportAllExcel = (items: BookExpense[], p: { from: string; to: string; currency: string; filters?: string }) => exportExcel("all", items, p);

// ── PDF ──────────────────────────────────────────────────────────────────
//
// One organised document:
//   page 1   summary: the company, key figures, totals by category and by
//            RRA support, and the contents;
//   then     1. Schedule of expenses (landscape): one row per expense, with
//            the page of its documents (a link), the declaration and the
//            signatures;
//   then     2. Supporting documents (portrait): the expenses in the same
//            order, each under a band giving its reference, date, amount,
//            description, payee and document number, then its receipts;
//            small receipts (MoMo SMS…) share a page;
//   footer   the company, the title and "Page x of y" on every page.

type Photo = { data: string; w: number; h: number };
type Proof = { name: string; type: string; photo: Photo | null };
type PdfOpts = { from: string; to: string; currency: string; preparedBy: string; filters?: string; onProgress?: (done: number, all: number) => void };

/** A receipt photo as a JPEG for the PDF, at most 1600 px (readable, not huge). */
async function photoForPdf(dataUrl: string): Promise<Photo | null> {
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

/** Every expense's documents, fetched and prepared 6 at a time. */
async function loadProofs(items: BookExpense[], onProgress?: (d: number, all: number) => void) {
  const out = new Map<string, Proof[]>();
  const queue = items.filter(hasDocs);
  const all = queue.length;
  let done = 0;
  onProgress?.(0, all);
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
    for (let it = queue.shift(); it; it = queue.shift()) {
      let files: { name: string; type: string; data: string }[] = [];
      try { files = (await expenseRequest(`/expenses/${it.id}/proof`))?.data?.files ?? []; } catch { files = []; }
      out.set(it.id, await Promise.all(files.map(async (f) => ({
        name: f.name, type: f.type, photo: f.type.startsWith("image/") ? await photoForPdf(f.data) : null,
      }))));
      onProgress?.(++done, all);
    }
  }));
  return out;
}

// Portrait pages for the documents (mm).
const PW_P = 210, PH_P = 297, MARGIN = 12, BAND = 19, BOTTOM = PH_P - 14;
const IMG_W = 150, IMG_H = PH_P - 2 * MARGIN - BAND - 22;

type Placed =
  | { kind: "title"; y: number }
  | { kind: "band"; y: number; item: BookExpense; continued: boolean }
  | { kind: "photo"; y: number; photo: Photo; w: number; h: number }
  | { kind: "note"; y: number; text: string };

/** Where every band and receipt goes, page by page (so the schedule can say
 *  on which page each expense's documents are before they are drawn). */
function planDocuments(items: BookExpense[], proofs: Map<string, Proof[]>) {
  const pages: Placed[][] = [[{ kind: "title", y: MARGIN }]];
  const startPage = new Map<string, number>();
  let y = MARGIN + 12;
  const newPage = () => { pages.push([]); y = MARGIN; };
  const boxOf = (p: Proof) => {
    if (!p.photo) return { h: 14 };
    const k = Math.min(IMG_W / p.photo.w, IMG_H / p.photo.h);
    return { h: p.photo.h * k, w: p.photo.w * k };
  };
  for (const it of items) {
    const docs = proofs.get(it.id) ?? [];
    if (!docs.length) continue;
    const first = boxOf(docs[0]);
    if (y + BAND + first.h + 4 > BOTTOM && pages[pages.length - 1].length) newPage();
    startPage.set(it.id, pages.length - 1);
    pages[pages.length - 1].push({ kind: "band", y, item: it, continued: false });
    y += BAND + 3;
    docs.forEach((d, i) => {
      const box = boxOf(d);
      if (y + box.h > BOTTOM) {
        newPage();
        pages[pages.length - 1].push({ kind: "band", y, item: it, continued: true });
        y += 11;
      }
      if (d.photo && "w" in box) pages[pages.length - 1].push({ kind: "photo", y, photo: d.photo, w: box.w!, h: box.h });
      else pages[pages.length - 1].push({ kind: "note", y, text: d.type === "application/pdf"
        ? `Document ${i + 1} is a PDF file (${d.name}): open expense ${na(it.voucher_no)} in Higoverse to view or print the original.`
        : `Document ${i + 1} (${d.name}) could not be included.` });
      y += box.h + 4;
    });
    y += 5;
  }
  return { pages, startPage };
}

async function exportPdf(kind: Kind, items: BookExpense[], p: PdfOpts): Promise<{ file: string }> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  type PDF = InstanceType<typeof jsPDF>;
  type WithTable = { lastAutoTable?: { finalY?: number } };
  const shop = await getPrintShop();
  const logo = await imageForPdf(shop.logo_url);
  const ink: [number, number, number] = [22, 36, 58];
  const soft: [number, number, number] = [235, 242, 253];
  const total = items.reduce((s, i) => s + i.amount, 0);
  const title = kind === "rra" ? TITLE.rra : "Expense book and supporting documents";
  const period = `${p.from} to ${p.to}`;

  // 1. Every receipt, ready before anything is laid out.
  const proofs = await loadProofs(items, p.onProgress);
  const { pages: docPages, startPage } = planDocuments(items, proofs);

  // 2. The schedule, drawn once on a scratch document to know its length.
  const scheduleRows = rows(kind, items);
  const cols = Object.keys(scheduleRows[0] ?? rows(kind, [{ id: "", title: "", amount: 0, expense_date: "", category: "other" }])[0]);
  const amountCol = cols.indexOf("Amount"), docsCol = cols.indexOf("Supporting documents");
  const heads = cols.map((c) => (c === "Amount" ? `Amount (${p.currency})` : c === "Supporting documents" ? "Documents" : c === "Document reference" ? "Doc. ref." : c));
  const drawSchedule = (doc: PDF, docsStart: number) => {
    const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...ink);
    doc.text("1. Schedule of expenses", 8, 14);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(90, 98, 112);
    doc.text(`${shop.name || ""}  |  ${period}${p.filters ? `  |  ${p.filters}` : ""}  |  ${items.length} expenses  |  ${money(total)} ${p.currency}`, 8, 19);
    const pageOf = (it: BookExpense) => (startPage.has(it.id) ? docsStart + startPage.get(it.id)! : 0);
    autoTable(doc, {
      startY: 23,
      head: [heads],
      body: scheduleRows.map((row, n) => cols.map((c) => {
        if (c === "Amount") return money(row.Amount);
        if (c === "Supporting documents") return pageOf(items[n]) ? `page ${pageOf(items[n])}` : String(row[c]);
        return String((row as Record<string, unknown>)[c]);
      })),
      foot: [cols.map((c, k) => (c === "Amount" ? money(total) : k === amountCol - 1 ? "TOTAL" : ""))],
      styles: { fontSize: 6.8, cellPadding: 1.4, overflow: "linebreak", lineColor: [221, 227, 236], lineWidth: 0.1 },
      headStyles: { fillColor: ink, textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: ink, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [247, 249, 252] },
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 13 }, 2: { cellWidth: 17 }, [amountCol]: { halign: "right", cellWidth: 22 }, [docsCol]: { cellWidth: 16 } },
      didParseCell: (d) => {
        if (d.section !== "body") return;
        if (d.cell.raw === "MISSING") { d.cell.styles.textColor = [200, 30, 30]; d.cell.styles.fontStyle = "bold"; }
        else if (d.cell.raw === NA) d.cell.styles.textColor = [150, 150, 150];
        else if (d.column.index === docsCol) d.cell.styles.textColor = [10, 102, 194];
      },
      didDrawCell: (d) => {
        if (d.section !== "body" || d.column.index !== docsCol) return;
        const target = pageOf(items[d.row.index]);
        if (target) doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { pageNumber: target });
      },
      margin: { left: 8, right: 8, top: 14, bottom: 14 },
    });
    let y = ((doc as unknown as WithTable).lastAutoTable?.finalY ?? 23) + 8;
    if (y > PH - 48) { doc.addPage("a4", "landscape"); y = 16; }
    doc.setFontSize(8); doc.setTextColor(40, 40, 40); doc.setFont("helvetica", "normal");
    const company = `${shop.name ? ` of ${shop.name}` : ""}${shop.tin ? ` (TIN ${shop.tin})` : ""}`;
    doc.text(doc.splitTextToSize(kind === "rra"
      ? `We declare that the expenses listed above were incurred for the business${company} during the period ${period}, that no EBM ` +
        "receipt, withholding tax or customs declaration exists for them, and that the supporting documents attached are true copies " +
        "of the originals kept by the business."
      : `We declare that the expenses listed above are the expenses recorded by the business${company} during the period ${period}, ` +
        "and that the supporting documents attached are true copies of the originals kept by the business.", PW - 16), 8, y);
    y += 13;
    const sign = (x: number, role: string, name: string) => {
      doc.setFont("helvetica", "bold"); doc.text(role, x, y);
      doc.setFont("helvetica", "normal");
      doc.text(`Name: ${name || "...................................................."}`, x, y + 7);
      doc.text("Signature: ...........................................", x, y + 14);
      doc.text("Date: ......................................................", x, y + 21);
    };
    sign(8, "Prepared by (Accountant)", p.preparedBy);
    sign(PW / 2, "Approved by (Owner / Managing Director)", "");
  };
  const scratch = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  drawSchedule(scratch, 0);
  const schedulePages = scratch.getNumberOfPages();
  const docsStart = 1 + schedulePages + 1;           // after the summary page and the schedule

  // 3. The summary page.
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const PW = doc.internal.pageSize.getWidth();
  let y = pdfCompanyHeader(doc, shop, logo, title, `Period ${period}  |  Amounts in ${p.currency}${p.filters ? `  |  ${p.filters}` : ""}`);
  const withDocs = items.filter(hasDocs);
  const noEbm = items.filter(isNoEbm);
  const figures: [string, string][] = [
    ["Expenses", String(items.length)],
    [`Total (${p.currency})`, money(total)],
    ["With supporting documents", `${withDocs.length} of ${items.length}`],
    [`Without EBM (${p.currency})`, `${noEbm.length}  |  ${money(noEbm.reduce((s, i) => s + i.amount, 0))}`],
  ];
  const boxW = (PW - 16 - 3 * 4) / 4;
  figures.forEach(([label, value], k) => {
    const x = 8 + k * (boxW + 4);
    doc.setFillColor(...soft); doc.roundedRect(x, y, boxW, 17, 2, 2, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(90, 98, 112); doc.text(label, x + 4, y + 6);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...ink); doc.text(value, x + 4, y + 13);
  });
  y += 24;
  const byCategory = summary("all", items).map(([k, g]) => [k, String(g.n), money(g.total)]);
  const supportGroups = new Map<string, { n: number; total: number }>();
  for (const i of items) {
    const k = i.ebm_support && i.ebm_support !== "none" ? SUPPORT_EN[i.ebm_support] : isNoEbm(i) ? "No EBM (RRA Tax Ledger)" : "Not applicable (salaries, taxes)";
    const g = supportGroups.get(k) ?? { n: 0, total: 0 }; g.n++; g.total += i.amount; supportGroups.set(k, g);
  }
  const bySupport = [...supportGroups.entries()].sort((a, b) => b[1].total - a[1].total).map(([k, g]) => [k, String(g.n), money(g.total)]);
  const half = (PW - 16 - 8) / 2;
  const small = { fontSize: 7.5, cellPadding: 1.6, lineColor: [221, 227, 236] as [number, number, number], lineWidth: 0.1 };
  autoTable(doc, { startY: y, head: [["By category", "Expenses", `Amount (${p.currency})`]], body: byCategory,
    foot: [["TOTAL", String(items.length), money(total)]], styles: small,
    headStyles: { fillColor: ink, textColor: 255, fontStyle: "bold" }, footStyles: { fillColor: soft, textColor: ink, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } }, margin: { left: 8 }, tableWidth: half });
  const leftEnd = (doc as unknown as WithTable).lastAutoTable?.finalY ?? y;
  autoTable(doc, { startY: y, head: [["By RRA support", "Expenses", `Amount (${p.currency})`]], body: bySupport,
    foot: [["TOTAL", String(items.length), money(total)]], styles: small,
    headStyles: { fillColor: ink, textColor: 255, fontStyle: "bold" }, footStyles: { fillColor: soft, textColor: ink, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } }, margin: { left: 8 + half + 8 }, tableWidth: half });
  y = Math.max(leftEnd, (doc as unknown as WithTable).lastAutoTable?.finalY ?? y) + 10;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...ink); doc.text("Contents", 8, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(40, 40, 40);
  const toc: [string, number][] = [["1. Schedule of expenses (with declaration and signatures)", 2]];
  if (docPages.length && withDocs.length) toc.push([`2. Supporting documents (${withDocs.length} expenses)`, docsStart]);
  toc.forEach(([label, page], k) => {
    const ty = y + 7 + k * 6;
    doc.textWithLink(label, 8, ty, { pageNumber: page });
    doc.text(`page ${page}`, 8 + half, ty, { align: "right" });
  });

  // 4. The schedule, for real.
  doc.addPage("a4", "landscape");
  drawSchedule(doc, docsStart);

  // 5. The supporting documents.
  if (withDocs.length) {
    for (const page of docPages) {
      doc.addPage("a4", "portrait");
      for (const el of page) {
        if (el.kind === "title") {
          doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...ink);
          doc.text("2. Supporting documents", MARGIN, el.y + 4);
        } else if (el.kind === "band") {
          const it = el.item;
          const h = el.continued ? 8 : BAND;
          doc.setFillColor(...soft); doc.rect(MARGIN, el.y, PW_P - 2 * MARGIN, h, "F");
          doc.setFillColor(...ink); doc.rect(MARGIN, el.y, 1.6, h, "F");
          doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...ink);
          doc.text(`Ref. ${na(it.voucher_no)}  |  ${day(it.expense_date)}  |  ${money(it.amount)} ${p.currency}${el.continued ? "  (continued)" : ""}`, MARGIN + 4, el.y + 5.5);
          if (!el.continued) {
            doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(40, 40, 40);
            doc.text(`${it.title}  |  ${CATEGORY_EN[it.category] ?? it.category}  |  ${supportOf(it)}`, MARGIN + 4, el.y + 10.5, { maxWidth: PW_P - 2 * MARGIN - 8 });
            doc.setTextColor(90, 98, 112);
            doc.text(`Paid to: ${na(it.supplier_name)}${it.supplier_tin ? ` (TIN/ID ${it.supplier_tin})` : ""}  |  Doc. ref.: ${na(it.doc_ref)}  |  Paid by: ${na(paidBy(it))}`,
              MARGIN + 4, el.y + 15.5, { maxWidth: PW_P - 2 * MARGIN - 8 });
          }
        } else if (el.kind === "photo") {
          const x = (PW_P - el.w) / 2;
          doc.addImage(el.photo.data, "JPEG", x, el.y, el.w, el.h);
          doc.setDrawColor(210, 216, 226); doc.setLineWidth(0.2); doc.rect(x, el.y, el.w, el.h);
        } else {
          doc.setDrawColor(210, 216, 226); doc.setFillColor(250, 250, 250); doc.rect(MARGIN, el.y, PW_P - 2 * MARGIN, 12, "FD");
          doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(60, 60, 60);
          doc.text(el.text, MARGIN + 4, el.y + 7, { maxWidth: PW_P - 2 * MARGIN - 8 });
        }
      }
    }
  }

  // 6. The check code, then the footer on every page.
  await stampPdf(doc, { kind: kind === "rra" ? "rra_ledger" : "expenses_pack", title,
    period_from: p.from, period_to: p.to, records: items.length, total, currency: p.currency });
  const count = doc.getNumberOfPages();
  for (let i = 1; i <= count; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(221, 227, 236); doc.setLineWidth(0.2); doc.line(8, h - 9, w - 8, h - 9);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(120, 126, 138);
    doc.text(`${shop.name || "Higoverse"}  |  ${title}  |  ${period}`, 8, h - 5);
    doc.text(`Page ${i} of ${count}`, w - 8, h - 5, { align: "right" });
  }
  const file = `${stemOf(kind, p)}.pdf`;
  doc.save(file);
  return { file };
}

export const exportAllPdf = (items: BookExpense[], p: PdfOpts) => exportPdf("all", items, p);
