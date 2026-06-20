"use client";

import { useEffect, useState } from "react";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import { useLanguage } from "@/lib/language-context";
import { itemRequest } from "@/lib/product-api";
import { settingsRequest } from "@/lib/settings-api";
import { getMyShop } from "@/lib/shop-api";
import {
  Plus, Trash2, Printer, X, FileText, RefreshCw, Building2, User,
  Calendar, Hash, ChevronRight,
} from "lucide-react";

interface LineItem { id: string; product_name: string; qty: number; unit_price: number; }
interface Product { id: string; name: string; selling_price: number; }
interface ShopInfo { name: string; phone?: string; address?: string; email?: string; }

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

export default function ProformaPage() {
  const { t } = useLanguage();

  const [products, setProducts] = useState<Product[]>([]);
  const [shop, setShop] = useState<ShopInfo>({ name: "" });
  const [currency, setCurrency] = useState("RWF");
  const [taxRate, setTaxRate] = useState(0);

  const [invoiceNo, setInvoiceNo] = useState(genInvoiceNo);
  const [date, setDate] = useState(toDateStr(new Date()));
  const [validUntilDate, setValidUntilDate] = useState(addDays(30));
  const [customer, setCustomer] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([
    { id: genId(), product_name: "", qty: 1, unit_price: 0 },
  ]);

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
        setShop({ name: s.name || "", phone: s.phone, address: s.address, email: s.email });
      }
    });
  }, []);

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
  }

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const taxAmt = Math.round(subtotal * taxRate / 100);
  const grandTotal = subtotal + taxAmt;
  const hasLines = lines.some((l) => l.product_name.trim() && l.qty > 0 && l.unit_price > 0);

  function printPopup() {
    const itemsHtml = lines
      .filter((l) => l.product_name.trim())
      .map((l, i) => `
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
  /* Header */
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
  /* Bill section */
  .bill-section{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px}
  .bill-box{background:#f8fafc;border-radius:10px;padding:16px 20px;border:1px solid #e2e8f0}
  .bill-title{font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px}
  .bill-name{font-size:15px;font-weight:700;color:#0f172a;margin-bottom:4px}
  .bill-detail{font-size:11px;color:#64748b;line-height:1.6}
  /* Items table */
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
  /* Notes */
  .notes{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin-bottom:28px;font-size:11px;color:#92400e;line-height:1.6}
  .notes-title{font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;color:#b45309}
  /* Signatures */
  .sig-row{display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #e2e8f0;padding-top:28px;margin-top:8px}
  .sig-box{width:200px;text-align:center}
  .sig-line{border-top:1.5px solid #cbd5e1;margin-bottom:6px;margin-top:40px}
  .sig-label{font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.8px}
  /* Footer */
  .footer{text-align:center;margin-top:40px;padding-top:16px;border-top:1px dashed #e2e8f0;font-size:10px;color:#94a3b8}
  .footer strong{color:#1e3a8a}
  /* Watermark-style label */
  .watermark{position:absolute;top:50%;right:40px;transform:translateY(-50%) rotate(30deg);font-size:80px;font-weight:900;color:rgba(37,99,235,.04);text-transform:uppercase;letter-spacing:8px;pointer-events:none;user-select:none}
  @media print{
    html,body{width:210mm;height:297mm;margin:0}
    .page{padding:20mm 22mm;min-height:0}
    @page{size:A4 portrait;margin:0}
  }
</style>
</head>
<body>
<div class="page">
  <div class="watermark">PROFORMA</div>

  <!-- Header -->
  <div class="header">
    <div class="logo-block">
      <div class="logo-name">${shop.name || "Your Business"}</div>
      ${shop.address ? `<div class="logo-sub">${shop.address}</div>` : ""}
      ${shop.phone ? `<div class="logo-sub">Tel: ${shop.phone}</div>` : ""}
      ${shop.email ? `<div class="logo-sub">${shop.email}</div>` : ""}
    </div>
    <div class="meta-block">
      <div class="invoice-label">Invoice</div>
      <div class="invoice-type">Proforma</div>
      <div class="meta-row"><span class="meta-label">Number</span><span class="meta-val">${invoiceNo}</span></div>
      <div class="meta-row"><span class="meta-label">Issue Date</span><span class="meta-val">${fmtDate(date)}</span></div>
      <div class="meta-row"><span class="meta-label">Valid Until</span><span class="meta-val">${fmtDate(validUntilDate)}</span></div>
    </div>
  </div>

  <!-- Bill To / From -->
  <div class="bill-section">
    <div class="bill-box">
      <div class="bill-title">Bill To</div>
      ${customer ? `<div class="bill-name">${customer}</div>` : `<div class="bill-detail" style="color:#cbd5e1;font-style:italic">Customer name not specified</div>`}
      ${customerPhone ? `<div class="bill-detail">Phone: ${customerPhone}</div>` : ""}
      ${customerAddress ? `<div class="bill-detail">${customerAddress}</div>` : ""}
    </div>
    <div class="bill-box">
      <div class="bill-title">Issued By</div>
      <div class="bill-name">${shop.name || "Your Business"}</div>
      ${shop.address ? `<div class="bill-detail">${shop.address}</div>` : ""}
      ${shop.phone ? `<div class="bill-detail">Tel: ${shop.phone}</div>` : ""}
    </div>
  </div>

  <!-- Items -->
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
      <tr class="sub-row">
        <td colspan="4">Subtotal</td>
        <td>${subtotal.toLocaleString()}</td>
      </tr>
      ${taxRow}
      <tr class="grand-row">
        <td colspan="4">Grand Total</td>
        <td>${currency} ${grandTotal.toLocaleString()}</td>
      </tr>
    </tfoot>
  </table>

  ${notes ? `<div class="notes"><div class="notes-title">Notes & Terms</div>${notes}</div>` : ""}

  <!-- Signatures -->
  <div class="sig-row">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-label">Authorized Signature</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:600">Amount Due</div>
      <div style="font-size:28px;font-weight:900;color:#1e3a8a">${grandTotal.toLocaleString()}</div>
      <div style="font-size:12px;color:#64748b;font-weight:600">${currency}</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-label">Received By</div>
    </div>
  </div>

  <div class="footer">
    This is a proforma invoice — not a VAT invoice. &nbsp;·&nbsp; Valid until <strong>${fmtDate(validUntilDate)}</strong> &nbsp;·&nbsp; Powered by <strong>Higoverse</strong>
  </div>
</div>
<script>
  window.onload = function() { setTimeout(function(){ window.print(); }, 500); };
  window.onafterprint = function() { window.close(); };
</script>
</body>
</html>`;

    const w = window.open("", "_blank", "width=860,height=1000,toolbar=no,menubar=no,scrollbars=yes,resizable=yes");
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
  }

  const inputCls = "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition";
  const subtotal2 = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const taxAmt2 = Math.round(subtotal2 * taxRate / 100);
  const grandTotal2 = subtotal2 + taxAmt2;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
      <DashboardHeader />
      <div className="max-w-5xl mx-auto px-6 py-6">

        {/* PAGE HEADER */}
        <div className="text-white rounded-2xl p-5 mb-6" style={{ background: "#1372e6" }}>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              <FileText size={20} />
              <div>
                <h1 className="text-base font-semibold">{t("proforma.title")}</h1>
                <p className="text-blue-200 text-xs mt-0.5">Create professional proforma invoices for your customers</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={clearAll} title="Clear all" className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"><RefreshCw size={14} /></button>
              <button onClick={addLine}
                className="bg-white text-blue-700 px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-semibold hover:bg-blue-50 transition">
                <Plus size={15} /> Add Line
              </button>
              <button onClick={printPopup} disabled={!hasLines}
                className="bg-blue-800 hover:bg-blue-900 text-white px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-semibold transition disabled:opacity-40">
                <Printer size={15} /> Print / Save PDF
              </button>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">

          {/* MAIN INVOICE FORM */}
          <div className="space-y-4">

            {/* Invoice Meta */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Hash size={15} className="text-blue-500" />
                <h2 className="text-sm font-semibold text-slate-700">Invoice Details</h2>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Invoice #</label>
                  <input className={inputCls} value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    <Calendar size={11} className="inline mr-1" />Issue Date
                  </label>
                  <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Valid Until</label>
                  <input type="date" className={inputCls} value={validUntilDate} onChange={(e) => setValidUntilDate(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Customer Info */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <User size={15} className="text-blue-500" />
                <h2 className="text-sm font-semibold text-slate-700">Bill To (Customer)</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Customer / Company Name</label>
                  <input className={inputCls} placeholder="e.g. INYANGE Industries Ltd" value={customer} onChange={(e) => setCustomer(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Phone</label>
                  <input className={inputCls} placeholder="07XXXXXXXX" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Address / Location</label>
                  <input className={inputCls} placeholder="e.g. Kigali, Rwanda" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 size={15} className="text-blue-500" />
                  <h2 className="text-sm font-semibold text-slate-700">Items / Services</h2>
                </div>
                <button onClick={addLine}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition">
                  <Plus size={12} /> Add Line
                </button>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[1fr_80px_110px_100px_32px] gap-2 px-5 py-2.5 bg-slate-50 border-b border-slate-100 text-[10px] font-semibold uppercase text-slate-400 tracking-wide">
                <span>Description</span><span className="text-center">Qty</span><span className="text-center">Unit Price</span><span className="text-right">Subtotal</span><span />
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
                            placeholder="Product or service description…"
                            className="border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
                          />
                          {products.length > 0 && (
                            <select
                              className="text-xs text-slate-400 border border-slate-100 rounded px-1.5 py-1 focus:outline-none focus:border-blue-300 transition"
                              defaultValue=""
                              onChange={(e) => { if (e.target.value) onProductPick(line.id, e.target.value); }}
                            >
                              <option value="">— Pick from inventory —</option>
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
                    <span>Subtotal</span>
                    <span className="tabular-nums font-medium text-slate-700">{subtotal2.toLocaleString()} {currency}</span>
                  </div>
                  {taxRate > 0 && (
                    <div className="flex justify-between text-slate-500">
                      <span>Tax ({taxRate}%)</span>
                      <span className="tabular-nums font-medium">{taxAmt2.toLocaleString()} {currency}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t-2 border-blue-700">
                    <span className="font-bold text-slate-900">Grand Total</span>
                    <span className="font-bold text-blue-700 text-base tabular-nums">{grandTotal2.toLocaleString()} {currency}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Notes / Terms & Conditions</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                rows={3} placeholder="e.g. Payment due within 30 days. Prices subject to change."
                className={inputCls + " resize-none"} />
            </div>

          </div>

          {/* SIDEBAR SUMMARY */}
          <div className="space-y-4">

            {/* Issued by */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wide mb-3">Issued By</h3>
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {(shop.name || "?")[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{shop.name || "Your Shop"}</p>
                  {shop.phone && <p className="text-xs text-slate-400 mt-0.5">{shop.phone}</p>}
                  {shop.address && <p className="text-xs text-slate-400">{shop.address}</p>}
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wide mb-3">Invoice Summary</h3>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Number</span>
                  <span className="font-mono font-semibold text-blue-600">{invoiceNo}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Date</span>
                  <span className="font-medium text-slate-700">{fmtDate(date) || "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Valid Until</span>
                  <span className="font-medium text-slate-700">{fmtDate(validUntilDate) || "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Bill To</span>
                  <span className="font-medium text-slate-700 text-right max-w-28 truncate">{customer || <span className="text-slate-300 italic">Not set</span>}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Line Items</span>
                  <span className="font-medium text-slate-700">{lines.filter((l) => l.product_name.trim()).length}</span>
                </div>
                <div className="border-t border-slate-100 pt-2.5 mt-2.5">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Subtotal</span>
                    <span className="font-medium text-slate-700 tabular-nums text-sm">{subtotal2.toLocaleString()}</span>
                  </div>
                  {taxRate > 0 && (
                    <div className="flex justify-between mt-1.5">
                      <span className="text-sm text-slate-500">Tax ({taxRate}%)</span>
                      <span className="font-medium text-slate-700 tabular-nums text-sm">{taxAmt2.toLocaleString()}</span>
                    </div>
                  )}
                </div>
                <div className="bg-blue-600 rounded-lg px-3 py-3 flex justify-between items-center">
                  <span className="text-blue-100 text-xs font-semibold uppercase tracking-wide">Grand Total</span>
                  <span className="text-white font-bold tabular-nums">{grandTotal2.toLocaleString()} {currency}</span>
                </div>
              </div>
            </div>

            {/* Print button */}
            <button onClick={printPopup} disabled={!hasLines}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition disabled:opacity-40 text-sm">
              <Printer size={16} />
              Print / Save as PDF
            </button>

            {!hasLines && (
              <p className="text-center text-xs text-slate-400">Add at least one item to enable printing.</p>
            )}

            <button onClick={clearAll}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 font-medium hover:bg-slate-50 transition text-sm">
              <Trash2 size={14} />
              Clear All
            </button>

            {/* Quick actions */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wide mb-3">Quick Validity</h3>
              <div className="flex flex-wrap gap-2">
                {[7, 14, 30, 60, 90].map((d) => (
                  <button key={d} onClick={() => setValidUntilDate(addDays(d))}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 text-xs font-medium text-slate-600 hover:text-blue-700 border border-slate-200 hover:border-blue-200 transition">
                    <ChevronRight size={10} /> {d}d
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
