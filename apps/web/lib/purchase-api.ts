import { authFetch } from "@/lib/session";

export async function purchaseRequest(endpoint: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  // Route through Next.js rewrite proxy to avoid browser CORS restrictions
  const res = await authFetch(`/api/purchases${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    return null; // Service not yet configured for this account — return empty data
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Purchase API error: ${res.status} ${text}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}
