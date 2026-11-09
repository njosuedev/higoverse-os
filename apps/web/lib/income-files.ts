// Income as files, like Expenses: a template to fill in Excel, importing it
// back, an Excel export and a PDF (with the company letterhead and the QR
// code of every printed list, lib/printed-doc.ts).

import { companySheet, getPrintShop, imageForPdf, pdfCompanyHeader, periodText } from "@/lib/print-shop";
import { stampPdf } from "@/lib/printed-doc";
import { INCOME_SOURCES, saveIncome, type Income, type IncomeInput, type IncomeMethod, type IncomeSource, type Scope } from "@/lib/income";

const SOURCE_LABEL: Record<IncomeSource, string> = {
  rental: "Rentals", services: "Services", commission: "Commissions", transport: "Transport", interest: "Interest", other: "Other",
};
const METHOD_LABEL: Record<IncomeMethod, string> = { cash: "Cash", mtn: "MTN MoMo", bank: "Bank" };
const day = (iso: string) => (iso || "").slice(0, 10);

const COLUMNS = [
  { key: "title", label: "Title *", width: 32 },
  { key: "source", label: "Source *", width: 16 },
  { key: "amount", label: "Amount *", width: 14 },
  { key: "date", label: "Date *", width: 14 },
  { key: "method", label: "Paid by", width: 14 },
  { key: "payer", label: "Payer", width: 22 },
  { key: "reference", label: "Reference", width: 18 },
  { key: "where", label: "Where", width: 12 },
  { key: "notes", label: "Notes", width: 34 },
] as const;
const HEADER_KEYS: Record<string, string> = {
  title: "title", source: "source", amount: "amount", date: "date", incomedate: "date",
  paidby: "method", payment: "method", paymentmethod: "method", method: "method",
  payer: "payer", reference: "reference", ref: "reference", where: "where", scope: "where", notes: "notes",
};
const HEADER_ROW = 3;

function download(buf: ArrayBuffer, name: string) {
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A blank workbook: headers locked, lists for Source, Paid by and Where. */
export async function downloadIncomeTemplate(isCar: boolean) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Higoverse";
  const ws = wb.addWorksheet("Income", { views: [{ state: "frozen", ySplit: HEADER_ROW }] });
  const cols = COLUMNS.filter((c) => isCar || c.key !== "where");
  const lastCol = String.fromCharCode(64 + cols.length);
  ws.columns = cols.map((c) => ({ width: c.width }));
  ws.mergeCells(`A1:${lastCol}1`);
  ws.mergeCells(`A2:${lastCol}2`);
  ws.getCell("A1").value = "Higoverse · Income import";
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF057642" } };
  ws.getCell("A2").value = `One income per row, from row ${HEADER_ROW + 1}. Columns with * are required. Date as YYYY-MM-DD. ` +
    "Rentals are recorded in Sales → Rentals, not here." + (isCar ? " Where: Abroad (before Rwanda) or Rwanda." : "");
  ws.getCell("A2").font = { size: 10, color: { argb: "FF4B5563" } };
  ws.getCell("A2").alignment = { wrapText: true, vertical: "top" };
  ws.getRow(2).height = 30;
  const head = ws.getRow(HEADER_ROW);
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF057642" } };
  });
  const last = HEADER_ROW + 500;
  for (let r = HEADER_ROW + 1; r <= last; r++) {
    const row = ws.getRow(r);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.protection = { locked: false };
      cell.numFmt = c.key === "amount" ? "#,##0" : c.key === "date" ? "yyyy-mm-dd" : "@";
    });
  }
  const range = (key: string) => {
    const c = String.fromCharCode(65 + cols.findIndex((x) => x.key === key));
    return `${c}${HEADER_ROW + 1}:${c}${last}`;
  };
  type Rule = Record<string, unknown>;
  const rules = (ws as unknown as { dataValidations: { add(range: string, rule: Rule): void } }).dataValidations;
  const err = { allowBlank: true, showErrorMessage: true, errorStyle: "stop" };
  rules.add(range("source"), { type: "list", formulae: [`"${INCOME_SOURCES.map((s) => SOURCE_LABEL[s]).join(",")}"`], ...err, error: "Pick a source from the list." });
  rules.add(range("method"), { type: "list", formulae: ['"Cash,MTN MoMo,Bank"'], ...err, error: "Pick Cash, MTN MoMo or Bank." });
  rules.add(range("amount"), { type: "decimal", operator: "greaterThan", formulae: [0], ...err, error: "Enter an amount greater than 0." });
  if (isCar) rules.add(range("where"), { type: "list", formulae: ['"Rwanda,Abroad"'], ...err, error: "Pick Rwanda or Abroad." });
  await ws.protect(crypto.randomUUID(), { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true });
  download(await wb.xlsx.writeBuffer() as ArrayBuffer, "higoverse_income_import_template.xlsx");
}

/** A date cell as YYYY-MM-DD (Excel date number, 2026-11-08 or 08/11/2026). */
function cellDate(v: unknown, XLSX: typeof import("xlsx")): string {
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : "";
  }
  const s = String(v ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}

