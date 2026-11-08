// Printed RRA EBM reports: X and Z daily reports (CIS spec §18–19), PLU
// report (§21) and closing stock (§7.31). Monospace, on the receipt roll or
// A4, in English like the receipts. Pure: builds HTML for printHtml.

import type { EbmDailyReport, EbmPluReport, EbmReportSide } from "./ebm-api";
import { RRA_LOGO } from "./ebm-receipt-print";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const dec = (n: unknown) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const abs = (path: string) => (typeof window !== "undefined" ? new URL(path, window.location.origin).href : path);

function page(title: string, body: string, wide: boolean): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(title)}</title>
<style>
  @page { size: ${wide ? "A4" : "80mm 297mm"}; margin: ${wide ? "14mm" : "0"}; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 12px; color: #000; background: #fff;
    width: ${wide ? "100%" : "80mm"}; max-width: ${wide ? "170mm" : "80mm"}; margin: 0 auto; padding: ${wide ? "0" : "4mm"}; }
  .c { text-align: center; } .b { font-weight: 700; }
  .logo { width: 16mm; display: block; margin: 0 auto 3px; }
  h1 { font-size: 15px; text-align: center; margin: 4px 0; letter-spacing: 1px; }
  hr { border: none; border-top: 1px dashed #000; margin: 5px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .row span:last-child { text-align: right; white-space: nowrap; }
  .sub { margin-top: 4px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { padding: 2px 3px; text-align: right; border-bottom: 1px dotted #999; }
  th:first-child, td:first-child, th:nth-child(2), td:nth-child(2) { text-align: left; }
</style></head><body>${body}
<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},350);});</script></body></html>`;
}

const row = (a: string, b: string | number, bold = false) => `<div class="row${bold ? " b" : ""}"><span>${esc(a)}</span><span>${esc(b)}</span></div>`;

function header(r: { trade_name: string | null; tin: string | null; cis: string; mrc?: string | null }, title: string) {
  return `<img class="logo" src="${esc(abs(RRA_LOGO))}" alt="RRA">
  <div class="c b">${esc(r.trade_name || "")}</div>
  <div class="c">TIN: ${esc(r.tin || "")}</div>
  <h1>${esc(title)}</h1>
  ${row("CIS", r.cis)}${r.mrc !== undefined ? row("MRC", r.mrc || "") : ""}`;
}

function side(name: string, s: EbmReportSide, label: "NS" | "NR") {
  const neg = label === "NR" ? "-" : "";
  return `<div class="sub">${esc(name)} (${label})</div>
  ${row("Receipts", s.count)}
  ${row("Total incl. tax", `${s.total ? neg : ""}${dec(s.total)}`, true)}
  ${s.taxes.filter((t) => t.rate > 0 || t.taxable).map((t) => row(`Taxable ${t.label}`, `${t.taxable ? neg : ""}${dec(t.taxable)}`) +
    (t.rate > 0 ? row(`Tax ${t.type} (${t.rate}%)`, `${t.tax ? neg : ""}${dec(t.tax)}`) : "")).join("")}
  ${row("Total tax", `${s.total_tax ? neg : ""}${dec(s.total_tax)}`)}
  ${Object.entries(s.by_payment).map(([k, v]) => row(`  ${k}`, `${v ? neg : ""}${dec(v)}`)).join("")}`;
}

/** X or Z daily report, with every figure §18.1 / §19.1 lists. */
export function dailyReportHtml(r: EbmDailyReport, wide = false): string {
  const title = r.kind === "Z" ? `Z DAILY REPORT No ${r.number}` : "X DAILY REPORT";
  const body = `${header(r, title)}
  ${r.kind === "Z" && r.day ? row("Day", r.day.split("-").reverse().join("/")) : ""}
  ${row("From", when(r.from))}${row("To", when(r.to))}
  ${r.kind === "Z" ? row("Closed", when(r.closed_at)) + (r.closed_by ? row("By", r.closed_by) : "") : row("Printed", when(new Date().toISOString()))}
  <hr>${side("SALES", r.sales, "NS")}
  <hr>${side("REFUNDS", r.refunds, "NR")}
  <hr>
  ${row("NET SALES", dec(r.net_total), true)}
  ${row("Items sold", r.items_sold)}
  ${row("Items refunded", r.items_refunded ?? 0)}
  ${row("Opening deposit", dec(r.opening_deposit))}
  ${row("Cash withdrawals", `${r.withdrawals.count} / ${dec(r.withdrawals.amount)}`)}
  ${row("Copies CS", `${r.copies.CS.count} / ${dec(r.copies.CS.amount)}`)}
  ${row("Copies CR", `${r.copies.CR.count} / ${dec(r.copies.CR.amount)}`)}
  ${row("Training TS/TR", `${r.training.count} / ${dec(r.training.amount)}`)}
  ${row("Proforma PS", `${r.proforma.count} / ${dec(r.proforma.amount)}`)}
  ${row("Discounts", dec(r.discounts))}
  ${row("Other reductions", dec(r.reductions))}
  ${row("Incomplete sales", r.incomplete_sales)}
  <hr><div class="c">END OF ${r.kind} REPORT</div>`;
  return page(title, body, wide);
}

/** PLU report (§21): item code, name, unit price, tax rate, quantity sold and stock left. */
export function pluReportHtml(r: EbmPluReport, wide = false): string {
  const body = `${header(r, "PLU REPORT")}
  ${row("From", when(r.from))}${row("To", when(r.to))}<hr>
  <table><thead><tr><th>Code</th><th>Item</th><th>Price</th><th>Tax</th><th>Qty</th><th>Amount</th><th>Stock</th></tr></thead><tbody>
  ${r.items.map((i) => `<tr><td>${esc(i.item_code)}</td><td>${esc(i.name || "")}</td><td>${dec(i.unit_price)}</td><td>${esc(i.tax_type)} ${i.tax_rate}%</td>
    <td>${i.quantity}</td><td>${dec(i.amount)}</td><td>${i.remaining ?? "-"}</td></tr>`).join("")}
  </tbody></table>
  <hr>${row("TOTAL", dec(r.items.reduce((s, i) => s + i.amount, 0)), true)}`;
  return page("PLU report", body, wide);
}

/** Closing stock of a day (§7.31). */
export function stockReportHtml(r: { trade_name: string | null; tin: string | null }, day: string, items: { name: string; quantity: number }[], wide = false): string {
  const body = `${header({ ...r, cis: "Higoverse" }, "CLOSING STOCK")}
  ${row("Day", day.split("-").reverse().join("/"))}<hr>
  <table><thead><tr><th>Item</th><th></th><th>Quantity</th></tr></thead><tbody>
  ${items.map((i) => `<tr><td>${esc(i.name)}</td><td></td><td>${i.quantity}</td></tr>`).join("")}
  </tbody></table>`;
  return page("Closing stock", body, wide);
}
