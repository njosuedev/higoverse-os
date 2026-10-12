// The sale receipt, printed on this device's paper (Settings → Printing):
// 80 mm or 58 mm thermal roll, or A4. Shows the business's logo, address,
// phone and closing message as chosen there. Every name is escaped, so a
// product or customer called "A&B <1>" prints as written. Pure: builds the
// HTML for printHtml (lib/print-frame).

import QRCode from "qrcode";
import type { PrintSettings, ReceiptPaper } from "./print-settings";

type T = (key: string) => string;

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const amount = (n: unknown) => Math.round(Number(n) || 0).toLocaleString("en-US");

export interface ReceiptLine { name: string; quantity: number; unitPrice: number; total: number }

export interface ReceiptData {
  shop: { name: string; address?: string | null; phone?: string | null; logoUrl?: string | null; email?: string | null; tin?: string | null };
  receiptNo: string;
  date: string;
  customer?: string | null;
  lines: ReceiptLine[];
  currency: string;
  /** Translated payment method, if known. */
  payment?: string | null;
  paid?: number;
  change?: number;
  left?: number;
  /** Sold on credit: the whole total is owed. */
  onCredit?: boolean;
  /** The receipt's QR code as SVG (receiptQr), shown when Settings → Printing allows. */
  qrSvg?: string | null;
}

/** The receipt's QR code (SVG, sharp on any printer) for the signed code the
 *  server gives each sale (sale-service GET /sales/{id}/receipt-code):
 *  "HGV1.R.<sale>.<signature>". It carries no readable details: only the
 *  Higoverse app can check it, and only inside the business that sold it. */
