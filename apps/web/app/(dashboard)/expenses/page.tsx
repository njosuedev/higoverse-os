"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { expenseRequest, expenseUploadProof } from "@/lib/expense-api";
import { useLanguage } from "@/lib/language-context";
import { useShopSettings } from "@/lib/shop-settings-context";
import Pagination from "@/app/components/ui/Pagination";
import DateRangeFilter from "@/app/components/ui/DateRangeFilter";
import {
  Plus, Trash2, X, Calendar, BarChart3, AlertCircle, Download, Upload, FileSpreadsheet, FileText, Paperclip, ImageIcon, FileIcon, Receipt, RefreshCw, Search, Filter, ChevronDown,
} from "lucide-react";

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
}

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

const CATEGORY_COLORS: Record<Category, { bg: string; text: string; badge: string }> = {
  rent:        { bg: "bg-blue-50",   text: "text-blue-700",   badge: "bg-blue-100 text-blue-700" },
  utilities:   { bg: "bg-cyan-50",   text: "text-cyan-700",   badge: "bg-cyan-100 text-cyan-700" },
  salaries:    { bg: "bg-violet-50", text: "text-violet-700", badge: "bg-violet-100 text-violet-700" },
  supplies:    { bg: "bg-amber-50",  text: "text-amber-700",  badge: "bg-amber-100 text-amber-700" },
  maintenance: { bg: "bg-orange-50", text: "text-orange-700", badge: "bg-orange-100 text-orange-700" },
  marketing:   { bg: "bg-pink-50",   text: "text-pink-700",   badge: "bg-pink-100 text-pink-700" },
  transport:   { bg: "bg-teal-50",   text: "text-teal-700",   badge: "bg-teal-100 text-teal-700" },
  taxes:       { bg: "bg-purple-50", text: "text-purple-700", badge: "bg-purple-100 text-purple-700" },
  other:       { bg: "bg-slate-50",  text: "text-slate-600",  badge: "bg-slate-100 text-slate-600" },
};

