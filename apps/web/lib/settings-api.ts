import { authFetch } from "@/lib/session";
import { SETTINGS_API } from "@/lib/api-config";


export async function settingsRequest(endpoint: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await authFetch(`${SETTINGS_API}${endpoint}`, { ...options, headers });
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
