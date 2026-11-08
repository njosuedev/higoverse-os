// RRA EBM receipts, laid out as RRA's "Technical Specification of CIS for
// VSDC" (v1.0, March 2018) prescribes: §4 minimum content, §7.22–7.29 tax
// lines / SDC block / item counter / RRA logo, §11 COPY marking, §13.1 sale
// (NS), §14.1 refund (NR) and §15.1 copy examples. Labels stay in English, as
// on every EBM receipt. Pure: builds HTML for printHtml (lib/print-frame).

import type { ReceiptData } from "./receipt-print";
import type { PrintSettings, ReceiptPaper } from "./print-settings";

type T = (key: string) => string;

/** What RRA's VSDC signed, plus the CIS's own receipt number and time. */
export interface EbmReceipt {
  label: "NS" | "NR";
  sellerTin?: string | null;
  customerTin?: string | null;
  customerPhone?: string | null;
  /** The CIS receipt number (invcNo) and, for refunds, the sale's. */
  invoiceNo: number;
  originalInvoiceNo?: number | null;
  /** RRA's counters: per receipt type / all receipts. */
  receiptNo: number | null;
  totalReceiptNo: number | null;
  /** Internal data and signature, already in groups of four. */
  internalData: string;
  signature: string;
  sdcId: string | null;
  mrcNo: string | null;
  cashier?: string | null;
  /** dd/mm/yyyy and hh:mm:ss: stamped by the VSDC, and by Higoverse (CIS). */
  date: string;
  time: string;
  cisDate?: string;
  cisTime?: string;
  taxes: Record<string, { label: string; rate: number; taxable: number; tax: number }>;
  totalTax: number;
  /** A reprint (§7.18): marked COPY, "THIS IS NOT AN OFFICIAL RECEIPT". */
  copy?: boolean;
  /** RRA's data as a QR code (SVG). */
  qrSvg?: string | null;
}

/** The RRA emblem printed on every receipt (§7.29), from the app's own files. */
export const RRA_LOGO = "/rra-emblem.png";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
/** Two decimals, dot separator, thousands grouped (§24.4.1 data format). */
const dec = (n: unknown) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Absolute URL of a public file (the print frame has no base URL of its own). */
const abs = (path: string) => (typeof window !== "undefined" ? new URL(path, window.location.origin).href : path);

function parts(r: ReceiptData) {
  const e = r.ebm!;
  const refund = e.label === "NR";
  // Refunds contain only negative amounts (§14); zero stays 0.00.
  const sgn = (n: unknown) => `${refund && Number(n) ? "-" : ""}${dec(n)}`;
  const total = r.lines.reduce((s, l) => s + (Number(l.total) || 0), 0);
  // §7.22: every rate above 0 always; §7.23: a 0 rate only when used.
  const taxLines = ["A", "B", "C", "D"].flatMap((k) => {
    const x = e.taxes[k];
    if (!x || !(Number(x.rate) > 0 || Number(x.taxable) !== 0)) return [];
    const rows: [string, string][] = [[`TOTAL ${x.label}`, sgn(x.taxable)]];
    if (Number(x.rate) > 0) rows.push([`TOTAL TAX ${k}`, sgn(x.tax)]);
    return rows;
  });
  return { e, refund, sgn, total, taxLines, items: r.lines.length };
}

export function ebmReceiptHtml(r: ReceiptData, t: T, lang: string, paper: ReceiptPaper, print: PrintSettings, opts: { autoPrint?: boolean } = {}): string {
  return paper === "a4" ? a4(r, t, lang, print, opts) : roll(r, t, lang, paper, print, opts);
}

const autoPrint = (on?: boolean) => on
  ? `<script>(function(){var printed=false;function go(){if(printed)return;printed=true;setTimeout(function(){window.print();},350);}
  if(document.readyState==="complete")go();else window.addEventListener("load",go);})();</script>` : "";

// COPY marking: below the header, below the totals and as a watermark, at
// least twice the size of the amounts (§11).
const WATERMARK = `<div class="wm">COPY</div>`;

