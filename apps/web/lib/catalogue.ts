// A car company's public catalogue (product-service /catalogue/public/<token>)
// and the shop it belongs to (auth-service public profile). Read on the
// server, for the public page, its link preview and the WhatsApp Status card.

import { translate, type Lang, LANGUAGES } from "@/lib/i18n";

export interface CatalogueModel {
  name: string;
  count: number;
  min_price: number | null;
  max_price: number | null;
  years: number[];
  car_types: string[];
  colors: string[];
  conditions: string[];
  battery_range: [number, number] | null;
  mileage: [number, number] | null;
  cover: string | null;
}

export interface Catalogue {
  shop_id: string;
  prices: boolean;
  currency: string;
  total: number;
  models: CatalogueModel[];
  generated_at: string;
}

export interface CatalogueShop {
  name: string;
  phone: string | null;
  address: string | null;
  logo: string | null;
}

/** Models on one Status card (2 columns × 3 rows inside WhatsApp's safe zone). */
export const MODELS_PER_CARD = 6;

// Same rule as next.config.ts: a deployed server in local development
// (HGV_API_ORIGIN), otherwise the services on this machine.
function service(name: string, port: number): string {
  const remote = process.env.HGV_API_ORIGIN?.replace(/\/+$/, "");
  return remote ? `${remote}/${name}` : `http://127.0.0.1:${port}`;
}

/** Tokens look like "<shop id>.<p|n><CUR><signature>"; anything else is not tried. */
export function validToken(token: string): boolean {
  return /^[\w-]{1,64}\.[pn][A-Za-z]{3}[\w-]{10,24}$/.test(token);
}

export async function getCatalogue(token: string, size = 640): Promise<Catalogue | null> {
  if (!validToken(token)) return null;
  try {
    const res = await fetch(`${service("products", 8001)}/catalogue/public/${encodeURIComponent(token)}?size=${size}`, {
      next: { revalidate: 60 }, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return ((await res.json())?.data as Catalogue) ?? null;
  } catch {
    return null;
  }
}

export async function getCatalogueShop(shopId: string): Promise<CatalogueShop | null> {
  try {
    const res = await fetch(`${service("auth", 8000)}/api/v1/shops/${encodeURIComponent(shopId)}`, {
      next: { revalidate: 300 }, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const s = (await res.json())?.data;
    if (!s?.name) return null;
    return {
      name: String(s.name),
      phone: s.phone ? String(s.phone) : null,
      address: s.address ? String(s.address) : null,
      logo: typeof s.logo_url === "string" && s.logo_url ? s.logo_url : null,
    };
  } catch {
    return null;
  }
}

export function catalogueLang(value: string | string[] | undefined | null): Lang {
  const v = Array.isArray(value) ? value[0] : value;
  return LANGUAGES.some((l) => l.code === v) ? (v as Lang) : "en";
}

/** Translator for the public pages (no signed-in language context there). */
export function catalogueT(lang: Lang) {
  return (key: string, vars: Record<string, string | number> = {}) =>
    Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), translate(lang, key));
}

const money = (n: number) => Math.round(n).toLocaleString("en-US");

/** "25,000,000 RWF", "From 25,000,000 RWF", or null when prices are hidden. */
export function modelPrice(m: CatalogueModel, currency: string, t: ReturnType<typeof catalogueT>): string | null {
  if (m.min_price == null) return null;
  if (m.max_price != null && m.max_price > m.min_price) return t("catalogue.from_price", { price: `${money(m.min_price)} ${currency}` });
  return `${money(m.min_price)} ${currency}`;
}

const span = (r: number[]) => (r.length ? (r[0] === r[r.length - 1] ? String(r[0]) : `${r[0]}–${r[r.length - 1]}`) : null);

/** The model's key facts on one line: "2024–2025 · SUV · 401 km range · New". */
export function modelFacts(m: CatalogueModel, t: ReturnType<typeof catalogueT>): string[] {
  const facts: (string | null)[] = [
    span(m.years),
    m.car_types.length === 1 ? carType(m.car_types[0], t) : null,
    m.battery_range ? t("catalogue.range_km", { km: span(m.battery_range) ?? "" }) : null,
    m.conditions.length === 1 ? t(`proforma.condition_${m.conditions[0]}`) : null,
    m.mileage && m.conditions[0] !== "new"
      ? `${money(m.mileage[0])}${m.mileage[1] > m.mileage[0] ? `–${money(m.mileage[1])}` : ""} km` : null,
  ];
  return facts.filter((f): f is string => !!f);
}

function carType(value: string, t: ReturnType<typeof catalogueT>): string {
  const key = `vehicle.car_type_${value}`;
  const label = t(key);
  return label === key ? value : label;
}

/** International digits for wa.me / tel: links ("0788 123 456" → "250788123456"). */
export function phoneDigits(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = `250${d.slice(1)}`; // Higoverse businesses are in Rwanda
  return d.length >= 9 ? d : null;
}

/** Photos the image renderer can draw (it can't decode WebP or GIF). */
export function drawable(src: string | null): string | null {
  return src && /^data:image\/(jpeg|jpg|png);base64,/.test(src) ? src : null;
}
