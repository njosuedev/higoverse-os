import type { Lang } from "./i18n";

// UI templates the platform admin can assign to a business (shop.layout).
// Keep in sync with BUSINESS_LAYOUTS in backend/auth-service/app/schemas/shop.py.
export const BUSINESS_LAYOUTS = ["retail", "car"] as const;
export type BusinessLayout = (typeof BUSINESS_LAYOUTS)[number];

export function normalizeLayout(v: string | null | undefined): BusinessLayout {
  return (BUSINESS_LAYOUTS as readonly string[]).includes(v ?? "") ? (v as BusinessLayout) : "retail";
}

// ── Car layout: car details stored in product.attributes (JSON text) ──
export type VehicleField = "year" | "car_type" | "battery_range" | "color" | "chassis_no" | "plate_no" | "mileage" | "condition";

/** A car's condition (printed on proformas). */
export const CAR_CONDITIONS = ["new", "used"] as const;

export const CAR_TYPES = ["sedan", "suv", "pickup", "hatchback", "van", "bus", "truck", "coupe", "other"] as const;

/**
 * Built-in types are stored as keys and translated; a company's own types
 * (added in Settings → Car types, kept in shop_settings.car_types) are
 * stored and shown exactly as typed.
 */
export function carTypeLabel(t: (key: string) => string, value: string): string {
  return (CAR_TYPES as readonly string[]).includes(value) ? t(`vehicle.car_type_${value}`) : value;
}

export const VEHICLE_FIELDS: {
  key: VehicleField; type: "text" | "number" | "select"; required: boolean; options?: readonly string[]; placeholder?: string;
}[] = [
  // Chassis and plate identify one physical car; no two vehicles share them.
  { key: "chassis_no",    type: "text",   required: true,  placeholder: "LGXCE4CB0P0000000" },
  { key: "plate_no",      type: "text",   required: true,  placeholder: "RAC 123 A" },
  { key: "car_type",      type: "select", required: true,  options: CAR_TYPES },
  { key: "year",          type: "number", required: true,  placeholder: "2023" },
  { key: "battery_range", type: "number", required: true,  placeholder: "400" },
  { key: "color",         type: "text",   required: true,  placeholder: "White" },
  // Optional; printed on proformas (which can't change them).
  { key: "mileage",       type: "number", required: false, placeholder: "45000" },
  { key: "condition",     type: "select", required: false, options: CAR_CONDITIONS },
];

/** The fields that make a car unique (see VEHICLE_FIELDS). */
export const VEHICLE_ID_FIELDS: readonly VehicleField[] = ["chassis_no", "plate_no"];

/** Plate/chassis as stored: upper case, single spaces. */
export function normalizeVehicleId(v: string): string {
  return v.trim().replace(/\s+/g, " ").toUpperCase();
}

/** The car a 409 from the product API says already holds this plate or
 *  chassis, or null when the error is something else. */
export function duplicateVehicle(err: unknown): { field: string; name: string } | null {
  const m = /Product API error: 409 ([\s\S]*)$/.exec(err instanceof Error ? err.message : "");
  if (!m) return null;
  try {
    const d = JSON.parse(m[1])?.detail;
    return d?.field ? { field: String(d.field), name: String(d.product_name ?? "") } : null;
  } catch { return null; }
}

// Sale status + traffic penalties, also kept in attributes (set from the
// vehicle cards, not the main form). Sold is derived from quantity = 0.
export type VehicleStatusField =
  | "sale_status" | "buyer_name" | "buyer_phone" | "buyer_id_no" | "pending_since" | "pending_at" | "pending_note"
  // A pending car is paid for in deposits: the agreed price, the customer it's
  // reserved for (the sale goes to them), and every deposit as JSON text.
  | "buyer_customer_id" | "agreed_price" | "deposits"
  | "penalty_count" | "penalty_amount" | "penalty_checked" | "penalty_saved_at";

export type Attributes = Partial<Record<VehicleField | VehicleStatusField, string>>;

export const DEPOSIT_METHODS = ["cash", "mtn", "airtel", "bank", "card"] as const;

export interface Deposit { amount: number; method: string; date: string; at: string; }

export function parseDeposits(a: Attributes): Deposit[] {
  try {
    const v = JSON.parse(a.deposits || "[]");
    return Array.isArray(v) ? v.filter((d) => d && Number(d.amount) > 0).map((d) => ({ ...d, amount: Number(d.amount) })) : [];
  } catch { return []; }
}

