// The proforma of a pending car as it stands now: the agreed price, every
// deposit paid so far and the balance left, printed like any proforma
// (lib/proforma-print.ts) so it can be saved as PDF or handed to the buyer.
//
// A car's deposits live on the car (Vehicles → Add deposit), not always on a
// proforma. When the car was booked through a proforma, that proforma's
// number, customer details, terms and bank accounts are kept; otherwise they
// come from the buyer's customer record and the company's settings.

import { printHtml } from "./print-frame";
import { saleRequest } from "./sale-api";
import { settingsRequest } from "./settings-api";
import { getMyShop } from "./shop-api";
import { loadCustomers } from "./supplier-api";
import { formatPublicAddress, decodeShopHumanInfo } from "./product-meta";
import { prettyPhone, shopTin, bankText, type BankAccount } from "./company";
import { carTypeLabel, depositSummary, parseDeposits, type Attributes } from "./business-layout";
import { listProformas, type Deposit, type Proforma } from "./proforma-api";
import { proformaPrintHtml, savedProformaTemplate, type PrintShop } from "./proforma-print";

type T = (key: string) => string;

export interface ProformaCar {
  id: string;
  name: string;
  selling_price: number;
}

const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function addDays(from: string, n: number) { const d = new Date(from + "T00:00:00"); d.setDate(d.getDate() + n); return toDateStr(d); }

/** The proforma this car was booked with, if any (the buyer's, newest first). */
async function bookingProforma(carId: string, customerId?: string): Promise<Proforma | null> {
  try {
    const { items } = await listProformas({ status: "approved", limit: 200 });
    const withCar = items.filter((p) => p.lines?.some((l) => l.product_id === carId));
    return withCar.find((p) => customerId && p.customer_id === customerId) ?? withCar[0] ?? null;
  } catch { return null; }
}

/** Builds the car's proforma at its current status. */
export async function vehicleProforma(
  v: ProformaCar, a: Attributes, t: T, opts: { salesperson?: string } = {},
): Promise<{ proforma: Proforma; shop: PrintShop }> {
  const [sett, sh, custs, booked] = await Promise.allSettled([
    settingsRequest("/settings"), getMyShop(), loadCustomers(), bookingProforma(v.id, a.buyer_customer_id),
  ]);
  const settings = sett.status === "fulfilled" ? sett.value?.data ?? {} : {};
  const s = sh.status === "fulfilled" ? sh.value : null;
  const shop: PrintShop = {
    name: s?.name || "", phone: prettyPhone(s?.phone), logo_url: s?.logo_url ?? undefined,
    address: formatPublicAddress(s?.address), email: s?.email || decodeShopHumanInfo(s?.description).email,
    tin: s ? shopTin(s) : undefined,
  };
  const cust = custs.status === "fulfilled" ? custs.value.find((c) => c.id === a.buyer_customer_id) : undefined;
  const base = booked.status === "fulfilled" ? booked.value : null;
  // Only a proforma for this one car keeps its number and QR: one for several
  // cars would print with different contents under the same number.
  const same = base && base.lines.length === 1 ? base : null;

  const accounts: BankAccount[] = Array.isArray(settings.bank_accounts) ? settings.bank_accounts : [];
  const account = accounts.find((x) => x.is_default) ?? accounts[0];
  const currency = base?.currency || settings.currency || "RWF";
  const { price } = depositSummary(a, v.selling_price);
  const deposits: Deposit[] = parseDeposits(a).map((d) => ({
    amount: d.amount, method: d.method as Deposit["method"], date: d.date, at: d.at,
  }));
  const line = base?.lines.find((l) => l.product_id === v.id);
  const date = toDateStr(new Date());

  const proforma: Proforma = {
    id: same?.id ?? "",
    invoice_no: same?.invoice_no ?? `PRO-${Date.now().toString().slice(-6)}`,
    date,
    valid_until: same?.valid_until && same.valid_until >= date ? same.valid_until : addDays(date, 5),
    salesperson: base?.salesperson || opts.salesperson || "",
    customer_id: a.buyer_customer_id || base?.customer_id || null,
    customer: cust?.name || a.buyer_name || base?.customer || "",
    customer_phone: cust?.phone || a.buyer_phone || base?.customer_phone || "",
    customer_address: cust?.address || base?.customer_address || "",
    customer_id_no: cust?.id_number || a.buyer_id_no || base?.customer_id_no || "",
    customer_tin: cust?.tin || base?.customer_tin || "",
    customer_email: cust?.email || base?.customer_email || "",
    customer_country: cust?.country || base?.customer_country || "Rwanda",
    customer_company: cust?.company || base?.customer_company || "",
    notes: base?.notes || "",
    lines: [{
      product_id: v.id, product_name: v.name, qty: 1, unit_price: price,
      car_type: line?.car_type || (a.car_type ? carTypeLabel(t, a.car_type) : ""),
      year: a.year || line?.year || "", color: a.color || line?.color || "",
      mileage: a.mileage || line?.mileage || "", energy: line?.energy || "",
      chassis_no: a.chassis_no || line?.chassis_no || "", plate_no: a.plate_no || line?.plate_no || "",
      condition: a.condition || line?.condition || "",
    }],
    // The agreed price is what the buyer pays in all, as on the deposit form.
    subtotal: price, tax_rate: 0, tax_amount: 0, grand_total: price,
    currency,
    payment_method: base?.payment_method || (account ? `${t("bank.transfer")} · ${account.bank_name}` : ""),
    bank_details: base?.bank_details || (account ? bankText(account, t) : ""),
    deposit_amount: deposits.reduce((x, d) => x + d.amount, 0),
    deposits,
    terms: base?.terms || t("proforma.default_terms"),
    status: "approved",
    created_at: same?.created_at ?? new Date().toISOString(),
    doc_code: same?.doc_code,
  };
  return { proforma, shop };
}

/** A signed QR code for this print (sale-service POST /sales/printed), or undefined. */
async function printedCode(p: Proforma, v: ProformaCar, plate?: string): Promise<string | undefined> {
  try {
    const title = ["Proforma", p.invoice_no, [v.name, plate].filter(Boolean).join(" "), p.customer].filter(Boolean).join(" · ");
    const res = await saleRequest("/sales/printed", {
      method: "POST",
      body: JSON.stringify({ kind: "proforma", title: title.slice(0, 200), period_from: p.date, period_to: p.valid_until,
        records: p.deposits?.length ?? 0, total: p.grand_total, currency: p.currency }),
    });
    return res?.data?.code ?? undefined;
  } catch { return undefined; }   // printed without a QR
}

/** Opens the print dialog (Save as PDF) for the car's proforma at its current status. */
export async function printVehicleProforma(
  v: ProformaCar, a: Attributes, t: T, opts: { salesperson?: string; qr?: boolean } = {},
): Promise<void> {
  const { proforma, shop } = await vehicleProforma(v, a, t, opts);
  // No proforma of its own to point at: note this print on the server, which
  // signs a code for its QR (scanned, it shows the title, total and who printed it).
  if (!proforma.doc_code && opts.qr !== false) proforma.doc_code = await printedCode(proforma, v, a.plate_no);
  printHtml(proformaPrintHtml(proforma, shop, t, true, { autoPrint: true, qr: opts.qr, template: savedProformaTemplate() }));
}
