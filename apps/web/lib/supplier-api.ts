import { getToken } from "@/lib/auth";

const SUPPLIER_API =
  "https://higoverse-suppliers.vercel.app";

export async function supplierRequest(
  endpoint: string,
  options: RequestInit = {}
) {
  const token = getToken();

  const res = await fetch(`${SUPPLIER_API}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && {
        Authorization: `Bearer ${token}`,
      }),
      ...options.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`Supplier API error: ${res.status}`);
  }

  return res.json();
}