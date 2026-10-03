import { authFetch } from "@/lib/session";

const EXPENSE_API = "/api/expenses";

export async function expenseRequest(endpoint: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  const res = await authFetch(`${EXPENSE_API}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    return null; // Service not yet configured for this account — return empty data
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Expense API error: ${res.status} ${text}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export async function expenseUploadProof(expenseId: string, files: File[]) {
  const formData = new FormData();
  for (const file of files) formData.append("files", file);

  const headers: Record<string, string> = {};

  const res = await authFetch(`${EXPENSE_API}/expenses/${expenseId}/proof`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Proof upload error: ${res.status} ${text}`);
  }
  return res.json();
}
