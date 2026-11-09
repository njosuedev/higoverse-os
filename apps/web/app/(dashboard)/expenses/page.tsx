"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isZero } from "@/lib/format";
import { expenseRequest, expenseUploadProof } from "@/lib/expense-api";
import { useLanguage } from "@/lib/language-context";
import { useShopSettings } from "@/lib/shop-settings-context";
import Pagination from "@/app/components/ui/Pagination";
import DeepLink from "@/app/components/DeepLink";
import DateRangeFilter from "@/app/components/ui/DateRangeFilter";
import { getPrintShop, imageForPdf, printShopLines } from "@/lib/print-shop";
import { notify } from "@/lib/dialogs";
import { apiError, CORRECTION_ROLES, INCOME_SOURCES, moveExpenseToIncome, type IncomeSource } from "@/lib/income";
import { useAuth } from "@/lib/auth-context";
import CorrectionHistory from "@/app/components/finance/CorrectionHistory";
import type { DataValidation as ExcelDataValidation } from "exceljs";
import {
  Plus, Pencil, Trash2, X, Calendar, BarChart3, AlertCircle, Download, Upload, FileSpreadsheet, FileText, Paperclip, ImageIcon, FileIcon, Receipt, RefreshCw, Search, Filter, ChevronDown, ArrowRightLeft, History } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Category =
  | "rent" | "utilities" | "salaries" | "supplies"
  | "maintenance" | "marketing" | "transport" | "taxes" | "other";

type PaymentMethod = "mtn" | "bank" | "";

const BANK_NAMES = ["Equity Bank", "BK Bank", "GT Bank", "Access Bank", "I&M Bank"];

interface Expense {
  id: string;
  shop_id: string;
  created_by: string;
  title: string;
  category: Category;
  amount: number;
  notes?: string;
  expense_date: string;
  created_at: string;
  has_proof?: boolean;
  payment_method?: string;
  bank_name?: string;
  bank_account?: string;
  receiver_phone?: string;
  /** It came here from Income by a correction. */
  corrected?: boolean;
  /** "in": money received, kept here for the record but never counted as spending. */
  direction?: "in" | "out";
}

const isIn = (e: Expense) => e.direction === "in";

interface CategoryStat { category: Category; total: number; count: number; }
interface ProofEntry   { name: string; type: string; preview: string; file: File; }
interface ProofFile    { name: string; type: string; data: string; }
interface DialogState  {
  type: "alert" | "confirm";
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
}

const ALL_CATEGORIES: Category[] = [
  "rent", "utilities", "salaries", "supplies",
  "maintenance", "marketing", "transport", "taxes", "other",
];

// One neutral look for every category: the name tells them apart, colour
// is kept for status (owed, low, loss).
const CATEGORY_COLORS: Record<Category, { bg: string; text: string; badge: string }> = {
  rent:        { bg: "bg-slate-50", text: "text-slate-700", badge: "bg-slate-100 text-slate-700" },
  utilities:   { bg: "bg-slate-50", text: "text-slate-700", badge: "bg-slate-100 text-slate-700" },
  salaries:    { bg: "bg-slate-50", text: "text-slate-700", badge: "bg-slate-100 text-slate-700" },
  supplies:    { bg: "bg-slate-50", text: "text-slate-700", badge: "bg-slate-100 text-slate-700" },
  maintenance: { bg: "bg-slate-50", text: "text-slate-700", badge: "bg-slate-100 text-slate-700" },
  marketing:   { bg: "bg-slate-50", text: "text-slate-700", badge: "bg-slate-100 text-slate-700" },
  transport:   { bg: "bg-slate-50", text: "text-slate-700", badge: "bg-slate-100 text-slate-700" },
  taxes:       { bg: "bg-slate-50", text: "text-slate-700", badge: "bg-slate-100 text-slate-700" },
  other:       { bg: "bg-slate-50", text: "text-slate-700", badge: "bg-slate-100 text-slate-700" },
};

const PAGE_SIZES = [25, 50, 100, 250];
const EMPTY_FORM = {
  title: "", category: "other" as Category, amount: "", notes: "", expense_date: "",
  payment_method: "" as PaymentMethod, bank_name: "", bank_account: "", receiver_phone: "",
  direction: "out" as "in" | "out",
};

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Expense import template: headers on this row, then this many blank rows.
const TPL_HEADER_ROW = 3;
const TPL_ROWS = 500;
const TPL_COLUMNS = [
  { key: "title",        label: "Title *",          width: 32 },
  { key: "category",     label: "Category *",       width: 16 },
  { key: "amount",       label: "Amount *",         width: 14 },
  { key: "date",         label: "Date *",           width: 14 },
  { key: "payment",      label: "Payment method *", width: 18 },
  { key: "bank_name",    label: "Bank name",        width: 18 },
  { key: "bank_account", label: "Account / ref",    width: 20 },
  { key: "phone",        label: "Receiver phone",   width: 18 },
  { key: "notes",        label: "Notes",            width: 36 },
  { key: "direction",    label: "Money in / out",   width: 16 },
];
/** Header text (letters only, lower case) → column; covers the old template's names too. */
const TPL_HEADER_KEYS: Record<string, string> = {
  title: "title", category: "category", amount: "amount",
  date: "date", expensedate: "date",
  paymentmethod: "payment", payment: "payment",
  bankname: "bank_name", account: "bank_account", accountref: "bank_account", bankaccount: "bank_account",
  receiverphone: "phone", phone: "phone", notes: "notes",
  moneyinout: "direction", direction: "direction", type: "direction", inout: "direction",
};

