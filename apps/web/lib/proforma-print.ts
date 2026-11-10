// The printed proforma: A4 sheets laid out like a car dealer's paper
// proforma. Sheet 1 carries the details, customer, vehicles and payment
// terms; the last sheet the bank account, terms & conditions and signatures
// (as on the dealer's own second page). Each sheet is a fixed A4 box with
// its own header and footer, and each sheet's content (header included) is
// drawn at the largest size that fits its page: a short sheet is enlarged to
// fill the page, a long one shrunk instead of spilling onto an extra page.
//
// Pure: builds an HTML string, so it can be rendered to PDF in tests.

import { qrBlockHtml } from "./doc-qr";
import type { Proforma } from "./proforma-api";

export interface PrintShop {
  name: string;
  phone?: string;
  email?: string;
  tin?: string;
  /** Public address, ready to print. */
  address?: string;
  logo_url?: string;
}

type T = (key: string) => string;

/** The looks a proforma can be printed in (same content, different style). */
export const PROFORMA_TEMPLATES = ["classic", "modern", "minimal", "bold", "elegant"] as const;
export type ProformaTemplate = (typeof PROFORMA_TEMPLATES)[number];
/** Main colour of each template, for the picker's swatches. */
export const PROFORMA_TEMPLATE_COLORS: Record<ProformaTemplate, string> = {
  classic: "#1f3a68", modern: "#0f766e", minimal: "#111111", bold: "#b91c1c", elegant: "#8a6d3b",
};
const TEMPLATE_KEY = "hgv.proforma_template";
export function savedProformaTemplate(): ProformaTemplate {
  try {
    const v = localStorage.getItem(TEMPLATE_KEY);
    if (v && (PROFORMA_TEMPLATES as readonly string[]).includes(v)) return v as ProformaTemplate;
  } catch { /* storage blocked: default */ }
  return "classic";
}
export function saveProformaTemplate(v: ProformaTemplate) {
  try { localStorage.setItem(TEMPLATE_KEY, v); } catch { /* not remembered */ }
}

// Each template only overrides colours, fonts and the header's layout.
const TEMPLATE_CSS: Record<ProformaTemplate, string> = {
  classic: "",
  modern: `
  :root { --accent: #0f766e; --soft: #ecfdf5; --line: #cfe9e3; }
  .head { background: var(--accent); color: #fff; padding: 12px 16px; border-radius: 10px; margin-bottom: 4px; }
  .head img { background: #fff; padding: 4px; }
  .title .s { color: #d1fae5; }
  h2 { border-bottom: none; border-left: 4px solid var(--accent); padding: 2px 0 2px 10px; }
  table.grid { border-radius: 8px; overflow: hidden; }
  table.grid th { color: #134e4a; }
  table.items th:first-child { border-top-left-radius: 6px; } table.items th:last-child { border-top-right-radius: 6px; }`,
  minimal: `
  :root { --accent: #111; --soft: #fff; --line: #e5e5e5; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
  .head { border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 4px; }
  .head img { border-radius: 0; width: 70px; height: 70px; }
  .co b { font-weight: normal; color: #444; }
  .title .t { font-weight: 300; letter-spacing: 3px; }
  h2 { font-size: 11px; letter-spacing: 2px; font-weight: 600; padding-left: 0; border-bottom: 1px solid #bbb; }
  table.grid th, table.grid td { border: none; border-bottom: 1px solid var(--line); }
  table.grid th { background: none; color: #777; font-weight: normal; }
  table.items th { background: none; color: #111; border-bottom: 2px solid #111; }
  table.items tr.gt td { background: none; color: #111; border-top: 2px solid #111; font-size: 1.15em; }
  .terms { background: none; border: none; border-left: 2px solid #111; }`,
  bold: `
  :root { --accent: #b91c1c; --soft: #fef2f2; --line: #9ca3af; }
  .head { flex-direction: column; text-align: center; gap: 6px; border-bottom: 6px solid var(--accent); }
  .head .co { text-align: center; }
  .head .co b { display: inline; margin: 0 6px; }
  .co .n { font-size: 20px; font-weight: 900; }
  .title { background: #111; color: #fff; width: 100%; padding: 6px 0; }
  .title .t { font-size: 24px; font-weight: 900; }
  .title .t br { display: none; }
  .title .s { color: #f87171; }
  h2 { background: var(--accent); color: #fff; border: none; padding: 5px 10px; font-weight: 900; }
  table.grid th, table.grid td { border: 1.5px solid #374151; }
  table.grid th { background: #f3f4f6; color: #111; }
  table.items th { background: #111; }
  .foot { border-top: 3px solid var(--accent); }`,
  elegant: `
  :root { --accent: #8a6d3b; --soft: #faf7f0; --line: #e4dccb; }
  body { font-family: Georgia, "Times New Roman", serif; color: #2b2b2b; }
  .head { flex-direction: column; text-align: center; gap: 4px; border-bottom: 3px double var(--accent); padding-bottom: 10px; }
  .head .co { text-align: center; }
  .head .co b { display: inline; margin: 0 6px; font-weight: normal; font-style: italic; }
  .co .n { font-size: 20px; letter-spacing: 3px; color: var(--accent); }
  .title .t { font-size: 18px; letter-spacing: 4px; font-variant: small-caps; text-transform: none; }
  .title .t br { display: none; }
  h2 { text-align: center; border-bottom: none; padding: 0; letter-spacing: 3px; font-weight: normal; }
  h2::before, h2::after { content: " — "; color: var(--line); }
  table.grid th { background: var(--soft); color: #6b5a3a; font-weight: normal; font-style: italic; }
  table.items th { background: var(--soft); color: var(--accent); border-bottom: 1px solid var(--accent); }
  table.items tr.gt td { background: none; color: var(--accent); border-top: 3px double var(--accent); }
  .terms { background: var(--soft); }`,
};