/** 80 mm / 58 mm thermal roll, as the §13.1 / §14.1 / §15.1 examples. */
function roll(r: ReceiptData, t: T, lang: string, paper: ReceiptPaper, print: PrintSettings, opts: { autoPrint?: boolean }): string {
  const { e, refund, sgn, total, taxLines, items } = parts(r);
  const width = paper === "58" ? 58 : 80;
  const font = paper === "58" ? 10.5 : 12;
  const row = (a: string, b: string, cls = "") => `<div class="row ${cls}"><span>${esc(a)}</span><span>${esc(b)}</span></div>`;
  const lines = r.lines.map((l) => `
    <div class="item">${esc(l.name || t("sales.receipt_item"))}</div>
    <div class="row"><span>${dec(l.unitPrice)}x ${dec(l.quantity)}</span><span>${sgn(l.total)}${esc(l.tax || "")}</span></div>`).join("");
  const copyMark = e.copy ? `<div class="big">COPY</div>` : "";
  return `<!DOCTYPE html>
<html lang="${esc(lang)}"><head><meta charset="UTF-8"><title>${esc(e.label)} ${esc(e.invoiceNo)}</title>
<style id="page">@page { size: ${width}mm 200mm; margin: 0; }</style>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Courier New', Courier, monospace; font-size: ${font}px; width: ${width}mm; max-width: 100%; margin: 0 auto; padding: ${paper === "58" ? "2.5mm" : "4mm"}; position: relative; }
  .c { text-align: center; }
  .logo { width: 18mm; display: block; margin: 0 auto 3px; }
  .shop { font-weight: 700; text-transform: uppercase; font-size: 1.15em; word-break: break-word; }
  hr { border: none; border-top: 1px dashed #000; margin: 5px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .row span:last-child { text-align: right; white-space: nowrap; }
  .item { margin-top: 3px; word-break: break-word; }
  .b { font-weight: 700; }
  .big { text-align: center; font-weight: 700; font-size: 2.2em; letter-spacing: 2px; margin: 4px 0; }
  .notice { text-align: center; font-weight: 700; font-size: 2em; line-height: 1.15; margin: 4px 0; }
  .code { text-align: center; word-break: break-all; }
  .qr { width: 30mm; height: 30mm; margin: 6px auto; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .wm { position: absolute; top: 35%; left: 0; right: 0; text-align: center; font-size: 5em; font-weight: 700; color: rgba(0,0,0,.08); transform: rotate(-30deg); pointer-events: none; }
</style></head>
<body>
  ${e.copy ? WATERMARK : ""}
  <div class="c">
    <img class="logo" src="${esc(abs(RRA_LOGO))}" alt="RRA">
    <div class="shop">${esc(r.shop.name)}</div>
    ${r.shop.address ? `<div>${esc(r.shop.address)}</div>` : ""}
    ${e.sellerTin ? `<div>TIN: ${esc(e.sellerTin)}</div>` : ""}
  </div>
  ${copyMark}
  <hr>
  ${refund ? `<div class="c b">REFUND</div><div class="c">REF. NORMAL RECEIPT#: ${esc(e.originalInvoiceNo ?? "")}</div><hr>
  <div class="c">REFUND IS APPROVED ONLY FOR<br>ORIGINAL SALES RECEIPT</div>` : ""}
  ${print.receiptFooter.trim() && !refund ? `<div class="c">${esc(print.receiptFooter.trim())}</div>` : ""}
  ${e.customerTin ? `<div>Client ID: ${esc(e.customerTin)}</div>` : ""}
  ${r.customer ? `<div>Client: ${esc(r.customer)}</div>` : ""}
  ${e.customerPhone ? `<div>Client phone: ${esc(e.customerPhone)}</div>` : ""}
  <hr>
  ${lines}
  <hr>
  ${e.copy ? `<div class="notice">THIS IS NOT AN OFFICIAL RECEIPT</div><hr>` : ""}
  ${row("TOTAL", sgn(total), "b")}
  ${taxLines.map(([a, b]) => row(a, b)).join("")}
  ${row("TOTAL TAX", sgn(e.totalTax))}
  <hr>
  ${row((r.payment || "CASH").toUpperCase(), sgn(total))}
  ${row("ITEMS NUMBER", String(items))}
  <hr>
  ${copyMark ? `${copyMark}<hr>` : ""}
  <div class="b">SDC INFORMATION</div>
  <div>Date: ${esc(e.date)} Time: ${esc(e.time)}</div>
  <div>SDC ID: ${esc(e.sdcId || "")}</div>
  <div>RECEIPT NUMBER: ${esc(e.receiptNo ?? "")}/${esc(e.totalReceiptNo ?? "")} ${esc(e.label)}</div>
  <div>Internal Data:</div>
  <div class="code">${esc(e.internalData)}</div>
  <div>Receipt Signature:</div>
  <div class="code">${esc(e.signature)}</div>
  ${e.qrSvg ? `<div class="qr">${e.qrSvg}</div>` : ""}
  <hr>
  <div>RECEIPT NUMBER: ${esc(e.invoiceNo)}</div>
  <div>DATE: ${esc(e.cisDate || e.date)} TIME: ${esc(e.cisTime || e.time)}</div>
  <div>MRC: ${esc(e.mrcNo || "")}</div>
  ${e.cashier ? `<div>CASHIER: ${esc(e.cashier)}</div>` : ""}
  <hr>
  <div class="c">${esc(t("sales.thank_you"))}</div>
  <div class="c" style="font-size:.85em;margin-top:2px">${esc(t("sales.powered_by"))} Higoverse</div>
  <script>(function(){
    function fit(){var mm=Math.ceil(document.body.getBoundingClientRect().height*25.4/96)+6;document.getElementById("page").textContent="@page { size: ${width}mm "+mm+"mm; margin: 0; }";}
    var printed=false;function go(){fit();${opts.autoPrint ? `if(printed)return;printed=true;setTimeout(function(){window.print();},350);` : ""}}
    if(document.readyState==="complete")go();else window.addEventListener("load",go);
  })();</script>
</body></html>`;
}

