// Printed payroll papers (A4): the pay slip an employee signs on receiving
// their pay (the business's own layout), one per page; the advance receipt;
// and the month's payroll sheet with a signature column. Pure: builds an
// HTML string for a print window.

import { qrBlockHtml } from "./doc-qr";
import type { PrintShop } from "./proforma-print";
import type { SalaryAdvance, SalaryPayment } from "./payroll-api";

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
  .slip { padding: 14mm 14mm 14mm; font-family: "Times New Roman", Times, serif; }
  .slip-head { display: flex; justify-content: space-between; align-items: flex-start; }
  .slip-head img { width: 120px; height: 120px; object-fit: contain; }
  .slip-co { font-size: 11px; line-height: 2; text-align: left; }
  .slip-title { margin: 6px 0 10px; font-size: 18px; letter-spacing: .5px; text-align: center; text-transform: uppercase; }
  .slip-who { margin: 0 0 2px; font-size: 12px; }
  .slip-draft { margin: -4px 0 8px; text-align: center; font-size: 11px; font-weight: 700; letter-spacing: 1px; color: #c00000; text-transform: uppercase; }
  table.slip-t { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.slip-t th, table.slip-t td { border: 1px solid #333; padding: 2px 4px; height: 19px; text-align: left; vertical-align: top; font-weight: 400; }
  table.slip-t th { width: 20%; }
  table.slip-t td { width: 20%; }
  table.slip-t tr.hd th { background: #f8cbad; font-weight: 700; }
  table.slip-t tr.hd th span { font-weight: 700; }
  table.slip-t th.lb { background: #f8cbad; font-weight: 700; }
  table.slip-t tr.salary th, table.slip-t tr.salary td { background: #a9d08e; font-weight: 700; }
  table.slip-t tr.pay th, table.slip-t tr.pay td { background: #ffff00; font-weight: 700; }
  table.slip-t .red { color: #c00000; }
  table.slip-t th.red { color: #c00000; }
  table.slip-t th.blue { color: #2f5597; font-weight: 700; }
  table.slip-t th:not(.lb):not(.blue):not(.red) { font-weight: 700; }
  table.slip-t td.num { text-align: left; font-variant-numeric: tabular-nums; }
  table.slip-t .note { font-size: 9.5px; color: #444; }
  .slip-signs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 18px; font-size: 12px; }
  .slip-signs .line { border-bottom: 1px solid #333; height: 34px; }
  .slip-signs small { color: #555; }
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

// Prints once (a frame or window written into can report "loaded" twice:
// its own blank page, then the papers), then closes a window it is in.
const PRINT_ONCE = `<script>(function(){var printed=false;function go(){if(printed)return;printed=true;setTimeout(function(){window.print();},300);}
if(document.readyState==="complete")go();else window.addEventListener("load",go);window.onafterprint=function(){window.close();};})();</script>`;

/** The document's QR code (lib/doc-qr.ts), at the right under the signatures. */
const qrCorner = (code: string | null | undefined, t: T) => {
  const block = qrBlockHtml(code, t("print.qr_caption"), "24mm");
  return block ? `<div style="display:flex;justify-content:flex-end;margin-top:14px">${block}</div>` : "";
};

function page(title: string, body: string, autoPrint: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head>
<body>${body}${autoPrint ? PRINT_ONCE : ""}</body></html>`;
}

/** One pay slip per payment, each on its own A4 page, as the business's
 *  own paper looks: the letterhead, "PAY SLIP", the employee, then the
 *  contract, month, day wage and working days; basic salary, bonus,
 *  accommodation and the salary; lateness, personal and sick leave (days,
 *  from Attendance); overtime; what was deducted; and the line paid to the
 *  employee's bank. "Approved by" and the employee's signature underneath. */
export function salaryLettersHtml(payments: SalaryPayment[], shop: PrintShop, t: T, lang: string, opts: { autoPrint?: boolean; qr?: boolean } = {}): string {
  const short = (iso: string | null) => (iso ? iso.replaceAll("-", "/") : "…");
  const days = (n: number) => (n ? `${n} ${esc(t(n === 1 ? "slip.day" : "slip.days"))}` : "");
  const sheets = payments.map((p) => {
    const month = monthLabel(p.period, lang);
    const wd = p.working_days || 26;
    const earned = p.gross + (p.bonus || 0) + (p.accommodation || 0) + (p.overtime_amount || 0);
    // Not paid yet (for approval): how it will be paid isn't known unless there's a bank account.
    const payTo = p.bank_name ? fill(t("slip.pay_to_bank"), { bank: p.bank_name })
      : p.draft ? t("payroll.status_due") : fill(t("slip.pay_by"), { method: t(`payroll.method_${p.method}`) });
    const amt = (n: number) => (n ? `${money(n)} RWF` : "");
    return `
  <section class="sheet slip">
    <header class="slip-head">
      ${shop.logo_url ? `<img src="${esc(shop.logo_url)}" alt="">` : "<span></span>"}
      <div class="slip-co">
        <div>${esc(shop.name.toUpperCase())}</div>
        ${shop.tin ? `<div>TIN: ${esc(shop.tin)}</div>` : ""}
        ${shop.phone ? `<div>Tel: ${esc(shop.phone)}</div>` : ""}
        ${shop.email ? `<div>EMAIL: ${esc(shop.email)}</div>` : ""}
        ${shop.address ? `<div>${esc(shop.address.toUpperCase())}</div>` : ""}
      </div>
    </header>
    <h1 class="slip-title">${esc(t("slip.title"))}</h1>
    ${p.draft ? `<p class="slip-draft">${esc(t("slip.draft"))}</p>` : ""}
    <p class="slip-who"><b>${esc(t("slip.employee"))}: ${esc(p.employee_name.toUpperCase())}</b>${p.position ? ` · ${esc(p.position)}` : ""}</p>
    <table class="slip-t">
      <tr class="hd">
        <th>${esc(t("slip.contract"))}<br><span>${esc(short(p.contract_start))} - ${esc(short(p.contract_end))}</span></th>
        <th>${esc(fill(t("slip.month"), { month }))}<br><span>${p.draft ? "" : esc(short(p.paid_on))}</span></th>
        <th>${esc(t("slip.day_wage"))}</th>
        <th>${esc(t("slip.working_days"))}</th>
        <th></th>
      </tr>
      <tr><th class="lb">${esc(t("slip.basic"))}</th><td>${money(p.gross)} RWF</td><td>${money(Math.floor(p.gross / wd))} RWF</td><td>${wd}</td><td class="num">${money(p.gross)} RWF</td></tr>
      <tr><th class="lb">${esc(t("slip.bonus"))}</th><td>${amt(p.bonus)}</td><td></td><td></td><td class="num">${amt(p.bonus)}</td></tr>
      <tr><th class="lb">${esc(t("slip.accommodation"))}</th><td>${amt(p.accommodation)}</td><td></td><td></td><td class="num">${amt(p.accommodation)}</td></tr>
      <tr class="salary"><th>${esc(t("slip.salary"))}</th><td>${money(earned)} RWF</td><td></td><td></td><td class="num">${money(earned)} RWF</td></tr>
      <tr><th class="lb red">${esc(t("slip.lateness"))}</th><td>${days(p.late_days)}</td><td></td><td></td><td></td></tr>
      <tr><th class="lb red">${esc(t("slip.personal_leave"))}</th><td>${days(p.leave_days)}</td><td></td><td></td><td></td></tr>
      <tr><th class="lb red">${esc(t("slip.sick_leave"))}</th><td>${days(p.sick_days)}</td><td></td><td></td><td></td></tr>
      <tr><th class="lb"></th><td></td><td></td><td></td><td></td></tr>
      <tr><th class="blue">${esc(t("slip.overtime"))}</th><td>${p.overtime_hours || 0}</td><td></td><td></td><td class="num">${amt(p.overtime_amount)}</td></tr>
      <tr><th></th><td></td><td></td><td></td><td></td></tr>
      <tr><th>${esc(t("slip.deduct"))}</th><td>${p.deductions ? `${money(p.deductions)} RWF` : ""}${p.deduction_note ? `<div class="note">${esc(p.deduction_note)}</div>` : ""}</td><td></td><td></td><td class="num">${p.deductions ? `- ${money(p.deductions)} RWF` : ""}</td></tr>
      <tr class="pay"><th>${esc(payTo)}</th><td class="red">${p.bank_account ? `${esc(p.bank_account)}<br>` : ""}${esc(p.employee_name.toUpperCase())}${!p.bank_account && p.reference ? `<br>${esc(t("letter.reference"))} ${esc(p.reference)}` : ""}</td><td></td><td></td><td class="num red">${money(p.net)}RWF</td></tr>
    </table>
    <div class="slip-signs">
      <div><span>${esc(t("slip.approved_by"))}</span><div class="line"></div>${p.paid_by_name ? `<small>${esc(p.paid_by_name)}</small>` : ""}</div>
      <div><span>${esc(t("slip.employee_sign"))}</span><div class="line"></div></div>
    </div>
    ${qrCorner(opts.qr !== false ? p.doc_code : null, t)}
  </section>`;
  });
  return page(payments.length === 1 ? `${t("slip.title")} - ${payments[0].employee_name}` : t("slip.title"), sheets.join(""), !!opts.autoPrint);
}

/** The receipt an employee signs on receiving a salary advance. */
export function advanceReceiptHtml(a: SalaryAdvance, shop: PrintShop, t: T, lang: string, opts: { autoPrint?: boolean; qr?: boolean } = {}): string {
  const who = a.employee_id_number ? `${esc(a.employee_name)}, ${esc(fill(t("letter.id_no"), { id: a.employee_id_number }))}` : esc(a.employee_name);
  const words = lang === "en" ? `${numberToWords(a.amount)} Rwandan francs` : "";
  const body = `
  <section class="sheet">
    ${head(shop)}
    <div class="meta">
      <span>${esc(t("letter.ref"))}: ${esc(`ADV-${a.given_on.slice(0, 7)}-${a.id.slice(0, 6).toUpperCase()}`)}</span>
      <span>${esc(dayLabel(a.given_on, lang))}</span>
    </div>
    <h1>${esc(t("advance.title"))}</h1>
    <div class="body">${fill(esc(t("advance.body")), {
      who: `<b>${who}</b>`,
      position: esc(a.position || t("letter.employee")),
      company: `<b>${esc(shop.name)}</b>`,
    })}</div>
    <table class="fig">
      <tr class="net"><th>${esc(t("advance.amount"))}</th><td class="num">${money(a.amount)} RWF</td></tr>
      ${words ? `<tr><th>${esc(t("letter.in_words"))}</th><td class="words">${esc(words.charAt(0).toUpperCase() + words.slice(1))}</td></tr>` : ""}
      ${a.note ? `<tr><th>${esc(t("advance.reason"))}</th><td>${esc(a.note)}</td></tr>` : ""}
      <tr><th>${esc(t("letter.method"))}</th><td>${esc(t(`payroll.method_${a.method}`))}${a.reference ? ` · ${esc(t("letter.reference"))} ${esc(a.reference)}` : ""}</td></tr>
      <tr><th>${esc(t("advance.given_on"))}</th><td>${esc(dayLabel(a.given_on, lang))}</td></tr>
    </table>
    <p class="body">${esc(t("advance.deducted_note"))}</p>
    <div class="signs">
      <div class="sign">
        <div class="line"></div>
        <b>${esc(t("letter.employee_sign"))}</b>
        ${esc(a.employee_name)}
      </div>
      <div class="sign">
        <div class="line"></div>
        <b>${esc(fill(t("letter.employer_sign"), { company: shop.name }))}</b>
        ${a.given_by_name ? esc(fill(t("letter.paid_by"), { name: a.given_by_name })) : ""}
      </div>
    </div>
    ${qrCorner(opts.qr !== false ? a.doc_code : null, t)}
    <div class="foot">${esc(t("advance.footer"))}</div>
  </section>`;
  return page(`${t("advance.title")} - ${a.employee_name}`, body, !!opts.autoPrint);
}

/** The month's payroll sheet: everyone paid, with a column to sign. */
export function payrollSheetHtml(period: string, payments: SalaryPayment[], shop: PrintShop, t: T, lang: string, opts: { autoPrint?: boolean; qr?: boolean; code?: string } = {}): string {
  const month = monthLabel(period, lang);
  // Gross: the whole month's pay (basic + bonus + accommodation + overtime), so gross - deductions = net.
  const earned = (p: SalaryPayment) => p.gross + (p.bonus || 0) + (p.accommodation || 0) + (p.overtime_amount || 0);
  const total = (k: "gross" | "deductions" | "net") => payments.reduce((s, p) => s + (k === "gross" ? earned(p) : p[k]), 0);
  const rows = payments.map((p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><b>${esc(p.employee_name)}</b>${p.position ? `<br><span style="color:#555">${esc(p.position)}</span>` : ""}</td>
        <td>${esc(p.employee_id_number || "")}</td>
        <td class="num">${money(earned(p))}</td>
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
    ${qrCorner(opts.qr !== false ? opts.code : null, t)}
  </section>`;
  return page(fill(t("sheet.title"), { month }), body, !!opts.autoPrint);
}
