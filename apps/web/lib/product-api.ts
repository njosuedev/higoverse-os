import { getToken } from "@/lib/auth";

const PRODUCT_API =
  "https://higoverse-products.vercel.app";

export async function productRequest(
  endpoint: string,
  options: RequestInit = {}
) {
  const token = getToken();

  const res = await fetch(`${PRODUCT_API}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",

      // 🔐 IMPORTANT: attach JWT
      ...(token && {
        Authorization: `Bearer ${token}`,
      }),

      ...options.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`Product API error: ${res.status}`);
  }

  return res.json();
}