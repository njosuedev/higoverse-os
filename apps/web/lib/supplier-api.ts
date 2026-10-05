import { authFetch } from "@/lib/session";
import { SUPPLIER_API } from "@/lib/api-config";


export async function partnerRequest(
  endpoint: string,
  options: RequestInit = {}
) {
  const headers = new Headers(options.headers);

  headers.set("Content-Type", "application/json");

  const res = await authFetch(`${SUPPLIER_API}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    return null; // Service not yet configured for this account — return empty data
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

export interface Customer { id: string; name: string; phone?: string | null; address?: string | null; id_number?: string | null; }

/** Customers saved in the Customers section (suppliers carry a TIN in their
 *  address; everyone else is a customer). Buyers are only ever picked from
 *  these, never typed in on a sale or pending form. */
export async function loadCustomers(): Promise<Customer[]> {
  const res = await partnerRequest("/suppliers");
  const all: Customer[] = res?.data?.items || res?.data || [];
  return all.filter((c) => !c.address?.startsWith("TIN:"));
}
