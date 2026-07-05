/** Shared category taxonomy for the public marketplace (frontend-only — no backend schema change).
 *  `category` on a product stays a freeform string; this just gives it a curated top-level grouping. */

export interface Category {
  key: string;
  label: string;
}

export const CATEGORIES: Category[] = [
  { key: "electronics",   label: "Electronics" },
  { key: "vehicles",      label: "Vehicles" },
  { key: "fashion",       label: "Fashion & Apparel" },
  { key: "health",        label: "Health & Beauty" },
  { key: "furniture",     label: "Furniture & Decor" },
  { key: "agriculture",   label: "Agriculture" },
  { key: "construction",  label: "Construction Services" },
  { key: "business",      label: "Business Services" },
  { key: "food",          label: "Food & Drinks" },
  { key: "wholesale",     label: "Wholesale & Bulk" },
  { key: "other",         label: "Other" },
];

const CAT_KEYWORDS: Record<string, string[]> = {
  electronics:  ["tech", "electronic", "phone", "computer", "digital", "mobile", "gadget", "battery", "cable", "printer", "camera", "laptop", "tv"],
  vehicles:     ["car", "vehicle", "truck", "motor", "bike", "auto", "tyre", "tire"],
  fashion:      ["fashion", "cloth", "wear", "beauty", "salon", "boutique", "tailoring", "shoes", "bag", "jewelry", "accessory", "shirt", "dress"],
  health:       ["health", "pharma", "medicine", "medical", "clinic", "cosmetic", "skincare", "wellness", "pharmacy"],
  furniture:    ["furniture", "wood", "chair", "table", "sofa", "bed", "cabinet", "decor", "home", "office"],
  agriculture:  ["agri", "farm", "seed", "fertilizer", "crop", "harvest", "livestock", "animal", "poultry", "garden"],
  construction: ["construction", "cement", "brick", "build", "hardware", "paint", "roofing", "tiles"],
  business:     ["service", "repair", "print", "photo", "logistics", "transport", "consulting", "delivery", "cleaning"],
  food:         ["food", "drink", "restaurant", "cafe", "bakery", "juice", "grocery", "market", "farm", "rice", "sugar", "milk", "flour", "meat", "fish", "vegetable", "beverage"],
  wholesale:    ["wholesale", "bulk", "distribution", "import", "export", "supplier", "trade", "stock", "manufacturing", "supply"],
};

export function categoryOf(name: string, description?: string | null): string {
  const text = `${name} ${description ?? ""}`.toLowerCase();
  for (const [cat, kws] of Object.entries(CAT_KEYWORDS)) {
    if (kws.some((kw) => text.includes(kw))) return cat;
  }
  return "other";
}

export function categoryLabel(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key;
}
