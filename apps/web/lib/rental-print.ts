// The printed car rental agreement (one A4 sheet, sometimes two), in the
// language the user picks when printing: Kinyarwanda (the wording of the
// agreement car companies use), English or French. The company's own name,
// TIN, phone and address come from its settings; the blanks are filled from
// the rental, and anything not recorded stays a line to fill in by hand.
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

interface Words {
  title: string;
  intro: (co: string, tin: string, addr: string, renter: string, id: string, date: string) => string;
  a1: string; p1: (renter: string, period: string) => string;
  a2: string; p2: string; carType: string; plate: string; chassis: string;
  a3: string; p3: (from: string, to: string) => string; p3b: string;
  a4: string; p4: string; duties: string[];
  a5: string; p5: (renter: string, rent: string, deposit: string) => string;
  p5b: (renter: string) => string;
  a6: string; p6: string; done: (date: string) => string;
  lessor: string; renterRole: string; name: string; signStamp: string; sign: string; date: string;
  days: (n: number) => string; tinL: string; telL: string; addrL: string; qr: string;
}

const RW: Words = {
  title: "AMASEZERANO YO GUKODESHA IMODOKA",
  intro: (co, tin, addr, renter, id, date) =>
    `Uyu munsi, ku wa ${date}, hagati ya <b>${co}</b>, ifite TIN ${tin}, ikorera ubucuruzi bwo kugurisha no gukodesha imodoka${addr ? ` i ${addr}` : ""}, na ${renter} ukodesheje imodoka, ufite indangamuntu nimero ${id}, hakozwe amasezerano akurikira:`,
  a1: "Ingingo ya 1: Icyo amasezerano agamije",
  p1: (renter, period) => `Aya masezerano agamije gukodesha imodoka y’ikigo kuri ${renter} mu gihe cya ${period}, hakurikijwe ibikubiye muri aya masezerano.`,
  a2: "Ingingo ya 2: Amakuru aranga imodoka",
  p2: "Imodoka ikodeshejwe irangwa n’amakuru akurikira:",
  carType: "Ubwoko bw’imodoka", plate: "Nimero ya pulake", chassis: "Nimero ya chassis",
  a3: "Ingingo ya 3: Igihe amasezerano azamara",
  p3: (from, to) => `Aya masezerano atangiye ku wa ${from}, azarangira ku wa ${to}.`,
  p3b: "Kongera igihe cy’ubukode bizakorwa gusa ari uko impande zombi zibyumvikanyeho.",
  a4: "Ingingo ya 4: Inshingano z’ukodesha",
  p4: "Ukodesha yemeye:",
  duties: [
    "Gukoresha imodoka mu buryo bwemewe n’amategeko no kuyitaho neza.",
    "Kutayikoresha mu bikorwa binyuranyije n’amategeko.",
    "Kumenyesha uwamukodesheje igihe habaye impanuka, cyangwa ikindi kibazo cyose gikomeye kijyanye n’imodoka. Ukodesheje imodoka arebwa no gukoresha imodoka mu gihe imupfiriye mu biganza, akazirikana ko azasubiza imodoka nk’uko yayihawe.",
    "Gusubiza imodoka ku munsi amasezerano azarangiriraho, imeze neza nk’uko yayishyikirijwe.",
  ],
  a5: "Ingingo ya 5: Ubukode n’uburyo bwo kwishyura",
  p5: (renter, rent, deposit) => `${renter} yishyuye amafaranga y’ubukode angana na ${rent}, hamwe na ${deposit} ya kosiyo.`,
  p5b: (renter) => `Kosiyo izasubizwa ${renter} igihe azaba asubije imodoka imeze neza, nta byangiritse byatewe n’ikoreshwa ryayo. Mu gihe hagaragaye ibyangiritse byatewe n’uwakodesheje, amafaranga akenewe mu gusana imodoka azavanwa kuri kosiyo, naho amafaranga asigaye asubizwe ${renter}.`,
  a6: "Ingingo ya 6: Kwemeza amasezerano",
  p6: "Impande zombi zemeje ko zasomye, zumvise kandi zemeye ibikubiye muri aya masezerano, zikaba ziyashyizeho umukono ku bushake bwazo.",
  done: (date) => `Bikorewe i Kigali, ku wa ${date}.`,
  lessor: "UKODESHWA", renterRole: "UKODESHA", name: "Amazina", signStamp: "Umukono na kashe", sign: "Umukono", date: "Itariki",
  days: (n) => `iminsi ${n}`, tinL: "TIN", telL: "Telefoni", addrL: "Aderesi",
  qr: "Suzuma aya masezerano muri porogaramu ya Higoverse",
};

