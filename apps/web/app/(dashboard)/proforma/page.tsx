"use client";

import { useEffect, useRef, useState } from "react";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import { useLanguage } from "@/lib/language-context";
import { itemRequest } from "@/lib/product-api";
import { settingsRequest } from "@/lib/settings-api";
import { Plus, Trash2, Printer, X, FileText, RefreshCw } from "lucide-react";

interface LineItem {
  id: string;
  product_name: string;
  qty: number;
  unit_price: number;
}

interface Product { id: string; name: string; selling_price: number; }

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

function genInvoiceNo() {
  const n = Date.now().toString().slice(-6);
  return `PRO-${n}`;
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function validUntil(days = 30) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export default function ProformaPage() {
  const { t } = useLanguage();
  const printRef = useRef<HTMLDivElement>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [currency, setCurrency] = useState("RWF");
  const [taxRate, setTaxRate] = useState(0);
  const [shopName, setShopName] = useState("");

  const [invoiceNo, setInvoiceNo] = useState(genInvoiceNo);
  const [date, setDate] = useState(toDateStr(new Date()));
  const [validUntilDate, setValidUntilDate] = useState(validUntil());
  const [customer, setCustomer] = useState("");
  const [notes, setNotes] = useState("");

  const [lines, setLines] = useState<LineItem[]>([
    { id: genId(), product_name: "", qty: 1, unit_price: 0 },
  ]);

  useEffect(() => {
    itemRequest("/products?limit=500").then((r) => setProducts(r?.data?.items || [])).catch(() => {});
    settingsRequest("/settings").then((r) => {
      if (r?.data) {
        setCurrency(r.data.currency || "RWF");
        setTaxRate(r.data.tax_rate ?? 0);
        setShopName(r.data.shop_name || "");
      }
    }).catch(() => {});
  }, []);

  function addLine() {
    setLines((prev) => [...prev, { id: genId(), product_name: "", qty: 1, unit_price: 0 }]);
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function updateLine<K extends keyof LineItem>(id: string, key: K, value: LineItem[K]) {
    setLines((prev) => prev.map((l) => l.id === id ? { ...l, [key]: value } : l));
  }

  function onProductSelect(id: string, productId: string) {
    const p = products.find((x) => x.id === productId);
    if (p) {
      setLines((prev) => prev.map((l) => l.id === id
        ? { ...l, product_name: p.name, unit_price: p.selling_price }
        : l));
    }
  }

  function clearAll() {
    setLines([{ id: genId(), product_name: "", qty: 1, unit_price: 0 }]);
    setCustomer(""); setNotes("");
    setInvoiceNo(genInvoiceNo()); setDate(toDateStr(new Date())); setValidUntilDate(validUntil());
  }

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const taxAmt = Math.round(subtotal * taxRate / 100);
  const grandTotal = subtotal + taxAmt;
  const hasLines = lines.some((l) => l.product_name.trim() && l.qty > 0 && l.unit_price > 0);

  function handlePrint() {
    window.print();
  }

  const inputCls =
    "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition";

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <div className="max-w-5xl mx-auto px-6 py-6 print:px-0 print:py-0 print:max-w-full">

        {/* Page header — hidden on print */}
        <div className="bg-linear-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-5 mb-6 print:hidden">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              <FileText size={20} />
              <div>
                <h1 className="text-base font-semibold">{t("proforma.title")}</h1>
                <p className="text-blue-200 text-xs mt-0.5">{t("proforma.subtitle")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={clearAll}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition" title={t("proforma.clear")}>
                <RefreshCw size={14} />
              </button>
              <button onClick={addLine}
                className="bg-white text-blue-700 px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-semibold hover:bg-blue-50 transition">
                <Plus size={15} /> {t("proforma.add_line")}
              </button>
              <button onClick={handlePrint}
                className="bg-white/10 hover:bg-white/20 text-white px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-semibold transition">
                <Printer size={15} /> {t("proforma.print")}
              </button>
            </div>
          </div>
        </div>

        {/* INVOICE DOCUMENT */}
        <div ref={printRef} className="bg-white rounded-2xl border border-slate-200 shadow-sm print:shadow-none print:border-none print:rounded-none">

          {/* Invoice Header */}
          <div className="p-6 border-b border-slate-100">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{t("proforma.title").toUpperCase()}</h2>
                {shopName && <p className="text-slate-500 text-sm mt-0.5">{shopName}</p>}
              </div>
              <div className="text-right space-y-1">
                <div className="flex items-center justify-end gap-2">
                  <span className="text-xs text-slate-500 uppercase">{t("proforma.invoice_no")}</span>
                  <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)}
                    className="w-32 text-right font-mono text-sm border border-slate-200 rounded px-2 py-0.5 print:border-none print:outline-none" />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <span className="text-xs text-slate-500 uppercase">{t("proforma.date")}</span>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                    className="text-sm border border-slate-200 rounded px-2 py-0.5 print:border-none" />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <span className="text-xs text-slate-500 uppercase">{t("proforma.valid_until")}</span>
                  <input type="date" value={validUntilDate} onChange={(e) => setValidUntilDate(e.target.value)}
                    className="text-sm border border-slate-200 rounded px-2 py-0.5 print:border-none" />
                </div>
              </div>
            </div>

            {/* Customer */}
            <div className="mt-5">
              <label className="block text-xs font-medium text-slate-500 uppercase mb-1">{t("proforma.customer")}</label>
              <input value={customer} onChange={(e) => setCustomer(e.target.value)}
                placeholder="e.g. INYANGE Industries Ltd"
                className="w-full max-w-xs border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 print:border-none print:p-0 print:text-base print:font-semibold" />
            </div>
          </div>

          {/* Line Items Table */}
          <div className="p-6">
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-2 text-xs font-semibold uppercase text-slate-400 w-8">#</th>
                  <th className="text-left py-2 text-xs font-semibold uppercase text-slate-400">{t("proforma.col_product")}</th>
                  <th className="text-right py-2 text-xs font-semibold uppercase text-slate-400 w-24">{t("proforma.col_qty")}</th>
                  <th className="text-right py-2 text-xs font-semibold uppercase text-slate-400 w-32">{t("proforma.col_price")}</th>
                  <th className="text-right py-2 text-xs font-semibold uppercase text-slate-400 w-32">{t("proforma.col_total")}</th>
                  <th className="w-8 print:hidden" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lines.map((line, i) => (
                  <tr key={line.id}>
                    <td className="py-2 text-slate-400 text-xs">{i + 1}</td>
                    <td className="py-2 pr-4">
                      {/* Product name — selectable from inventory or typed freely */}
                      <div className="flex flex-col gap-1">
                        <input
                          value={line.product_name}
                          onChange={(e) => updateLine(line.id, "product_name", e.target.value)}
                          placeholder="Product / Service"
                          className="border border-slate-200 rounded px-2 py-1 text-sm w-full focus:outline-none focus:border-blue-400 print:border-none"
                        />
                        {products.length > 0 && (
                          <select
                            className="text-xs text-slate-400 border border-slate-100 rounded px-1 py-0.5 print:hidden"
                            defaultValue=""
                            onChange={(e) => onProductSelect(line.id, e.target.value)}>
                            <option value="">— from inventory —</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.name} ({p.selling_price.toLocaleString()})</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      <input type="number" min="1" value={line.qty}
                        onChange={(e) => updateLine(line.id, "qty", Math.max(1, Number(e.target.value)))}
                        className="w-20 text-right border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400 print:border-none" />
                    </td>
                    <td className="py-2 text-right">
                      <input type="number" min="0" value={line.unit_price}
                        onChange={(e) => updateLine(line.id, "unit_price", Number(e.target.value))}
                        className="w-28 text-right border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400 print:border-none" />
                    </td>
                    <td className="py-2 text-right font-semibold text-slate-800 tabular-nums">
                      {(line.qty * line.unit_price).toLocaleString()}
                    </td>
                    <td className="py-2 pl-2 print:hidden">
                      {lines.length > 1 && (
                        <button onClick={() => removeLine(line.id)}
                          className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition">
                          <X size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Add line button */}
            <button onClick={addLine}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium mb-6 print:hidden">
              <Plus size={14} /> {t("proforma.add_line")}
            </button>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-2 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>{t("proforma.subtotal")}</span>
                  <span className="tabular-nums font-medium">{subtotal.toLocaleString()}</span>
                </div>
                {taxRate > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>{t("proforma.tax")} ({taxRate}%)</span>
                    <span className="tabular-nums font-medium">{taxAmt.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between border-t-2 border-slate-800 pt-2">
                  <span className="font-bold text-slate-900 text-base">{t("proforma.grand_total")}</span>
                  <span className="tabular-nums font-bold text-slate-900 text-base">{currency} {grandTotal.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="mt-8 border-t border-slate-100 pt-5">
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-2">{t("proforma.notes")}</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder={t("proforma.notes_placeholder")} rows={3}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-blue-400 resize-none print:border-none print:p-0" />
            </div>

            {/* Signature area */}
            <div className="mt-8 flex justify-between text-xs text-slate-400 border-t border-slate-100 pt-5">
              <div>
                <p className="font-semibold uppercase mb-6">{t("proforma.prepared_by")}</p>
                <p className="border-t border-slate-300 pt-1 w-40">{t("proforma.signature")}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-300">{currency}</p>
                <p className="font-bold text-slate-900 text-lg mt-1">{grandTotal.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Warning if no valid lines */}
        {!hasLines && (
          <p className="mt-4 text-center text-sm text-slate-400 print:hidden">{t("proforma.no_lines")}</p>
        )}

        {/* Action buttons */}
        <div className="flex justify-center gap-3 mt-6 print:hidden">
          <button onClick={clearAll}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">
            <Trash2 size={15} /> {t("proforma.clear")}
          </button>
          <button onClick={handlePrint} disabled={!hasLines}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50">
            <Printer size={15} /> {t("proforma.print")}
          </button>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .min-h-screen, .min-h-screen * { visibility: visible; }
          header, .print\\:hidden { display: none !important; }
          .min-h-screen { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
