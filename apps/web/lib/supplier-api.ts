import { getToken, handleUnauthorized } from "@/lib/auth";

const SUPPLIER_API = process.env.NEXT_PUBLIC_SUPPLIER_API_URL || "https://higoverse-suppliers.vercel.app";

export async function partnerRequest(
  endpoint: string,
  options: RequestInit = {}
) {
  const token = getToken();

  const headers = new Headers(options.headers);

  headers.set("Content-Type", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${SUPPLIER_API}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired. Please log in again.");
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(
      `Supplier API error: ${res.status} ${errorText || ""}`
    );
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return null;
  }

  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}