export async function receiptQr(code: string | null | undefined): Promise<string | null> {
  if (!code) return null;
  try {
    return await QRCode.toString(code, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
  } catch {
    return null;   // the receipt prints without it
  }
}

/** Whether scanned text is a Higoverse receipt code. */
export const isReceiptCode = (text: string) => text.trim().startsWith("HGV1.R.");

/** The QR block: the code and a short caption. */
const qrBlock = (r: ReceiptData, t: T, print: PrintSettings, size: string) =>
  print.showQr && r.qrSvg
    ? `<div class="qr"><div class="qr-img" style="width:${size};height:${size}">${r.qrSvg}</div><div class="qr-cap">${esc(t("print.qr_caption"))}</div></div>`
    : "";

// A thermal roll is as long as the receipt: its page height is measured once
// laid out (browsers reject "80mm auto" and fall back to Letter or A4).
const PAPER: Record<ReceiptPaper, { page: string; width: string; roll: number | null; font: number; pad: string }> = {
  "80": { page: "80mm 200mm", width: "80mm", roll: 80, font: 12, pad: "4mm" },
  "58": { page: "58mm 200mm", width: "58mm", roll: 58, font: 10.5, pad: "2.5mm" },
  a4: { page: "A4", width: "120mm", roll: null, font: 13, pad: "14mm 0" },
};

export function receiptHtml(r: ReceiptData, t: T, lang: string, paper: ReceiptPaper, print: PrintSettings, opts: { autoPrint?: boolean } = {}): string {
  if (paper === "a4") return a4Html(r, t, lang, print, opts);
  const p = PAPER[paper];
  const total = r.lines.reduce((s, l) => s + (Number(l.total) || 0), 0);
  const rows = r.lines.map((l) => `
    <tr>
      <td class="item">${esc(l.name || t("sales.receipt_item"))}</td>
      <td class="c">${esc(l.quantity)}</td>
      <td class="r">${amount(l.unitPrice)}</td>
      <td class="r b">${amount(l.total)}</td>
    </tr>`).join("");
  const money = (n: number) => `${amount(n)} ${esc(r.currency)}`;
  return `<!DOCTYPE html>
<html lang="${esc(lang)}"><head><meta charset="UTF-8"><title>${esc(t("sales.receipt_title"))} #${esc(r.receiptNo)}</title>
<style id="page">@page { size: ${p.page}; margin: 0; }</style>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #fff; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Courier New', Courier, monospace; font-size: ${p.font}px; width: ${p.width}; max-width: 100%; margin: 0 auto; padding: ${p.pad}; }
  .center { text-align: center; }
  .logo { max-width: 60%; max-height: 22mm; object-fit: contain; margin: 0 auto 4px; display: block; }
  .shop { font-size: 1.3em; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; word-break: break-word; }
  .muted { color: #555; font-size: .85em; }
  hr { border: none; border-top: 1px dashed #888; margin: 6px 0; }
  hr.solid { border-top: 1px solid #222; }
  .row { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 2px; font-size: .92em; }
  .row span:last-child { text-align: right; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0; }
  th { font-size: .8em; text-transform: uppercase; color: #555; padding: 3px 0; border-bottom: 1.5px solid #222; text-align: right; }
  th:first-child { text-align: left; }
  td { padding: 4px 2px; border-bottom: 1px dotted #ccc; vertical-align: top; }
  td.item { word-break: break-word; padding-left: 0; }
  td.c { text-align: center; white-space: nowrap; }
  td.r { text-align: right; white-space: nowrap; }
  td.b { font-weight: 700; padding-right: 0; }
  .total { font-size: 1.15em; font-weight: 700; }
  .warn { color: #b91c1c; font-weight: 700; }
  .foot { text-align: center; color: #555; font-size: .85em; margin-top: 8px; }
  .qr { text-align: center; margin-top: 8px; }
  .qr-img { margin: 0 auto; }
  .qr-img svg { width: 100%; height: 100%; display: block; }
  .qr-cap { font-size: .75em; color: #555; margin-top: 3px; }
  ${paper === "58" ? "th:nth-child(3), td:nth-child(3) { display: none; }" : ""}
</style></head>
<body>
  <div class="center">
    ${print.showLogo && r.shop.logoUrl ? `<img class="logo" src="${esc(r.shop.logoUrl)}" alt="">` : ""}
    <div class="shop">${esc(r.shop.name)}</div>
    ${print.showAddress && r.shop.address ? `<div class="muted">${esc(r.shop.address)}</div>` : ""}
    ${print.showPhone && r.shop.phone ? `<div class="muted">${esc(r.shop.phone)}</div>` : ""}
    <div class="muted" style="margin-top:3px;letter-spacing:1px;text-transform:uppercase">${esc(t("sales.receipt_title"))}</div>
  </div>
  <hr>
  <div class="row"><span class="muted">${esc(t("sales.receipt_no"))}</span><b>${esc(r.receiptNo)}</b></div>
  <div class="row"><span class="muted">${esc(t("common.date"))}</span><span>${esc(r.date)}</span></div>
  ${r.customer ? `<div class="row"><span class="muted">${esc(t("sales.col_customer"))}</span><b>${esc(r.customer)}</b></div>` : ""}
  <hr>
  <table>
    <thead><tr><th>${esc(t("sales.receipt_item"))}</th><th style="text-align:center">${esc(t("sales.col_qty"))}</th><th>${esc(t("sales.unit_price"))}</th><th>${esc(t("common.total"))}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <hr class="solid">
  <div class="row total"><span>${esc(t("sales.receipt_grand_total"))}</span><span>${money(total)}</span></div>
  ${r.payment ? `
  <hr>
  <div class="row"><span class="muted">${esc(t("sales.payment"))}</span><b>${esc(r.payment)}</b></div>
  ${r.paid ? `<div class="row"><span class="muted">${esc(t("sales.amount_paid"))}</span><span>${money(r.paid)}</span></div>` : ""}
  ${r.change && r.change > 0 ? `<div class="row"><span class="muted">${esc(t("sales.change_label"))}</span><b>${money(r.change)}</b></div>` : ""}
  ${r.left && r.left > 0 ? `<div class="row"><span class="muted">${esc(t("sales.remaining"))}</span><b>${money(r.left)}</b></div>` : ""}
  ${r.onCredit ? `<div class="row warn"><span>${esc(t("sales.on_credit"))}</span><span>${money(total)} ${esc(t("sales.owed"))}</span></div>` : ""}` : ""}
  <hr>
  ${qrBlock(r, t, print, paper === "58" ? "24mm" : "28mm")}
  <div class="foot">${esc(print.receiptFooter.trim() || t("sales.thank_you"))}</div>
  <div class="foot" style="margin-top:2px">${esc(t("sales.powered_by"))} Higoverse</div>
  <script>(function(){
    // The roll's length: the receipt's own height (+ a little to tear off).
    function fit(){${p.roll ? `var mm=Math.ceil(document.body.getBoundingClientRect().height*25.4/96)+6;document.getElementById("page").textContent="@page { size: ${p.roll}mm "+mm+"mm; margin: 0; }";` : ""}}
    var printed=false;function go(){fit();${opts.autoPrint ? `if(printed)return;printed=true;setTimeout(function(){window.print();},350);` : ""}}
    if(document.readyState==="complete")go();else window.addEventListener("load",go);
  })();</script>
</body></html>`;
}

/** The same sale on A4, as a business document: the letterhead (logo, name,
 *  TIN, phone, email, address), "Sales receipt" with its number and date,
 *  the customer, a full-width table of items, the totals and payment, the
 *  closing message, and lines for the seller's and customer's signatures. */
function a4Html(r: ReceiptData, t: T, lang: string, print: PrintSettings, opts: { autoPrint?: boolean }): string {
  const total = r.lines.reduce((s, l) => s + (Number(l.total) || 0), 0);
  const money = (n: number) => `${amount(n)} ${esc(r.currency)}`;
  const rows = r.lines.map((l, i) => `
      <tr>
        <td class="n">${i + 1}</td>
        <td>${esc(l.name || t("sales.receipt_item"))}</td>
        <td class="c">${esc(l.quantity)}</td>
        <td class="r">${amount(l.unitPrice)}</td>
        <td class="r b">${amount(l.total)}</td>
      </tr>`).join("");
  return `<!DOCTYPE html>
<html lang="${esc(lang)}"><head><meta charset="UTF-8"><title>${esc(t("sales.receipt_title"))} #${esc(r.receiptNo)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #fff; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 12.5px; }
  .head { display: flex; align-items: center; gap: 16px; padding-bottom: 12px; border-bottom: 2px solid #111; }
  .head img { width: 70px; height: 70px; object-fit: contain; }
  .co .name { font-size: 20px; font-weight: 800; letter-spacing: .3px; }
  .co div { font-size: 11.5px; color: #333; line-height: 1.55; }
  .title { display: flex; justify-content: space-between; align-items: flex-end; margin: 18px 0 12px; }
  .title h1 { font-size: 20px; letter-spacing: 1.5px; text-transform: uppercase; }
  .meta { text-align: right; font-size: 12px; line-height: 1.6; }
  .meta b { font-weight: 700; }
  .cust { margin-bottom: 12px; font-size: 12.5px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f1f1f1; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; padding: 8px; border: 1px solid #bbb; }
  td { padding: 8px; border: 1px solid #ccc; vertical-align: top; word-break: break-word; }
  td.n { width: 34px; color: #666; }
  td.c, th.c { text-align: center; white-space: nowrap; }
  td.r, th.r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.b { font-weight: 700; }
  .sum { display: flex; align-items: flex-start; gap: 24px; margin-top: 12px; }
  .sum .qr { text-align: center; }
  .sum .qr-img svg { width: 100%; height: 100%; display: block; }
  .sum .qr-cap { font-size: 10px; color: #555; margin-top: 4px; max-width: 34mm; }
  .totals { margin-left: auto; width: 60%; border-collapse: collapse; }
  .totals td { border: none; border-bottom: 1px solid #e5e5e5; padding: 6px 8px; }
  .totals td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .totals tr.grand td { font-size: 15px; font-weight: 800; border-top: 2px solid #111; border-bottom: 2px solid #111; }
  .warn { color: #b91c1c; font-weight: 700; }
  .msg { margin-top: 18px; text-align: center; color: #444; }
  .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 46px; font-size: 12px; }
  .signs .line { border-bottom: 1px solid #111; height: 40px; margin-bottom: 6px; }
  .foot { margin-top: 28px; padding-top: 8px; border-top: 1px solid #ddd; text-align: center; font-size: 10.5px; color: #777; }
</style></head>
<body>
  <header class="head">
    ${print.showLogo && r.shop.logoUrl ? `<img src="${esc(r.shop.logoUrl)}" alt="">` : ""}
    <div class="co">
      <div class="name">${esc(r.shop.name)}</div>
      ${r.shop.tin ? `<div>TIN: ${esc(r.shop.tin)}</div>` : ""}
      ${[print.showPhone && r.shop.phone ? `Tel: ${esc(r.shop.phone)}` : "", r.shop.email ? esc(r.shop.email) : ""].filter(Boolean).length
        ? `<div>${[print.showPhone && r.shop.phone ? `Tel: ${esc(r.shop.phone)}` : "", r.shop.email ? esc(r.shop.email) : ""].filter(Boolean).join(" · ")}</div>` : ""}
      ${print.showAddress && r.shop.address ? `<div>${esc(r.shop.address)}</div>` : ""}
    </div>
  </header>
  <div class="title">
    <h1>${esc(t("sales.receipt_title"))}</h1>
    <div class="meta">
      <div>${esc(t("sales.receipt_no"))} <b>${esc(r.receiptNo)}</b></div>
      <div>${esc(t("common.date"))}: ${esc(r.date)}</div>
    </div>
  </div>
  ${r.customer ? `<p class="cust">${esc(t("sales.col_customer"))}: <b>${esc(r.customer)}</b></p>` : ""}
  <table>
    <thead><tr><th>#</th><th>${esc(t("sales.receipt_item"))}</th><th class="c">${esc(t("sales.col_qty"))}</th><th class="r">${esc(t("sales.unit_price"))}</th><th class="r">${esc(t("common.total"))}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="sum">
  ${qrBlock(r, t, print, "32mm")}
  <table class="totals">
    <tr class="grand"><td>${esc(t("sales.receipt_grand_total"))}</td><td>${money(total)}</td></tr>
    ${r.payment ? `<tr><td>${esc(t("sales.payment"))}</td><td><b>${esc(r.payment)}</b></td></tr>` : ""}
    ${r.paid ? `<tr><td>${esc(t("sales.amount_paid"))}</td><td>${money(r.paid)}</td></tr>` : ""}
    ${r.change && r.change > 0 ? `<tr><td>${esc(t("sales.change_label"))}</td><td>${money(r.change)}</td></tr>` : ""}
    ${r.left && r.left > 0 ? `<tr><td>${esc(t("sales.remaining"))}</td><td><b>${money(r.left)}</b></td></tr>` : ""}
    ${r.onCredit ? `<tr class="warn"><td>${esc(t("sales.on_credit"))}</td><td>${money(total)} ${esc(t("sales.owed"))}</td></tr>` : ""}
  </table>
  </div>
  <p class="msg">${esc(print.receiptFooter.trim() || t("sales.thank_you"))}</p>
  <div class="signs">
    <div><div class="line"></div>${esc(t("print.sign_seller"))}</div>
    <div><div class="line"></div>${esc(t("print.sign_customer"))}</div>
  </div>
  <div class="foot">${esc(t("sales.powered_by"))} Higoverse</div>
  ${opts.autoPrint ? `<script>(function(){var printed=false;function go(){if(printed)return;printed=true;setTimeout(function(){window.print();},350);}
  if(document.readyState==="complete")go();else window.addEventListener("load",go);})();</script>` : ""}
</body></html>`;
}
