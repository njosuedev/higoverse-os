// The printed car rental agreement (one A4 sheet, sometimes two), in the
// language the user picks when printing: Kinyarwanda (the wording of the
// agreement car companies use), English or French. The company's own name,
// TIN, phone and address come from its settings.
//
// The wording is a template: each car company may write its own (title,
// intro, articles, closing) in Rentals → Agreement wording, saved in
// sale-service (GET/PUT /rentals/agreement-template); a language it hasn't
// changed prints the standard wording below. Placeholders such as {customer}
// or {plate} are filled from the rental; anything not recorded stays a line
// to fill in by hand. In an article, lines starting with "- " are a bulleted
// list and lines starting with "1. " a numbered one.
//
// Pure: builds an HTML string for lib/print-frame.ts.

import { qrBlockHtml } from "./doc-qr";
import type { PrintShop } from "./proforma-print";
import type { Rental } from "./rental-api";

export type AgreementLang = "rw" | "en" | "fr";
export const AGREEMENT_LANGS: { code: AgreementLang; label: string }[] = [
  { code: "rw", label: "Kinyarwanda" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
];

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** A filled blank (bold), or a line to write on. */
const v = (x: unknown, width = 38) => {
  const s = String(x ?? "").trim();
  return s ? `<b>${esc(s)}</b>` : `<span class="line" style="width:${width}mm"></span>`;
};
/** 2026-11-09 → 09 / 11 / 2026. */
const day = (iso?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `<b>${m[3]} / ${m[2]} / ${m[1]}</b>` : "____ / ____ / ________";
};
const money = (n: number) => Math.round(n || 0).toLocaleString("en-US");

/** Days between the start and end dates (at least 1). */
export function rentalDays(r: Pick<Rental, "start_date" | "end_date">): number {
  const a = Date.parse(`${r.start_date}T00:00:00Z`), b = Date.parse(`${r.end_date}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

export interface AgreementArticle { title: string; body: string }
/** One language of the agreement's wording. */
export interface AgreementTemplate { title: string; intro: string; articles: AgreementArticle[]; closing: string }
/** A company's own wording: only the languages it changed. */
export type AgreementTemplates = Partial<Record<AgreementLang, AgreementTemplate>>;

/** The placeholders a template can use, in the order the editor lists them. */
export const AGREEMENT_PLACEHOLDERS = [
  "company", "company_tin", "company_phone", "company_address",
  "customer", "customer_id", "customer_phone", "customer_address",
  "car", "plate", "chassis",
  "start_date", "end_date", "days", "agreement_date",
  "rent", "deposit", "rental_no",
] as const;
export type AgreementPlaceholder = (typeof AGREEMENT_PLACEHOLDERS)[number];

/** Labels around the template (company header, signatures, QR). */
interface Words {
  lessor: string; renterRole: string; idNo: string; name: string; signStamp: string; sign: string; date: string;
  days: (n: number) => string; tinL: string; telL: string; addrL: string; rwf: string; qr: string;
}

const RW: Words = {
  lessor: "UKODESHWA", renterRole: "UKODESHA", idNo: "Indangamuntu", name: "Amazina", signStamp: "Umukono na kashe", sign: "Umukono", date: "Itariki",
  days: (n) => `iminsi ${n}`, tinL: "TIN", telL: "Telefoni", addrL: "Aderesi", rwf: "Frw",
  qr: "Suzuma aya masezerano muri porogaramu ya Higoverse",
};
const EN: Words = {
  lessor: "LENDER", renterRole: "BORROWER", idNo: "National ID", name: "Names", signStamp: "Signature and stamp", sign: "Signature", date: "Date",
  days: (n) => `${n} day${n === 1 ? "" : "s"}`, tinL: "TIN", telL: "Telephone", addrL: "Address", rwf: "Rwf",
  qr: "Scan in the Higoverse app to check this agreement",
};
const FR: Words = {
  lessor: "LA SOCIÉTÉ", renterRole: "LE LOCATAIRE", idNo: "Carte d’identité", name: "Nom", signStamp: "Signature et cachet", sign: "Signature", date: "Date",
  days: (n) => `${n} jour${n === 1 ? "" : "s"}`, tinL: "TIN", telL: "Téléphone", addrL: "Adresse", rwf: "Frw",
  qr: "Scannez dans l’application Higoverse pour vérifier ce contrat",
};

const WORDS: Record<AgreementLang, Words> = { rw: RW, en: EN, fr: FR };

/** The standard wording, printed in every language a company hasn't changed. */
export const DEFAULT_AGREEMENT: Record<AgreementLang, AgreementTemplate> = {
  rw: {
    title: "AMASEZERANO YO GUKODESHA IMODOKA",
    intro: "Uyu munsi, ku wa {agreement_date}, hagati ya {company}, ifite TIN {company_tin}, ikorera ubucuruzi bwo kugurisha no gukodesha imodoka i {company_address}, na {customer} ukodesheje imodoka, ufite indangamuntu nimero {customer_id}, telefoni {customer_phone}, utuye {customer_address}, hakozwe amasezerano akurikira:",
    articles: [
      { title: "Ingingo ya 1: Icyo amasezerano agamije", body: "Aya masezerano agamije gukodesha imodoka y’ikigo kuri {customer} mu gihe cya {days}, hakurikijwe ibikubiye muri aya masezerano." },
      { title: "Ingingo ya 2: Amakuru aranga imodoka", body: "Imodoka ikodeshejwe irangwa n’amakuru akurikira:\n- Ubwoko bw’imodoka: {car}\n- Nimero ya pulake: {plate}\n- Nimero ya chassis: {chassis}" },
      { title: "Ingingo ya 3: Igihe amasezerano azamara", body: "Aya masezerano atangiye ku wa {start_date}, azarangira ku wa {end_date}.\nKongera igihe cy’ubukode bizakorwa gusa ari uko impande zombi zibyumvikanyeho." },
      { title: "Ingingo ya 4: Inshingano z’ukodesha", body: "Ukodesha yemeye:\n1. Gukoresha imodoka mu buryo bwemewe n’amategeko no kuyitaho neza.\n2. Kutayikoresha mu bikorwa binyuranyije n’amategeko.\n3. Kumenyesha uwamukodesheje igihe habaye impanuka, cyangwa ikindi kibazo cyose gikomeye kijyanye n’imodoka. Ukodesheje imodoka arebwa no gukoresha imodoka mu gihe imupfiriye mu biganza, akazirikana ko azasubiza imodoka nk’uko yayihawe.\n4. Gusubiza imodoka ku munsi amasezerano azarangiriraho, imeze neza nk’uko yayishyikirijwe." },
      { title: "Ingingo ya 5: Ubukode n’uburyo bwo kwishyura", body: "{customer} yishyuye amafaranga y’ubukode angana na {rent}, hamwe na {deposit} ya kosiyo.\nKosiyo izasubizwa {customer} igihe azaba asubije imodoka imeze neza, nta byangiritse byatewe n’ikoreshwa ryayo. Mu gihe hagaragaye ibyangiritse byatewe n’uwakodesheje, amafaranga akenewe mu gusana imodoka azavanwa kuri kosiyo, naho amafaranga asigaye asubizwe {customer}." },
      { title: "Ingingo ya 6: Kwemeza amasezerano", body: "Impande zombi zemeje ko zasomye, zumvise kandi zemeye ibikubiye muri aya masezerano, zikaba ziyashyizeho umukono ku bushake bwazo." },
    ],
    closing: "Bikorewe i Kigali, ku wa {agreement_date}.",
  },
  en: {
    // Follows the wording of the English agreement car companies sign.
    title: "CAR RENTAL AGREEMENT",
    intro: "Today, on {agreement_date}, between {company}, having TIN {company_tin}, engaged in the business of selling and renting cars in {company_address}, and {customer}, having rented the car, holding national ID number {customer_id}, telephone {customer_phone}, residing at {customer_address}, the following agreement has been made:",
    articles: [
      { title: "Article 1: Purpose of the agreement", body: "This agreement is for the rental of a {company} car to {customer} for a period of {days}, in accordance with the contents of this agreement." },
      { title: "Article 2: Vehicle details", body: "The rented car is identified by the following details:\n- Type of car: {car}\n- Plate number: {plate}\n- Chassis number: {chassis}" },
      { title: "Article 3: Duration of the agreement", body: "This agreement starts on {start_date}, and will end on {end_date}.\nExtension of the rental period will only be done if both parties agree." },
      { title: "Article 4: Obligations of the Borrower", body: "The Borrower agrees to:\n1. Use the car lawfully and take good care of it.\n2. Not use it for any unlawful activities.\n3. Notify the Lender in the event of an accident, or any other serious problem relating to the car caused by the Borrower. The Borrower is responsible for using the car while it is in their hands, bearing in mind that they will return the car as it was given to them.\n4. Return the car on the day the agreement ends, in the same good condition as when it was handed over." },
      { title: "Article 5: Rent and method of payment", body: "{customer} has paid rental fees amounting to {rent}, together with {deposit} as a deposit.\nThe deposit will be refunded to {customer} when he/she returns the car in good condition, with no damage caused by its use. Where damage caused by the Borrower is found, the amount needed to repair the car will be deducted from the deposit, and the remaining amount will be refunded to {customer}." },
      { title: "Article 6: Confirmation of the agreement", body: "Both parties confirm that they have read, understood and accepted the contents of this agreement, and have signed it voluntarily." },
    ],
    closing: "Done at Kigali, on {agreement_date}.",
  },
  fr: {
    title: "CONTRAT DE LOCATION DE VÉHICULE",
    intro: "Ce jour, {agreement_date}, entre {company}, TIN {company_tin}, société de vente et de location de véhicules située à {company_address}, et {customer}, le locataire, titulaire de la carte d’identité n° {customer_id}, téléphone {customer_phone}, domicilié(e) à {customer_address}, il a été convenu ce qui suit :",
    articles: [
      { title: "Article 1 : Objet du contrat", body: "Le présent contrat a pour objet la location du véhicule de la société à {customer} pour une durée de {days}, selon les conditions ci-dessous." },
      { title: "Article 2 : Identification du véhicule", body: "Le véhicule loué est identifié comme suit :\n- Type de véhicule : {car}\n- Numéro de plaque : {plate}\n- Numéro de châssis : {chassis}" },
      { title: "Article 3 : Durée du contrat", body: "Le présent contrat commence le {start_date} et prend fin le {end_date}.\nLa durée de location ne peut être prolongée qu’avec l’accord des deux parties." },
      { title: "Article 4 : Obligations du locataire", body: "Le locataire s’engage à :\n1. Utiliser le véhicule conformément à la loi et en prendre soin.\n2. Ne pas l’utiliser pour des activités illégales.\n3. Informer la société de tout accident ou autre problème grave concernant le véhicule. Le locataire est responsable du véhicule tant qu’il est en sa possession et doit le rendre dans l’état où il l’a reçu.\n4. Rendre le véhicule à la date de fin du contrat, en bon état, tel qu’il lui a été remis." },
      { title: "Article 5 : Loyer et paiement", body: "{customer} a payé un loyer de {rent}, ainsi qu’une caution de {deposit}.\nLa caution sera rendue à {customer} lorsque le véhicule sera restitué en bon état, sans dommage dû à son utilisation. En cas de dommages causés par le locataire, les frais de réparation seront retenus sur la caution et le solde rendu à {customer}." },
      { title: "Article 6 : Signatures", body: "Les deux parties déclarent avoir lu, compris et accepté le présent contrat, et le signent de leur plein gré." },
    ],
    closing: "Fait à Kigali, le {agreement_date}.",
  },
};

/** The wording to print: the company's own for this language, else the standard. */
export function agreementTemplate(lang: AgreementLang, own?: AgreementTemplates | null): AgreementTemplate {
  const t = own?.[lang];
  return t && t.title?.trim() ? t : DEFAULT_AGREEMENT[lang];
}

/** Escaped text with {placeholders} replaced (unknown ones stay as typed). */
function fill(text: string, vals: Record<string, string>): string {
  return esc(text).replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in vals ? vals[k] : m));
}

/** "Label: value" in a list item: the label in bold (when it is plain text). */
function boldLabel(html: string): string {
  const m = /^([^:<{]{1,40}?)(\s?:)(\s)/.exec(html);
  return m ? `<b>${m[1]}${m[2]}</b>${m[3]}${html.slice(m[0].length)}` : html;
}

/** A block of text: paragraphs, "- " bullets and "1. " numbered lists. */
function blocks(text: string, vals: Record<string, string>): string {
  const out: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  for (const raw of (text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const item = /^[-•*]\s+(.*)$/.exec(line) ?? null;
    const num = item ? null : /^\d+[.)]\s+(.*)$/.exec(line);
    if (item || num) {
      const tag = item ? "ul" : "ol";
      if (!list || list.tag !== tag) { flush(); list = { tag, items: [] }; }
      list.items.push(boldLabel(fill((item ?? num)![1], vals)));
    } else {
      flush();
      out.push(`<p>${fill(line, vals)}</p>`);
    }
  }
  flush();
  return out.join("\n  ");
}

export function rentalAgreementHtml(
  r: Rental, shop: PrintShop, lang: AgreementLang, opts: { autoPrint?: boolean; template?: AgreementTemplates | null } = {},
): string {
  const w = WORDS[lang];
  const tpl = agreementTemplate(lang, opts.template);
  const co = esc(shop.name || "");
  const cur = !r.currency || r.currency === "RWF" ? w.rwf : esc(r.currency);
  const amount = (n: number) => (n > 0 ? `<b>${money(n)} ${cur}</b>` : `<span class="line" style="width:30mm"></span> ${cur}`);
  const n = rentalDays(r);
  const vals: Record<AgreementPlaceholder, string> = {
    company: co ? `<b>${co}</b>` : v("", 50),
    company_tin: v(shop.tin, 30),
    company_phone: v(shop.phone, 30),
    company_address: v(shop.address, 40),
    customer: v(r.customer, 50),
    customer_id: v(r.customer_id_no, 40),
    customer_phone: v(r.customer_phone, 30),
    customer_address: v(r.customer_address, 50),
    car: v([r.car_name, r.car_type].filter(Boolean).join(" · "), 50),
    plate: v(r.plate_no, 50),
    chassis: v(r.chassis_no, 50),
    start_date: day(r.start_date),
    end_date: day(r.end_date),
    days: n ? `<b>${esc(w.days(n))}</b>` : v("", 40),
    agreement_date: day(r.agreement_date),
    rent: amount(r.rent_amount),
    deposit: amount(r.deposit_total ?? r.deposit),
    rental_no: `<b>${esc(r.rental_no)}</b>`,
  };
  const articles = tpl.articles
    .map((a) => `${a.title.trim() ? `<h2>${fill(a.title, vals)}</h2>\n  ` : ""}${blocks(a.body, vals)}`)
    .join("\n\n  ");

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${fill(tpl.title, vals).replace(/<[^>]*>/g, "")} ${esc(r.rental_no)}</title>
<style>
  @page { size: A4; margin: 18mm 20mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Georgia, serif; font-size: 12pt; line-height: 1.45; color: #111; margin: 0; }
  .co { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
  .co img { max-height: 22mm; max-width: 40mm; object-fit: contain; }
  .co .n { font-weight: bold; font-size: 13pt; }
  .co p { margin: 1px 0; }
  h1 { font-size: 13pt; margin: 14px 0 10px; }
  h2 { font-size: 12pt; margin: 14px 0 4px; }
  p { margin: 4px 0; }
  ul, ol { margin: 4px 0 4px 6mm; padding-left: 6mm; }
  li { margin: 2px 0; }
  .line { display: inline-block; border-bottom: 1px solid #111; height: 1em; vertical-align: baseline; }
  .no { float: right; font-size: 9.5pt; color: #444; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 14mm; margin-top: 12px; break-inside: avoid; }
  .sign p { margin: 7px 0; }
</style></head><body>
  <div class="co">
    ${shop.logo_url ? `<img src="${esc(shop.logo_url)}" alt="">` : ""}
    <div>
      <div class="n">${co}</div>
      ${shop.tin ? `<p><b>${w.tinL}:</b> ${esc(shop.tin)}</p>` : ""}
      ${shop.phone ? `<p><b>${w.telL}:</b> ${esc(shop.phone)}</p>` : ""}
      ${shop.address ? `<p><b>${w.addrL}:</b> ${esc(shop.address)}</p>` : ""}
    </div>
  </div>
  <span class="no">${esc(r.rental_no)}</span>
  <h1>${fill(tpl.title, vals)}</h1>
  ${blocks(tpl.intro, vals)}

  ${articles}

  ${blocks(tpl.closing, vals)}

  <div class="sign">
    <div>
      <p><b>${esc(w.lessor)}</b><br>${co}</p>
      <p>${esc(w.name)}: <span class="line" style="width:52mm"></span></p>
      <p>${esc(w.signStamp)}: <span class="line" style="width:40mm"></span></p>
      <p>${esc(w.date)}: <span class="line" style="width:56mm"></span></p>
    </div>
    <div>
      <p><b>${esc(w.renterRole)}</b><br>${esc(r.customer)}</p>
      <p>${esc(w.idNo)}: ${v(r.customer_id_no, 44)}</p>
      <p>${esc(w.telL)}: ${v(r.customer_phone, 46)}</p>
      <p>${esc(w.addrL)}: ${v(r.customer_address, 48)}</p>
      <p>${esc(w.sign)}: <span class="line" style="width:56mm"></span></p>
      <p>${esc(w.date)}: <span class="line" style="width:58mm"></span></p>
    </div>
  </div>
  <div style="margin-top:10mm">${qrBlockHtml(r.doc_code, w.qr, "24mm")}</div>
  ${opts.autoPrint ? `<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},250)}</script>` : ""}
</body></html>`;
}
