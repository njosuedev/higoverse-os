import { getToken } from "@/lib/auth";

const PRODUCT_API = "https://higoverse-products.vercel.app";

export async function itemRequest(
  endpoint: string,
  options: RequestInit = {}
) {
  const token = getToken();

  const headers = new Headers(options.headers);

  headers.set("Content-Type", "application/json");

  // 🔐 attach token only if exists
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${PRODUCT_API}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(
      `Product API error: ${res.status} ${errorText || ""}`
    );
  }

  return res.json();
}