/** A4: the layout of EBM v2 invoices (seller, INVOICE TO, items with RRA item
 *  codes, supply/VAT totals, SDC information and QR), with the RRA logo. */
function a4(r: ReceiptData, t: T, lang: string, print: PrintSettings, opts: { autoPrint?: boolean }): string {
  const { e, refund, sgn, total, items } = parts(r);
  const tx = (k: string) => e.taxes[k] || { label: k, rate: 0, taxable: 0, tax: 0 };
  const vatIncl = ["B", "C", "D"].reduce((s, k) => s + (Number(tx(k).taxable) || 0), 0);
  const rows = r.lines.map((l) => `
      <tr><td class="code">${esc(l.code || "")}</td><td>${esc(l.name || t("sales.receipt_item"))}</td>
        <td>${dec(l.quantity)}</td><td>${esc(l.tax || "")}</td><td>${sgn(l.unitPrice)}</td><td>${sgn(l.total)}</td></tr>`).join("");
  const line = "-----------------------------------";
  return `<!DOCTYPE html>
<html lang="${esc(lang)}"><head><meta charset="UTF-8"><title>INVOICE NO : ${esc(e.invoiceNo)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #fff; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Consolas, "Courier New", monospace; font-size: 12px; position: relative; }
  .top { display: flex; align-items: flex-start; gap: 14px; }
  .top img.own { width: 70px; height: 70px; object-fit: contain; }
  .top img.rra { width: 78px; margin-left: auto; }
  .seller { font-size: 11px; line-height: 1.7; text-transform: uppercase; }
  .seller .name { font-size: 12.5px; font-weight: 700; }
  .boxes { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; margin: 4px 0 16px; }
  .to { min-width: 40%; }
  .box { border: 1px solid #222; padding: 4px 6px; font-size: 13px; line-height: 1.5; }
  .inv { width: 38%; min-height: 90px; display: flex; flex-direction: column; justify-content: space-between; }
  .inv .no { font-size: 18px; }
  .big { text-align: center; font-weight: 700; font-size: 26px; letter-spacing: 2px; margin: 6px 0; }
  .refund { text-align: center; margin: 0 0 10px; font-size: 13px; }
  table.items { width: 100%; border-collapse: collapse; }
  table.items th { text-align: left; font-weight: 400; font-size: 13px; padding: 12px 6px; border: 1px solid #222; }
  table.items td { padding: 8px 6px; font-size: 11px; border-left: 1px solid #222; border-right: 1px solid #222; vertical-align: top; }
  table.items td.code { font-size: 10px; }
  table.items tr.fill td { height: ${Math.max(40, 360 - r.lines.length * 30)}px; border-bottom: 1px solid #222; }
  .bottom { display: flex; gap: 16px; margin-top: 18px; align-items: flex-start; }
  .sdc { flex: 1.1; font-size: 12.5px; line-height: 1.7; white-space: pre-wrap; }
  .qr { width: 32mm; height: 32mm; margin-top: 150px; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .right { flex: 1; }
  table.tot { width: 100%; border-collapse: collapse; }
  table.tot td { border: 1px solid #222; padding: 5px 6px; }
  table.tot td:first-child { font-size: 10px; font-weight: 700; width: 48%; }
  table.tot td:last-child { font-size: 13px; font-weight: 700; }
  .pay { margin-top: 8px; font-size: 12px; line-height: 1.6; }
  .wm { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 140px; font-weight: 700; color: rgba(0,0,0,.07); transform: rotate(-30deg); pointer-events: none; }
  .foot { margin-top: 22px; text-align: center; font-family: "Segoe UI", Arial, sans-serif; font-size: 10.5px; color: #777; }
</style></head>
<body>
  ${e.copy ? WATERMARK : ""}
  <div class="top">
    ${print.showLogo && r.shop.logoUrl ? `<img class="own" src="${esc(r.shop.logoUrl)}" alt="">` : ""}
    <div class="seller">
      <div class="name">${esc(r.shop.name)}</div>
      ${r.shop.address ? `<div>${esc(r.shop.address)}</div>` : ""}
      ${r.shop.phone ? `<div>TEL: ${esc(r.shop.phone)}</div>` : ""}
      ${r.shop.email ? `<div style="text-transform:none">EMAIL: ${esc(r.shop.email)}</div>` : ""}
      ${e.sellerTin ? `<div>TIN: ${esc(e.sellerTin)}</div>` : ""}
      ${e.cashier ? `<div style="text-transform:none">CASHIER: ${esc(e.cashier)}</div>` : ""}
    </div>
    <img class="rra" src="${esc(abs(RRA_LOGO))}" alt="RRA">
  </div>
  <div class="boxes">
    <div class="to">
      <div>INVOICE TO</div>
      <div class="box">TIN : ${esc(e.customerTin || "")}<br>Name : ${esc(r.customer || "")}${e.customerPhone ? `<br>Phone : ${esc(e.customerPhone)}` : ""}</div>
    </div>
    <div class="box inv">
      <div class="no">INVOICE NO : ${esc(e.invoiceNo)}</div>
      ${refund ? `<div>REFUND · REF. NORMAL RECEIPT# : ${esc(e.originalInvoiceNo ?? "")}</div>` : ""}
      <div>Date : ${esc(e.cisDate || e.date)}</div>
    </div>
  </div>
  ${e.copy ? `<div class="big">COPY</div>` : ""}
  ${refund ? `<div class="refund">REFUND IS APPROVED ONLY FOR ORIGINAL SALES RECEIPT</div>` : ""}
  <table class="items">
    <thead><tr><th style="width:17%">Item Code</th><th>Item Description</th><th style="width:8%">Qty</th><th style="width:6%">Tax</th><th style="width:17%">Unit Price</th><th style="width:19%">Total Price</th></tr></thead>
    <tbody>${rows}<tr class="fill"><td></td><td></td><td></td><td></td><td></td><td></td></tr></tbody>
  </table>
  ${e.copy ? `<div class="big">THIS IS NOT AN OFFICIAL RECEIPT</div>` : ""}
  <div class="bottom">
    <div class="sdc">${e.copy ? "COPY\n" : ""}SDC INFORMATION
${line}
Date: ${esc(e.date)}   Time: ${esc(e.time)}
SDC ID: ${esc(e.sdcId || "")}
RECEIPT NUMBER: ${esc(e.receiptNo ?? "")}/${esc(e.totalReceiptNo ?? "")} ${esc(e.label)}
Internal Data:
${esc(e.internalData)}
Receipt Signature:
${esc(e.signature)}
${line}
RECEIPT NUMBER: ${esc(e.invoiceNo)}
DATE: ${esc(e.cisDate || e.date)}   TIME: ${esc(e.cisTime || e.time)}
MRC: ${esc(e.mrcNo || "")}</div>
    ${e.qrSvg ? `<div class="qr">${e.qrSvg}</div>` : ""}
    <div class="right">
      <table class="tot">
        <tr><td>Exempt Supplies</td><td>${sgn(tx("A").taxable)}</td></tr>
        <tr><td>Total Supplies VAT Incl.</td><td>${sgn(vatIncl)}</td></tr>
        <tr><td>Total Supplies</td><td>${sgn(total)}</td></tr>
        <tr><td>Total VAT</td><td>${sgn(tx("B").tax)}</td></tr>
        <tr><td>Total Tax</td><td>${sgn(e.totalTax)}</td></tr>
        <tr><td>Total Amount</td><td>${sgn(total)}</td></tr>
      </table>
      <div class="pay">Payment : ${esc((r.payment || "CASH").toUpperCase())} ${sgn(total)}<br>ITEMS NUMBER : ${items}</div>
    </div>
  </div>
  <div class="foot">${esc(print.receiptFooter.trim() || t("sales.thank_you"))} · ${esc(t("sales.powered_by"))} Higoverse</div>
  ${autoPrint(opts.autoPrint)}
</body></html>`;
}
