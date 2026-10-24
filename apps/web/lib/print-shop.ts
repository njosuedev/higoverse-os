"use client";

import { getMyShop } from "@/lib/shop-api";
import { decodeShopHumanInfo, formatPublicAddress } from "@/lib/product-meta";
import { prettyPhone, shopTin } from "@/lib/company";
import type { PrintShop } from "@/lib/proforma-print";

/** The company's details for the top of exported documents (as on pay slips). */
export async function getPrintShop(): Promise<PrintShop> {
  const s = await getMyShop().catch(() => null);
  if (!s) return { name: "" };
  return {
    name: s.name || "", phone: prettyPhone(s.phone), address: formatPublicAddress(s.address), logo_url: s.logo_url,
    email: s.email || decodeShopHumanInfo(s.description).email, tin: shopTin(s),
  };
}

/** The company's details as text lines: TIN, Tel · email, address. */
export function printShopLines(shop: PrintShop): string[] {
  return [
    shop.tin ? `TIN: ${shop.tin}` : "",
    [shop.phone && `Tel: ${shop.phone}`, shop.email].filter(Boolean).join("  ·  "),
    shop.address || "",
  ].filter(Boolean);
}

/** An image as a data URL with its size (for a PDF), or null when it can't be loaded. */
export async function imageForPdf(url: string | undefined): Promise<{ data: string; w: number; h: number } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string>((ok, fail) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.onerror = fail;
      r.readAsDataURL(blob);
    });
    const img = new Image();
    await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = data; });
    // jsPDF takes PNG/JPEG: redraw anything else (webp, svg…) as PNG.
    if (/^data:image\/(png|jpe?g)/.test(data)) return { data, w: img.naturalWidth, h: img.naturalHeight };
    const c = document.createElement("canvas");
    c.width = img.naturalWidth || 200; c.height = img.naturalHeight || 200;
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL("image/png"), w: c.width, h: c.height };
  } catch { return null; }
}
