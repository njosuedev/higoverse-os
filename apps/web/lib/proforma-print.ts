// The printed proforma: A4 sheets laid out like a car dealer's paper
// proforma. Sheet 1 carries the details, customer, vehicles and payment
// terms; the last sheet the bank account, terms & conditions and signatures
// (as on the dealer's own second page). Each sheet is a fixed A4 box with
// its own header and footer, and each sheet's content (header included) is
// drawn at the largest size that fits its page: a short sheet is enlarged to
// fill the page, a long one shrunk instead of spilling onto an extra page.
//
// Pure: builds an HTML string, so it can be rendered to PDF in tests.

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
  p: Proforma, shop: PrintShop, t: T, isCar: boolean, opts: { autoPrint?: boolean } = {},
): string {
  const row = (a: string, av: string, b?: string, bv?: string) =>
    `<tr><th>${esc(a)}</th><td>${av}</td>${b !== undefined ? `<th>${esc(b)}</th><td>${bv ?? ""}</td>` : `<td colspan="2" class="blank"></td>`}</tr>`;
  const val = (v: unknown) => esc(v || "N/A");
  const cur = esc(p.currency);
  const approved = p.status === "approved" || p.status === "accepted" || p.status === "sold";

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
        <div class="t">${esc(t("proforma.print_title_1"))}<br>${esc(t("proforma.print_title_2"))}</div>
        <div class="s">${esc(t("proforma.non_binding"))}</div>
        ${approved ? `<div class="stamp">${esc(t("proforma.stage_approved"))}${p.approved_by ? ` · ${esc(p.approved_by)}` : ""}</div>` : ""}
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
      </tfoot>` : ""}
    </table>`;

  const due = Math.max(0, p.grand_total - (p.deposit_amount || 0));
  const payment = `
    <h2>${esc(t("proforma.payment_terms"))}</h2>
    <table class="grid keep">
      ${row(t("proforma.payment_method"), esc(p.payment_method || ""), t("proforma.currency"), cur)}
      ${row(t("proforma.deposit"), money(p.deposit_amount), t("proforma.balance_due"), `<b>${money(due)}</b>`)}
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
  .stamp { display: inline-block; margin-top: 5px; font-size: 10px; color: #1f3a68; border: 1px solid #1f3a68; border-radius: 4px; padding: 1px 6px; }

  h2 { color: #1f3a68; font-size: 13.5px; text-transform: uppercase; margin: 16px 0 8px; padding: 0 0 5px 10px; border-bottom: 1px solid #1f3a68; }
  table { width: 100%; border-collapse: collapse; }
  table.grid th, table.grid td { border: 1px solid #d4d4d4; padding: 6px 9px; text-align: left; vertical-align: top; font-size: 12px; }
  table.grid th { background: #f3f3f3; color: #444; font-weight: bold; width: 21%; }
  table.grid td { width: 29%; }
  table.grid td.blank { border: none; background: none; }
  table.bank th { width: 22%; }
  table.bank td { width: auto; }
  .sub { font-weight: bold; color: #1f3a68; margin: 8px 0 5px; }
  table.items th { background: #1f3a68; color: #fff; padding: 7px 9px; text-align: left; font-size: 10.5px; text-transform: uppercase; }
  table.items td { padding: 6px 9px; border-bottom: 1px solid #e5e5e5; }
  table.items .r { text-align: right; }
  table.items tfoot td { border: none; color: #444; }
  table.items tr.gt td { background: #1f3a68; color: #fff; font-weight: bold; }
  .terms { background: #f3f3f3; border: 1px solid #d4d4d4; padding: 9px 13px; font-size: 11px; color: #333; line-height: 1.45; }
  .terms p { margin: 2px 0; }
  .notes { margin-top: 8px; font-size: 11px; color: #333; }
  .sigwrap { margin-top: 6px; }
  .sig { display: flex; gap: 40px; }
  .sig > div { flex: 1; }
  /* Same height for both titles, so the signature lines line up. */
  .sig h3 { color: #1f3a68; font-size: 12px; text-transform: uppercase; margin: 6px 0 0; min-height: 2.6em; }
  .sig .l { border-top: 1px solid #333; margin-top: 38px; padding-top: 4px; font-size: 10.5px; color: #555; }
  .thanks { text-align: center; font-style: italic; color: #444; margin: 24px 0 0; }
  .foot { display: flex; justify-content: space-between; gap: 12px; border-top: 1px solid #1f3a68; padding-top: 4px; margin-top: 8px; font-size: 9.5px; color: #555; }
  .keep { break-inside: avoid; }

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
  // text re-wraps and the content always spans the page.
  function fitSheets() {
    document.querySelectorAll(".room").forEach(function (room) {
      var fit = room.firstElementChild, have = room.clientHeight;
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
  window.addEventListener("load", function () {
    fitSheets();
    ${opts.autoPrint ? `setTimeout(function () { window.print(); }, 300);` : ""}
  });
  ${opts.autoPrint ? `window.onafterprint = function () { window.close(); };` : ""}
</script>
</body></html>`;
}