/** A date cell as YYYY-MM-DD: an Excel date number, or text like 2026-11-08 or 08/11/2026. */
function cellDate(v: unknown, XLSX: typeof import("xlsx")): string {
  if (typeof v === "number" && v > 0) {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : "";
  }
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);   // day/month/year, as written in Rwanda
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ExpenseManagementPage() {
  const { t } = useLanguage();
  const { currency } = useShopSettings();

  const [expenses, setExpenses]       = useState<Expense[]>([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [pageSize, setPageSize]       = useState(25);
  // Opens on this month (the date picker's "This month" preset).
  const [dateFrom, setDateFrom]       = useState(() => { const d = new Date(); d.setDate(1); return toDateStr(d); });
  const [dateTo, setDateTo]           = useState(() => toDateStr(new Date()));
  const [catFilter, setCatFilter]     = useState<Category | "">("");
  const [search, setSearch]           = useState("");

  const [summaryFiltered, setSummaryFiltered] = useState({ total_expenses: 0, count: 0, total_in: 0, count_in: 0 });
  const [byCategory, setByCategory]          = useState<CategoryStat[]>([]);

  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [showModal, setShowModal]     = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [deletingId, setDeletingId]   = useState("");
  const [editingId, setEditingId]     = useState("");   // "" = recording a new expense
  // "Move to Income": an expense that was really money received. Owner,
  // admin or accountant only, with a reason and a confirmation; recorded in
  // the correction history.
  const { user } = useAuth();
  const canCorrect = CORRECTION_ROLES.has(user?.role ?? "");
  const [moving, setMoving] = useState<{ e: Expense; source: IncomeSource; reason: string } | null>(null);
  const [movingBusy, setMovingBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  async function confirmMove() {
    if (!moving) return;
    const reason = moving.reason.trim();
    if (reason.length < 5) { notify(t("move.err_reason")); return; }
    const ok = await showConfirm(
      t("move.confirm_title"),
      t("move.confirm_to_income").replace("{title}", moving.e.title).replace("{amount}", Number(moving.e.amount).toLocaleString()),
      t("move.to_income"),
    );
    if (!ok) return;
    setMovingBusy(true);
    try {
      await moveExpenseToIncome(moving.e.id, moving.source, reason);
      setMoving(null);
      notify(t("move.done_income"), "success");
      await loadAll(true);
    } catch (err) { notify(apiError(err, t("common.something_wrong"))); }
    finally { setMovingBusy(false); }
  }
  const [form, setForm]               = useState(EMPTY_FORM);

  const [proofEntries, setProofEntries]   = useState<ProofEntry[]>([]);
  const [viewingProofs, setViewingProofs] = useState<ProofFile[]>([]);
  const [viewerIndex, setViewerIndex]     = useState(0);

  const [dialog, setDialog] = useState<DialogState | null>(null);

  const fileInputRef    = useRef<HTMLInputElement>(null);
  const proofInputRef   = useRef<HTMLInputElement>(null);
  // Attaching proof later, to an expense recorded without any.
  const rowProofInputRef = useRef<HTMLInputElement>(null);
  const [proofTargetId, setProofTargetId] = useState("");
  const [uploadingProofId, setUploadingProofId] = useState("");

  function showAlert(title: string, message: string): Promise<void> {
    return new Promise((resolve) => {
      setDialog({ type: "alert", title, message, onClose: () => { setDialog(null); resolve(); } });
    });
  }

  function showConfirm(title: string, message: string, confirmLabel = t("common.confirm"), danger = false): Promise<boolean> {
    return new Promise((resolve) => {
      setDialog({
        type: "confirm", title, message, confirmLabel, danger,
        onConfirm: () => { setDialog(null); resolve(true); },
        onClose:   () => { setDialog(null); resolve(false); },
      });
    });
  }

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loading) loadExpenses(); }, [page, pageSize, dateFrom, dateTo, catFilter]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loading) { loadSummaries(); loadByCategory(); } }, [dateFrom, dateTo, catFilter]);

  // ── Import template ──────────────────────────────────────────────────────
  // A blank, protected workbook: the title, notes and column headers are locked;
  // only the expense rows below them can be filled in, with dropdowns for the
  // category and the payment method. Import reads it back (and older files).
  async function downloadTemplate() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Higoverse";
    const ws = wb.addWorksheet("Expenses", { views: [{ state: "frozen", ySplit: TPL_HEADER_ROW }] });
    const last = TPL_HEADER_ROW + TPL_ROWS;
    const lastCol = String.fromCharCode(64 + TPL_COLUMNS.length);

    ws.columns = TPL_COLUMNS.map((c) => ({ width: c.width }));
    ws.mergeCells(`A1:${lastCol}1`);
    ws.mergeCells(`A2:${lastCol}2`);
    ws.getCell("A1").value = "Higoverse · Expense import";
    ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF0A66C2" } };
    ws.getCell("A2").value =
      `Type one expense per row, from row ${TPL_HEADER_ROW + 1}. Columns with * are required. ` +
      "Pick Category and Payment method from the list; Date as YYYY-MM-DD. Money in / out: Out (or empty) for money spent, " +
      "In for money received (it is recorded in Income). Then use Import on the Expenses page.";
    ws.getCell("A2").font = { size: 10, color: { argb: "FF4B5563" } };
    ws.getCell("A2").alignment = { wrapText: true, vertical: "top" };
    ws.getRow(2).height = 30;

    const head = ws.getRow(TPL_HEADER_ROW);
    TPL_COLUMNS.forEach((c, i) => {
      const cell = head.getCell(i + 1);
      cell.value = c.label;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A66C2" } };
      cell.alignment = { vertical: "middle" };
    });
    head.height = 20;

    // The fill-in rows: unlocked, typed per column.
    for (let r = TPL_HEADER_ROW + 1; r <= last; r++) {
      const row = ws.getRow(r);
      TPL_COLUMNS.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.protection = { locked: false };
        if (c.key === "amount") cell.numFmt = "#,##0";
        else if (c.key === "date") cell.numFmt = "yyyy-mm-dd";
        else cell.numFmt = "@";   // text: keeps phone numbers' leading + and 0
      });
    }
    // One rule per column (rules set cell by cell come out as overlapping
    // ranges, which Excel can report as a damaged file).
    const range = (key: string) => {
      const c = String.fromCharCode(65 + TPL_COLUMNS.findIndex((x) => x.key === key));
      return `${c}${TPL_HEADER_ROW + 1}:${c}${last}`;
    };
    const rules = (ws as unknown as { dataValidations: { add(range: string, rule: ExcelDataValidation): void } }).dataValidations;
    const err = { allowBlank: true, showErrorMessage: true, errorStyle: "stop" as const };
    const categories = ALL_CATEGORIES.map((c) => c[0].toUpperCase() + c.slice(1)).join(",");
    rules.add(range("category"), { type: "list", formulae: [`"${categories}"`], ...err, errorTitle: "Category", error: "Pick a category from the list." });
    rules.add(range("payment"), { type: "list", formulae: ['"MTN MoMo,Bank"'], ...err, errorTitle: "Payment method", error: "Pick MTN MoMo or Bank." });
    rules.add(range("direction"), { type: "list", formulae: ['"Out,In"'], ...err, errorTitle: "Money in / out", error: "Pick Out (money spent) or In (money received)." });
    rules.add(range("amount"), { type: "decimal", operator: "greaterThan", formulae: [0], ...err, errorTitle: "Amount", error: "Enter an amount greater than 0." });
    rules.add(range("date"), { type: "date", operator: "between", formulae: [new Date(Date.UTC(2000, 0, 1)), new Date(Date.UTC(2100, 11, 31))], ...err, errorTitle: "Date", error: "Enter a date, e.g. 2026-11-08." });

    // Random password nobody keeps: the layout cannot be unlocked, only filled in.
    await ws.protect(crypto.randomUUID(), {
      selectLockedCells: true, selectUnlockedCells: true,
      formatColumns: true, formatRows: true,
      insertRows: false, deleteRows: false, insertColumns: false, deleteColumns: false, sort: false, autoFilter: false,
    });

    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url; a.download = "higoverse_expense_import_template.xlsx";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    let rows: unknown[][];
    let XLSX: typeof import("xlsx");
    try {
      XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
    } catch { await showAlert(t("expenses.import_failed_title"), t("expenses.import_failed_msg")); return; }

    // The header row is the one starting with "Title" (row 3 in the template,
    // row 1 or 3 in older files); each column is found by its name.
    const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
    const headerAt = rows.findIndex((r) => norm(r?.[0]) === "title");
    if (headerAt < 0) { await showAlert(t("expenses.import_failed_title"), t("expenses.import_failed_msg")); return; }
    const col: Record<string, number> = {};
    rows[headerAt].forEach((h, i) => {
      const k = TPL_HEADER_KEYS[norm(h)];
      if (k && col[k] === undefined) col[k] = i;
    });
    const get = (r: unknown[], k: string) => (col[k] === undefined ? "" : r[col[k]]);
    const text = (r: unknown[], k: string) => String(get(r, k) ?? "").trim();

    let imported = 0;
    const failedRows: number[] = [];
    for (let i = headerAt + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.every((v) => String(v ?? "").trim() === "")) continue;   // empty row
      const title = text(r, "title");
      const amountRaw = get(r, "amount");
      const amount = typeof amountRaw === "number" ? amountRaw : Number(String(amountRaw).replace(/[,\s]/g, ""));
      const date = cellDate(get(r, "date"), XLSX);
      const pm = text(r, "payment").toLowerCase();
      const payment = pm.includes("bank") ? "bank" : (pm.includes("mtn") || pm.includes("momo")) ? "mtn" : "";
      const cat = (text(r, "category").toLowerCase() || "other") as Category;
      const dir = /^(in|received|income|credit)/i.test(text(r, "direction")) ? "in" : "out";
      if (!title || !(amount > 0) || !date || !payment || !ALL_CATEGORIES.includes(cat)) { failedRows.push(i + 1); continue; }
      try {
        if (dir === "in") {
          // Money received belongs in Income.
          await expenseRequest("/incomes", {
            method: "POST",
            body: JSON.stringify({
              title, source: "other", amount, income_date: date + "T00:00:00", payment_method: payment,
              reference: payment === "bank" ? (text(r, "bank_account") || undefined) : undefined,
              notes: text(r, "notes") || undefined,
            }),
          });
          imported++;
          continue;
        }
        await expenseRequest("/expenses", {
          method: "POST",
          body: JSON.stringify({
            title, category: cat, amount,
            notes: text(r, "notes") || undefined,
            expense_date: date + "T00:00:00",
            payment_method: payment,
            bank_name:      payment === "bank" ? (text(r, "bank_name") || undefined) : undefined,
            bank_account:   payment === "bank" ? (text(r, "bank_account") || undefined) : undefined,
            receiver_phone: text(r, "phone") || undefined,
          }),
        });
        imported++;
      } catch { failedRows.push(i + 1); }
    }
    const shown = failedRows.slice(0, 15).join(", ") + (failedRows.length > 15 ? "…" : "");
    await showAlert(
      t("expenses.import_complete_title"),
      `${t("expenses.import_summary_imported")} ${imported} ${t("expenses.import_summary_records")}` +
      (failedRows.length ? ` · ${failedRows.length} ${t("expenses.import_summary_failed")} (${t("expenses.import_rows")} ${shown})` : "") + ".",
    );
    await loadAll(true);
  }

  async function fetchAllForExport(): Promise<Expense[]> {
    const params = new URLSearchParams({
      page: "1", limit: "1000",
      ...(dateFrom  && { from_date: dateFrom }),
      ...(dateTo    && { to_date: dateTo }),
      ...(catFilter && { category: catFilter }),
    });
    const res = await expenseRequest(`/expenses?${params}`);
    const all: Expense[] = res?.data?.items || [];
    if (search) {
      const q = search.toLowerCase();
      return all.filter((e) =>
        e.title.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        (e.notes || "").toLowerCase().includes(q)
      );
    }
    return all;
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const [all, shop] = await Promise.all([fetchAllForExport(), getPrintShop()]);
    // Money received is listed on its own sheet, never in the expense totals.
    const rows = all.filter((e) => !isIn(e));
    const received = all.filter(isIn);
    const now  = new Date();
    // The company's name and details above each sheet.
    const company = shop.name ? [[shop.name.toUpperCase()], ...printShopLines(shop).map((l) => [l]), []] : [];
    const top = company.length;

    const headers = [
      "Date", "Title", "Category", `Amount (${currency})`,
      "Payment Method", "Bank Name", "Account / Ref", "Receiver Phone", "Notes",
    ];

    const dataRows = rows.map((e) => {
      const d = e.expense_date ? new Date(e.expense_date) : null;
      return [
        d ? toDateStr(d) : "",
        e.title,
        e.category,
        Number(e.amount),
        e.payment_method === "mtn"  ? "MTN Mobile Money"
          : e.payment_method === "bank" ? "Bank Transfer" : "",
        e.bank_name      || "",
        e.bank_account   || "",
        e.receiver_phone || "",
        e.notes          || "",
      ];
    });

    const grandTotal = rows.reduce((s, e) => s + Number(e.amount), 0);

    const wsData = [
      ...company,
      [`EXPENSE REPORT: ${periodLabel.toUpperCase()}`],
      [`Period: ${dateFrom || "All time"}  →  ${dateTo || toDateStr(now)}  |  Generated: ${now.toLocaleString()}  |  Records: ${rows.length}`],
      [],
      headers,
      ...dataRows,
      [],
      ["", "TOTAL", "", grandTotal, "", "", "", "", ""],
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 14 },
      { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 35 },
    ];
    ws["!merges"] = Array.from({ length: top + 2 }, (_, r) => ({ s: { r, c: 0 }, e: { r, c: 8 } }));

    // Summary by category sheet
    const catMap: Record<string, { total: number; count: number }> = {};
    rows.forEach((e) => {
      if (!catMap[e.category]) catMap[e.category] = { total: 0, count: 0 };
      catMap[e.category].total += Number(e.amount);
      catMap[e.category].count += 1;
    });
    const catRows = Object.entries(catMap)
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([cat, s]) => [
        cat.charAt(0).toUpperCase() + cat.slice(1),
        s.total,
        s.count,
        grandTotal > 0 ? `${Math.round((s.total / grandTotal) * 100)}%` : "0%",
      ]);

    const ws2Data = [
      ...company,
      ["EXPENSE SUMMARY BY CATEGORY"],
      [`Generated: ${now.toLocaleString()}`],
      [],
      ["Category", `Total (${currency})`, "Records", "% of Total"],
      ...catRows,
      [],
      ["GRAND TOTAL", grandTotal, rows.length, "100%"],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
    ws2["!cols"] = [{ wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 14 }];
    ws2["!merges"] = Array.from({ length: top + 2 }, (_, r) => ({ s: { r, c: 0 }, e: { r, c: 3 } }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws,  "Expenses");
    XLSX.utils.book_append_sheet(wb, ws2, "Summary");
    if (received.length) {
      const receivedTotal = received.reduce((s, e) => s + Number(e.amount), 0);
      const ws3 = XLSX.utils.aoa_to_sheet([
        ...company,
        ["MONEY RECEIVED (NOT COUNTED AS EXPENSES)"],
        [],
        ["Date", "Title", `Amount (${currency})`, "Payment Method", "Notes"],
        ...received.map((e) => [
          e.expense_date ? toDateStr(new Date(e.expense_date)) : "",
          e.title, Number(e.amount),
          e.payment_method === "mtn" ? "MTN Mobile Money" : e.payment_method === "bank" ? "Bank Transfer" : "",
          e.notes || "",
        ]),
        [],
        ["", "TOTAL", receivedTotal, "", ""],
      ]);
      ws3["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 18 }, { wch: 35 }];
      XLSX.utils.book_append_sheet(wb, ws3, "Money received");
    }
    XLSX.writeFile(wb, `expenses_${toDateStr(now)}.xlsx`);
  }

  async function exportPDF() {
    const { jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const [all, shop] = await Promise.all([fetchAllForExport(), getPrintShop()]);
    // Money received is left out of the expense report (noted under the total).
    const rows = all.filter((e) => !isIn(e));
    const received = all.filter(isIn);
    const receivedTotal = received.reduce((s, e) => s + Number(e.amount), 0);
    const logo = await imageForPdf(shop.logo_url);
    const now  = new Date();

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const PW  = doc.internal.pageSize.getWidth();
    const PH  = doc.internal.pageSize.getHeight();

    const C_BLUE   = [19, 114, 230]  as [number, number, number];
    const C_DARK   = [22,  36,  58]  as [number, number, number];
    const C_LIGHT  = [235, 242, 253] as [number, number, number];
    const C_GRAY   = [107, 114, 128] as [number, number, number];
    const C_WHITE  = [255, 255, 255] as [number, number, number];
    const C_GREEN  = [5,  150,  80]  as [number, number, number];
    const C_ORANGE = [234,  88,  12] as [number, number, number];
    const C_SLATE  = [ 71,  85, 105] as [number, number, number];

    const grandTotal = rows.reduce((s, e) => s + Number(e.amount), 0);
    const catMap: Record<string, { total: number; count: number }> = {};
    rows.forEach((e) => {
      if (!catMap[e.category]) catMap[e.category] = { total: 0, count: 0 };
      catMap[e.category].total += Number(e.amount);
      catMap[e.category].count += 1;
    });
    const catEntries = Object.entries(catMap).sort(([, a], [, b]) => b.total - a.total);
    const topCat     = catEntries[0];

    // ── Header banner: the company, then the report ─────────────────────────
    const lines = printShopLines(shop);
    const bannerH = shop.name ? 40 : 30;
    doc.setFillColor(...C_BLUE);
    doc.rect(0, 0, PW, bannerH, "F");

    // The logo on a white tile, at most 24 mm square, keeping its shape.
    let textX = 14;
    if (logo) {
      const box = bannerH - 12;
      const k = Math.min(box / logo.w, box / logo.h);
      const w = logo.w * k, h = logo.h * k;
      doc.setFillColor(...C_WHITE);
      doc.roundedRect(14, 6, box, box, 2, 2, "F");
      try { doc.addImage(logo.data, 14 + (box - w) / 2, 6 + (box - h) / 2, w, h); } catch { /* unreadable image: tile stays empty */ }
      textX = 14 + box + 5;
    }

    doc.setTextColor(...C_WHITE);
    let y = 11;
    if (shop.name) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(shop.name.toUpperCase(), textX, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      lines.forEach((l) => { y += 4.2; doc.text(l, textX, y, { maxWidth: PW / 2 }); });
      y = bannerH - 11;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(shop.name ? 11 : 20);
    doc.text("EXPENSE REPORT", textX, shop.name ? y : 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(
      `Period: ${dateFrom || "All time"}  to  ${dateTo || toDateStr(now)}` +
      (catFilter ? `   |   Category: ${catFilter}` : "") +
      (shop.name ? `   |   Generated: ${now.toLocaleString()}` : ""),
      textX, shop.name ? y + 5 : 20,
    );
    if (!shop.name) doc.text(`Generated: ${now.toLocaleString()}`, 14, 26);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(grandTotal.toLocaleString(), PW - 14, 14, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`${currency}  TOTAL EXPENSES`, PW - 14, 20, { align: "right" });
    doc.text(`${rows.length} records  ·  ${periodLabel}`, PW - 14, 26, { align: "right" });
    if (received.length) {
      doc.text(`Money received, not counted: ${receivedTotal.toLocaleString()} (${received.length})`, PW - 14, 31, { align: "right" });
    }

    // ── Summary cards ────────────────────────────────────────────────────────
    const cardY = bannerH + 4;
    const cardH = 20;
    const gap   = 3;
    const cardW = (PW - 28 - gap * 3) / 4;

    const summaryCards = [
      { label: "TOTAL AMOUNT",   value: grandTotal.toLocaleString(), sub: currency,                          accent: C_BLUE   },
      { label: "TOTAL RECORDS",  value: String(rows.length),         sub: "expenses",                     accent: C_GREEN  },
      { label: "TOP CATEGORY",   value: topCat ? topCat[0].toUpperCase() : "-", sub: topCat ? `${topCat[1].total.toLocaleString()} ${currency}` : "", accent: C_ORANGE },
      { label: "CATEGORIES",     value: String(catEntries.length),   sub: `of ${ALL_CATEGORIES.length}`,  accent: C_SLATE },
    ];

    summaryCards.forEach((card, i) => {
      const cx = 14 + i * (cardW + gap);
      doc.setFillColor(...C_LIGHT);
      doc.roundedRect(cx, cardY, cardW, cardH, 2, 2, "F");
      doc.setFillColor(...card.accent);
      doc.roundedRect(cx, cardY, 2.5, cardH, 1, 1, "F");

      doc.setTextColor(...C_GRAY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.text(card.label, cx + 5, cardY + 5.5);

      doc.setTextColor(...card.accent);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(card.value, cx + 5, cardY + 13);

      doc.setTextColor(...C_GRAY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.text(card.sub, cx + 5, cardY + 18.5);
    });

    // ── Expense records table ────────────────────────────────────────────────
    let curY = cardY + cardH + 6;

    doc.setTextColor(...C_DARK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("EXPENSE RECORDS", 14, curY);
    curY += 2;

    autoTable(doc, {
      startY: curY,
      head: [["Date", "Title", "Category", `Amount (${currency})`, "Payment", "Bank Name", "Account / Ref", "Receiver Phone", "Notes"]],
      body: rows.map((e) => {
        const d = e.expense_date ? new Date(e.expense_date) : null;
        return [
          d ? toDateStr(d) : "-",
          e.title,
          e.category.charAt(0).toUpperCase() + e.category.slice(1),
          Number(e.amount).toLocaleString(),
          e.payment_method === "mtn"  ? "MTN MoMo"
            : e.payment_method === "bank" ? "Bank" : "-",
          e.bank_name      || "-",
          e.bank_account   || "-",
          e.receiver_phone || "-",
          e.notes ? (e.notes.length > 40 ? e.notes.slice(0, 38) + "…" : e.notes) : "-",
        ];
      }),
      styles:             { fontSize: 6.5, cellPadding: 1.8 },
      headStyles:         { fillColor: C_BLUE, textColor: C_WHITE, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 50 },
        2: { cellWidth: 20 },
        3: { cellWidth: 24, halign: "right" as const },
        4: { cellWidth: 18 },
        5: { cellWidth: 24 },
        6: { cellWidth: 24 },
        7: { cellWidth: 24 },
        8: { cellWidth: "auto" as const },
      },
      margin: { left: 14, right: 14 },
      didDrawPage: (data) => {
        doc.setFillColor(...C_DARK);
        doc.rect(0, PH - 8, PW, 8, "F");
        doc.setFontSize(6.5);
        doc.setTextColor(...C_WHITE);
        doc.setFont("helvetica", "normal");
        doc.text(`${shop.name || "Higoverse"} · Expense report`, 14, PH - 3.5);
        doc.text(`Page ${data.pageNumber}`, PW / 2, PH - 3.5, { align: "center" });
        doc.text(`Generated ${now.toLocaleDateString()}`, PW - 14, PH - 3.5, { align: "right" });
      },
    });

    // ── Category breakdown ───────────────────────────────────────────────────
    const afterTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? curY + 20;
    const bY = afterTable + 8;
    const fits = bY + catEntries.length * 5 + 24 < PH - 12;

    if (!fits) doc.addPage();
    const breakY = fits ? bY : 15;

    doc.setTextColor(...C_DARK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("CATEGORY BREAKDOWN", 14, breakY);

    autoTable(doc, {
      startY: breakY + 2,
      head: [["Category", `Total (${currency})`, "Records", "% of Total"]],
      body: catEntries.map(([cat, s]) => [
        cat.charAt(0).toUpperCase() + cat.slice(1),
        s.total.toLocaleString(),
        s.count,
        grandTotal > 0 ? `${Math.round((s.total / grandTotal) * 100)}%` : "0%",
      ]),
      foot: [["Grand Total", grandTotal.toLocaleString(), rows.length, "100%"]],
      styles:     { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: C_DARK, textColor: C_WHITE, fontStyle: "bold" },
      footStyles: { fillColor: C_BLUE, textColor: C_WHITE, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 40, halign: "right"  as const },
        2: { cellWidth: 25, halign: "center" as const },
        3: { cellWidth: 30, halign: "right"  as const },
      },
      margin: { left: 14, right: 14 },
    });

    doc.save(`expense_report_${toDateStr(now)}.pdf`);
  }

  async function loadAll(soft = false) {
    try {
      if (!soft) setLoading(true); else setRefreshing(true);
      await Promise.all([loadExpenses(), loadSummaries(), loadByCategory()]);
      setLastUpdated(new Date());
    } finally { setLoading(false); setRefreshing(false); }
  }

  async function loadExpenses() {
    try {
      const params = new URLSearchParams({
        page: String(page), limit: String(pageSize),
        ...(dateFrom && { from_date: dateFrom }),
        ...(dateTo   && { to_date: dateTo }),
        ...(catFilter && { category: catFilter }),
      });
      const res = await expenseRequest(`/expenses?${params}`);
      setExpenses(res?.data?.items || []);
      setTotal(res?.data?.total || 0);
    } catch (err) { console.error(err); }
  }

  async function loadSummaries() {
    try {
      const params = new URLSearchParams({
        ...(dateFrom  && { from_date: dateFrom }),
        ...(dateTo    && { to_date: dateTo }),
        ...(catFilter && { category: catFilter }),
      });
      const res = await expenseRequest(`/expenses/summary?${params}`);
      // Numbers whatever the server sent: a missing total is 0, not a blank page.
      setSummaryFiltered({
        total_expenses: Number(res?.data?.total_expenses) || 0, count: Number(res?.data?.count) || 0,
        total_in: Number(res?.data?.total_in) || 0, count_in: Number(res?.data?.count_in) || 0,
      });
    } catch { /* ignore */ }
  }

  async function loadByCategory() {
    try {
      const params = new URLSearchParams({
        ...(dateFrom && { from_date: dateFrom }),
        ...(dateTo   && { to_date: dateTo }),
      });
      const res = await expenseRequest(`/expenses/by-category?${params}`);
      const rows: Partial<CategoryStat>[] = Array.isArray(res?.data) ? res.data : [];
      setByCategory(rows.filter((r) => r.category).map((r) => ({ category: r.category as Category, total: Number(r.total) || 0, count: Number(r.count) || 0 })));
    } catch { /* ignore */ }
  }

  // /expenses?new=1 (the "+" at the top, search's shortcuts) opens the form.
  function handleDeepLink(params: URLSearchParams) {
    if (params.get("new") === "1") openModal();
  }

  function openModal() {
    setEditingId("");
    setForm({ ...EMPTY_FORM, expense_date: toDateStr(new Date()) });
    setProofEntries([]);
    setShowModal(true);
  }

  /** Opens the same form filled with an expense, to correct it. */
  function openEdit(e: Expense) {
    const method: PaymentMethod = e.payment_method === "mtn" || e.payment_method === "bank" ? e.payment_method : "";
    setEditingId(e.id);
    setForm({
      title: e.title, category: e.category, amount: String(e.amount), notes: e.notes ?? "",
      // The day as stored ("2026-11-06T00:00:00"), not shifted by the browser's time zone.
      expense_date: (e.expense_date || "").slice(0, 10),
      payment_method: method,
      direction: e.direction === "in" ? "in" : "out",
      bank_name: e.bank_name ?? "", bank_account: e.bank_account ?? "", receiver_phone: e.receiver_phone ?? "",
    });
    setProofEntries([]);
    setShowModal(true);
  }

  function handleProofSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    const remaining = 5 - proofEntries.length;
    const toAdd = picked.slice(0, remaining);
    toAdd.forEach((file) => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setProofEntries((prev) => [...prev, { name: file.name, type: file.type, preview: ev.target?.result as string, file }]);
        };
        reader.readAsDataURL(file);
      } else {
        setProofEntries((prev) => [...prev, { name: file.name, type: file.type, preview: "pdf", file }]);
      }
    });
    if (proofInputRef.current) proofInputRef.current.value = "";
  }

  function removeProofEntry(idx: number) {
    setProofEntries((prev) => prev.filter((_, i) => i !== idx));
  }

  function pickProofFor(expenseId: string) {
    setProofTargetId(expenseId);
    rowProofInputRef.current?.click();
  }

  async function handleRowProofSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []).slice(0, 5);
    if (rowProofInputRef.current) rowProofInputRef.current.value = "";
    const id = proofTargetId;
    if (!picked.length || !id) return;
    try {
      setUploadingProofId(id);
      await expenseUploadProof(id, picked);
      await loadAll(true);
    } catch (err: unknown) {
      await showAlert(t("common.error_title"), err instanceof Error ? err.message : t("common.something_wrong"));
    } finally { setUploadingProofId(""); setProofTargetId(""); }
  }

  async function openProofViewer(expenseId: string) {
    try {
      const res = await expenseRequest(`/expenses/${expenseId}/proof`);
      const files: ProofFile[] = res?.data?.files || [];
      if (files.length) { setViewingProofs(files); setViewerIndex(0); }
      else await showAlert(t("expenses.no_proof_title"), t("expenses.no_proof_msg"));
    } catch { await showAlert(t("common.error_title"), t("expenses.load_proof_error")); }
  }

  async function submitForm() {
    if (!form.title.trim()) { await showAlert(t("common.missing_field"), t("expenses.title_field") + t("common.field_required_suffix")); return; }
    if (!form.amount || Number(form.amount) <= 0) { await showAlert(t("common.invalid_amount"), t("expenses.amount") + t("common.must_be_greater_than_zero_suffix")); return; }
    if (!form.expense_date) { await showAlert(t("common.missing_field"), t("expenses.expense_date") + t("common.field_required_suffix")); return; }
    if (!form.payment_method) { await showAlert(t("common.missing_field"), t("expenses.payment_method_required")); return; }

    try {
      setSubmitting(true);
      if (editingId) {
        // null clears a field (e.g. bank details after switching to MoMo).
        await expenseRequest(`/expenses/${editingId}`, {
          method: "PUT",
          body: JSON.stringify({
            title: form.title.trim(),
            category: form.category,
            amount: Number(form.amount),
            notes: form.notes.trim() || null,
            expense_date: form.expense_date + "T00:00:00",
            payment_method: form.payment_method || null,
            bank_name:      form.payment_method === "bank" ? (form.bank_name.trim() || null) : null,
            bank_account:   form.payment_method === "bank" ? (form.bank_account.trim() || null) : null,
            receiver_phone: form.payment_method ? (form.receiver_phone.trim() || null) : null,
          }),
        });
        setShowModal(false);
        setEditingId("");
        setForm(EMPTY_FORM);
        await loadAll(true);
        return;
      }
      const res = await expenseRequest("/expenses", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          category: form.category,
          amount: Number(form.amount),
          notes: form.notes.trim() || undefined,
          expense_date: form.expense_date + "T00:00:00",
          payment_method: form.payment_method || undefined,
          bank_name:      form.payment_method === "bank" ? (form.bank_name.trim() || undefined) : undefined,
          bank_account:   form.payment_method === "bank" ? (form.bank_account.trim() || undefined) : undefined,
          receiver_phone: form.receiver_phone.trim() || undefined,
        }),
      });

      if (proofEntries.length > 0 && res?.data?.id) {
        await expenseUploadProof(res.data.id, proofEntries.map((e) => e.file));
      }

      setShowModal(false);
      setForm(EMPTY_FORM);
      setProofEntries([]);
      await loadAll(true);
    } catch (err: unknown) {
      await showAlert(t("common.error_title"), err instanceof Error ? err.message : t("common.something_wrong"));
    } finally { setSubmitting(false); }
  }

  async function deleteExpense(id: string) {
    const ok = await showConfirm(
      t("expenses.delete_title"),
      t("expenses.delete_confirm_msg"),
      t("common.delete"),
      true,
    );
    if (!ok) return;
    try {
      setDeletingId(id);
      await expenseRequest(`/expenses/${id}`, { method: "DELETE" });
      await loadAll(true);
    } catch { await showAlert(t("common.error_title"), t("expenses.delete_error")); }
    finally { setDeletingId(""); }
  }

  const filteredExpenses = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return expenses;
    return expenses.filter((e) =>
      e.title.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      (e.notes || "").toLowerCase().includes(q)
    );
  }, [expenses, search]);

  const totalPages = Math.ceil(total / pageSize);
  const hasDateFilter = dateFrom || dateTo;

  // ── Dynamic card values (search = client-side; filters = API-driven) ──────
  const displayByCategory: CategoryStat[] = useMemo(() => {
    if (!search) return byCategory;
    const map: Record<string, CategoryStat> = {};
    filteredExpenses.filter((e) => !isIn(e)).forEach((e) => {
      if (!map[e.category]) map[e.category] = { category: e.category as Category, total: 0, count: 0 };
      map[e.category].total += Number(e.amount);
      map[e.category].count += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [search, byCategory, filteredExpenses]);

  // Spending only: rows marked as money received are not expenses.
  const displayTotal = search
    ? filteredExpenses.filter((e) => !isIn(e)).reduce((s, e) => s + Number(e.amount), 0)
    : summaryFiltered.total_expenses;
  const displayCount = search ? filteredExpenses.filter((e) => !isIn(e)).length : summaryFiltered.count;
  const displayIn = search
    ? filteredExpenses.filter(isIn).reduce((s, e) => s + Number(e.amount), 0)
    : summaryFiltered.total_in;
  const topCategory  = displayByCategory[0];

  // Dynamic period label
  const periodLabel = (() => {
    const today = toDateStr(new Date());
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const yearStart  = `${now.getFullYear()}-01-01`;
    const weekAgo    = toDateStr(new Date(Date.now() - 6 * 86_400_000));
    if (search) return "Search";
    if (dateFrom === today  && dateTo === today)      return "Today";
    if (dateFrom === weekAgo && dateTo === today)     return "7 Days";
    if (dateFrom === monthStart && dateTo === today)  return "This Month";
    if (dateFrom === yearStart  && dateTo === today)  return "This Year";
    if (dateFrom || dateTo) return "Period";
    return "All Time";
  })();

  // Localized counterpart of periodLabel for on-screen UI (periodLabel itself
  // stays English — it's also embedded in the Excel/PDF export documents).
  const periodLabelLocalized = (() => {
    const today = toDateStr(new Date());
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const yearStart  = `${now.getFullYear()}-01-01`;
    const weekAgo    = toDateStr(new Date(Date.now() - 6 * 86_400_000));
    if (search) return t("common.search");
    if (dateFrom === today  && dateTo === today)      return t("daterange.today");
    if (dateFrom === weekAgo && dateTo === today)     return t("daterange.week");
    if (dateFrom === monthStart && dateTo === today)  return t("daterange.month");
    if (dateFrom === yearStart  && dateTo === today)  return t("daterange.year");
    if (dateFrom || dateTo) return t("common.period");
    return t("common.all_time");
  })();

  const inputCls = "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-md px-2 py-1 w-full text-[11px] focus:outline-none focus:ring-1 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2] transition";

  if (loading) return <ExpenseSkeleton />;

  return (
    <div className="min-h-screen">
      <DeepLink keys={["new"]} onParams={handleDeepLink} />
      {showHistory && <CorrectionHistory onClose={() => setShowHistory(false)} />}
      {moving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !movingBusy && setMoving(null)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(ev) => ev.stopPropagation()}>
            <p className="flex items-center gap-2 font-bold text-slate-800"><ArrowRightLeft size={17} className="text-[#057642]" /> {t("move.to_income")}</p>
            <p className="mt-1 text-sm text-slate-600">{moving.e.title} · <b>{Number(moving.e.amount).toLocaleString()}</b></p>
            <label className="mt-4 block text-[11px] font-medium text-slate-500 mb-0.5">{t("move.pick_source")}</label>
            <select value={moving.source} onChange={(ev) => setMoving({ ...moving, source: ev.target.value as IncomeSource })}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm">
              {INCOME_SOURCES.map((s) => <option key={s} value={s}>{t(`income.src_${s}`)}</option>)}
            </select>
            <label className="mt-3 block text-[11px] font-medium text-slate-500 mb-0.5">{t("move.reason")} <span className="text-red-400">*</span></label>
            <textarea rows={2} maxLength={1000} value={moving.reason} placeholder={t("move.reason_ph")}
              onChange={(ev) => setMoving({ ...moving, reason: ev.target.value })}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
            <p className="mt-2 text-xs text-slate-500">{t("move.to_income_hint")}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setMoving(null)} disabled={movingBusy} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm">{t("common.cancel")}</button>
              <button onClick={() => void confirmMove()} disabled={movingBusy} className="px-4 py-1.5 rounded-lg bg-[#057642] text-white text-sm font-semibold disabled:opacity-50">{t("move.to_income")}</button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4">

        {/* ── HEADER ─────────────────────────────────────────── */}
        <div className="hgv-surface relative rounded-xl mb-2 overflow-hidden">

          {/* Single title row */}
          <div className="relative flex items-center gap-2 px-4 pt-2.5 pb-2">
            <Receipt size={14} className="text-white/80 shrink-0" strokeWidth={2} />
            <h1 className="text-sm font-bold text-white tracking-tight mr-auto">{t("expenses.title")}</h1>
            <span className="text-[11px] text-blue-100/70 mr-1">
              <span className="font-semibold text-white/80">{total.toLocaleString()}</span> {t("expenses.records")}
            </span>
            <button onClick={() => setShowHistory(true)} title={t("move.history")} aria-label={t("move.history")}
              className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition-all">
              <History size={12} />
            </button>
            <button onClick={() => loadAll(true)} disabled={refreshing}
              className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition-all disabled:opacity-40">
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button onClick={openModal}
              className="flex items-center gap-1.5 bg-white text-[#0a66c2] px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-blue-50 active:scale-95 transition-all shadow shadow-black/20">
              <Plus size={12} strokeWidth={3} /> {t("expenses.add")}
            </button>
          </div>

          {/* Search + filter + date */}
          <div className="relative px-4 pb-3 space-y-2">
            <div className="flex gap-2">
              <div className="hgv-search hgv-page-search">
                <Search size={16} className="hgv-search-icon" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("expenses.search")}
                  className="hgv-search-input" />
                {search && <button onClick={() => setSearch("")} className="hgv-search-clear"><X size={14} /></button>}
              </div>
              <div className="hgv-filter">
                <Filter size={14} className="shrink-0" />
                <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value as Category | ""); setPage(1); }}
                  >
                  <option value="" className="text-gray-800">{t("expenses.all_categories")}</option>
                  {ALL_CATEGORIES.map((c) => (
                    <option key={c} value={c} className="text-gray-800">{t(`expenses.cat.${c}`)}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="shrink-0" />
              </div>
            </div>
            <DateRangeFilter
              from={dateFrom} to={dateTo}
              onFrom={(v) => { setDateFrom(v); setPage(1); }}
              onTo={(v) => { setDateTo(v); setPage(1); }}
              onClear={() => { setDateFrom(""); setDateTo(""); setPage(1); }}
              accentClass="focus:ring-[#0a66c2]/30 focus:border-[#0a66c2]"
            />
          </div>
        </div>

        {/* ── STAT CARDS ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-2">
          {[
            {
              label: `${t("common.total")} · ${periodLabelLocalized}`,
              value: displayTotal.toLocaleString(),
              sub: `${displayCount} ${t("expenses.records")}` +
                (displayIn > 0 ? ` · +${displayIn.toLocaleString()} ${t("expenses.received_not_counted")}` : ""),
              color: "text-slate-900",
            },
            {
              label: `${t("expenses.records")} · ${periodLabelLocalized}`,
              value: String(displayCount),
              sub: displayTotal.toLocaleString(),
              color: "text-slate-900",
            },
            {
              label: t("expenses.top_category"),
              value: topCategory ? t(`expenses.cat.${topCategory.category}`) : "-",
              sub: topCategory ? topCategory.total.toLocaleString() : t("common.no_data"),
              color: "text-slate-900",
            },
            {
              label: t("expenses.categories_used"),
              value: String(displayByCategory.length),
              sub: `${ALL_CATEGORIES.length} ${t("expenses.available")}`,
              color: "text-slate-900",
            },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-lg border border-slate-200 px-2.5 py-2">
              <div className="flex items-center gap-1 mb-1">
                <p className="text-[11px] font-medium text-slate-500 leading-none truncate">{card.label}</p>
              </div>
              <p className={`text-xl font-bold leading-none tabular-nums ${isZero(card.value) ? "text-slate-900" : card.color}`}>{card.value}</p>
              {card.sub && <p className="text-[11px] text-slate-500 mt-1 leading-tight truncate">{card.sub}</p>}
            </div>
          ))}
        </div>

        {/* ── EXPENSES TABLE ─────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

          {/* toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-1.5 border-b border-slate-100 bg-slate-50/60">
            <p className="text-[11px] text-slate-500">
              {t("common.showing")} <span className="font-semibold text-slate-700">{filteredExpenses.length.toLocaleString()}</span> {t("common.of")} <span className="font-semibold text-slate-700">{total.toLocaleString()}</span> {t("expenses.records")}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {(search || catFilter) && (
                <button onClick={() => { setSearch(""); setCatFilter(""); setPage(1); }} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition mr-1"><X size={10} /> {t("daterange.clear")}</button>
              )}
              <button onClick={downloadTemplate} title={t("expenses.download_template_title")}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition">
                <Download size={10} /> {t("common.template")}
              </button>
              <button onClick={() => fileInputRef.current?.click()} title={t("expenses.import_title_hint")}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition">
                <Upload size={10} /> {t("common.import")}
              </button>
              <button onClick={exportExcel} title={t("common.export_excel_title")}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition">
                <FileSpreadsheet size={10} /> Excel
              </button>
              <button onClick={exportPDF} title={t("common.export_pdf_title")}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition">
                <FileText size={10} /> PDF
              </button>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />

          {hasDateFilter && (
            <div className="flex items-center gap-2 px-4 py-1.5 border-b border-slate-100 text-xs bg-[#EBF2FD]" style={{ color: "#0a66c2" }}>
              <Calendar size={13} />
              <span>
                {dateFrom && <> {t("common.date")}: <span className="font-semibold">{dateFrom}</span></>}
                {dateTo   && <> → <span className="font-semibold">{dateTo}</span></>}
                {" "}· <span className="font-semibold">{total.toLocaleString()}</span> {t("expenses.records")}
              </span>
              <button onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }} className="ml-auto hover:opacity-70" style={{ color: "#0a66c2" }}><X size={13} /></button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {[
                    t("expenses.col_date"),
                    t("expenses.col_title"),
                    t("expenses.col_category"),
                    t("expenses.col_amount"),
                    t("expenses.payment_method"),
                    t("expenses.bank_name"),
                    t("expenses.account_ref"),
                    t("expenses.receiver_phone"),
                    t("expenses.col_notes"),
                    t("expenses.proof"),
                    "",
                  ].map((h) => (
                    <th key={h} data-primary={h === t("expenses.col_title") || undefined} className="px-2.5 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map((e) => {
                  const d = e.expense_date ? new Date(e.expense_date) : null;
                  const colors = CATEGORY_COLORS[e.category] || CATEGORY_COLORS.other;
                  return (
                    <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-2.5 py-1 whitespace-nowrap">
                        {d ? (
                          <div>
                            <p className="text-xs font-medium text-slate-700 leading-tight">{toDateStr(d)}</p>
                            <p className="text-[11px] text-slate-400 leading-tight">{d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                        ) : <span className="text-slate-300 text-xs">-</span>}
                      </td>
                      <td className="px-2.5 py-1">
                        <p className="font-semibold text-slate-800 text-xs leading-tight">{e.title}
                          {e.corrected && <span title={t("move.corrected_tag_hint")} className="ml-1 inline-flex rounded bg-amber-50 border border-amber-200 px-1 text-[10px] font-semibold text-amber-700 align-middle">{t("move.corrected_tag")}</span>}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono leading-tight">{e.id.slice(0, 8)}</p>
                      </td>
                      <td className="px-2.5 py-1">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold ${colors.badge}`}>
                          {t(`expenses.cat.${e.category}`)}
                        </span>
                      </td>
                      <td className="px-2.5 py-1 font-bold tabular-nums text-xs" style={{ color: isIn(e) ? "#057642" : "#0a66c2" }}>
                        {isIn(e) ? "+" : ""}{Number(e.amount).toLocaleString()}
                        {isIn(e) && <span className="block text-[10px] font-semibold leading-tight">{t("expenses.money_in")}</span>}
                      </td>
                      {/* Payment Method */}
                      <td className="px-2.5 py-1 whitespace-nowrap">
                        {e.payment_method === "mtn" && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">MTN MoMo</span>
                        )}
                        {e.payment_method === "bank" && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700">{t("common.bank")}</span>
                        )}
                        {!e.payment_method && <span className="text-slate-300 text-[11px]">-</span>}
                      </td>
                      {/* Bank Name */}
                      <td className="px-2.5 py-1 text-[11px] text-slate-600 whitespace-nowrap">
                        {e.bank_name || <span className="text-slate-300">-</span>}
                      </td>
                      {/* Account / Ref */}
                      <td className="px-2.5 py-1 text-[11px] text-slate-600 font-mono whitespace-nowrap">
                        {e.bank_account || <span className="text-slate-300 font-sans">-</span>}
                      </td>
                      {/* Receiver Phone */}
                      <td className="px-2.5 py-1 text-[11px] text-slate-600 whitespace-nowrap">
                        {e.receiver_phone || <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-2.5 py-1 text-slate-500 text-[11px] max-w-[160px] truncate">
                        {e.notes || <span className="text-slate-300 italic">-</span>}
                      </td>
                      <td className="px-2.5 py-1">
                        {e.has_proof ? (
                          <button onClick={() => openProofViewer(e.id)} title={t("expenses.view_proof_title")}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#EBF2FD] hover:bg-[#D5E8FB] text-[#0a66c2] transition text-[11px] font-medium">
                            <Paperclip size={9} /> {t("common.view")}
                          </button>
                        ) : (
                          <button onClick={() => pickProofFor(e.id)} disabled={uploadingProofId === e.id}
                            title={t("expenses.attach_receipts")}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-dashed border-slate-300 hover:border-[#0a66c2] hover:bg-[#EBF2FD] text-slate-500 hover:text-[#0a66c2] transition text-[11px] font-medium disabled:opacity-40">
                            {uploadingProofId === e.id ? <RefreshCw size={9} className="animate-spin" /> : <Plus size={9} />} {t("common.add")}
                          </button>
                        )}
                      </td>
                      <td className="px-2.5 py-1">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(e)} title={t("common.edit")} aria-label={t("common.edit")}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 hover:border-[#0a66c2] hover:bg-[#EBF2FD] hover:text-[#0a66c2] transition text-[11px] font-medium">
                            <Pencil size={9} /> {t("common.edit")}
                          </button>
                          {canCorrect && <button onClick={() => setMoving({ e, source: "other", reason: "" })} title={t("move.to_income")} aria-label={t("move.to_income")}
                            className={`p-0.5 rounded transition ${isIn(e) ? "text-[#057642] bg-emerald-50" : "text-slate-500"} hover:bg-emerald-50 hover:text-[#057642]`}>
                            <ArrowRightLeft size={10} />
                          </button>}
                          <button onClick={() => deleteExpense(e.id)} disabled={deletingId === e.id}
                            title={t("common.delete")} aria-label={t("common.delete")}
                            className="p-0.5 rounded text-slate-500 hover:bg-red-50 hover:text-red-600 transition disabled:opacity-40">
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <input ref={rowProofInputRef} type="file" accept="image/*,application/pdf"
              multiple className="hidden" onChange={handleRowProofSelect} />
          </div>

          {filteredExpenses.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                <AlertCircle size={20} className="opacity-40" />
              </div>
              <p className="font-semibold text-slate-500 text-xs">{t("expenses.no_expenses")}</p>
              {!search && !catFilter && (
                <button onClick={openModal}
                  className="mt-3 flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition hover:opacity-90" style={{ background: "#0a66c2" }}>
                  <Plus size={11} /> {t("expenses.add")}
                </button>
              )}
            </div>
          )}

          <Pagination page={page} totalPages={totalPages} total={total}
            pageSize={pageSize} pageSizes={PAGE_SIZES} onPage={setPage} onPageSize={setPageSize} />
        </div>

        {/* ── BY-CATEGORY BREAKDOWN ───────────────────────────── */}
        {byCategory.length > 0 && (
          <div className="mt-2 bg-white rounded-xl border border-slate-200 px-3 py-2">
            <h2 className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <BarChart3 size={13} style={{ color: "#0a66c2" }} />
              {t("expenses.breakdown_title")}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-1.5">
              {byCategory.map((row) => {
                const colors = CATEGORY_COLORS[row.category] || CATEGORY_COLORS.other;
                const grandTotal = byCategory.reduce((s, r) => s + r.total, 0);
                const pct = grandTotal > 0 ? Math.round((row.total / grandTotal) * 100) : 0;
                return (
                  <div key={row.category} className={`rounded-lg px-2 py-1.5 ${colors.bg}`}>
                    <p className={`text-[11px] font-semibold uppercase tracking-wide ${colors.text} truncate`}>{t(`expenses.cat.${row.category}`)}</p>
                    <p className={`text-sm font-bold mt-0.5 ${colors.text} tabular-nums`}>{row.total.toLocaleString()}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[11px] text-slate-400">{row.count}</p>
                      <p className={`text-[11px] font-bold ${colors.text}`}>{pct}%</p>
                    </div>
                    <div className="mt-1 h-0.5 bg-black/10 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${colors.text.replace("text-", "bg-")}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── FACEBOOK-STYLE DIALOG ───────────────────────────── */}
        {dialog && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.45)" }}
            onClick={dialog.onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[360px] overflow-hidden"
              onClick={(e) => e.stopPropagation()}>
              {/* Body */}
              <div className="px-5 pt-5 pb-4 text-center">
                {/* Icon */}
                <div className={`w-10 h-10 rounded-full mx-auto mb-3 flex items-center justify-center ${dialog.danger ? "bg-red-100" : "bg-[#EBF2FD]"}`}>
                  {dialog.danger
                    ? <Trash2 size={18} className="text-red-500" />
                    : <AlertCircle size={18} style={{ color: "#0a66c2" }} />}
                </div>
                <p className="text-[13px] font-bold text-gray-900 leading-snug mb-1">{dialog.title}</p>
                <p className="text-[12px] text-gray-500 leading-relaxed">{dialog.message}</p>
              </div>
              {/* Divider */}
              <div className="h-px bg-gray-100" />
              {/* Buttons */}
              {dialog.type === "confirm" ? (
                <div className="grid grid-cols-2 divide-x divide-gray-100">
                  <button onClick={dialog.onClose}
                    className="py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                    {t("common.cancel")}
                  </button>
                  <button onClick={dialog.onConfirm}
                    className={`py-2.5 text-[13px] font-bold transition-colors ${dialog.danger ? "text-red-600 hover:bg-red-50" : "hover:bg-[#EBF2FD]"}`}
                    style={dialog.danger ? {} : { color: "#0a66c2" }}>
                    {dialog.confirmLabel ?? t("common.confirm")}
                  </button>
                </div>
              ) : (
                <button onClick={dialog.onClose}
                  className="w-full py-2.5 text-[13px] font-bold hover:bg-[#EBF2FD] transition-colors"
                  style={{ color: "#0a66c2" }}>
                  {t("common.ok")}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── PROOF VIEWER ────────────────────────────────────── */}
        {viewingProofs.length > 0 && (() => {
          const current = viewingProofs[viewerIndex];
          return (
            <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setViewingProofs([])}>
              <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92dvh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}>

                {/* header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Paperclip size={14} className="text-slate-500" />
                    {t("expenses.proof_viewer_title")}
                    {viewingProofs.length > 1 && (
                      <span className="text-xs font-normal text-slate-400 ml-1">
                        {viewerIndex + 1} / {viewingProofs.length}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={current.data} download={current.name}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
                      <Download size={11} /> {t("common.download")}
                    </a>
                    <button onClick={() => setViewingProofs([])}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={16} /></button>
                  </div>
                </div>

                {/* main viewer */}
                <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-50 min-h-0">
                  {current.type === "application/pdf" ? (
                    <iframe src={current.data} className="w-full h-[60dvh] rounded border border-slate-200" title={current.name} />
                  ) : (
                    <img src={current.data} alt={current.name} className="max-w-full max-h-[60dvh] object-contain rounded shadow" />
                  )}
                </div>

                {/* thumbnail strip (only when >1 file) */}
                {viewingProofs.length > 1 && (
                  <div className="flex gap-2 px-4 py-3 border-t border-slate-100 overflow-x-auto shrink-0 bg-slate-50/60">
                    {viewingProofs.map((f, i) => (
                      <button key={i} onClick={() => setViewerIndex(i)}
                        className={`shrink-0 w-14 h-14 rounded-lg border-2 overflow-hidden flex items-center justify-center transition ${i === viewerIndex ? "border-[#0a66c2] shadow" : "border-slate-200 hover:border-slate-400"}`}>
                        {f.type === "application/pdf" ? (
                          <FileIcon size={20} className="text-slate-500" />
                        ) : (
                          <img src={f.data} alt={f.name} className="w-full h-full object-cover" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── MODAL ───────────────────────────────────────────── */}
        {showModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-3">
            <div className="bg-white rounded-xl w-full max-w-md shadow-2xl max-h-[92dvh] flex flex-col">

              {/* Header */}
              <div className="flex justify-between items-center px-3 py-2 border-b border-slate-100 shrink-0">
                <h2 className="text-xs font-semibold text-slate-800">{t(editingId ? "expenses.edit_title" : "expenses.add_title")}</h2>
                <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setProofEntries([]); }}
                  className="p-1 rounded-md hover:bg-slate-100 text-slate-400 transition"><X size={12} /></button>
              </div>

              {/* Body */}
              <div className="px-3 py-2 grid gap-2 overflow-y-auto flex-1">

                {/* Title */}
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-0.5">
                    {t("expenses.title_field")} <span className="text-red-400">*</span>
                  </label>
                  <input className={inputCls} placeholder={t("expenses.title_placeholder")}
                    value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>

                {/* Category + Amount */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-0.5">
                      {t("expenses.category")} <span className="text-red-400">*</span>
                    </label>
                    <select className={inputCls} value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value as Category })}>
                      {ALL_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{t(`expenses.cat.${c}`)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-0.5">
                      {t("expenses.amount")} <span className="text-red-400">*</span>
                    </label>
                    <input type="number" min="0" step="0.01" className={inputCls} placeholder="0"
                      value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  </div>
                </div>

                {/* Date + Notes side-by-side */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-0.5">
                      {t("expenses.expense_date")} <span className="text-red-400">*</span>
                    </label>
                    <input type="date" className={inputCls}
                      value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-0.5">{t("common.notes")}</label>
                    <input className={inputCls} placeholder={t("common.notes_placeholder")}
                      value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </div>
                </div>

                {/* Payment method */}
                <div className="border border-slate-100 rounded-lg p-2 bg-slate-50/50">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t("expenses.payment_method")}</p>
                  <div className="flex gap-1.5 mb-1.5">
                    {(["", "mtn", "bank"] as PaymentMethod[]).map((m) => (
                      <button key={m} type="button"
                        onClick={() => setForm({ ...form, payment_method: m, bank_name: "", bank_account: "", receiver_phone: "" })}
                        className={`flex-1 py-1 rounded-md text-[11px] font-semibold border transition-all ${
                          form.payment_method === m
                            ? "bg-[#0a66c2] border-[#0a66c2] text-white"
                            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}>
                        {m === "" ? t("common.none") : m === "mtn" ? "MTN MoMo" : t("common.bank")}
                      </button>
                    ))}
                  </div>

                  {form.payment_method === "bank" && (
                    <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                      <div>
                        <label className="block text-[11px] font-medium text-gray-500 mb-0.5">{t("expenses.bank_name")}</label>
                        <select className={inputCls} value={form.bank_name}
                          onChange={(e) => setForm({ ...form, bank_name: e.target.value })}>
                          <option value="">{t("expenses.select_bank")}</option>
                          {BANK_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
                          {form.bank_name && !BANK_NAMES.includes(form.bank_name) && <option value={form.bank_name}>{form.bank_name}</option>}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-500 mb-0.5">{t("expenses.account_ref")}</label>
                        <input className={inputCls} placeholder={t("expenses.account_ref_placeholder")}
                          value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} />
                      </div>
                    </div>
                  )}

                  {form.payment_method !== "" && (
                    <div>
                      <label className="block text-[11px] font-medium text-gray-500 mb-0.5">
                        {form.payment_method === "mtn" ? t("expenses.receiver_phone_mtn") : t("expenses.receiver_phone")}
                      </label>
                      <input className={inputCls} placeholder="+250 7XX XXX XXX"
                        value={form.receiver_phone} onChange={(e) => setForm({ ...form, receiver_phone: e.target.value })} />
                    </div>
                  )}
                </div>

                {/* Proof upload (new expenses; a saved one's proof is managed from its row) */}
                {!editingId && <div>
                  <label className="flex items-center gap-1 text-[11px] font-medium text-gray-500 mb-0.5">
                    <Paperclip size={9} /> {t("expenses.proof")}
                    <span className="text-slate-400 font-normal ml-1">{t("expenses.proof_hint")}</span>
                  </label>
                  <input ref={proofInputRef} type="file" accept="image/*,application/pdf"
                    multiple className="hidden" onChange={handleProofSelect} />

                  {proofEntries.length > 0 && (
                    <div className="grid grid-cols-5 gap-1 mb-1">
                      {proofEntries.map((entry, idx) => (
                        <div key={idx} className="relative rounded-md border border-slate-200 bg-slate-50 overflow-hidden">
                          {entry.preview === "pdf" ? (
                            <div className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-1">
                              <FileIcon size={14} className="text-slate-500" />
                              <span className="text-[7px] text-slate-500 truncate w-full text-center">{entry.name}</span>
                            </div>
                          ) : (
                            <img src={entry.preview} alt={entry.name} className="w-full h-10 object-cover" />
                          )}
                          <button onClick={() => removeProofEntry(idx)}
                            className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 transition">
                            <X size={6} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {proofEntries.length < 5 && (
                    <button type="button" onClick={() => proofInputRef.current?.click()}
                      className="w-full border border-dashed border-slate-300 hover:border-[#0a66c2] rounded-md px-2 py-1.5 flex items-center justify-center gap-1 text-[11px] text-slate-400 hover:text-[#0a66c2] transition-colors">
                      <ImageIcon size={10} />
                      {proofEntries.length === 0 ? t("expenses.attach_receipts") : `${t("expenses.add_more")} (${5 - proofEntries.length})`}
                    </button>
                  )}
                </div>}

                {/* Summary hint */}
                {form.amount && Number(form.amount) > 0 && form.direction !== "in" && (
                  <div className="rounded-md px-2 py-1 text-[11px] bg-[#EBF2FD]" style={{ color: "#0a66c2" }}>
                    {t("expenses.recording")}: <span className="font-bold">{Number(form.amount).toLocaleString()}</span>
                    {" "}{t("expenses.under")} <span className="font-bold">{t(`expenses.cat.${form.category}`)}</span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-1.5 px-3 py-2 border-t border-slate-100 shrink-0">
                <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setProofEntries([]); }}
                  className="px-3 py-1 rounded-md border border-slate-200 text-slate-600 text-[11px] font-medium hover:bg-slate-50 transition">
                  {t("common.cancel")}
                </button>
                <button onClick={submitForm} disabled={submitting}
                  className="px-3 py-1 rounded-md text-white text-[11px] font-semibold transition disabled:opacity-60 hover:opacity-90 flex items-center gap-1" style={{ background: "#0a66c2" }}>
                  {proofEntries.length > 0 && !submitting && <Paperclip size={9} />}
                  {submitting ? t("common.saving") : t(editingId ? "common.save" : "expenses.add")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ExpenseSkeleton() {
  return (
    <div className="min-h-screen">
      <style>{`
        @keyframes exp-sh {
          0%   { background-position: -600px 0; }
          100% { background-position:  600px 0; }
        }
        .exp-sh {
          background: linear-gradient(90deg, #f0f0f0 25%, #e4e4e4 50%, #f0f0f0 75%);
          background-size: 600px 100%;
          animation: exp-sh 1.4s infinite linear;
        }
        .exp-sh-blue {
          background: linear-gradient(90deg, rgba(255,255,255,0.10) 25%, rgba(255,255,255,0.20) 50%, rgba(255,255,255,0.10) 75%);
          background-size: 600px 100%;
          animation: exp-sh 1.4s infinite linear;
        }
      `}</style>

      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4">

        {/* Banner */}
        <div className="hgv-surface rounded-xl mb-2 overflow-hidden px-3 pt-2 pb-2">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="exp-sh-blue w-3.5 h-3.5 rounded shrink-0" />
            <div className="exp-sh-blue h-2.5 w-28 rounded flex-1" />
            <div className="exp-sh-blue h-2 w-16 rounded" />
            <div className="exp-sh-blue h-5 w-5 rounded-md shrink-0" />
            <div className="exp-sh-blue h-5 w-16 rounded-md shrink-0" />
          </div>
          <div className="exp-sh-blue h-6 rounded-lg mb-1" />
          <div className="exp-sh-blue h-5 rounded-lg" />
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-200 px-2.5 py-2">
              <div className="flex items-center gap-1 mb-1.5">
                <div className="exp-sh w-1.5 h-1.5 rounded-full shrink-0" />
                <div className="exp-sh h-1.5 w-16 rounded" />
              </div>
              <div className="exp-sh h-4 w-14 rounded mb-1" />
              <div className="exp-sh h-1.5 w-10 rounded" />
            </div>
          ))}
        </div>

        {/* Table card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-1.5 border-b border-slate-100 bg-slate-50/60">
            <div className="exp-sh h-2 w-24 rounded" />
            <div className="flex flex-wrap items-center gap-1.5">
              {[56, 44, 48, 40].map((w, i) => (
                <div key={i} className="exp-sh h-5 rounded" style={{ width: w }} />
              ))}
            </div>
          </div>

          {/* Table head */}
          <div className="grid gap-3 px-2.5 py-1.5 border-b border-slate-200 bg-slate-50"
            style={{ gridTemplateColumns: "80px 1fr 80px 70px 120px 50px 30px" }}>
            {[...Array(7)].map((_, i) => (
              <div key={i} className="exp-sh h-1.5 rounded" />
            ))}
          </div>

          {/* Table rows */}
          {[...Array(9)].map((_, i) => (
            <div key={i} className="grid gap-3 px-2.5 py-1 border-b border-slate-50 items-center"
              style={{ gridTemplateColumns: "80px 1fr 80px 70px 120px 50px 30px" }}>
              <div className="space-y-0.5">
                <div className="exp-sh h-2 w-16 rounded" />
                <div className="exp-sh h-1.5 w-10 rounded" />
              </div>
              <div className="space-y-0.5">
                <div className="exp-sh h-2.5 rounded" />
                <div className="exp-sh h-1.5 w-3/4 rounded" />
              </div>
              <div className="exp-sh h-4 w-14 rounded-full" />
              <div className="exp-sh h-2.5 w-12 rounded" />
              <div className="exp-sh h-2 rounded" />
              <div className="exp-sh h-4 w-9 rounded" />
              <div className="exp-sh h-5 w-5 rounded" />
            </div>
          ))}

          {/* Pagination row */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100">
            <div className="exp-sh h-2 w-20 rounded" />
            <div className="flex gap-1">
              {[...Array(4)].map((_, i) => <div key={i} className="exp-sh h-6 w-7 rounded" />)}
            </div>
          </div>
        </div>

        {/* Breakdown strip */}
        <div className="mt-2 bg-white rounded-xl border border-slate-200 px-3 py-2">
          <div className="exp-sh h-2.5 w-32 rounded mb-2" />
          <div className="grid grid-cols-5 gap-1.5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="exp-sh h-14 rounded-lg" />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