const PAGE_SIZES = [25, 50, 100, 250];
const EMPTY_FORM = {
  title: "", category: "other" as Category, amount: "", notes: "", expense_date: "",
  payment_method: "" as PaymentMethod, bank_name: "", bank_account: "", receiver_phone: "",
};

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ExpenseManagementPage() {
  const { t } = useLanguage();
  const { currency } = useShopSettings();

  const [expenses, setExpenses]       = useState<Expense[]>([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [pageSize, setPageSize]       = useState(25);
  const [dateFrom, setDateFrom]       = useState(() => toDateStr(new Date()));
  const [dateTo, setDateTo]           = useState(() => toDateStr(new Date()));
  const [catFilter, setCatFilter]     = useState<Category | "">("");
  const [search, setSearch]           = useState("");

  const [summaryFiltered, setSummaryFiltered] = useState({ total_expenses: 0, count: 0 });
  const [byCategory, setByCategory]          = useState<CategoryStat[]>([]);

  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [showModal, setShowModal]     = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [deletingId, setDeletingId]   = useState("");
  const [form, setForm]               = useState(EMPTY_FORM);

  const [proofEntries, setProofEntries]   = useState<ProofEntry[]>([]);
  const [viewingProofs, setViewingProofs] = useState<ProofFile[]>([]);
  const [viewerIndex, setViewerIndex]     = useState(0);

  const [dialog, setDialog] = useState<DialogState | null>(null);

  const fileInputRef    = useRef<HTMLInputElement>(null);
  const proofInputRef   = useRef<HTMLInputElement>(null);

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

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const today = toDateStr(new Date());
    const ws = XLSX.utils.aoa_to_sheet([
      ["HIGOVERSE — Expense Import Template  |  Do not modify column headers  |  payment_method: mtn or bank  |  category: rent | utilities | salaries | supplies | maintenance | marketing | transport | taxes | other"],
      [],
      ["title *", "category *", "amount *", "expense_date *", "payment_method *", "bank_name", "bank_account", "receiver_phone", "notes"],
      ["Monthly Office Rent", "rent",      200000, today, "bank", "BK Bank",     "001-200-456",  "",              "Q2 office space"],
      ["Staff Salaries",      "salaries",  850000, today, "bank", "Equity Bank", "ACC-78901",    "+250788123456", "June payroll"],
      ["Airtime & Internet",  "utilities",  12000, today, "mtn",  "",            "",             "+250788654321", "Monthly plan"],
    ]);
    ws["!cols"] = [
      { wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 16 },
      { wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 20 }, { wch: 35 },
    ];
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Import Template");
    XLSX.writeFile(wb, "expense_import_template.xlsx");
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws);
      let imported = 0, failed = 0;
      for (const row of rows) {
        try {
          const title = (row.title || row.Title || "").trim();
          const amount = Number(row.amount || row.Amount || 0);
          const expDate = (row.expense_date || row["Expense Date"] || toDateStr(new Date())).trim();
          if (!title || !amount) { failed++; continue; }
          const cat = (row.category || row.Category || "other").toLowerCase() as Category;
          await expenseRequest("/expenses", {
            method: "POST",
            body: JSON.stringify({
              title,
              category: ALL_CATEGORIES.includes(cat) ? cat : "other",
              amount,
              notes: (row.notes || row.Notes || "").trim() || undefined,
              expense_date: expDate + (expDate.includes("T") ? "" : "T00:00:00"),
            }),
          });
          imported++;
        } catch { failed++; }
      }
      e.target.value = "";
      await showAlert(
        t("expenses.import_complete_title"),
        `${t("expenses.import_summary_imported")} ${imported} ${t("expenses.import_summary_records")}${failed ? ` · ${failed} ${t("expenses.import_summary_failed")}` : ""}.`
      );
      await loadAll(true);
    } catch { await showAlert(t("expenses.import_failed_title"), t("expenses.import_failed_msg")); }
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
    const rows = await fetchAllForExport();
    const now  = new Date();

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
      [`EXPENSE REPORT — ${periodLabel.toUpperCase()}`],
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
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
    ];

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
    ws2["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws,  "Expenses");
    XLSX.utils.book_append_sheet(wb, ws2, "Summary");
    XLSX.writeFile(wb, `expenses_${toDateStr(now)}.xlsx`);
  }

  async function exportPDF() {
    const { jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const rows = await fetchAllForExport();
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
    const C_PURPLE = [109,  40, 217] as [number, number, number];

    const grandTotal = rows.reduce((s, e) => s + Number(e.amount), 0);
    const catMap: Record<string, { total: number; count: number }> = {};
    rows.forEach((e) => {
      if (!catMap[e.category]) catMap[e.category] = { total: 0, count: 0 };
      catMap[e.category].total += Number(e.amount);
      catMap[e.category].count += 1;
    });
    const catEntries = Object.entries(catMap).sort(([, a], [, b]) => b.total - a.total);
    const topCat     = catEntries[0];

    // ── Header banner ────────────────────────────────────────────────────────
    doc.setFillColor(...C_BLUE);
    doc.rect(0, 0, PW, 30, "F");

    doc.setTextColor(...C_WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("EXPENSE REPORT", 14, 13);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(
      `Period: ${dateFrom || "All time"}  →  ${dateTo || toDateStr(now)}` +
      (catFilter ? `   |   Category: ${catFilter}` : ""),
      14, 20,
    );
    doc.text(`Generated: ${now.toLocaleString()}`, 14, 26);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(grandTotal.toLocaleString(), PW - 14, 14, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`${currency}  TOTAL EXPENSES`, PW - 14, 20, { align: "right" });
    doc.text(`${rows.length} records  ·  ${periodLabel}`, PW - 14, 26, { align: "right" });

    // ── Summary cards ────────────────────────────────────────────────────────
    const cardY = 34;
    const cardH = 20;
    const gap   = 3;
    const cardW = (PW - 28 - gap * 3) / 4;

    const summaryCards = [
      { label: "TOTAL AMOUNT",   value: grandTotal.toLocaleString(), sub: currency,                          accent: C_BLUE   },
      { label: "TOTAL RECORDS",  value: String(rows.length),         sub: "expenses",                     accent: C_GREEN  },
      { label: "TOP CATEGORY",   value: topCat ? topCat[0].toUpperCase() : "—", sub: topCat ? `${topCat[1].total.toLocaleString()} ${currency}` : "", accent: C_ORANGE },
      { label: "CATEGORIES",     value: String(catEntries.length),   sub: `of ${ALL_CATEGORIES.length}`,  accent: C_PURPLE },
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
          d ? toDateStr(d) : "—",
          e.title,
          e.category.charAt(0).toUpperCase() + e.category.slice(1),
          Number(e.amount).toLocaleString(),
          e.payment_method === "mtn"  ? "MTN MoMo"
            : e.payment_method === "bank" ? "Bank" : "—",
          e.bank_name      || "—",
          e.bank_account   || "—",
          e.receiver_phone || "—",
          e.notes ? (e.notes.length > 40 ? e.notes.slice(0, 38) + "…" : e.notes) : "—",
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
        doc.text("Higoverse — Expense Management System", 14, PH - 3.5);
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
      setSummaryFiltered(res?.data || { total_expenses: 0, count: 0 });
    } catch { /* ignore */ }
  }

  async function loadByCategory() {
    try {
      const params = new URLSearchParams({
        ...(dateFrom && { from_date: dateFrom }),
        ...(dateTo   && { to_date: dateTo }),
      });
      const res = await expenseRequest(`/expenses/by-category?${params}`);
      setByCategory(res?.data || []);
    } catch { /* ignore */ }
  }

  function openModal() {
    setForm({ ...EMPTY_FORM, expense_date: toDateStr(new Date()) });
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
    filteredExpenses.forEach((e) => {
      if (!map[e.category]) map[e.category] = { category: e.category as Category, total: 0, count: 0 };
      map[e.category].total += Number(e.amount);
      map[e.category].count += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [search, byCategory, filteredExpenses]);

  const displayTotal = search
    ? filteredExpenses.reduce((s, e) => s + Number(e.amount), 0)
    : summaryFiltered.total_expenses;
  const displayCount = search ? filteredExpenses.length : summaryFiltered.count;
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
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4">

        {/* ── HEADER ─────────────────────────────────────────── */}
        <div className="hgv-surface relative rounded-xl mb-2 overflow-hidden"
          style={{ background: "linear-gradient(135deg, #0a66c2 0%, #004182 50%, #00376b 100%)" }}>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "18px 18px" }} />

          {/* Single title row */}
          <div className="relative flex items-center gap-2 px-4 pt-2.5 pb-2">
            <Receipt size={14} className="text-white/80 shrink-0" strokeWidth={2} />
            <h1 className="text-sm font-bold text-white tracking-tight mr-auto">{t("expenses.title")}</h1>
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
            </span>
            <span className="text-[11px] text-blue-100/70 mr-1">
              <span className="font-semibold text-white/80">{total.toLocaleString()}</span> {t("expenses.records")}
            </span>
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
              <div className="flex-1 flex items-center gap-2 bg-white/10 hover:bg-white/15 focus-within:bg-white/20 border border-white/10 focus-within:border-white/30 rounded-xl px-3 py-2 transition-all group">
                <Search size={13} className="shrink-0 text-white/40 group-focus-within:text-white/70 transition-colors" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("expenses.search")}
                  className="bg-transparent outline-none w-full text-sm text-white placeholder:text-white/40 font-medium" />
                {search && <button onClick={() => setSearch("")} className="w-4 h-4 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center text-white/70 transition-all shrink-0"><X size={9} /></button>}
              </div>
              <div className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl px-3 py-2 transition-all">
                <Filter size={11} className="shrink-0 text-white/50" />
                <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value as Category | ""); setPage(1); }}
                  className="bg-transparent outline-none text-sm text-white font-semibold appearance-none cursor-pointer">
                  <option value="" className="text-gray-800">{t("expenses.all_categories")}</option>
                  {ALL_CATEGORIES.map((c) => (
                    <option key={c} value={c} className="text-gray-800">{t(`expenses.cat.${c}`)}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="text-white/35 shrink-0" />
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
              sub: `${displayCount} ${t("expenses.records")}`,
              color: "text-[#0a66c2]", dot: "bg-[#0a66c2]",
            },
            {
              label: `${t("expenses.records")} · ${periodLabelLocalized}`,
              value: String(displayCount),
              sub: displayTotal.toLocaleString(),
              color: "text-blue-700", dot: "bg-blue-600",
            },
            {
              label: t("expenses.top_category"),
              value: topCategory ? t(`expenses.cat.${topCategory.category}`) : "—",
              sub: topCategory ? topCategory.total.toLocaleString() : t("common.no_data"),
              color: "text-orange-600", dot: "bg-orange-400",
            },
            {
              label: t("expenses.categories_used"),
              value: String(displayByCategory.length),
              sub: `${ALL_CATEGORIES.length} ${t("expenses.available")}`,
              color: "text-violet-600", dot: "bg-violet-500",
            },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-lg border border-slate-200 px-2.5 py-2">
              <div className="flex items-center gap-1 mb-1">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${card.dot}`} />
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider leading-none truncate">{card.label}</p>
              </div>
              <p className={`text-xl font-bold leading-none tabular-nums ${card.color}`}>{card.value}</p>
              {card.sub && <p className="text-[10px] text-slate-400 mt-1 leading-tight truncate">{card.sub}</p>}
            </div>
          ))}
        </div>

        {/* ── EXPENSES TABLE ─────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

          {/* toolbar */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 bg-slate-50/60">
            <p className="text-[11px] text-slate-500">
              {t("common.showing")} <span className="font-semibold text-slate-700">{filteredExpenses.length.toLocaleString()}</span> {t("common.of")} <span className="font-semibold text-slate-700">{total.toLocaleString()}</span> {t("expenses.records")}
            </p>
            <div className="flex items-center gap-1.5">
              {(search || catFilter) && (
                <button onClick={() => { setSearch(""); setCatFilter(""); setPage(1); }} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition mr-1"><X size={10} /> {t("daterange.clear")}</button>
              )}
              <button onClick={downloadTemplate} title={t("expenses.download_template_title")}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-violet-200 text-violet-600 bg-white hover:bg-violet-50 transition">
                <Download size={10} /> {t("common.template")}
              </button>
              <button onClick={() => fileInputRef.current?.click()} title={t("expenses.import_title_hint")}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-violet-200 text-violet-600 bg-white hover:bg-violet-50 transition">
                <Upload size={10} /> {t("common.import")}
              </button>
              <button onClick={exportExcel} title={t("common.export_excel_title")}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-green-200 text-green-600 bg-white hover:bg-green-50 transition">
                <FileSpreadsheet size={10} /> Excel
              </button>
              <button onClick={exportPDF} title={t("common.export_pdf_title")}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-red-200 text-red-600 bg-white hover:bg-red-50 transition">
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
                    <th key={h} className="px-2.5 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">{h}</th>
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
                            <p className="text-[10px] text-slate-400 leading-tight">{d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-2.5 py-1">
                        <p className="font-semibold text-slate-800 text-xs leading-tight">{e.title}</p>
                        <p className="text-[10px] text-slate-400 font-mono leading-tight">{e.id.slice(0, 8)}</p>
                      </td>
                      <td className="px-2.5 py-1">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${colors.badge}`}>
                          {t(`expenses.cat.${e.category}`)}
                        </span>
                      </td>
                      <td className="px-2.5 py-1 font-bold tabular-nums text-xs" style={{ color: "#0a66c2" }}>
                        {Number(e.amount).toLocaleString()}
                      </td>
                      {/* Payment Method */}
                      <td className="px-2.5 py-1 whitespace-nowrap">
                        {e.payment_method === "mtn" && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-100 text-yellow-700">MTN MoMo</span>
                        )}
                        {e.payment_method === "bank" && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">{t("common.bank")}</span>
                        )}
                        {!e.payment_method && <span className="text-slate-300 text-[10px]">—</span>}
                      </td>
                      {/* Bank Name */}
                      <td className="px-2.5 py-1 text-[10px] text-slate-600 whitespace-nowrap">
                        {e.bank_name || <span className="text-slate-300">—</span>}
                      </td>
                      {/* Account / Ref */}
                      <td className="px-2.5 py-1 text-[10px] text-slate-600 font-mono whitespace-nowrap">
                        {e.bank_account || <span className="text-slate-300 font-sans">—</span>}
                      </td>
                      {/* Receiver Phone */}
                      <td className="px-2.5 py-1 text-[10px] text-slate-600 whitespace-nowrap">
                        {e.receiver_phone || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-2.5 py-1 text-slate-500 text-[10px] max-w-[160px] truncate">
                        {e.notes || <span className="text-slate-300 italic">—</span>}
                      </td>
                      <td className="px-2.5 py-1">
                        {e.has_proof ? (
                          <button onClick={() => openProofViewer(e.id)} title={t("expenses.view_proof_title")}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition text-[10px] font-medium">
                            <Paperclip size={9} /> {t("common.view")}
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[10px] italic">—</span>
                        )}
                      </td>
                      <td className="px-2.5 py-1">
                        <button onClick={() => deleteExpense(e.id)} disabled={deletingId === e.id}
                          className="p-0.5 rounded bg-red-50 hover:bg-red-100 text-red-500 transition disabled:opacity-40">
                          <Trash2 size={10} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1.5">
              {byCategory.map((row) => {
                const colors = CATEGORY_COLORS[row.category] || CATEGORY_COLORS.other;
                const grandTotal = byCategory.reduce((s, r) => s + r.total, 0);
                const pct = grandTotal > 0 ? Math.round((row.total / grandTotal) * 100) : 0;
                return (
                  <div key={row.category} className={`rounded-lg px-2 py-1.5 ${colors.bg}`}>
                    <p className={`text-[9px] font-semibold uppercase tracking-wide ${colors.text} truncate`}>{t(`expenses.cat.${row.category}`)}</p>
                    <p className={`text-sm font-bold mt-0.5 ${colors.text} tabular-nums`}>{row.total.toLocaleString()}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[9px] text-slate-400">{row.count}</p>
                      <p className={`text-[9px] font-bold ${colors.text}`}>{pct}%</p>
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
              <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}>

                {/* header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Paperclip size={14} className="text-emerald-500" />
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
                    <iframe src={current.data} className="w-full h-[60vh] rounded border border-slate-200" title={current.name} />
                  ) : (
                    <img src={current.data} alt={current.name} className="max-w-full max-h-[60vh] object-contain rounded shadow" />
                  )}
                </div>

                {/* thumbnail strip (only when >1 file) */}
                {viewingProofs.length > 1 && (
                  <div className="flex gap-2 px-4 py-3 border-t border-slate-100 overflow-x-auto shrink-0 bg-slate-50/60">
                    {viewingProofs.map((f, i) => (
                      <button key={i} onClick={() => setViewerIndex(i)}
                        className={`shrink-0 w-14 h-14 rounded-lg border-2 overflow-hidden flex items-center justify-center transition ${i === viewerIndex ? "border-[#0a66c2] shadow" : "border-slate-200 hover:border-slate-400"}`}>
                        {f.type === "application/pdf" ? (
                          <FileIcon size={20} className="text-red-400" />
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
            <div className="bg-white rounded-xl w-full max-w-md shadow-2xl max-h-[92vh] flex flex-col">

              {/* Header */}
              <div className="flex justify-between items-center px-3 py-2 border-b border-slate-100 shrink-0">
                <h2 className="text-xs font-semibold text-slate-800">{t("expenses.add_title")}</h2>
                <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setProofEntries([]); }}
                  className="p-1 rounded-md hover:bg-slate-100 text-slate-400 transition"><X size={12} /></button>
              </div>

              {/* Body */}
              <div className="px-3 py-2 grid gap-2 overflow-y-auto flex-1">

                {/* Title */}
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                    {t("expenses.title_field")} <span className="text-red-400">*</span>
                  </label>
                  <input className={inputCls} placeholder={t("expenses.title_placeholder")}
                    value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>

                {/* Category + Amount */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
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
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                      {t("expenses.amount")} <span className="text-red-400">*</span>
                    </label>
                    <input type="number" min="0" step="0.01" className={inputCls} placeholder="0"
                      value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  </div>
                </div>

                {/* Date + Notes side-by-side */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                      {t("expenses.expense_date")} <span className="text-red-400">*</span>
                    </label>
                    <input type="date" className={inputCls}
                      value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">{t("common.notes")}</label>
                    <input className={inputCls} placeholder={t("common.notes_placeholder")}
                      value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </div>
                </div>

                {/* Payment method */}
                <div className="border border-slate-100 rounded-lg p-2 bg-slate-50/50">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t("expenses.payment_method")}</p>
                  <div className="flex gap-1.5 mb-1.5">
                    {(["", "mtn", "bank"] as PaymentMethod[]).map((m) => (
                      <button key={m} type="button"
                        onClick={() => setForm({ ...form, payment_method: m, bank_name: "", bank_account: "", receiver_phone: "" })}
                        className={`flex-1 py-1 rounded-md text-[10px] font-semibold border transition-all ${
                          form.payment_method === m
                            ? m === "mtn"  ? "bg-yellow-400 border-yellow-400 text-white"
                            : m === "bank" ? "border-[#0a66c2] text-white"
                            : "bg-slate-200 border-slate-200 text-slate-700"
                            : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                        }`}
                        style={form.payment_method === m && m === "bank" ? { background: "#0a66c2" } : {}}>
                        {m === "" ? t("common.none") : m === "mtn" ? "MTN MoMo" : t("common.bank")}
                      </button>
                    ))}
                  </div>

                  {form.payment_method === "bank" && (
                    <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-0.5">{t("expenses.bank_name")}</label>
                        <select className={inputCls} value={form.bank_name}
                          onChange={(e) => setForm({ ...form, bank_name: e.target.value })}>
                          <option value="">{t("expenses.select_bank")}</option>
                          {BANK_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-0.5">{t("expenses.account_ref")}</label>
                        <input className={inputCls} placeholder={t("expenses.account_ref_placeholder")}
                          value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} />
                      </div>
                    </div>
                  )}

                  {form.payment_method !== "" && (
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                        {form.payment_method === "mtn" ? t("expenses.receiver_phone_mtn") : t("expenses.receiver_phone")}
                      </label>
                      <input className={inputCls} placeholder="+250 7XX XXX XXX"
                        value={form.receiver_phone} onChange={(e) => setForm({ ...form, receiver_phone: e.target.value })} />
                    </div>
                  )}
                </div>

                {/* Proof upload */}
                <div>
                  <label className="flex items-center gap-1 text-[10px] font-medium text-gray-500 mb-0.5">
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
                              <FileIcon size={14} className="text-red-400" />
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
                      className="w-full border border-dashed border-slate-300 hover:border-[#0a66c2] rounded-md px-2 py-1.5 flex items-center justify-center gap-1 text-[10px] text-slate-400 hover:text-[#0a66c2] transition-colors">
                      <ImageIcon size={10} />
                      {proofEntries.length === 0 ? t("expenses.attach_receipts") : `${t("expenses.add_more")} (${5 - proofEntries.length})`}
                    </button>
                  )}
                </div>

                {/* Summary hint */}
                {form.amount && Number(form.amount) > 0 && (
                  <div className="rounded-md px-2 py-1 text-[10px] bg-[#EBF2FD]" style={{ color: "#0a66c2" }}>
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
                  {submitting ? t("common.saving") : t("expenses.add")}
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
        <div className="hgv-surface rounded-xl mb-2 overflow-hidden px-3 pt-2 pb-2"
          style={{ background: "linear-gradient(135deg, #0a66c2 0%, #004182 50%, #00376b 100%)" }}>
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
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 bg-slate-50/60">
            <div className="exp-sh h-2 w-24 rounded" />
            <div className="flex items-center gap-1.5">
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
