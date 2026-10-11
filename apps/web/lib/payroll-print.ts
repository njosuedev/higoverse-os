// Printed payroll papers (A4): the salary confirmation an employee signs on
// receiving their pay, one per page, and the month's payroll sheet with a
// signature column. Pure: builds an HTML string for a print window.

import type { PrintShop } from "./proforma-print";
import type { SalaryPayment } from "./payroll-api";

type T = (key: string) => string;

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
const money = (n: number) => Math.round(n || 0).toLocaleString("en-US");
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

/** "October 2026" in the letter's language (English if the browser has no names for it). */
export function monthLabel(period: string, lang: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  try { return d.toLocaleDateString(lang, { month: "long", year: "numeric" }); }
  catch { return d.toLocaleDateString("en", { month: "long", year: "numeric" }); }
}

/** "11 October 2026" (day, month, year, as letters are dated in Rwanda);
 *  Chinese in its own order. */
function dayLabel(iso: string, lang: string): string {
  const d = new Date(`${iso}T12:00:00`);
  try {
    if (lang === "zh") return d.toLocaleDateString("zh", { day: "numeric", month: "long", year: "numeric" });
    return `${d.getDate()} ${d.toLocaleDateString(lang, { month: "long" })} ${d.getFullYear()}`;
  } catch { return iso; }
}

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function under1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const rest = r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : "");
  return [h ? `${ONES[h]} hundred` : "", rest].filter(Boolean).join(" ");
}

/** 430000 → "four hundred thirty thousand" (whole numbers, English). */
export function numberToWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return "zero";
  const parts: string[] = [];
  for (const [size, name] of [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"], [1, ""]] as const) {
    const chunk = Math.floor(n / size);
    if (chunk) parts.push(`${under1000(chunk)}${name ? ` ${name}` : ""}`);
    n %= size;
  }
  return parts.join(" ");
}

