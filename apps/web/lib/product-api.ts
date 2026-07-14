import { getToken } from "@/lib/auth";

const PRODUCT_API = process.env.NEXT_PUBLIC_PRODUCT_API || "https://products-esys.vercel.app";

export async function itemRequest(
  endpoint: string,
  options: RequestInit = {}
) {
  const token = getToken();

  const headers = new Headers(options.headers);

  headers.set("Content-Type", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${PRODUCT_API}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    return null; // Service not yet configured for this account — return empty data
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    // 5xx here is almost always backend infra (DB down/unreachable, quota
    // exhausted, cold-start crash) rather than something about this
    // particular request — the raw body can contain DB hostnames/credentials
    // in the driver's error message, so don't surface it to callers/console.
    if (res.status >= 500) {
      console.warn(`Product service unavailable (${res.status}):`, errorText);
      throw new Error("Product service is temporarily unavailable. Please try again shortly.");
    }
    throw new Error(`Product API error: ${res.status} ${errorText || ""}`);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}