/** Reads a filled template (or any sheet with those headers): {imported, failedRows}. */
export async function importIncomeFile(file: File): Promise<{ imported: number; failedRows: number[] } | null> {
  const XLSX = await import("xlsx");
  let rows: unknown[][];
  try {
    const wb = XLSX.read(await file.arrayBuffer());
    rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
  } catch { return null; }
  const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const headerAt = rows.findIndex((r) => norm(r?.[0]) === "title");
  if (headerAt < 0) return null;
  const col: Record<string, number> = {};
  rows[headerAt].forEach((h, i) => { const k = HEADER_KEYS[norm(h)]; if (k && col[k] === undefined) col[k] = i; });
  const get = (r: unknown[], k: string) => (col[k] === undefined ? "" : r[col[k]]);
  const text = (r: unknown[], k: string) => String(get(r, k) ?? "").trim();
  let imported = 0;
  const failedRows: number[] = [];
  for (let i = headerAt + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((v) => String(v ?? "").trim() === "")) continue;
    const amountRaw = get(r, "amount");
    const amount = typeof amountRaw === "number" ? amountRaw : Number(String(amountRaw).replace(/[,\s]/g, ""));
    const srcText = text(r, "source").toLowerCase();
    const source = (INCOME_SOURCES.find((s) => s === srcText || SOURCE_LABEL[s].toLowerCase() === srcText) ?? (srcText ? null : "other")) as IncomeSource | null;
    const m = text(r, "method").toLowerCase();
    const method: IncomeMethod | null = m.includes("bank") ? "bank" : (m.includes("mtn") || m.includes("momo")) ? "mtn" : m.includes("cash") ? "cash" : null;
    const scope: Scope = /^(abroad|outside|foreign|hanze)/i.test(text(r, "where")) ? "abroad" : "rwanda";
    const date = cellDate(get(r, "date"), XLSX);
    const title = text(r, "title");
    if (!title || !(amount > 0) || !date || !source) { failedRows.push(i + 1); continue; }
    const body: IncomeInput = {
      title, source, amount, income_date: `${date}T00:00:00`, payment_method: method,
      payer: text(r, "payer") || null, reference: text(r, "reference") || null, notes: text(r, "notes") || null, scope,
    };
    try { await saveIncome(body); imported++; } catch { failedRows.push(i + 1); }
  }
  return { imported, failedRows };
}

const rowsOf = (items: Income[], isCar: boolean) => items.map((i) => ({
  Date: day(i.income_date), Title: i.title, Source: SOURCE_LABEL[i.source] ?? i.source,
  ...(isCar ? { Where: i.scope === "abroad" ? "Abroad" : "Rwanda" } : {}),
  Amount: Number(i.amount), "Paid by": i.payment_method ? METHOD_LABEL[i.payment_method] : "",
  Payer: i.payer ?? "", Reference: i.reference ?? "", Notes: i.notes ?? "",
}));

export async function exportIncomeExcel(items: Income[], p: { from: string; to: string; currency: string; isCar: boolean }) {
  const XLSX = await import("xlsx");
  const rows = rowsOf(items, p.isCar);
  const total = items.reduce((s, i) => s + Number(i.amount), 0);
  const ws = companySheet(XLSX, await getPrintShop(), "Income report", `${periodText(p.from, p.to)}  |  Total: ${Math.round(total).toLocaleString()} ${p.currency}`, rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Income");
  XLSX.writeFile(wb, `income_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportIncomePdf(items: Income[], p: { from: string; to: string; currency: string; isCar: boolean }) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const shop = await getPrintShop();
  const total = items.reduce((s, i) => s + Number(i.amount), 0);
  const startY = pdfCompanyHeader(doc, shop, await imageForPdf(shop.logo_url), "Income report",
    `${periodText(p.from, p.to)}  |  ${items.length} records  |  Total ${Math.round(total).toLocaleString()} ${p.currency}`);
  autoTable(doc, {
    startY,
    head: [["Date", "Title", "Source", ...(p.isCar ? ["Where"] : []), `Amount (${p.currency})`, "Paid by", "Payer", "Reference", "Notes"]],
    body: items.map((i) => [
      day(i.income_date), i.title, SOURCE_LABEL[i.source] ?? i.source, ...(p.isCar ? [i.scope === "abroad" ? "Abroad" : "Rwanda"] : []),
      Math.round(Number(i.amount)).toLocaleString(), i.payment_method ? METHOD_LABEL[i.payment_method] : "-",
      i.payer || "-", i.reference || "-", i.notes ? (i.notes.length > 40 ? i.notes.slice(0, 38) + "…" : i.notes) : "-",
    ]),
    foot: [["", "TOTAL", "", ...(p.isCar ? [""] : []), Math.round(total).toLocaleString(), "", "", "", ""]],
    styles: { fontSize: 7, cellPadding: 1.8 },
    headStyles: { fillColor: [5, 118, 66], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [5, 118, 66], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 250, 248] },
    margin: { left: 14, right: 14 },
  });
  await stampPdf(doc, {
    kind: "income", title: "Income report", period_from: p.from || null, period_to: p.to || null,
    records: items.length, total, currency: p.currency,
  });
  doc.save(`income_report_${new Date().toISOString().slice(0, 10)}.pdf`);
}
