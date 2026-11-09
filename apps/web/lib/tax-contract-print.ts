// The printed tax advisory contract between Higoverse and one of its tax
// clients (AMASEZERANO YO KUNGANIRA MU IBARURA MARI N'IMISORO), from the
// admin panel's Tax clients. Kinyarwanda, as Higoverse's own contract; the
// blanks are filled from the contract (auth-service tax_contracts), and
// anything not recorded prints as a line to fill in by hand.
//
// Laid out as a formal contract: letterhead with the logo and contract
// number, the two parties side by side, numbered articles, the payment
// details as a table, signature blocks with room for the stamp, and on every
// page the company line and the contract number (the page is a
// table whose header and footer the browser repeats on each printed page).
// A verification panel with the QR code closes it.
//
// Pure: builds an HTML string for lib/print-frame.ts.

import type { TaxContract } from "./admin-api";
import { qrSvg } from "./doc-qr";

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const MONTHS = ["Mutarama", "Gashyantare", "Werurwe", "Mata", "Gicurasi", "Kamena", "Nyakanga", "Kanama", "Nzeri", "Ukwakira", "Ugushyingo", "Ukuboza"];

/** 2026-11-06 → 06/11/2026. */
const slashDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "____/____/________";
};
/** 2026-09-01 → 1 Nzeri 2026. */
const longDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : "____________";
};
/** +250788497878 → 0788 497 878 (as written in Rwanda). */
const localPhone = (p?: string | null) => {
  const d = (p || "").replace(/^\+250/, "0").replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : (p || "").replace(/^\+250/, "0");
};
const money = (n: number) => Math.round(n || 0).toLocaleString("en-US");
/** A filled value, or a line to write on. */
const v = (x: unknown, width = 40) => {
  const s = String(x ?? "").trim();
  return s ? esc(s) : `<span class="line" style="width:${width}mm"></span>`;
};

