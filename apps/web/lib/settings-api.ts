import { getToken } from "@/lib/auth";

const SETTINGS_API = process.env.NEXT_PUBLIC_API_SETTINGS || "https://higoverse-settings.vercel.app";

export async function settingsRequest(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${SETTINGS_API}${endpoint}`, { ...options, headers });
  } catch {
    // Network error or CORS block (e.g. localhost dev vs. production service)
    return null;
  }

  if (res.status === 401) {
    return null; // Service not yet configured for this account — return empty data
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Settings API error: ${res.status} ${text}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}
