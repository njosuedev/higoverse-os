// The printed tax advisory contract between Higoverse and one of its tax
// clients (AMASEZERANO YO KUNGANIRA MU IBARURA MARI N'IMISORO), from the
// admin panel's Tax clients. Kinyarwanda, as Higoverse's own contract; the
// blanks are filled from the contract (auth-service tax_contracts), and
// anything not recorded prints as a line to fill in by hand.
//
// Pure: builds an HTML string for lib/print-frame.ts.

import type { TaxContract } from "./admin-api";
import { qrBlockHtml } from "./doc-qr";

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
/** +250788497878 → 0788497878 (as written in Rwanda). */
const localPhone = (p?: string | null) => (p || "").replace(/^\+250/, "0");
const money = (n: number) => Math.round(n || 0).toLocaleString("en-US");
/** A filled blank, or a line to write on. */
const v = (x: unknown, width = 40) => {
  const s = String(x ?? "").trim();
  return s ? `<b>${esc(s)}</b>` : `<span class="line" style="width:${width}mm"></span>`;
};

/** [logoUrl]: Higoverse's logo, a full URL (the page prints from a blank frame). */
export function taxContractHtml(c: TaxContract, opts: { autoPrint?: boolean; logoUrl?: string } = {}): string {
  const co = c.company || {};
  const name = co.name || "HIGOVERSE";
  const phones = [co.phone, co.phone2].filter(Boolean).map((p) => esc(localPhone(p))).join(" / ");
  const footer = [co.website ? esc(co.website).toUpperCase() : "", co.phone2 || co.phone ? `TEL: ${esc(localPhone(co.phone2 || co.phone))}` : "", esc((co.address || "").toUpperCase())]
    .filter(Boolean).join("&nbsp;&nbsp; ");
  const client = esc(c.client_name);

  return `<!doctype html><html lang="rw"><head><meta charset="utf-8"><title>Amasezerano · ${client}</title>
<style>
  @page { size: A4; margin: 16mm 18mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Georgia, serif; font-size: 11.5pt; line-height: 1.45; color: #111; margin: 0; }
  .top { display: flex; gap: 12px; align-items: center; border-bottom: 1.5px solid #111; padding-bottom: 6px; margin-bottom: 12px; }
  .top img { height: 18mm; width: auto; object-fit: contain; }
  .top .n { font-weight: bold; font-size: 13pt; letter-spacing: .5px; }
  .top .d { font-size: 9pt; line-height: 1.35; }
  .qr { display: flex; justify-content: flex-end; margin-top: 8mm; }
  h1 { text-align: center; font-size: 13pt; margin: 6px 0 0; }
  .sub { text-align: center; font-style: italic; margin: 0 0 12px; }
  h2 { font-size: 11.5pt; margin: 12px 0 3px; }
  p { margin: 3px 0; }
  ul { margin: 3px 0 3px 7mm; padding: 0; }
  li { margin: 2px 0; }
  .pay { margin-left: 7mm; }
  .line { display: inline-block; border-bottom: 1px solid #111; height: 1em; vertical-align: baseline; }
  .note { margin-top: 6px; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; margin-top: 18px; break-inside: avoid; }
  .sign p { margin: 4px 0; }
  .sign .s { margin-top: 16mm; border-top: 1px solid #111; width: 60mm; padding-top: 2px; font-size: 9.5pt; color: #444; }
  footer { margin-top: 14mm; padding-top: 4px; border-top: 1px solid #111; text-align: center; font-size: 8.5pt; font-weight: bold; letter-spacing: .3px; break-inside: avoid; }
</style></head><body>
  <div class="top">
    ${opts.logoUrl ? `<img src="${esc(opts.logoUrl)}" alt="">` : ""}
    <div>
      <div class="n">${esc(name)}: UNIVERSAL ECOSYSTEM COMPANY</div>
      <div class="d">${[co.tin ? `TIN: ${esc(co.tin)}` : "", phones ? `TEL: ${phones}` : "", co.email ? esc(co.email) : ""].filter(Boolean).join(" · ")}</div>
      <div class="d">${[co.website ? esc(co.website) : "", co.address ? esc(co.address) : ""].filter(Boolean).join(" · ")}</div>
    </div>
  </div>
  <h1>AMASEZERANO YO KUNGANIRA MU IBARURA MARI N’IMISORO</h1>
  <p class="sub">(TAX ADVISORY SERVICES CONTRACT)</p>

  <p>Aya masezerano akozwe ku itariki ya <b>${slashDate(c.contract_date)}</b>, hagati ya:</p>
  <p><b>${client}</b>${c.client_tin ? ` (${esc(c.client_tin)})` : ""} ufite TEL ${v(localPhone(c.client_phone), 35)}.</p>
  <p>Na</p>
  <p><b>${esc(name)}</b> ufite TIN: ${v(co.tin, 30)} ihagarariwe na ${v(co.representative, 45)}${co.title ? ` (${esc(co.title)})` : ""} ufite TEL ${v(localPhone(co.phone), 30)}.</p>
  ${co.phone2 ? `<p>Aderesi cg imirongo sosiyete ibonekaho: ${esc(localPhone(co.phone2))}</p>` : ""}
  ${co.website ? `<p>Website: ${esc(co.website)}</p>` : ""}
  ${co.email ? `<p>Email: ${esc(co.email)}</p>` : ""}
  <p>Impande zombi zemeranijwe ibi bikurikira:</p>

  <h2>Ingingo ya 1: Impamvu (ibizakorwa muri aya masezerano)</h2>
  <ul>
    <li>Kunganira mu itegurwa ry’ibitabo by’ibaruramari, raporo y’uko imari ihagaze n’imigereka yabyo;</li>
    <li>Kunganira mu guhuza banki n’ibitabo by’ibaruramari mari byo mu gihe kimwe cy’umwaka w’ibaruramari;</li>
    <li>Gutegura no kumenyekanisha imisoro itandukanye: Umusoro ku Nyongera gaciro (VAT), Umusoro ku Nyungu (CIT/PIT), Avance k’umusoro ku Nyungu (IQP-CIT), ipatante n’indi misoro y’uturere;</li>
    <li>Gufasha mu gusaba inyandiko zerekana ko nta mwenda cg ko business ihagaze neza (Tax clearance na Quitus fiscal muri RRA na RSSB clearance muri RSSB);</li>
    <li>Ubujyanama mu misoro itandukanye ikoreshwa mu gihugu ifite aho ihuriye n’umukiriya.</li>
  </ul>

  <h2>Ingingo ya 2: Igihembo ku mirimo</h2>
  <p>Igihembo kemeranyijwe n’impande zombi ni <b>Rwf ${money(c.monthly_fee)}</b> ku kwezi. Aya mafaranga ashobora kujya yiyongera buri mwaka bitewe n’uko business igenda ikura.</p>

  <h2>Ingingo ya 3: Uburyo bwo kwishyura</h2>
  <p>Aya mafaranga yishyurwa mu buryo bukurikira:</p>
  <p class="pay">- Cash</p>
  <p class="pay">- Transferi kuri MoMo: ${v(co.momo_code, 35)}</p>
  <p class="pay">- Transferi kuri ${esc(co.bank_name || "banki")}: ${v(co.bank_account, 45)}</p>
  <p class="note"><b>ICYITONDERWA:</b> konti zose zibaruye kuri company “${esc(name)}”.</p>

  <h2>Ingingo ya 4: Igihe amasezerano azamara</h2>
  <p>Aya masezerano agira agaciro uhereye taliki ya <b>${longDate(c.start_date)}</b> kandi nta gihe giteganyijwe azamara (open ended), ariko ashobora guseswa ku bwumvikane bw’impande zombi (usabye iseswa atanga integuza y’iminsi 30) cyangwa mu gihe umwe mu bayashyizeho umukono atubahirije ibimureba kandi ntibashobore kumvikana nk’uko biteganywa mu ngingo ya 7 y’aya masezerano.</p>

  <h2>Ingingo ya 5: Inshingano z’impande zombi</h2>
  <p>Umujyanama mu misoro n’ibijyanye n’imari asabwa kubahiriza ibijyanye n’aya masezerano cyane cyane mu gukora akazi kanoze no kubahiriza igihe;</p>
  <p>Umukiliya nawe asabwa kubahiriza aya masezerano cyane ku birebana n’igihe cyo kwishyura bizajya bikorwa bitarenze tariki ya <b>${c.payment_day}</b> ya buri kwezi, gutanga amakuru yose asabwa harimo no korohereza mu bindi bikenewe ukenemo ikiguzi cy’urugendo (urugero: icumbi n’amafunguro).</p>

  <h2>Ingingo ya 6: Aho akazi gakorerwa</h2>
  <p>Akazi kazabamo ibice 2: Igice cya mbere kirebana no gukusanya amakuru gikorerwa aho umukiliya akorera (1) naho igice cya 2 kirebana no kumenyekanisha, kizakorerwa aho umujyanama akorera.</p>

  <h2>Ingingo ya 7: Gukemura amakimbirane</h2>
  <p>Impande zombi zihamagariwe kubahiriza aya masezerano, hagira ibyo batumvikanaho bikakemurwa binyuze mu bwumvikane.</p>

  <h2>Ingingo ya 8: Imirimo y’inyongera</h2>
  <p>Akazi katateganyijwe muri aya masezerano kabarwa ukwako kandi kakishyurwa ukwako binyuze mu bwumvikane bw’impande zombi.</p>

  <h2>Ingingo ya 9: Igihe amasezerano atangirira kubahirizwa</h2>
  <p>Aya masezerano atangira kubahirizwa kuva italiki yashyiriweho umukono.</p>
  ${c.notes ? `<p class="note"><b>Icyitonderwa:</b> ${esc(c.notes)}</p>` : ""}

  <div class="sign">
    <div>
      <p><b>K’uruhande rw’Umukiliya,</b></p>
      <p>SOSIYETE: <b>${client}</b></p>
      <p>${v(c.client_representative, 55)}</p>
      <p class="s">Umukono</p>
    </div>
    <div>
      <p><b>K’uruhande rw’Umujyanama,</b></p>
      <p><b>${esc(name)}</b></p>
      <p>${v(co.representative, 55)}</p>
      <p class="s">Umukono na kashe</p>
    </div>
  </div>
  <div class="qr">${qrBlockHtml(c.doc_code, "Amasezerano ya HIGOVERSE: suzuma muri Higoverse", "24mm")}</div>
  ${footer ? `<footer>${footer}</footer>` : ""}
  ${opts.autoPrint ? `<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},250)}</script>` : ""}
</body></html>`;
}