/** HGV/TC/2026/3F9A2C: the contract's number, from its date and id. */
export function contractNumber(c: Pick<TaxContract, "id" | "contract_date">): string {
  return `HGV/TC/${(c.contract_date || "").slice(0, 4) || "----"}/${(c.id || "").replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/** [logoUrl]: Higoverse's logo, a full URL (the page prints from a blank frame).
 *  [clientStamp] / [companyStamp]: each side's stamp with signature (data
 *  URLs), pressed over that side's signature box. */
export function taxContractHtml(c: TaxContract, opts: { autoPrint?: boolean; logoUrl?: string; clientStamp?: string | null; companyStamp?: string | null } = {}): string {
  const co = c.company || {};
  const name = esc(co.name || "HIGOVERSE");
  const client = esc(c.client_name);
  const no = esc(contractNumber(c));
  const qr = qrSvg(c.doc_code);
  const contact = [
    co.tin ? `<b>TIN</b> ${esc(co.tin)}` : "",
    [co.phone, co.phone2].filter(Boolean).length ? `<b>Tel</b> ${[co.phone, co.phone2].filter(Boolean).map((p) => esc(localPhone(p))).join(" · ")}` : "",
    co.email ? `<b>Email</b> ${esc(co.email)}` : "",
    co.website ? `<b>Web</b> ${esc(co.website)}` : "",
    co.address ? `<b>Aderesi</b> ${esc(co.address)}` : "",
  ].filter(Boolean);
  const footerLine = [name, co.website ? esc(co.website) : "", co.phone2 || co.phone ? `Tel ${esc(localPhone(co.phone2 || co.phone))}` : "", co.address ? esc(co.address) : ""]
    .filter(Boolean).join("  ·  ");

  const article = (n: number, title: string, body: string) =>
    `<section class="art"><h2><span class="num">${n}</span>${esc(title)}</h2>${body}</section>`;

  return `<!doctype html><html lang="rw"><head><meta charset="utf-8"><title>Amasezerano ${no} · ${client}</title>
<style>
  @page { size: A4; margin: 12mm 16mm 10mm; }
  :root { --ink: #0a3d7a; --accent: #0a66c2; --rule: #c9d6e8; --muted: #5b6474; }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { font-family: Georgia, "Times New Roman", serif; font-size: 10.6pt; line-height: 1.5; color: #1a1a1a;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table.page { width: 100%; border-collapse: collapse; }
  table.page > thead td, table.page > tfoot td { padding: 0; }
  .sp-top { height: 2mm; }

  /* Letterhead */
  .lh { display: flex; align-items: center; gap: 14px; padding-bottom: 8px; border-bottom: 2.5px solid var(--accent); }
  .lh img { height: 20mm; width: 20mm; object-fit: contain; }
  .lh .who { flex: 1; }
  .lh .n { font-family: Arial, Helvetica, sans-serif; font-weight: 800; font-size: 17pt; letter-spacing: 1.5px; color: var(--ink); line-height: 1.1; }
  .lh .tag { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; letter-spacing: 2.2px; color: var(--accent); text-transform: uppercase; margin-top: 2px; }
  .lh .contact { font-family: Arial, Helvetica, sans-serif; font-size: 7.8pt; color: var(--muted); text-align: right; line-height: 1.55; }
  .lh .contact b { color: var(--ink); font-weight: 700; margin-right: 2px; }

  /* Title */
  .title { text-align: center; margin: 14px 0 4px; }
  .title h1 { font-family: Arial, Helvetica, sans-serif; font-size: 13.5pt; letter-spacing: .6px; color: var(--ink); margin: 0; }
  .title .en { font-style: italic; color: var(--muted); font-size: 10pt; margin-top: 1px; }
  .meta { display: flex; justify-content: center; gap: 18px; margin: 8px 0 12px; font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; }
  .meta span { border: 1px solid var(--rule); border-radius: 3px; padding: 3px 9px; background: #f4f8fd; }
  .meta b { color: var(--ink); }

  /* Parties */
  .intro { margin: 0 0 6px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 6px 0 8px; break-inside: avoid; }
  .party { border: 1px solid var(--rule); border-top: 3px solid var(--accent); border-radius: 3px; padding: 8px 10px; }
  .party .role { font-family: Arial, Helvetica, sans-serif; font-size: 7.5pt; font-weight: 700; letter-spacing: 1.4px; color: var(--accent); text-transform: uppercase; }
  .party .pn { font-weight: 700; font-size: 11.5pt; color: var(--ink); margin: 2px 0 4px; }
  .party table { border-collapse: collapse; font-size: 9.4pt; }
  .party td { padding: 1px 8px 1px 0; vertical-align: top; }
  .party td:first-child { color: var(--muted); white-space: nowrap; }
  .agree { margin: 4px 0 10px; font-style: italic; }

  /* Articles */
  .art { margin: 0 0 9px; }
  .art h2 { font-family: Arial, Helvetica, sans-serif; font-size: 10.2pt; color: var(--ink); margin: 0 0 3px; display: flex; align-items: center; gap: 8px;
            border-bottom: 1px solid var(--rule); padding-bottom: 2px; break-after: avoid; }
  .art h2 .num { display: inline-flex; align-items: center; justify-content: center; min-width: 6.2mm; height: 6.2mm; border-radius: 50%;
                 background: var(--accent); color: #fff; font-size: 8.5pt; }
  .art p { margin: 3px 0; text-align: justify; }
  .art ol { margin: 3px 0 3px 6mm; padding: 0; }
  .art li { margin: 2px 0; text-align: justify; padding-left: 1mm; }
  .fee { display: inline-block; font-weight: 700; color: var(--ink); background: #f4f8fd; border: 1px solid var(--rule); border-radius: 3px; padding: 0 6px; }
  table.pay { border-collapse: collapse; width: 100%; margin: 4px 0; font-size: 9.6pt; break-inside: avoid; }
  table.pay th, table.pay td { border: 1px solid var(--rule); padding: 4px 8px; text-align: left; }
  table.pay th { background: #f4f8fd; color: var(--ink); font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; width: 32%; }
  .note { font-size: 9.4pt; background: #fff8e6; border-left: 3px solid #e0a800; padding: 4px 8px; margin: 5px 0; }
  .line { display: inline-block; border-bottom: 1px solid #333; height: 1em; vertical-align: baseline; }

  /* Signatures */
  .done { margin: 8px 0 5px; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; margin-top: 4px; break-inside: avoid; }
  .sbox { position: relative; border: 1px solid var(--rule); border-radius: 3px; padding: 8px 10px 10px; }
  /* A stamp with signature, pressed over the signature line and stamp space
     like a real one: on top of the lines, slightly turned. "multiply" lets the
     lines show through a white background (a scanned stamp). */
  .seal { position: absolute; right: 6mm; bottom: 3mm; width: 46mm; height: 34mm; display: flex; align-items: center; justify-content: center;
          pointer-events: none; }
  .seal img { max-width: 100%; max-height: 100%; object-fit: contain; transform: rotate(-4deg); mix-blend-mode: multiply; opacity: .95; }
  .sbox .role { font-family: Arial, Helvetica, sans-serif; font-size: 7.5pt; font-weight: 700; letter-spacing: 1.4px; color: var(--accent); text-transform: uppercase; }
  .sbox .pn { font-weight: 700; color: var(--ink); margin: 2px 0 6px; }
  .sbox .row { display: flex; align-items: flex-end; gap: 6px; margin-top: 6.5mm; font-size: 9pt; color: var(--muted); }
  .sbox .row .l { flex: 1; border-bottom: 1px solid #333; height: 1px; }
  .sbox .stamp { margin-top: 4mm; height: 15mm; border: 1px dashed #b8c4d6; border-radius: 3px; display: flex; align-items: center; justify-content: center;
                 font-size: 8pt; color: #a0aabb; letter-spacing: 1px; }

  /* Verification */
  .verify { display: flex; align-items: center; gap: 12px; margin-top: 8px; border: 1px solid var(--rule); border-radius: 3px; padding: 8px 10px; background: #f8fafd; break-inside: avoid; }
  .verify .qr { width: 21mm; height: 21mm; flex: none; }
  .verify .t { font-family: Arial, Helvetica, sans-serif; font-size: 8.4pt; color: var(--muted); line-height: 1.45; }
  .verify .t b { color: var(--ink); }

  /* Every page: the company line and the contract number */
  .foot { display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; margin-top: 6mm; padding-top: 4px; border-top: 1px solid var(--rule);
          font-family: Arial, Helvetica, sans-serif; font-size: 7.4pt; color: var(--muted); }
  .foot > div:first-child { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style></head><body>
<table class="page">
  <thead><tr><td><div class="sp-top"></div></td></tr></thead>
  <tfoot><tr><td>
    <div class="foot">
      <div>${footerLine}<br>Amasezerano ${no}</div>
    </div>
  </td></tr></tfoot>
  <tbody><tr><td>

  <header class="lh">
    ${opts.logoUrl ? `<img src="${esc(opts.logoUrl)}" alt="">` : ""}
    <div class="who">
      <div class="n">${name}</div>
      <div class="tag">Universal Ecosystem Company</div>
    </div>
    <div class="contact">${contact.join("<br>")}</div>
  </header>

  <div class="title">
    <h1>AMASEZERANO YO KUNGANIRA MU IBARURA MARI N’IMISORO</h1>
    <div class="en">Tax Advisory Services Contract</div>
  </div>
  <div class="meta">
    <span>Nimero: <b>${no}</b></span>
    <span>Itariki: <b>${slashDate(c.contract_date)}</b></span>
    <span>Atangira: <b>${longDate(c.start_date)}</b></span>
  </div>

  <p class="intro">Aya masezerano akozwe ku itariki ya <b>${slashDate(c.contract_date)}</b>, hagati ya:</p>
  <div class="parties">
    <div class="party">
      <div class="role">Umukiriya</div>
      <div class="pn">${client}</div>
      <table>
        <tr><td>TIN</td><td>${v(c.client_tin, 30)}</td></tr>
        <tr><td>Telefoni</td><td>${v(localPhone(c.client_phone), 30)}</td></tr>
        <tr><td>Uhagarariye</td><td>${v(c.client_representative, 40)}</td></tr>
      </table>
    </div>
    <div class="party">
      <div class="role">Umujyanama</div>
      <div class="pn">${name}</div>
      <table>
        <tr><td>TIN</td><td>${v(co.tin, 30)}</td></tr>
        <tr><td>Uhagarariye</td><td>${v(co.representative, 40)}${co.title ? ` <i>(${esc(co.title)})</i>` : ""}</td></tr>
        <tr><td>Telefoni</td><td>${v(localPhone(co.phone), 30)}</td></tr>
        ${co.email ? `<tr><td>Email</td><td>${esc(co.email)}</td></tr>` : ""}
      </table>
    </div>
  </div>
  <p class="agree">Impande zombi zemeranijwe ibi bikurikira:</p>

  ${article(1, "Impamvu (ibizakorwa muri aya masezerano)", `<ol type="a">
    <li>Kunganira mu itegurwa ry’ibitabo by’ibaruramari, raporo y’uko imari ihagaze n’imigereka yabyo;</li>
    <li>Kunganira mu guhuza banki n’ibitabo by’ibaruramari mari byo mu gihe kimwe cy’umwaka w’ibaruramari;</li>
    <li>Gutegura no kumenyekanisha imisoro itandukanye: Umusoro ku Nyongera gaciro (VAT), Umusoro ku Nyungu (CIT/PIT), Avance k’umusoro ku Nyungu (IQP-CIT), ipatante n’indi misoro y’uturere;</li>
    <li>Gufasha mu gusaba inyandiko zerekana ko nta mwenda cg ko business ihagaze neza (Tax clearance na Quitus fiscal muri RRA na RSSB clearance muri RSSB);</li>
    <li>Ubujyanama mu misoro itandukanye ikoreshwa mu gihugu ifite aho ihuriye n’umukiriya.</li>
  </ol>`)}

  ${article(2, "Igihembo ku mirimo", `<p>Igihembo kemeranyijwe n’impande zombi ni <span class="fee">Rwf ${money(c.monthly_fee)}</span> ku kwezi. Aya mafaranga ashobora kujya yiyongera buri mwaka bitewe n’uko business igenda ikura.</p>`)}

  ${article(3, "Uburyo bwo kwishyura", `<p>Aya mafaranga yishyurwa mu buryo bukurikira:</p>
  <table class="pay">
    <tr><th>Amafaranga mu ntoki</th><td>Cash</td></tr>
    <tr><th>Mobile Money (MoMo)</th><td>${v(co.momo_code, 45)}</td></tr>
    <tr><th>${esc(co.bank_name || "Banki")}</th><td>${v(co.bank_account, 60)}</td></tr>
  </table>
  <p class="note"><b>ICYITONDERWA:</b> konti zose zibaruye kuri company “${name}”.</p>`)}

  ${article(4, "Igihe amasezerano azamara", `<p>Aya masezerano agira agaciro uhereye taliki ya <b>${longDate(c.start_date)}</b> kandi nta gihe giteganyijwe azamara (open ended), ariko ashobora guseswa ku bwumvikane bw’impande zombi (usabye iseswa atanga integuza y’iminsi 30) cyangwa mu gihe umwe mu bayashyizeho umukono atubahirije ibimureba kandi ntibashobore kumvikana nk’uko biteganywa mu ngingo ya 7 y’aya masezerano.</p>`)}

  ${article(5, "Inshingano z’impande zombi", `<p>Umujyanama mu misoro n’ibijyanye n’imari asabwa kubahiriza ibijyanye n’aya masezerano cyane cyane mu gukora akazi kanoze no kubahiriza igihe.</p>
  <p>Umukiliya nawe asabwa kubahiriza aya masezerano cyane ku birebana n’igihe cyo kwishyura bizajya bikorwa bitarenze tariki ya <b>${c.payment_day}</b> ya buri kwezi, gutanga amakuru yose asabwa harimo no korohereza mu bindi bikenewe ukenemo ikiguzi cy’urugendo (urugero: icumbi n’amafunguro).</p>`)}

  ${article(6, "Aho akazi gakorerwa", `<p>Akazi kazabamo ibice 2: Igice cya mbere kirebana no gukusanya amakuru gikorerwa aho umukiriya akorera, naho igice cya 2 kirebana no kumenyekanisha, kizakorerwa aho umujyanama akorera.</p>`)}

  ${article(7, "Gukemura amakimbirane", `<p>Impande zombi zihamagariwe kubahiriza aya masezerano, hagira ibyo batumvikanaho bikakemurwa binyuze mu bwumvikane.</p>`)}

  ${article(8, "Imirimo y’inyongera", `<p>Akazi katateganyijwe muri aya masezerano kabarwa ukwako kandi kakishyurwa ukwako binyuze mu bwumvikane bw’impande zombi.</p>`)}

  ${article(9, "Igihe amasezerano atangirira kubahirizwa", `<p>Aya masezerano atangira kubahirizwa kuva italiki yashyiriweho umukono.</p>`)}

  ${c.notes ? `<p class="note"><b>Icyitonderwa:</b> ${esc(c.notes)}</p>` : ""}

  <p class="done">Bikorewe i Kigali, ku wa <b>${slashDate(c.contract_date)}</b>.</p>
  <div class="sign">
    <div class="sbox">
      <div class="role">K’uruhande rw’umukiriya</div>
      <div class="pn">${client}</div>
      <div>${v(c.client_representative, 55)}</div>
      <div class="row">Umukono<span class="l"></span></div>
      <div class="row">Itariki<span class="l"></span></div>
      ${opts.clientStamp ? `<div class="stamp" style="border-color:transparent"></div><div class="seal"><img src="${esc(opts.clientStamp)}" alt=""></div>` : `<div class="stamp">KASHE</div>`}
    </div>
    <div class="sbox">
      <div class="role">K’uruhande rw’umujyanama</div>
      <div class="pn">${name}</div>
      <div>${v(co.representative, 55)}${co.title ? `, <i>${esc(co.title)}</i>` : ""}</div>
      <div class="row">Umukono<span class="l"></span></div>
      <div class="row">Itariki<span class="l"></span></div>
      ${opts.companyStamp ? `<div class="stamp" style="border-color:transparent"></div><div class="seal"><img src="${esc(opts.companyStamp)}" alt=""></div>` : `<div class="stamp">KASHE</div>`}
    </div>
  </div>

  ${qr ? `<div class="verify">
    <div class="qr">${qr}</div>
    <div class="t"><b>Kugenzura aya masezerano</b><br>
      Aya masezerano yanditswe muri sisitemu ya ${name} ku nimero <b>${no}</b>.<br>
      Suzuma kode iri ku ruhande kugira ngo wemeze ko ari ay’ukuri kandi atahinduwe.</div>
  </div>` : ""}

  </td></tr></tbody>
</table>
${opts.autoPrint ? `<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},300)}</script>` : ""}
</body></html>`;
}