const EN: Words = {
  title: "CAR RENTAL AGREEMENT",
  intro: (co, tin, addr, renter, id, date) =>
    `This day, ${date}, between <b>${co}</b>, TIN ${tin}, a company selling and renting cars${addr ? `, located at ${addr}` : ""}, and ${renter}, the renter, holder of national ID number ${id}, the following agreement is made:`,
  a1: "Article 1: Purpose of the agreement",
  p1: (renter, period) => `This agreement is for the rental of the company’s car to ${renter} for a period of ${period}, under the terms set out in this agreement.`,
  a2: "Article 2: Details of the car",
  p2: "The rented car is identified as follows:",
  carType: "Type of car", plate: "Plate number", chassis: "Chassis number",
  a3: "Article 3: Duration of the agreement",
  p3: (from, to) => `This agreement starts on ${from} and ends on ${to}.`,
  p3b: "The rental period may only be extended if both parties agree.",
  a4: "Article 4: Obligations of the renter",
  p4: "The renter agrees:",
  duties: [
    "To use the car lawfully and take good care of it.",
    "Not to use it for any unlawful activity.",
    "To inform the company of any accident or other serious problem with the car. The renter is responsible for the car while it is in their hands and shall return it in the condition in which it was received.",
    "To return the car on the day this agreement ends, in the same good condition as when it was handed over.",
  ],
  a5: "Article 5: Rent and payment",
  p5: (renter, rent, deposit) => `${renter} has paid a rent of ${rent}, together with a deposit of ${deposit}.`,
  p5b: (renter) => `The deposit will be returned to ${renter} when the car is returned in good condition, with no damage caused by its use. If damage caused by the renter is found, the cost of repairing the car will be taken from the deposit, and the balance returned to ${renter}.`,
  a6: "Article 6: Signatures",
  p6: "Both parties confirm that they have read, understood and accepted the terms of this agreement, and sign it of their own free will.",
  done: (date) => `Done at Kigali, on ${date}.`,
  lessor: "THE COMPANY", renterRole: "THE RENTER", name: "Name", signStamp: "Signature and stamp", sign: "Signature", date: "Date",
  days: (n) => `${n} day${n === 1 ? "" : "s"}`, tinL: "TIN", telL: "Telephone", addrL: "Address",
  qr: "Scan in the Higoverse app to check this agreement",
};

const FR: Words = {
  title: "CONTRAT DE LOCATION DE VÉHICULE",
  intro: (co, tin, addr, renter, id, date) =>
    `Ce jour, ${date}, entre <b>${co}</b>, TIN ${tin}, société de vente et de location de véhicules${addr ? ` située à ${addr}` : ""}, et ${renter}, le locataire, titulaire de la carte d’identité n° ${id}, il a été convenu ce qui suit :`,
  a1: "Article 1 : Objet du contrat",
  p1: (renter, period) => `Le présent contrat a pour objet la location du véhicule de la société à ${renter} pour une durée de ${period}, selon les conditions ci-dessous.`,
  a2: "Article 2 : Identification du véhicule",
  p2: "Le véhicule loué est identifié comme suit :",
  carType: "Type de véhicule", plate: "Numéro de plaque", chassis: "Numéro de châssis",
  a3: "Article 3 : Durée du contrat",
  p3: (from, to) => `Le présent contrat commence le ${from} et prend fin le ${to}.`,
  p3b: "La durée de location ne peut être prolongée qu’avec l’accord des deux parties.",
  a4: "Article 4 : Obligations du locataire",
  p4: "Le locataire s’engage à :",
  duties: [
    "Utiliser le véhicule conformément à la loi et en prendre soin.",
    "Ne pas l’utiliser pour des activités illégales.",
    "Informer la société de tout accident ou autre problème grave concernant le véhicule. Le locataire est responsable du véhicule tant qu’il est en sa possession et doit le rendre dans l’état où il l’a reçu.",
    "Rendre le véhicule à la date de fin du contrat, en bon état, tel qu’il lui a été remis.",
  ],
  a5: "Article 5 : Loyer et paiement",
  p5: (renter, rent, deposit) => `${renter} a payé un loyer de ${rent}, ainsi qu’une caution de ${deposit}.`,
  p5b: (renter) => `La caution sera rendue à ${renter} lorsque le véhicule sera restitué en bon état, sans dommage dû à son utilisation. En cas de dommages causés par le locataire, les frais de réparation seront retenus sur la caution et le solde rendu à ${renter}.`,
  a6: "Article 6 : Signatures",
  p6: "Les deux parties déclarent avoir lu, compris et accepté le présent contrat, et le signent de leur plein gré.",
  done: (date) => `Fait à Kigali, le ${date}.`,
  lessor: "LA SOCIÉTÉ", renterRole: "LE LOCATAIRE", name: "Nom", signStamp: "Signature et cachet", sign: "Signature", date: "Date",
  days: (n) => `${n} jour${n === 1 ? "" : "s"}`, tinL: "TIN", telL: "Téléphone", addrL: "Adresse",
  qr: "Scannez dans l’application Higoverse pour vérifier ce contrat",
};

