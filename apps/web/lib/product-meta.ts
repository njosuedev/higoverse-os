// Extracts the human-readable business type and description from a shop's description field
export function decodeShopHumanInfo(
  description: string | undefined | null,
): { type?: string; desc?: string; ownerName?: string; email?: string; bannerUrl?: string; status?: string; rejectionReason?: string } {
  if (!description) return {};
  try {
    const parsed = JSON.parse(description);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return {
        type: parsed._t,
        desc: parsed._d,
        ownerName: parsed._owner,
        email: parsed._email,
        bannerUrl: parsed._banner,
        status: parsed._s,
        rejectionReason: parsed._r,
      };
    }
  } catch { /* old format */ }
  if (description.includes("|")) {
    const idx = description.indexOf("|");
    return { type: description.slice(0, idx), desc: description.slice(idx + 1) };
  }
  return { desc: description };
}

/** Parse the address field: "TIN:xxx|Province:yyy|District:zzz|Sector:aaa|Addr:bbb|Lat:x|Lng:y" */
export function parseShopAddress(address: string | undefined | null): {
  tin: string; province: string; district: string; sector: string; addr: string;
  lat: number | null; lng: number | null;
} {
  const result = { tin: "", province: "", district: "", sector: "", addr: "", lat: null as number | null, lng: null as number | null };
  if (!address) return result;
  if (!address.startsWith("TIN:")) {
    // Support plain "District, Province|Lat:x|Lng:y" format used by settings page
    const pipeIdx = address.indexOf("|Lat:");
    if (pipeIdx !== -1) {
      result.district = address.slice(0, pipeIdx);
      for (const seg of address.slice(pipeIdx + 1).split("|")) {
        const ci = seg.indexOf(":"); if (ci === -1) continue;
        const k = seg.slice(0, ci); const v = seg.slice(ci + 1);
        if (k === "Lat") { const n = parseFloat(v); if (!isNaN(n)) result.lat = n; }
        else if (k === "Lng") { const n = parseFloat(v); if (!isNaN(n)) result.lng = n; }
      }
    } else {
      result.district = address;
    }
    return result;
  }
  const parts = address.slice(4).split("|");
  result.tin = parts[0] ?? "";
  for (const part of parts.slice(1)) {
    const colonIdx = part.indexOf(":");
    if (colonIdx === -1) { result.district = result.district || part; continue; }
    const k = part.slice(0, colonIdx);
    const v = part.slice(colonIdx + 1);
    if (k === "Province") result.province = v;
    else if (k === "District") result.district = v;
    else if (k === "Sector") result.sector = v;
    else if (k === "Addr") result.addr = v;
    else if (k === "Lat") { const n = parseFloat(v); if (!isNaN(n)) result.lat = n; }
    else if (k === "Lng") { const n = parseFloat(v); if (!isNaN(n)) result.lng = n; }
  }
  return result;
}

/** Strip GPS coords suffix — works on any format. */
function stripCoords(address: string): string {
  return address.replace(/\|Lat:[^|]*(\|Lng:[^|]*)?$/, "").replace(/\|Lng:[^|]*$/, "");
}

/** Format raw shop address for public display — strips TIN/coords, returns clean readable string. */
export function formatPublicAddress(address: string | undefined | null): string {
  if (!address) return "";
  const { province, district, sector, addr } = parseShopAddress(address);
  // TIN-encoded address: join known fields
  if (province || sector || addr) {
    return [addr, sector, district, province].filter(Boolean).join(", ");
  }
  // Plain-text address (Nominatim or manual): strip coords suffix and return as-is
  return stripCoords(district || address);
}

/**
 * Short address for headers/cards — at most 2 meaningful location parts.
 * "Kigali International Airport, KK 83 Street, Kanombe, Kicukiro District, City of Kigali, Rwanda"
 * → "Kanombe, Kicukiro District"
 */
export function formatShortAddress(address: string | undefined | null): string {
  const full = formatPublicAddress(address);
  if (!full) return "";
  const parts = full.split(",").map(s => s.trim()).filter(Boolean);
  if (parts.length <= 2) return full;
  // Skip the most-specific part (index 0) and the country (last), take next 2
  const country = ["Rwanda", "Uganda", "Kenya", "Tanzania", "Burundi", "DRC"];
  const filtered = parts.filter(p => !country.includes(p));
  if (filtered.length <= 2) return filtered.join(", ");
  // Take 2 middle parts (neighbourhood / district level)
  const mid = Math.max(1, Math.floor(filtered.length / 2) - 1);
  return filtered.slice(mid, mid + 2).join(", ");
}