const STYLE = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #e9e9e9; color: #111; font-family: "Segoe UI", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { width: 210mm; min-height: 297mm; margin: 8mm auto; padding: 18mm 18mm 16mm; background: #fff; display: flex; flex-direction: column; page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
  @media print { body { background: #fff; } .sheet { margin: 0; box-shadow: none; } }
  .head { display: flex; align-items: center; gap: 14px; padding-bottom: 12px; border-bottom: 2px solid #111; }
  .head img { width: 64px; height: 64px; object-fit: contain; }
  .co .n { font-size: 20px; font-weight: 800; letter-spacing: .3px; }
  .co div { font-size: 11.5px; color: #333; line-height: 1.5; }
  .meta { display: flex; justify-content: space-between; margin-top: 14px; font-size: 12px; color: #333; }
  h1 { margin: 26px 0 18px; font-size: 18px; text-transform: uppercase; letter-spacing: 1.2px; text-align: center; }
  .body { font-size: 14px; line-height: 1.75; }
  table.fig { width: 100%; border-collapse: collapse; margin: 18px 0 8px; font-size: 13.5px; }
  table.fig th, table.fig td { border: 1px solid #bbb; padding: 8px 10px; text-align: left; }
  table.fig th { width: 42%; background: #f3f3f3; font-weight: 600; }
  table.fig td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.net th, tr.net td { font-weight: 800; font-size: 15px; }
  .words { font-size: 13px; font-style: italic; color: #222; }
  .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: auto; padding-top: 40px; font-size: 12.5px; }
  .sign .line { border-bottom: 1px solid #111; height: 46px; margin-bottom: 6px; }
  .sign b { display: block; margin-bottom: 2px; }
  .foot { margin-top: 18px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 10.5px; color: #666; text-align: center; }
  table.sheet-t { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
  table.sheet-t th, table.sheet-t td { border: 1px solid #999; padding: 7px 6px; vertical-align: middle; }
  table.sheet-t th { background: #f0f0f0; font-weight: 700; text-align: left; }
  table.sheet-t td.num, table.sheet-t th.num { text-align: right; font-variant-numeric: tabular-nums; }
  table.sheet-t td.sig { width: 26%; height: 34px; }
  table.sheet-t tr.total td { font-weight: 800; background: #f7f7f7; }
`;

function head(shop: PrintShop): string {
  return `
    <header class="head">
      ${shop.logo_url ? `<img src="${esc(shop.logo_url)}" alt="">` : ""}
      <div class="co">
        <div class="n">${esc(shop.name)}</div>
        ${shop.tin ? `<div>TIN: ${esc(shop.tin)}</div>` : ""}
        ${[shop.phone && `Tel: ${esc(shop.phone)}`, shop.email && esc(shop.email)].filter(Boolean).length
          ? `<div>${[shop.phone && `Tel: ${esc(shop.phone)}`, shop.email && esc(shop.email)].filter(Boolean).join(" · ")}</div>` : ""}
        ${shop.address ? `<div>${esc(shop.address)}</div>` : ""}
      </div>
    </header>`;
}

function page(title: string, body: string, autoPrint: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head>
<body>${body}${autoPrint ? `<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>` : ""}</body></html>`;
}

/** One confirmation per payment, each on its own A4 page. */
export function salaryLettersHtml(payments: SalaryPayment[], shop: PrintShop, t: T, lang: string, opts: { autoPrint?: boolean } = {}): string {
  const sheets = payments.map((p) => {
    const month = monthLabel(p.period, lang);
    const who = p.employee_id_number ? `${esc(p.employee_name)}, ${esc(fill(t("letter.id_no"), { id: p.employee_id_number }))}` : esc(p.employee_name);
    const words = lang === "en" ? `${numberToWords(p.net)} Rwandan francs` : "";
    return `
  <section class="sheet">
    ${head(shop)}
    <div class="meta">
      <span>${esc(t("letter.ref"))}: ${esc(`PAY-${p.period}-${p.id.slice(0, 6).toUpperCase()}`)}</span>
      <span>${esc(dayLabel(p.paid_on, lang))}</span>
    </div>
    <h1>${esc(t("letter.title"))}</h1>
    <div class="body">${fill(esc(t("letter.body")), {
      who: `<b>${who}</b>`,
      position: esc(p.position || t("letter.employee")),
      company: `<b>${esc(shop.name)}</b>`,
      month: `<b>${esc(month)}</b>`,
    })}</div>
    <table class="fig">
      <tr><th>${esc(t("letter.gross"))}</th><td class="num">${money(p.gross)} RWF</td></tr>
      ${p.deductions > 0 ? `<tr><th>${esc(t("letter.deductions"))}${p.deduction_note ? ` (${esc(p.deduction_note)})` : ""}</th><td class="num">- ${money(p.deductions)} RWF</td></tr>` : ""}
      <tr class="net"><th>${esc(t("letter.net"))}</th><td class="num">${money(p.net)} RWF</td></tr>
      ${words ? `<tr><th>${esc(t("letter.in_words"))}</th><td class="words">${esc(words.charAt(0).toUpperCase() + words.slice(1))}</td></tr>` : ""}
      <tr><th>${esc(t("letter.method"))}</th><td>${esc(t(`payroll.method_${p.method}`))}${p.reference ? ` · ${esc(t("letter.reference"))} ${esc(p.reference)}` : ""}</td></tr>
      <tr><th>${esc(t("letter.paid_on"))}</th><td>${esc(dayLabel(p.paid_on, lang))}</td></tr>
    </table>
    <div class="signs">
      <div class="sign">
        <div class="line"></div>
        <b>${esc(t("letter.employee_sign"))}</b>
        ${esc(p.employee_name)}
      </div>
      <div class="sign">
        <div class="line"></div>
        <b>${esc(fill(t("letter.employer_sign"), { company: shop.name }))}</b>
        ${p.paid_by_name ? esc(fill(t("letter.paid_by"), { name: p.paid_by_name })) : ""}
      </div>
    </div>
    <div class="foot">${esc(t("letter.footer"))}</div>
  </section>`;
  });
  return page(payments.length === 1 ? `${t("letter.title")} - ${payments[0].employee_name}` : t("letter.title"), sheets.join(""), !!opts.autoPrint);
}

/** The month's payroll sheet: everyone paid, with a column to sign. */
export function payrollSheetHtml(period: string, payments: SalaryPayment[], shop: PrintShop, t: T, lang: string, opts: { autoPrint?: boolean } = {}): string {
  const month = monthLabel(period, lang);
  const total = (k: "gross" | "deductions" | "net") => payments.reduce((s, p) => s + p[k], 0);
  const rows = payments.map((p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><b>${esc(p.employee_name)}</b>${p.position ? `<br><span style="color:#555">${esc(p.position)}</span>` : ""}</td>
        <td>${esc(p.employee_id_number || "")}</td>
        <td class="num">${money(p.gross)}</td>
        <td class="num">${p.deductions > 0 ? money(p.deductions) : ""}</td>
        <td class="num"><b>${money(p.net)}</b></td>
        <td class="sig"></td>
      </tr>`).join("");
  const body = `
  <section class="sheet">
    ${head(shop)}
    <h1>${esc(fill(t("sheet.title"), { month }))}</h1>
    <table class="sheet-t">
      <thead><tr>
        <th>#</th><th>${esc(t("sheet.name"))}</th><th>${esc(t("sheet.id"))}</th>
        <th class="num">${esc(t("sheet.gross"))}</th><th class="num">${esc(t("sheet.deductions"))}</th>
        <th class="num">${esc(t("sheet.net"))}</th><th>${esc(t("sheet.signature"))}</th>
      </tr></thead>
      <tbody>${rows}
        <tr class="total"><td colspan="3">${esc(t("sheet.total"))} (RWF)</td>
          <td class="num">${money(total("gross"))}</td><td class="num">${money(total("deductions"))}</td>
          <td class="num">${money(total("net"))}</td><td></td></tr>
      </tbody>
    </table>
    <div class="signs">
      <div class="sign"><div class="line"></div><b>${esc(t("sheet.prepared"))}</b></div>
      <div class="sign"><div class="line"></div><b>${esc(t("sheet.approved"))}</b></div>
    </div>
  </section>`;
  return page(fill(t("sheet.title"), { month }), body, !!opts.autoPrint);
}