const WORDS: Record<AgreementLang, Words> = { rw: RW, en: EN, fr: FR };

export function rentalAgreementHtml(r: Rental, shop: PrintShop, lang: AgreementLang, opts: { autoPrint?: boolean } = {}): string {
  const w = WORDS[lang];
  const co = esc(shop.name || "");
  const cur = !r.currency || r.currency === "RWF" ? "Frw" : esc(r.currency);
  const amount = (n: number) => (n > 0 ? `<b>${money(n)} ${cur}</b>` : `<span class="line" style="width:30mm"></span> ${cur}`);
  const renter = v(r.customer, 50);
  const n = rentalDays(r);

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(w.title)} ${esc(r.rental_no)}</title>
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
  <h1>${esc(w.title)}</h1>
  <p>${w.intro(co, shop.tin ? esc(shop.tin) : v("", 30), esc(shop.address || ""), renter, v(r.customer_id_no, 40), day(r.agreement_date))}</p>

  <h2>${esc(w.a1)}</h2>
  <p>${w.p1(renter, n ? `<b>${esc(w.days(n))}</b>` : v("", 40))}</p>

  <h2>${esc(w.a2)}</h2>
  <p>${esc(w.p2)}</p>
  <ul>
    <li><b>${esc(w.carType)}:</b> ${v([r.car_name, r.car_type].filter(Boolean).join(" · "), 50)}</li>
    <li><b>${esc(w.plate)}:</b> ${v(r.plate_no, 50)}</li>
    <li><b>${esc(w.chassis)}:</b> ${v(r.chassis_no, 50)}</li>
  </ul>

  <h2>${esc(w.a3)}</h2>
  <p>${w.p3(day(r.start_date), day(r.end_date))}</p>
  <p>${esc(w.p3b)}</p>

  <h2>${esc(w.a4)}</h2>
  <p>${esc(w.p4)}</p>
  <ol>${w.duties.map((d) => `<li>${esc(d)}</li>`).join("")}</ol>

  <h2>${esc(w.a5)}</h2>
  <p>${w.p5(renter, amount(r.rent_amount), amount(r.deposit))}</p>
  <p>${w.p5b(renter)}</p>

  <h2>${esc(w.a6)}</h2>
  <p>${esc(w.p6)}</p>
  <p>${w.done(day(r.agreement_date))}</p>

  <div class="sign">
    <div>
      <p><b>${esc(w.lessor)}</b><br>${co}</p>
      <p>${esc(w.name)}: <span class="line" style="width:52mm"></span></p>
      <p>${esc(w.signStamp)}: <span class="line" style="width:40mm"></span></p>
      <p>${esc(w.date)}: <span class="line" style="width:56mm"></span></p>
    </div>
    <div>
      <p><b>${esc(w.renterRole)}</b><br>${esc(r.customer)}</p>
      <p>${esc(w.sign)}: <span class="line" style="width:56mm"></span></p>
      <p>${esc(w.date)}: <span class="line" style="width:58mm"></span></p>
    </div>
  </div>
  <div style="margin-top:10mm">${qrBlockHtml(r.doc_code, w.qr, "24mm")}</div>
  ${opts.autoPrint ? `<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},250)}</script>` : ""}
</body></html>`;
}
