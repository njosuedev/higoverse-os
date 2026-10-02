"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/lib/language-context";
import { itemRequest } from "@/lib/product-api";
import { settingsRequest } from "@/lib/settings-api";
import { getMyShop } from "@/lib/shop-api";
import { formatPublicAddress } from "@/lib/product-meta";
import {
  listProformas, createProforma, updateProforma, deleteProforma,
  type Proforma, type ProformaLine, type ProformaStatus, type ProformaPayload,
} from "@/lib/proforma-api";
import {
  Plus, Trash2, Printer, X, FileText, RefreshCw, Building2, User,
  Calendar, Hash, ChevronRight, Save, Clock, CheckCircle2,
  Send, AlertCircle, Search, Eye, Pencil, History,
} from "lucide-react";

interface LineItem { id: string; product_name: string; qty: number; unit_price: number; }
interface Product { id: string; name: string; selling_price: number; }
interface ShopInfo { name: string; phone?: string; address?: string; email?: string; logo_url?: string; }

function genId() { return Math.random().toString(36).slice(2, 9); }
function genInvoiceNo() { return `PRO-${Date.now().toString().slice(-6)}`; }
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return toDateStr(d); }
function fmtDate(s: string) {
  if (!s) return "";
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const STATUS_META: Record<ProformaStatus, { color: string; icon: React.ReactNode }> = {
  draft:    { color: "bg-slate-100 text-slate-600 border-slate-200",   icon: <Pencil size={10} /> },
  sent:     { color: "bg-blue-50 text-blue-600 border-blue-200",       icon: <Send size={10} /> },
  accepted: { color: "bg-green-50 text-green-700 border-green-200",    icon: <CheckCircle2 size={10} /> },
  expired:  { color: "bg-red-50 text-red-600 border-red-200",          icon: <AlertCircle size={10} /> },
};

const STATUS_LABEL_KEY: Record<ProformaStatus, string> = {
  draft: "proforma.status_draft",
  sent: "proforma.status_sent",
  accepted: "proforma.status_accepted",
  expired: "proforma.status_expired",
};

function StatusBadge({ status }: { status: ProformaStatus }) {
  const { t } = useLanguage();
  const m = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${m.color}`}>
      {m.icon} {t(STATUS_LABEL_KEY[status] ?? STATUS_LABEL_KEY.draft)}
    </span>
  );
}

type PageView = "editor" | "history";

export default function ProformaPage() {
  return (
    <Suspense fallback={null}>
      <ProformaPageContent />
    </Suspense>
  );
}

function ProformaPageContent() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();

  const [loading, setLoading]     = useState(true);
  const [products, setProducts]   = useState<Product[]>([]);
  const [shop, setShop]           = useState<ShopInfo>({ name: "" });
  const [currency, setCurrency]   = useState("RWF");
  const [taxRate, setTaxRate]     = useState(0);

  // Editor state
  const [view, setView]           = useState<PageView>("editor");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState<"" | "success" | "error">("");

  const [invoiceNo, setInvoiceNo]             = useState(genInvoiceNo);
  const [date, setDate]                       = useState(toDateStr(new Date()));
  const [validUntilDate, setValidUntilDate]   = useState(addDays(30));
  const [customer, setCustomer]               = useState("");
  const [customerPhone, setCustomerPhone]     = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [notes, setNotes]                     = useState("");
  const [status, setStatus]                   = useState<ProformaStatus>("draft");
  const [lines, setLines]                     = useState<LineItem[]>([
    { id: genId(), product_name: "", qty: 1, unit_price: 0 },
  ]);

  // History state
  const [proformas, setProformas]       = useState<Proforma[]>([]);
  const [histSearch, setHistSearch]     = useState("");
  const [histLoading, setHistLoading]   = useState(false);
  const [deletingId, setDeletingId]     = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([
      itemRequest("/products?limit=500"),
      settingsRequest("/settings"),
      getMyShop(),
    ]).then(([prodRes, settRes, shopRes]) => {
      if (prodRes.status === "fulfilled") setProducts(prodRes.value?.data?.items || []);
      if (settRes.status === "fulfilled" && settRes.value?.data) {
        const d = settRes.value.data;
        setCurrency(d.currency || "RWF");
        setTaxRate(d.tax_rate ?? 0);
        if (d.shop_name) setShop((prev) => ({ ...prev, name: d.shop_name }));
      }
      if (shopRes.status === "fulfilled" && shopRes.value) {
        const s = shopRes.value;
        setShop({ name: s.name || "", phone: s.phone, address: s.address, email: s.email, logo_url: s.logo_url });
      }
      setLoading(false);
    });
  }, []);

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const res = await listProformas({ limit: 100 });
      setProformas(res.items || []);
    } catch { /* non-fatal */ }
    finally { setHistLoading(false); }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => {
    if (searchParams.get("view") === "history") setView("history");
  }, [searchParams]);

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || proformas.length === 0) return;
    const p = proformas.find((x) => x.id === editId);
    if (p) loadProforma(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, proformas]);

  function addLine() { setLines((p) => [...p, { id: genId(), product_name: "", qty: 1, unit_price: 0 }]); }
  function removeLine(id: string) { setLines((p) => p.filter((l) => l.id !== id)); }
  function setLineField<K extends keyof LineItem>(id: string, key: K, val: LineItem[K]) {
    setLines((p) => p.map((l) => l.id === id ? { ...l, [key]: val } : l));
  }
  function onProductPick(id: string, productId: string) {
    const p = products.find((x) => x.id === productId);
    if (p) setLines((prev) => prev.map((l) => l.id === id ? { ...l, product_name: p.name, unit_price: p.selling_price } : l));
  }

  function clearAll() {
    setLines([{ id: genId(), product_name: "", qty: 1, unit_price: 0 }]);
    setCustomer(""); setCustomerPhone(""); setCustomerAddress(""); setNotes("");
    setInvoiceNo(genInvoiceNo()); setDate(toDateStr(new Date())); setValidUntilDate(addDays(30));
    setStatus("draft"); setEditingId(null);
  }

  function loadProforma(p: Proforma) {
    setInvoiceNo(p.invoice_no);
    setDate(p.date);
    setValidUntilDate(p.valid_until);
    setCustomer(p.customer);
    setCustomerPhone(p.customer_phone);
    setCustomerAddress(p.customer_address);
    setNotes(p.notes);
    setStatus(p.status);
    setLines(p.lines.map((l) => ({ id: genId(), product_name: l.product_name, qty: l.qty, unit_price: l.unit_price })));
    setEditingId(p.id);
    setView("editor");
  }

  const subtotal   = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const taxAmt     = Math.round(subtotal * taxRate / 100);
  const grandTotal = subtotal + taxAmt;
  const hasLines   = lines.some((l) => l.product_name.trim() && l.qty > 0 && l.unit_price > 0);

  function buildPayload(): ProformaPayload {
    return {
      invoice_no: invoiceNo,
      date,
      valid_until: validUntilDate,
      customer,
      customer_phone: customerPhone,
      customer_address: customerAddress,
      notes,
      lines: lines
        .filter((l) => l.product_name.trim())
        .map(({ product_name, qty, unit_price }) => ({ product_name, qty, unit_price })),
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmt,
      grand_total: grandTotal,
      currency,
      status,
    };
  }

  async function saveProforma(andPrint = false) {
    if (!hasLines) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const payload = buildPayload();
      let saved: Proforma | null;
      if (editingId) {
        saved = await updateProforma(editingId, payload);
      } else {
        saved = await createProforma(payload);
        if (saved) setEditingId(saved.id);
      }
      if (saved) {
        setSaveMsg("success");
        await loadHistory();
        if (andPrint) printPopup();
        setTimeout(() => setSaveMsg(""), 3000);
      }
    } catch {
      setSaveMsg("error");
      setTimeout(() => setSaveMsg(""), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("common.confirm_delete"))) return;
    setDeletingId(id);
    try {
      await deleteProforma(id);
      if (editingId === id) clearAll();
      await loadHistory();
    } catch { /* non-fatal */ }
    finally { setDeletingId(null); }
  }

  const publicAddr = formatPublicAddress(shop.address);

  function printPopup() {
    const filteredLines = lines.filter((l) => l.product_name.trim());
    const itemsHtml = filteredLines.map((l, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="desc">${l.product_name}</td>
        <td class="center">${l.qty}</td>
        <td class="right">${l.unit_price.toLocaleString()}</td>
        <td class="right total">${(l.qty * l.unit_price).toLocaleString()}</td>
      </tr>`).join("");

    const taxRow = taxRate > 0
      ? `<tr class="sub-row"><td colspan="4">Tax (${taxRate}%)</td><td class="right">${taxAmt.toLocaleString()}</td></tr>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Proforma Invoice ${invoiceNo}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1a1a2e;font-size:13px;padding:0}
  .page{max-width:794px;margin:0 auto;padding:40px 48px;min-height:1123px;position:relative}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding-bottom:28px;border-bottom:3px solid #2563eb}
  .logo-block{flex:1}
  .logo-name{font-size:22px;font-weight:800;color:#1e3a8a;letter-spacing:.5px;text-transform:uppercase}
  .logo-sub{font-size:11px;color:#64748b;margin-top:3px}
  .meta-block{text-align:right}
  .invoice-label{font-size:26px;font-weight:900;color:#2563eb;letter-spacing:1px;text-transform:uppercase;line-height:1}
  .invoice-type{font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:2px;text-transform:uppercase;margin-top:2px}
  .meta-row{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:6px;font-size:12px}
  .meta-label{color:#94a3b8;font-weight:600;min-width:80px;text-align:right}
  .meta-val{color:#1e3a8a;font-weight:700;min-width:120px;text-align:right}
  .bill-section{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px}
  .bill-box{background:#f8fafc;border-radius:10px;padding:16px 20px;border:1px solid #e2e8f0}
  .bill-title{font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px}
  .bill-name{font-size:15px;font-weight:700;color:#0f172a;margin-bottom:4px}
  .bill-detail{font-size:11px;color:#64748b;line-height:1.6}
  table.items{width:100%;border-collapse:collapse;margin-bottom:24px}
  .items thead tr{background:#1e3a8a;color:#fff}
  .items thead th{padding:11px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px}
  .items thead th.right{text-align:right}
  .items thead th.center{text-align:center}
  .items tbody tr{border-bottom:1px solid #f1f5f9}
  .items tbody tr:hover{background:#fafbff}
  .items td{padding:12px 14px;font-size:12px;color:#334155;vertical-align:middle}
  .items td.num{color:#94a3b8;font-size:11px;width:32px}
  .items td.desc{font-weight:600;color:#0f172a}
  .items td.center{text-align:center}
  .items td.right{text-align:right;font-family:monospace;font-size:12px}
  .items td.total{font-weight:700;color:#1e3a8a}
  .items tfoot .sub-row td{padding:8px 14px;font-size:12px;color:#64748b;text-align:right}
  .items tfoot .sub-row td:first-child{text-align:right;padding-left:0;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8}
  .items tfoot .grand-row{background:#1e3a8a}
  .items tfoot .grand-row td{padding:14px;color:#fff;font-weight:800;font-size:14px;text-align:right}
  .items tfoot .grand-row td:first-child{text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;color:#bfdbfe}
  .notes{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin-bottom:28px;font-size:11px;color:#92400e;line-height:1.6}
  .notes-title{font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;color:#b45309}
  .sig-row{display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #e2e8f0;padding-top:28px;margin-top:8px}
  .sig-box{width:200px;text-align:center}
  .sig-line{border-top:1.5px solid #cbd5e1;margin-bottom:6px;margin-top:40px}
  .sig-label{font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.8px}
  .footer{text-align:center;margin-top:40px;padding-top:16px;border-top:1px dashed #e2e8f0;font-size:10px;color:#94a3b8}
  .footer strong{color:#1e3a8a}
  .watermark{position:absolute;top:50%;right:40px;transform:translateY(-50%) rotate(30deg);font-size:80px;font-weight:900;color:rgba(37,99,235,.04);text-transform:uppercase;letter-spacing:8px;pointer-events:none;user-select:none}
  @media print{html,body{width:210mm;height:297mm;margin:0}.page{padding:20mm 22mm;min-height:0}@page{size:A4 portrait;margin:0}}
</style>
</head>
<body>
<div class="page">
  <div class="watermark">PROFORMA</div>
  <div class="header">
    <div class="logo-block">
      ${shop.logo_url ? `<img src="${shop.logo_url}" alt="${shop.name}" style="width:64px;height:64px;object-fit:cover;border-radius:10px;margin-bottom:8px;display:block;" />` : ""}
      <div class="logo-name">${shop.name || "Your Business"}</div>
      ${publicAddr ? `<div class="logo-sub">${publicAddr}</div>` : ""}
      ${shop.phone ? `<div class="logo-sub">Tel: ${shop.phone}</div>` : ""}
    </div>
    <div class="meta-block">
      <div class="invoice-label">Invoice</div>
      <div class="invoice-type">Proforma</div>
      <div class="meta-row"><span class="meta-label">Number</span><span class="meta-val">${invoiceNo}</span></div>
      <div class="meta-row"><span class="meta-label">Issue Date</span><span class="meta-val">${fmtDate(date)}</span></div>
      <div class="meta-row"><span class="meta-label">Valid Until</span><span class="meta-val">${fmtDate(validUntilDate)}</span></div>
    </div>
  </div>
  <div class="bill-section">
    <div class="bill-box">
      <div class="bill-title">Bill To</div>
      ${customer ? `<div class="bill-name">${customer}</div>` : `<div class="bill-detail" style="color:#cbd5e1;font-style:italic">Customer not specified</div>`}
      ${customerPhone ? `<div class="bill-detail">Phone: ${customerPhone}</div>` : ""}
      ${customerAddress ? `<div class="bill-detail">${customerAddress}</div>` : ""}
    </div>
    <div class="bill-box">
      <div class="bill-title">Issued By</div>
      <div class="bill-name">${shop.name || "Your Business"}</div>
      ${publicAddr ? `<div class="bill-detail">${publicAddr}</div>` : ""}
      ${shop.phone ? `<div class="bill-detail">Tel: ${shop.phone}</div>` : ""}
    </div>
  </div>
  <table class="items">
    <thead>
      <tr>
        <th style="width:32px">#</th>
        <th>Description</th>
        <th class="center" style="width:70px">Qty</th>
        <th class="right" style="width:110px">Unit Price</th>
        <th class="right" style="width:120px">Total (${currency})</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
    <tfoot>
      <tr class="sub-row"><td colspan="4">Subtotal</td><td>${subtotal.toLocaleString()}</td></tr>
      ${taxRow}
      <tr class="grand-row"><td colspan="4">Grand Total</td><td>${currency} ${grandTotal.toLocaleString()}</td></tr>
    </tfoot>
  </table>
  ${notes ? `<div class="notes"><div class="notes-title">Notes &amp; Terms</div>${notes}</div>` : ""}
  <div class="sig-row">
    <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Authorized Signature</div></div>
    <div style="text-align:right">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:600">Amount Due</div>
      <div style="font-size:28px;font-weight:900;color:#1e3a8a">${grandTotal.toLocaleString()}</div>
      <div style="font-size:12px;color:#64748b;font-weight:600">${currency}</div>
    </div>
    <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Received By</div></div>
  </div>
  <div class="footer">
    This is a proforma invoice — not a VAT invoice. &nbsp;·&nbsp; Valid until <strong>${fmtDate(validUntilDate)}</strong> &nbsp;·&nbsp; Powered by <strong>Higoverse</strong>
  </div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},500);};window.onafterprint=function(){window.close();};</script>
</body>
</html>`;

    const w = window.open("", "_blank", "width=860,height=1000,toolbar=no,menubar=no,scrollbars=yes,resizable=yes");
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
  }

  if (loading) return <ProformaSkeleton />;

  const inputCls = "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition";
  const subtotal2   = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const taxAmt2     = Math.round(subtotal2 * taxRate / 100);
  const grandTotal2 = subtotal2 + taxAmt2;

  const filteredHistory = proformas.filter((p) => {
    if (!histSearch) return true;
    const q = histSearch.toLowerCase();
    return (
      p.invoice_no.toLowerCase().includes(q) ||
      p.customer.toLowerCase().includes(q) ||
      p.status.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-3 sm:px-5 py-3 sm:py-4">

        {/* PAGE HEADER */}
        <div className="text-white rounded-2xl p-5 mb-6" style={{ background: "#0a66c2" }}>
          <div className="flex justify-between items-center flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <FileText size={20} />
              <div>
                <h1 className="text-base font-semibold">{t("proforma.title")}</h1>
                <p className="text-blue-200 text-xs mt-0.5">
                  {editingId ? `${t("proforma.editing")} ${invoiceNo}` : t("proforma.create_hint")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* View toggle */}
              <div className="flex bg-white/10 rounded-lg overflow-hidden">
                <button
                  onClick={() => setView("editor")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition ${view === "editor" ? "bg-white text-blue-700" : "text-white hover:bg-white/10"}`}
                >
                  <Pencil size={12} /> {t("proforma.tab_editor")}
                </button>
                <button
                  onClick={() => { setView("history"); loadHistory(); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition ${view === "history" ? "bg-white text-blue-700" : "text-white hover:bg-white/10"}`}
                >
                  <History size={12} /> {t("proforma.tab_history")}
                  {proformas.length > 0 && (
                    <span className="bg-white/20 text-white rounded-full px-1.5 text-[10px]">{proformas.length}</span>
                  )}
                </button>
              </div>

              {view === "editor" && (
                <>
                  <button onClick={clearAll} title={t("proforma.new_tooltip")} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition">
                    <RefreshCw size={14} />
                  </button>
                  <button onClick={addLine}
                    className="bg-white/10 hover:bg-white/20 text-white px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-semibold transition border border-white/20">
                    <Plus size={15} /> {t("proforma.add_line")}
                  </button>
                  <button
                    onClick={() => saveProforma(false)}
                    disabled={!hasLines || saving}
                    className="bg-white text-blue-700 px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-semibold hover:bg-blue-50 transition disabled:opacity-40"
                  >
                    <Save size={15} />
                    {saving ? t("proforma.saving") : saveMsg === "success" ? t("proforma.saved_short") : saveMsg === "error" ? t("proforma.save_failed") : t("proforma.save")}
                  </button>
                  <button
                    onClick={() => saveProforma(true)}
                    disabled={!hasLines || saving}
                    className="bg-blue-800 hover:bg-blue-900 text-white px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-semibold transition disabled:opacity-40"
                  >
                    <Printer size={15} /> {t("proforma.save_print")}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── HISTORY VIEW ── */}
        {view === "history" && (
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setView("editor")}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 border border-slate-200 hover:border-blue-300 px-2.5 py-1.5 rounded-lg transition"
                >
                  <ChevronRight size={12} className="rotate-180" /> {t("common.back")}
                </button>
                <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <History size={15} className="text-blue-500" /> {t("proforma.saved_proformas")}
                  <span className="text-xs font-normal text-slate-400">({proformas.length})</span>
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={histSearch}
                    onChange={(e) => setHistSearch(e.target.value)}
                    placeholder={t("proforma.search_invoices")}
                    className="border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
                  />
                </div>
                <button onClick={loadHistory} className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-300 transition">
                  <RefreshCw size={13} className={histLoading ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            {histLoading && proformas.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
                <RefreshCw size={16} className="animate-spin mr-2" /> {t("common.loading")}
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileText size={32} className="text-slate-200 mb-3" />
                <p className="text-slate-500 font-medium text-sm">
                  {histSearch ? t("proforma.no_match_search") : t("proforma.no_saved_yet")}
                </p>
                <p className="text-slate-400 text-xs mt-1">
                  {!histSearch && t("proforma.create_to_see")}
                </p>
                {!histSearch && (
                  <button onClick={() => setView("editor")}
                    className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition flex items-center gap-2">
                    <Plus size={14} /> {t("proforma.create_cta")}
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredHistory.map((p) => (
                  <div key={p.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-sm text-blue-700">{p.invoice_no}</span>
                        <StatusBadge status={p.status} />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
                        <span className="font-medium text-slate-700 truncate max-w-40">
                          {p.customer || <span className="italic text-slate-300">{t("proforma.no_customer")}</span>}
                        </span>
                        <span className="flex items-center gap-1"><Calendar size={10} /> {fmtDate(p.date)}</span>
                        <span className="flex items-center gap-1"><Clock size={10} /> {t("proforma.valid_until_short")} {fmtDate(p.valid_until)}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-slate-800 tabular-nums">{p.grand_total.toLocaleString()} <span className="text-xs font-normal text-slate-400">{p.currency}</span></p>
                      <p className="text-[10px] text-slate-400">{p.lines.length} {t("proforma.items_unit")}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => loadProforma(p)}
                        title={t("common.edit")}
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={async () => {
                          loadProforma(p);
                          setTimeout(() => printPopup(), 100);
                        }}
                        title={t("common.print")}
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition"
                      >
                        <Printer size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        disabled={deletingId === p.id}
                        title={t("common.delete")}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition disabled:opacity-40"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── EDITOR VIEW ── */}
        {view === "editor" && (
          <div className="grid lg:grid-cols-[1fr_320px] gap-6">

            {/* MAIN INVOICE FORM */}
            <div className="space-y-4">

              {/* Invoice Meta */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Hash size={15} className="text-blue-500" />
                    <h2 className="text-sm font-semibold text-slate-700">{t("proforma.invoice_details")}</h2>
                  </div>
                  {/* Status picker */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{t("common.status")}:</span>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ProformaStatus)}
                      className="border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition text-slate-700"
                    >
                      <option value="draft">{t("proforma.status_draft")}</option>
                      <option value="sent">{t("proforma.status_sent")}</option>
                      <option value="accepted">{t("proforma.status_accepted")}</option>
                      <option value="expired">{t("proforma.status_expired")}</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("proforma.invoice_number_label")}</label>
                    <input className={inputCls} value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                      <Calendar size={11} className="inline mr-1" />{t("proforma.issue_date")}
                    </label>
                    <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("proforma.valid_until")}</label>
                    <input type="date" className={inputCls} value={validUntilDate} onChange={(e) => setValidUntilDate(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Customer Info */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <User size={15} className="text-blue-500" />
                  <h2 className="text-sm font-semibold text-slate-700">{t("proforma.bill_to_customer")}</h2>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("proforma.customer_company_name")}</label>
                    <input className={inputCls} placeholder={t("proforma.customer_name_placeholder")} value={customer} onChange={(e) => setCustomer(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("common.phone")}</label>
                    <input className={inputCls} placeholder="07XXXXXXXX" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("proforma.address_location")}</label>
                    <input className={inputCls} placeholder={t("proforma.address_placeholder")} value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 size={15} className="text-blue-500" />
                    <h2 className="text-sm font-semibold text-slate-700">{t("proforma.items_services")}</h2>
                  </div>
                  <button onClick={addLine}
                    className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition">
                    <Plus size={12} /> {t("proforma.add_line")}
                  </button>
                </div>

                <div className="grid grid-cols-[1fr_80px_110px_100px_32px] gap-2 px-5 py-2.5 bg-slate-50 border-b border-slate-100 text-[10px] font-semibold uppercase text-slate-400 tracking-wide">
                  <span>{t("proforma.description_col")}</span><span className="text-center">{t("proforma.col_qty")}</span><span className="text-center">{t("proforma.col_price")}</span><span className="text-right">{t("proforma.subtotal")}</span><span />
                </div>

                <div className="divide-y divide-slate-100">
                  {lines.map((line) => {
                    const sub = line.qty * line.unit_price;
                    return (
                      <div key={line.id} className="px-5 py-3">
                        <div className="grid grid-cols-[1fr_80px_110px_100px_32px] gap-2 items-center">
                          <div className="flex flex-col gap-1.5">
                            <input
                              value={line.product_name}
                              onChange={(e) => setLineField(line.id, "product_name", e.target.value)}
                              placeholder={t("proforma.product_placeholder")}
                              className="border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
                            />
                            {products.length > 0 && (
                              <select
                                className="text-xs text-slate-400 border border-slate-100 rounded px-1.5 py-1 focus:outline-none focus:border-blue-300 transition"
                                defaultValue=""
                                onChange={(e) => { if (e.target.value) onProductPick(line.id, e.target.value); }}
                              >
                                <option value="">{t("proforma.pick_from_inventory")}</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>{p.name} ({p.selling_price.toLocaleString()} {currency})</option>
                                ))}
                              </select>
                            )}
                          </div>
                          <input type="number" min="1" value={line.qty}
                            onChange={(e) => setLineField(line.id, "qty", Math.max(1, Number(e.target.value)))}
                            className="border border-slate-200 text-gray-800 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition" />
                          <input type="number" min="0" value={line.unit_price}
                            onChange={(e) => setLineField(line.id, "unit_price", Number(e.target.value))}
                            className="border border-slate-200 text-gray-800 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition" />
                          <p className="text-right font-semibold text-slate-800 text-sm tabular-nums">{sub.toLocaleString()}</p>
                          <button onClick={() => removeLine(line.id)} disabled={lines.length === 1}
                            className="p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition disabled:opacity-20">
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Totals */}
                <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                  <div className="w-60 space-y-2 text-sm">
                    <div className="flex justify-between text-slate-500">
                      <span>{t("proforma.subtotal")}</span>
                      <span className="tabular-nums font-medium text-slate-700">{subtotal2.toLocaleString()} {currency}</span>
                    </div>
                    {taxRate > 0 && (
                      <div className="flex justify-between text-slate-500">
                        <span>{t("proforma.tax")} ({taxRate}%)</span>
                        <span className="tabular-nums font-medium">{taxAmt2.toLocaleString()} {currency}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t-2 border-blue-700">
                      <span className="font-bold text-slate-900">{t("proforma.grand_total")}</span>
                      <span className="font-bold text-blue-700 text-base tabular-nums">{grandTotal2.toLocaleString()} {currency}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{t("proforma.notes")}</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  rows={3} placeholder={t("proforma.notes_placeholder_long")}
                  className={inputCls + " resize-none"} />
              </div>

            </div>

            {/* SIDEBAR */}
            <div className="space-y-4">

              {/* Issued by */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wide mb-3">{t("proforma.issued_by")}</h3>
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-blue-600 text-white font-bold text-sm">
                    {shop.logo_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={shop.logo_url} alt={shop.name} className="w-9 h-9 object-cover" />
                      : (shop.name || "?")[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{shop.name || t("proforma.your_shop")}</p>
                    {shop.phone && <p className="text-xs text-slate-400 mt-0.5">{shop.phone}</p>}
                    {publicAddr && <p className="text-xs text-slate-400">{publicAddr}</p>}
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wide mb-3">{t("proforma.invoice_summary")}</h3>
                <div className="space-y-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{t("proforma.number_label")}</span>
                    <span className="font-mono font-semibold text-blue-600">{invoiceNo}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{t("common.status")}</span>
                    <StatusBadge status={status} />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{t("common.date")}</span>
                    <span className="font-medium text-slate-700">{fmtDate(date) || "—"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{t("proforma.valid_until")}</span>
                    <span className="font-medium text-slate-700">{fmtDate(validUntilDate) || "—"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{t("proforma.bill_to_label")}</span>
                    <span className="font-medium text-slate-700 text-right max-w-28 truncate">{customer || <span className="text-slate-300 italic">{t("proforma.not_set")}</span>}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{t("proforma.line_items_label")}</span>
                    <span className="font-medium text-slate-700">{lines.filter((l) => l.product_name.trim()).length}</span>
                  </div>
                  <div className="border-t border-slate-100 pt-2.5 mt-2.5">
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">{t("proforma.subtotal")}</span>
                      <span className="font-medium text-slate-700 tabular-nums text-sm">{subtotal2.toLocaleString()}</span>
                    </div>
                    {taxRate > 0 && (
                      <div className="flex justify-between mt-1.5">
                        <span className="text-sm text-slate-500">{t("proforma.tax")} ({taxRate}%)</span>
                        <span className="font-medium text-slate-700 tabular-nums text-sm">{taxAmt2.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  <div className="bg-blue-600 rounded-lg px-3 py-3 flex justify-between items-center">
                    <span className="text-blue-100 text-xs font-semibold uppercase tracking-wide">{t("proforma.grand_total")}</span>
                    <span className="text-white font-bold tabular-nums">{grandTotal2.toLocaleString()} {currency}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <button
                onClick={() => saveProforma(false)}
                disabled={!hasLines || saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white border-2 border-blue-600 text-blue-700 font-semibold hover:bg-blue-50 transition disabled:opacity-40 text-sm"
              >
                <Save size={16} />
                {saving ? t("proforma.saving") : editingId ? t("proforma.update_proforma") : t("proforma.save_proforma")}
              </button>

              <button
                onClick={() => saveProforma(true)}
                disabled={!hasLines || saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition disabled:opacity-40 text-sm"
              >
                <Printer size={16} />
                {t("proforma.save_print_pdf")}
              </button>

              {saveMsg && (
                <p className={`text-center text-xs font-semibold ${saveMsg === "success" ? "text-green-600" : "text-red-500"}`}>
                  {saveMsg === "success" ? `✓ ${t("proforma.saved_success")}` : `✗ ${t("proforma.save_failed")}`}
                </p>
              )}

              {!hasLines && (
                <p className="text-center text-xs text-slate-400">{t("proforma.no_lines")}</p>
              )}

              <button onClick={clearAll}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 font-medium hover:bg-slate-50 transition text-sm">
                <Trash2 size={14} />
                {editingId ? t("proforma.new_proforma_btn") : t("proforma.clear")}
              </button>

              {/* Quick validity */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wide mb-3">{t("proforma.quick_validity")}</h3>
                <div className="flex flex-wrap gap-2">
                  {[7, 14, 30, 60, 90].map((d) => (
                    <button key={d} onClick={() => setValidUntilDate(addDays(d))}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 text-xs font-medium text-slate-600 hover:text-blue-700 border border-slate-200 hover:border-blue-200 transition">
                      <ChevronRight size={10} /> {d}{t("proforma.days_unit")}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recent proformas mini-list */}
              {proformas.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wide">{t("proforma.recent")}</h3>
                    <button onClick={() => setView("history")} className="text-xs text-blue-600 hover:underline">{t("dash.view_all")}</button>
                  </div>
                  <div className="space-y-2">
                    {proformas.slice(0, 4).map((p) => (
                      <button key={p.id} onClick={() => loadProforma(p)}
                        className="w-full text-left flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-slate-50 transition group">
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-semibold text-blue-700 truncate">{p.invoice_no}</p>
                          <p className="text-[10px] text-slate-400 truncate">{p.customer || t("proforma.no_customer")}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <StatusBadge status={p.status} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function ProformaSkeleton() {
  return (
    <>
      <style>{`
        @keyframes pf-sh { 0%{background-position:-700px 0} 100%{background-position:700px 0} }
        .pf-sh{background:linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%);background-size:700px 100%;animation:pf-sh 1.4s infinite linear;border-radius:6px}
        .pf-sh-w{background:linear-gradient(90deg,rgba(255,255,255,.15) 25%,rgba(255,255,255,.28) 50%,rgba(255,255,255,.15) 75%);background-size:700px 100%;animation:pf-sh 1.4s infinite linear;border-radius:6px}
      `}</style>
      <div className="min-h-screen">
        <div className="max-w-5xl mx-auto px-3 sm:px-5 py-3 sm:py-4">
          <div className="rounded-2xl p-5 mb-6" style={{ background: "#0a66c2" }}>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-5 h-5 pf-sh-w rounded" />
                <div className="space-y-1.5">
                  <div className="pf-sh-w" style={{ width: 140, height: 12 }} />
                  <div className="pf-sh-w" style={{ width: 220, height: 8 }} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                {[36, 90, 110, 120].map((w, i) => <div key={i} className="pf-sh-w rounded-lg" style={{ width: w, height: 32 }} />)}
              </div>
            </div>
          </div>
          <div className="grid lg:grid-cols-[1fr_320px] gap-6">
            <div className="space-y-4">
              {[110, 140, 200, 70].map((w, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="pf-sh mb-4" style={{ width: w, height: 11 }} />
                  <div className="pf-sh rounded-lg" style={{ height: 60 }} />
                </div>
              ))}
            </div>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="pf-sh mb-3" style={{ width: 80, height: 8 }} />
                  <div className="pf-sh rounded-lg" style={{ height: 44 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
