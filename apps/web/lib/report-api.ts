import { getToken } from "@/lib/auth";

const REPORT_API = process.env.NEXT_PUBLIC_API_REPORTS || "https://report-esys.vercel.app";

export async function reportRequest(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${REPORT_API}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    return null; // Service not yet configured for this account — return empty data
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Report API error: ${res.status} ${text}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}