/** What the buyer has paid so far, what they owe in total, and what's left. */
export function depositSummary(a: Attributes, sellingPrice: number) {
  const price = Number(a.agreed_price) > 0 ? Number(a.agreed_price) : Number(sellingPrice) || 0;
  const paid = parseDeposits(a).reduce((s, d) => s + d.amount, 0);
  return { price, paid, balance: Math.max(0, price - paid), full: price > 0 && paid >= price };
}

export type VehicleStatus = "available" | "pending" | "sold";

/** Sold when none left; pending while a buyer gathers transfer documents. */
export function vehicleStatus(quantity: number, a: Attributes): VehicleStatus {
  if (quantity <= 0) return "sold";
  return a.sale_status === "pending" ? "pending" : "available";
}

/** Days since an ISO date (YYYY-MM-DD), or null when unset/invalid. */
export function daysSince(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso + "T00:00:00").getTime();
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/** A penalty check older than this is shown as needing a re-check. */
export const PENALTY_RECHECK_DAYS = 30;

export function parseAttributes(raw: string | null | undefined): Attributes {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Serialise, dropping empty values; null when nothing is set. */
export function stringifyAttributes(a: Attributes): string | null {
  const clean = Object.fromEntries(Object.entries(a).filter(([, v]) => v != null && String(v).trim() !== ""));
  return Object.keys(clean).length ? JSON.stringify(clean) : null;
}

// ── Wording overrides ──────────────────────────────────────────────────────
// Existing i18n keys re-worded per layout. `t()` checks these first (see
// language-context), so pages pick up the car wording without per-page code.
type Terms = Record<string, string>;

const CAR_TERMS: Record<Lang, Terms> = {
  en: {
    "nav.inventory": "Vehicles",
    "items.title": "Vehicle Stock",
    "items.add": "Add Vehicle",
    "items.add_title": "Add New Vehicle",
    "items.edit_title": "Edit Vehicle",
    "items.search": "Search by car name, colour, chassis or plate number...",
    "items.focus_one": "Showing one vehicle",
    "dash.expenses_desc": "Record and track business costs.",
    "items.total": "Total Vehicles",
    "items.col_product": "Vehicle",
    "items.col_qty": "Qty",
    "items.name": "Car Name",
    "items.quantity": "Quantity",
    "items.no_items": "No vehicles found",
    "items.add_first": "Add your first vehicle to get started.",
    "items.confirm_delete": "Delete this vehicle? This cannot be undone.",
    "items.count_suffix": "vehicles",
    "items.name_placeholder": "e.g. Toyota RAV4",
    "dash.items_inventory": "Vehicles / Stock",
    "sales.col_product": "Vehicle",
    "sales.product": "Vehicle",
    "sales.select_product": "Select vehicle…",
    "purchases.stat_total_products": "Total Vehicles",
    "items.selling_price": "Price",
    "items.col_selling": "Price",
    "nav.partners": "Customers",
    "dash.partners": "Customers",
    "dash.suppliers_customers": "registered customers",
    "partners.title": "Customer Management",
    "partners.add": "Add Customer",
    "partners.add_title": "Add Customer",
    "partners.edit_title": "Edit Customer",
    "partners.search": "Search by name, phone or email...",
    "partners.total": "Total Customers",
    "partners.no_partners": "No customers found",
    "partners.add_first": "Add your first customer.",
    "partners.count_label": "customers",
    "partners.import_result_suffix": "customers",
    "partners.err_contact_required": "Enter a phone number",
    "partners.name_placeholder": "e.g. Jean Mugisha",
    "items.go_purchases": "Go to Vehicles",
    "reports.restock": "Stock in",
    "purchases.add": "Stock in",
  },
  rw: {
    "nav.inventory": "Imodoka",
    "items.title": "Imodoka mu bubiko",
    "items.add": "Ongeramo imodoka",
    "items.add_title": "Ongeramo imodoka nshya",
    "items.edit_title": "Hindura imodoka",
    "items.search": "Shakisha ukoresheje izina, nimero ya chassis cyangwa ya purake...",
    "items.focus_one": "Hagaragara imodoka imwe gusa",
    "dash.expenses_desc": "Andika kandi ukurikirane amafaranga y'ubucuruzi asohoka.",
    "items.total": "Imodoka zose",
    "items.col_product": "Imodoka",
    "items.col_qty": "Umubare",
    "items.name": "Izina ry'imodoka",
    "items.quantity": "Umubare",
    "items.no_items": "Nta modoka zibonetse",
    "items.add_first": "Ongeramo imodoka yawe ya mbere kugira ngo utangire.",
    "items.confirm_delete": "Gusiba iyi modoka? Ntibishobora gusubizwa inyuma.",
    "items.count_suffix": "imodoka",
    "items.name_placeholder": "urugero: Toyota RAV4",
    "dash.items_inventory": "Imodoka / Ububiko",
    "sales.col_product": "Imodoka",
    "sales.product": "Imodoka",
    "sales.select_product": "Hitamo imodoka…",
    "purchases.stat_total_products": "Imodoka zose",
    "items.selling_price": "Igiciro",
    "items.col_selling": "Igiciro",
    "nav.partners": "Abakiriya",
    "dash.partners": "Abakiriya",
    "dash.suppliers_customers": "abakiriya banditswe",
    "partners.title": "Gucunga abakiriya",
    "partners.add": "Ongeramo umukiriya",
    "partners.add_title": "Ongeramo umukiriya",
    "partners.edit_title": "Hindura umukiriya",
    "partners.search": "Shakisha ukoresheje izina, telefoni cyangwa imeyili...",
    "partners.total": "Abakiriya bose",
    "partners.no_partners": "Nta bakiriya babonetse",
    "partners.add_first": "Ongeramo umukiriya wawe wa mbere.",
    "partners.count_label": "abakiriya",
    "partners.import_result_suffix": "abakiriya",
    "partners.err_contact_required": "Andika nimero ya telefoni",
    "partners.name_placeholder": "urugero: Jean Mugabo",
    "items.go_purchases": "Jya ku modoka",
    "reports.restock": "Kwinjiza mu bubiko",
    "purchases.add": "Kwinjiza mu bubiko",
  },
  fr: {
    "nav.inventory": "Véhicules",
    "items.title": "Stock de véhicules",
    "items.add": "Ajouter un véhicule",
    "items.add_title": "Ajouter un nouveau véhicule",
    "items.edit_title": "Modifier le véhicule",
    "items.search": "Rechercher par nom, n° de châssis ou plaque...",
    "items.focus_one": "Un seul véhicule affiché",
    "dash.expenses_desc": "Enregistrez et suivez les dépenses de l'entreprise.",
    "items.total": "Total véhicules",
    "items.col_product": "Véhicule",
    "items.col_qty": "Qté",
    "items.name": "Nom de la voiture",
    "items.quantity": "Quantité",
    "items.no_items": "Aucun véhicule trouvé",
    "items.add_first": "Ajoutez votre premier véhicule pour commencer.",
    "items.confirm_delete": "Supprimer ce véhicule ? Cette action est irréversible.",
    "items.count_suffix": "véhicules",
    "items.name_placeholder": "ex. Toyota RAV4",
    "dash.items_inventory": "Véhicules / Stock",
    "sales.col_product": "Véhicule",
    "sales.product": "Véhicule",
    "sales.select_product": "Choisir un véhicule…",
    "purchases.stat_total_products": "Total véhicules",
    "items.selling_price": "Prix",
    "items.col_selling": "Prix",
    "nav.partners": "Clients",
    "dash.partners": "Clients",
    "dash.suppliers_customers": "clients enregistrés",
    "partners.title": "Gestion des clients",
    "partners.add": "Ajouter un client",
    "partners.add_title": "Ajouter un client",
    "partners.edit_title": "Modifier le client",
    "partners.search": "Rechercher par nom, téléphone ou e-mail...",
    "partners.total": "Total clients",
    "partners.no_partners": "Aucun client trouvé",
    "partners.add_first": "Ajoutez votre premier client.",
    "partners.count_label": "clients",
    "partners.import_result_suffix": "clients",
    "partners.err_contact_required": "Saisissez un numéro de téléphone",
    "partners.name_placeholder": "ex. Jean Dupont",
    "items.go_purchases": "Aller aux véhicules",
    "reports.restock": "Entrée de stock",
    "purchases.add": "Entrée de stock",
  },
  sw: {
    "nav.inventory": "Magari",
    "items.title": "Hifadhi ya Magari",
    "items.add": "Ongeza Gari",
    "items.add_title": "Ongeza Gari Jipya",
    "items.edit_title": "Hariri Gari",
    "items.search": "Tafuta kwa jina, namba ya chasisi au namba ya usajili...",
    "items.focus_one": "Linaonyeshwa gari moja tu",
    "dash.expenses_desc": "Rekodi na fuatilia gharama za biashara.",
    "items.total": "Jumla ya Magari",
    "items.col_product": "Gari",
    "items.col_qty": "Idadi",
    "items.name": "Jina la Gari",
    "items.quantity": "Idadi",
    "items.no_items": "Hakuna magari yaliyopatikana",
    "items.add_first": "Ongeza gari lako la kwanza ili kuanza.",
    "items.confirm_delete": "Futa gari hili? Hatua hii haiwezi kutenduliwa.",
    "items.count_suffix": "magari",
    "items.name_placeholder": "mf. Toyota RAV4",
    "dash.items_inventory": "Magari / Hifadhi",
    "sales.col_product": "Gari",
    "sales.product": "Gari",
    "sales.select_product": "Chagua gari…",
    "purchases.stat_total_products": "Jumla ya Magari",
    "items.selling_price": "Bei",
    "items.col_selling": "Bei",
    "nav.partners": "Wateja",
    "dash.partners": "Wateja",
    "dash.suppliers_customers": "wateja waliosajiliwa",
    "partners.title": "Usimamizi wa Wateja",
    "partners.add": "Ongeza Mteja",
    "partners.add_title": "Ongeza Mteja",
    "partners.edit_title": "Hariri Mteja",
    "partners.search": "Tafuta kwa jina, simu au barua pepe...",
    "partners.total": "Jumla ya Wateja",
    "partners.no_partners": "Hakuna wateja waliopatikana",
    "partners.add_first": "Ongeza mteja wako wa kwanza.",
    "partners.count_label": "wateja",
    "partners.import_result_suffix": "wateja",
    "partners.err_contact_required": "Weka namba ya simu",
    "partners.name_placeholder": "mf. Jean Mugisha",
    "items.go_purchases": "Nenda kwa Magari",
    "reports.restock": "Ingiza hifadhi",
    "purchases.add": "Ingiza hifadhi",
  },
  zh: {
    "nav.inventory": "车辆",
    "items.title": "车辆库存",
    "items.add": "添加车辆",
    "items.add_title": "添加新车辆",
    "items.edit_title": "编辑车辆",
    "items.search": "按车名、车架号或车牌号搜索...",
    "items.focus_one": "仅显示一辆车",
    "dash.expenses_desc": "记录并跟踪业务支出。",
    "items.total": "车辆总数",
    "items.col_product": "车辆",
    "items.col_qty": "数量",
    "items.name": "车辆名称",
    "items.quantity": "数量",
    "items.no_items": "未找到车辆",
    "items.add_first": "添加您的第一辆车以开始使用。",
    "items.confirm_delete": "删除此车辆？此操作无法撤销。",
    "items.count_suffix": "辆",
    "items.name_placeholder": "例如 Toyota RAV4",
    "dash.items_inventory": "车辆 / 库存",
    "sales.col_product": "车辆",
    "sales.product": "车辆",
    "sales.select_product": "选择车辆…",
    "purchases.stat_total_products": "车辆总数",
    "items.selling_price": "价格",
    "items.col_selling": "价格",
    "nav.partners": "客户",
    "dash.partners": "客户",
    "dash.suppliers_customers": "已登记客户",
    "partners.title": "客户管理",
    "partners.add": "添加客户",
    "partners.add_title": "添加客户",
    "partners.edit_title": "编辑客户",
    "partners.search": "按姓名、电话或邮箱搜索...",
    "partners.total": "客户总数",
    "partners.no_partners": "未找到客户",
    "partners.add_first": "添加您的第一位客户。",
    "partners.count_label": "位客户",
    "partners.import_result_suffix": "位客户",
    "partners.err_contact_required": "请输入电话号码",
    "partners.name_placeholder": "例如 张三",
    "items.go_purchases": "前往车辆",
    "reports.restock": "入库",
    "purchases.add": "入库",
  },
};

const LAYOUT_TERMS: Partial<Record<BusinessLayout, Record<Lang, Terms>>> = {
  car: CAR_TERMS,
};

/** Layout-specific wording for `key`, or undefined to use the normal dictionary. */
export function layoutTerm(layout: BusinessLayout, lang: Lang, key: string): string | undefined {
  const terms = LAYOUT_TERMS[layout];
  return terms?.[lang]?.[key] ?? terms?.en?.[key];
}