/** Vehicles (car layout) or item rows that fit on a sheet before the rest move on. */
const FIRST_SHEET_VEHICLES = 2;
const MORE_SHEET_VEHICLES = 4;
const FIRST_SHEET_ITEMS = 14;
const MORE_SHEET_ITEMS = 28;

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
const money = (n: number) => Math.round(n || 0).toLocaleString("en-US");
const dotDate = (s: string) => (s || "").replaceAll("-", ".");

function chunks<X>(list: X[], first: number, more: number): X[][] {
  const out: X[][] = [list.slice(0, first)];
  for (let i = first; i < list.length; i += more) out.push(list.slice(i, i + more));
  return out;
}

export function proformaPrintHtml(
  p: Proforma, shop: PrintShop, t: T, isCar: boolean, opts: { autoPrint?: boolean; qr?: boolean; template?: ProformaTemplate } = {},
): string {
  const row = (a: string, av: string, b?: string, bv?: string) =>
    `<tr><th>${esc(a)}</th><td>${av}</td>${b !== undefined ? `<th>${esc(b)}</th><td>${bv ?? ""}</td>` : `<td colspan="2" class="blank"></td>`}</tr>`;
  const val = (v: unknown) => esc(v || "N/A");
  const cur = esc(p.currency);

  const head = `
    <header class="head">
      ${shop.logo_url ? `<img src="${esc(shop.logo_url)}" alt="">` : ""}
      <div class="co">
        <div class="n">${esc(shop.name)}</div>
        ${shop.tin ? `<b>TIN: ${esc(shop.tin)}</b>` : ""}
        ${shop.phone ? `<b>Tel: ${esc(shop.phone)}</b>` : ""}
        ${shop.email ? `<b>EMAIL: ${esc(shop.email)}</b>` : ""}
        ${shop.address ? `<b>${esc(shop.address.toUpperCase())}</b>` : ""}
      </div>
      <div class="title">
        <div class="t">${esc(t("proforma.print_title_1"))} <br>${esc(t("proforma.print_title_2"))}</div>
        <div class="s">${esc(t("proforma.non_binding"))}</div>
      </div>
    </header>`;

  const meta = `
    <table class="grid">
      ${row(t("proforma.number_short"), esc(p.invoice_no), t("proforma.date_issued"), esc(dotDate(p.date)))}
      ${row(t("proforma.valid_until"), esc(dotDate(p.valid_until)), t("proforma.salesperson"), esc(p.salesperson || shop.name))}
    </table>`;

  const customer = `
    <h2>${esc(t("proforma.customer_info"))}</h2>
    <table class="grid">
      ${row(t("proforma.full_name"), `<b>${esc(p.customer)}</b>`, t("proforma.id_passport"), val(p.customer_id_no))}
      ${row("TIN", val(p.customer_tin), t("proforma.phone"), val(p.customer_phone))}
      ${row(t("proforma.address"), val(p.customer_address), t("proforma.email"), val(p.customer_email))}
      ${row(t("proforma.country"), val(p.customer_country), t("proforma.company"), val(p.customer_company))}
    </table>`;

  const vehicle = (l: Proforma["lines"][number], i: number) => `
    ${p.lines.length > 1 ? `<p class="sub">${esc(t("proforma.vehicle"))} ${i + 1}</p>` : ""}
    <table class="grid keep">
      ${row(t("proforma.brand"), `<b>${esc(l.product_name)}</b>`, t("proforma.genre"), esc(l.car_type || ""))}
      ${row(t("vehicle.year"), esc(l.year || ""), t("proforma.energy"), esc(l.energy || ""))}
      ${row(t("proforma.colour"), esc(l.color || ""), t("proforma.condition"), esc(l.condition ? t(`proforma.condition_${l.condition}`) : ""))}
      ${row(t("proforma.mileage"), esc(l.mileage || ""), t("proforma.quantity"), esc(l.qty))}
      ${row(t("vehicle.chassis_no"), esc(l.chassis_no || ""), t("vehicle.plate_no"), esc(l.plate_no || ""))}
      ${row(t("proforma.col_price"), `${money(l.unit_price)} ${cur}`, t("proforma.total_price"), `<b>${money(l.unit_price * l.qty)} ${cur}</b>`)}
    </table>`;

  const itemRows = (lines: Proforma["lines"], start: number) =>
    lines.map((l, i) => `<tr><td>${start + i + 1}</td><td>${esc(l.product_name)}</td><td class="r">${esc(l.qty)}</td><td class="r">${money(l.unit_price)}</td><td class="r">${money(l.unit_price * l.qty)}</td></tr>`).join("");
  const itemTable = (lines: Proforma["lines"], start: number, last: boolean) => `
    <table class="items">
      <thead><tr><th>#</th><th>${esc(t("proforma.description_col"))}</th><th class="r">${esc(t("proforma.col_qty"))}</th><th class="r">${esc(t("proforma.col_price"))}</th><th class="r">${esc(t("proforma.col_total"))}</th></tr></thead>
      <tbody>${itemRows(lines, start)}</tbody>
      ${last ? `<tfoot>
        <tr><td colspan="4" class="r">${esc(t("proforma.subtotal"))}</td><td class="r">${money(p.subtotal)}</td></tr>
        ${p.tax_rate > 0 ? `<tr><td colspan="4" class="r">${esc(t("proforma.tax"))} (${p.tax_rate}%)</td><td class="r">${money(p.tax_amount)}</td></tr>` : ""}
        <tr class="gt"><td colspan="4" class="r">${esc(t("proforma.grand_total"))}</td><td class="r">${money(p.grand_total)} ${cur}</td></tr>
        <!-- RRA's CIS specification §11: a proforma is not a receipt and says so, in English, larger than the amounts. -->
        <tr><td colspan="5" style="text-align:center;font-weight:700;font-size:1.6em;letter-spacing:1px;padding-top:10px">PROFORMA · THIS IS NOT AN OFFICIAL RECEIPT</td></tr>
      </tfoot>` : ""}
    </table>`;

  const paidDeposits = (p.deposits ?? []).reduce((a, d) => a + (Number(d.amount) || 0), 0) || (p.deposit_amount || 0);
  const due = Math.max(0, p.grand_total - paidDeposits);
  // Every deposit received, as on a receipt (two per row).
  const deps = (p.deposits ?? []).map((d, i) => [
    `${t("deposit.n")} ${i + 1}`,
    `${money(d.amount)} · ${esc(t(`sales.pm_${d.method}`))} · ${esc(dotDate(d.date))}${d.reference ? ` · ${esc(d.reference)}` : ""}`,
  ] as const);
  const depRows = Array.from({ length: Math.ceil(deps.length / 2) }, (_, i) => {
    const [a, b] = [deps[i * 2], deps[i * 2 + 1]];
    return b ? row(a[0], a[1], b[0], b[1]) : row(a[0], a[1]);
  }).join("");
  const payment = `
    <h2>${esc(t("proforma.payment_terms"))}</h2>
    <table class="grid keep">
      ${row(t("proforma.payment_method"), esc(p.payment_method || ""), t("proforma.currency"), cur)}
      ${row(t("proforma.deposit"), money(paidDeposits), t("proforma.balance_due"), `<b>${money(due)}</b>`)}
      ${depRows}
    </table>`;

  // ── Sheets: details + vehicles/items + payment, then terms & signatures ──
  const sectionTitle = `<h2>${esc(t(isCar ? "proforma.vehicle_details" : "proforma.items_services"))}</h2>`;
  const groups = isCar
    ? chunks(p.lines.map((l, i) => ({ l, i })), FIRST_SHEET_VEHICLES, MORE_SHEET_VEHICLES)
    : chunks(p.lines.map((l, i) => ({ l, i })), FIRST_SHEET_ITEMS, MORE_SHEET_ITEMS);
  const detailSheets = groups.map((g, gi) => {
    const last = gi === groups.length - 1;
    const body = isCar
      ? g.map(({ l, i }) => vehicle(l, i)).join("")
      : itemTable(g.map(({ l }) => l), g[0]?.i ?? 0, last);
    return [
      gi === 0 ? meta + customer : "",
      sectionTitle + body,
      last ? payment : "",
    ].join("");
  });

  const terms = (p.terms || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const closing = `
    ${p.bank_details ? `
      <table class="grid keep bank">
        <tr><th>${esc(t("proforma.bank_details"))}</th><td>${esc(p.bank_details).replace(/\n/g, "<br>")}</td></tr>
      </table>` : ""}
    ${terms.length ? `<h2>${esc(t("proforma.terms"))}</h2><div class="terms keep">${terms.map((s) => `<p>${esc(s)}</p>`).join("")}</div>` : ""}
    ${p.notes ? `<div class="notes"><b>${esc(t("proforma.notes"))}:</b> ${esc(p.notes)}</div>` : ""}
    <div class="sigwrap keep">
      <h2>${esc(t("proforma.signatures"))}</h2>
      <div class="sig">
        <div><h3>${esc(t("proforma.sig_customer"))}</h3><div class="l">${esc(t("proforma.signature"))}</div><div class="l">${esc(t("proforma.name_date"))}</div></div>
        <div><h3>${esc(t("proforma.sig_dealer"))}</h3><div class="l">${esc(t("proforma.signature"))}</div><div class="l">${esc(t("proforma.name_date"))}</div></div>
        ${opts.qr !== false && p.doc_code ? `<div class="sig-qr">${qrBlockHtml(p.doc_code, t("print.qr_caption"), "24mm")}</div>` : ""}
      </div>
      <p class="thanks">${esc(t("proforma.thanks").replace("{shop}", shop.name))}</p>
    </div>`;

  const sheets = [...detailSheets, closing];
  const total = sheets.length;
  const foot = (n: number) => `
    <footer class="foot">
      <span>${esc(shop.name)} — ${esc(t("proforma.print_title"))} &nbsp; <i>${esc(t("proforma.not_tax_invoice"))}</i></span>
      <span>${n} / ${total}</span>
    </footer>`;

  const body = sheets.map((content, i) => `
    <section class="sheet">
      <div class="room"><div class="fit">${head}${content}</div></div>
      ${foot(i + 1)}
    </section>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${esc(t("proforma.print_title"))} ${esc(p.invoice_no)}</title>
<style>
  :root { --accent: #1f3a68; --soft: #f3f3f3; --line: #d4d4d4; }
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #e9e9e9; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* One A4 sheet: header, the content room, footer pinned to the bottom. */
  .sheet { width: 210mm; height: 297mm; margin: 8mm auto; padding: 11mm 14mm 9mm; background: #fff;
           display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 2px 10px rgb(0 0 0 / .15); }
  .room { flex: 1; min-height: 0; overflow: hidden; }
  .fit { transform-origin: top left; }

  .head { display: flex; align-items: center; gap: 18px; padding-bottom: 8px; }
  .head img { width: 92px; height: 92px; object-fit: contain; border-radius: 50%; }
  .co { flex: 1; font-size: 12px; line-height: 1.35; }
  .co .n { font-size: 14px; text-transform: uppercase; }
  .co b { display: block; }
  .title { text-align: center; min-width: 170px; }
  .title .t { font-size: 22px; letter-spacing: .5px; line-height: 1.1; text-transform: uppercase; }
  .title .s { font-size: 10px; color: #444; margin-top: 2px; }

  h2 { color: var(--accent); font-size: 13.5px; text-transform: uppercase; margin: 16px 0 8px; padding: 0 0 5px 10px; border-bottom: 1px solid var(--accent); }
  table { width: 100%; border-collapse: collapse; }
  table.grid th, table.grid td { border: 1px solid var(--line); padding: 6px 9px; text-align: left; vertical-align: top; font-size: 12px; }
  table.grid th { background: var(--soft); color: #444; font-weight: bold; width: 21%; }
  table.grid td { width: 29%; }
  table.grid td.blank { border: none; background: none; }
  table.bank th { width: 22%; }
  table.bank td { width: auto; }
  .sub { font-weight: bold; color: var(--accent); margin: 8px 0 5px; }
  table.items th { background: var(--accent); color: #fff; padding: 7px 9px; text-align: left; font-size: 10.5px; text-transform: uppercase; }
  table.items td { padding: 6px 9px; border-bottom: 1px solid #e5e5e5; }
  table.items .r { text-align: right; }
  table.items tfoot td { border: none; color: #444; }
  table.items tr.gt td { background: var(--accent); color: #fff; font-weight: bold; }
  .terms { background: var(--soft); border: 1px solid var(--line); padding: 9px 13px; font-size: 11px; color: #333; line-height: 1.45; }
  .terms p { margin: 2px 0; }
  .notes { margin-top: 8px; font-size: 11px; color: #333; }
  .sigwrap { margin-top: 6px; }
  .sig { display: flex; gap: 40px; }
  .sig > div { flex: 1; }
  .sig > .sig-qr { flex: 0 0 auto; padding-top: 8px; }
  /* Same height for both titles, so the signature lines line up. */
  .sig h3 { color: var(--accent); font-size: 12px; text-transform: uppercase; margin: 6px 0 0; min-height: 2.6em; }
  .sig .l { border-top: 1px solid #333; margin-top: 38px; padding-top: 4px; font-size: 10.5px; color: #555; }
  .thanks { text-align: center; font-style: italic; color: #444; margin: 24px 0 0; }
  .foot { display: flex; justify-content: space-between; gap: 12px; border-top: 1px solid var(--accent); padding-top: 4px; margin-top: 8px; font-size: 9.5px; color: #555; }
  .keep { break-inside: avoid; }

${TEMPLATE_CSS[opts.template ?? "classic"] ?? ""}

  @media print {
    html, body { background: #fff; }
    .sheet { margin: 0; box-shadow: none; break-after: page; }
    .sheet:last-child { break-after: auto; }
  }
</style></head><body>
${body}
<script>
  // Draw each sheet's content at the largest size that fits its page, full
  // width: laid out narrower then scaled up (or wider then scaled down), so
  // text re-wraps and the content always spans the page. 8% of the page is
  // kept spare: printing lays text out a little taller than the screen
  // (fonts, logo), and content fitted exactly lost its last rows.
  function fitSheets() {
    document.querySelectorAll(".room").forEach(function (room) {
      var fit = room.firstElementChild, have = room.clientHeight * 0.92;
      function heightAt(s) {
        fit.style.width = (100 / s) + "%";
        fit.style.transform = "scale(" + s + ")";
        return fit.scrollHeight * s;
      }
      var lo = 0.5, hi = 1.6;
      if (heightAt(hi) <= have) lo = hi;
      else for (var i = 0; i < 16; i++) { var mid = (lo + hi) / 2; if (heightAt(mid) <= have) lo = mid; else hi = mid; }
      heightAt(lo);
    });
  }
  // Once, even if the window reports "loaded" twice (opened blank, then written into).
  var ready = false;
  window.addEventListener("load", function () {
    if (ready) return;
    ready = true;
    fitSheets();
    ${opts.autoPrint ? `setTimeout(function () { window.print(); }, 300);` : ""}
  });
  ${opts.autoPrint ? `window.onafterprint = function () { window.close(); };` : ""}
</script>
</body></html>`;
}
