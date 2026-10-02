import type { Lang } from "./i18n";

// UI templates the platform admin can assign to a business (shop.layout).
// Keep in sync with BUSINESS_LAYOUTS in backend/auth-service/app/schemas/shop.py.
export const BUSINESS_LAYOUTS = ["retail", "car"] as const;
export type BusinessLayout = (typeof BUSINESS_LAYOUTS)[number];

export function normalizeLayout(v: string | null | undefined): BusinessLayout {
  return (BUSINESS_LAYOUTS as readonly string[]).includes(v ?? "") ? (v as BusinessLayout) : "retail";
}

// ── Car layout: car details stored in product.attributes (JSON text) ──
export type VehicleField = "year" | "car_type" | "battery_range" | "color" | "chassis_no" | "plate_no";

export const CAR_TYPES = ["sedan", "suv", "pickup", "hatchback", "van", "bus", "truck", "coupe", "other"] as const;

export const VEHICLE_FIELDS: {
  key: VehicleField; type: "text" | "number" | "select"; required: boolean; options?: readonly string[]; placeholder?: string;
}[] = [
  { key: "car_type",      type: "select", required: true,  options: CAR_TYPES },
  { key: "year",          type: "number", required: true,  placeholder: "2023" },
  { key: "battery_range", type: "number", required: true,  placeholder: "400" },
  { key: "color",         type: "text",   required: true,  placeholder: "White" },
  { key: "chassis_no",    type: "text",   required: false, placeholder: "LGXCE4CB0P0000000" },
  { key: "plate_no",      type: "text",   required: false, placeholder: "RAC 123 A" },
];

export type Attributes = Partial<Record<VehicleField, string>>;

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
  },
  rw: {
    "nav.inventory": "Imodoka",
    "items.title": "Imodoka mu bubiko",
    "items.add": "Ongeramo imodoka",
    "items.add_title": "Ongeramo imodoka nshya",
    "items.edit_title": "Hindura imodoka",
    "items.search": "Shakisha ukoresheje izina, nimero ya chassis cyangwa ya purake...",
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
  },
  fr: {
    "nav.inventory": "Véhicules",
    "items.title": "Stock de véhicules",
    "items.add": "Ajouter un véhicule",
    "items.add_title": "Ajouter un nouveau véhicule",
    "items.edit_title": "Modifier le véhicule",
    "items.search": "Rechercher par nom, n° de châssis ou plaque...",
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
  },
  sw: {
    "nav.inventory": "Magari",
    "items.title": "Hifadhi ya Magari",
    "items.add": "Ongeza Gari",
    "items.add_title": "Ongeza Gari Jipya",
    "items.edit_title": "Hariri Gari",
    "items.search": "Tafuta kwa jina, namba ya chasisi au namba ya usajili...",
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
  },
  zh: {
    "nav.inventory": "车辆",
    "items.title": "车辆库存",
    "items.add": "添加车辆",
    "items.add_title": "添加新车辆",
    "items.edit_title": "编辑车辆",
    "items.search": "按车名、车架号或车牌号搜索...",
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
