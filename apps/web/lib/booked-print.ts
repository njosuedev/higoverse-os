// The "BOOKED" sign: one landscape A4 sheet put on (or in) a car once a
// customer has booked it with a proforma. Laid out like the dealer's paper
// sign: logo top-left, customer and phone top-right, a huge BOOKED across
// the middle, then the car(s) it holds and the booking (proforma number,
// booked until), salesperson and date at the bottom. No amounts: the sign
// sits on the car where any visitor can read it.
// The lines come filled in from the proforma; an empty field leaves a line
// to write on by hand.
//
// Pure: builds an HTML string.

import type { Proforma } from "./proforma-api";
import type { PrintShop } from "./proforma-print";

type T = (key: string) => string;

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
const dotDate = (s: string) => (s || "").replaceAll("-", ".");

export function bookedSignHtml(p: Proforma, shop: PrintShop, t: T, opts: { autoPrint?: boolean } = {}): string {
  const field = (label: string, value: unknown) =>
    `<div class="f"><span class="k">${esc(label)}</span><span class="v">${esc(value || "")}</span></div>`;
  const cols = [t("proforma.booked_car"), t("proforma.booked_year"), t("proforma.colour"), t("vehicle.plate_no"), t("vehicle.chassis_no"), t("proforma.mileage")];
  const carRows = p.lines.map((l) =>
    `<tr><td class="car">${esc(l.product_name)}</td><td>${esc(l.year || "")}</td><td>${esc(l.color || "")}</td><td><b>${esc(l.plate_no || "")}</b></td><td>${esc(l.chassis_no || "")}</td><td>${esc(l.mileage || "")}</td></tr>`,
  ).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t("proforma.booked"))} · ${esc(p.invoice_no)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap">
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #e5e7eb; font-family: "Open Sans", "Segoe UI", Arial, sans-serif; color: #2f2f33; }
  .sheet { width: 297mm; height: 210mm; margin: 10px auto; background: #fff; padding: 14mm 16mm 16mm; display: flex; flex-direction: column; overflow: hidden; }
  .top { display: flex; align-items: flex-start; }
  .logo { flex: 1; }
  .logo img { max-height: 16mm; max-width: 60mm; object-fit: contain; display: block; }
  .logo .n { font-size: 18px; font-weight: 600; text-transform: uppercase; }
  .fields { width: 46%; display: flex; flex-direction: column; gap: 5mm; padding-top: 2mm; }
  .f { display: flex; align-items: flex-end; gap: 3mm; font-size: 17px; }
  .f .k { white-space: nowrap; }
  .f .v { flex: 1; border-bottom: 1px solid #2f2f33; min-height: 1.4em; padding: 0 2mm; font-size: 17px; }
  .word { flex: 1; min-height: 30mm; display: flex; align-items: center; justify-content: center; }
  .word .b { display: inline-block; font-weight: 700; font-size: 62mm; line-height: 1; letter-spacing: 2mm; white-space: nowrap; }
  table.cars { width: 100%; border-collapse: collapse; margin-bottom: 5mm; font-size: 14px; }
  table.cars th { text-align: left; font-weight: 600; font-size: 12px; color: #555; border-bottom: 1px solid #2f2f33; padding: 0 2mm 1mm; }
  table.cars td { padding: 1.5mm 2mm; border-bottom: 1px solid #ccc; }
  table.cars td.car { font-weight: 600; }
  .deal { display: flex; gap: 8mm; margin-bottom: 7mm; }
  .deal .f { flex: 1; font-size: 15px; }
  .deal .f .v { font-size: 15px; font-weight: 600; }
  .bottom { display: flex; gap: 22mm; }
  .bottom .f { width: 42%; }
  @media print {
    html, body { background: #fff; }
    .sheet { margin: 0; }
  }
</style></head><body>
<div class="sheet">
  <div class="top">
    <div class="logo">${shop.logo_url ? `<img src="${esc(shop.logo_url)}" alt="">` : `<div class="n">${esc(shop.name)}</div>`}</div>
    <div class="fields">
      ${field(t("proforma.booked_customer"), p.customer)}
      ${field(t("proforma.booked_number"), p.customer_phone)}
    </div>
  </div>
  <div class="word"><div class="b">${esc(t("proforma.booked"))}</div></div>
  ${p.lines.length ? `<table class="cars"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${carRows}</tbody></table>` : ""}
  <div class="deal">
    ${field(t("proforma.number_short"), p.invoice_no)}
    ${field(t("proforma.booked_until"), dotDate(p.valid_until))}
  </div>
  <div class="bottom">
    ${field(t("proforma.booked_salesperson"), p.salesperson)}
    ${field(t("proforma.booked_date"), dotDate(p.date))}
  </div>
</div>
<script>
  // The word spans the page width, whatever the language.
  function fitWord() {
    var w = document.querySelector(".word .b"), room = w.parentElement.clientWidth * 0.94;
    w.style.fontSize = "100px";
    w.style.fontSize = Math.min(100 * room / w.scrollWidth, w.parentElement.clientHeight / 1.05) + "px";
  }
  var ready = false;
  window.addEventListener("load", function () {
    if (ready) return;
    ready = true;
    // Wait for the font (it sets the word's width), but never more than 1.5 s.
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    Promise.race([fonts, new Promise(function (r) { setTimeout(r, 1500); })]).then(function () {
      fitWord();
      ${opts.autoPrint ? `setTimeout(function () { window.print(); }, 200);` : ""}
    });
  });
  ${opts.autoPrint ? `window.onafterprint = function () { window.close(); };` : ""}
</script>
</body></html>`;
}
