import { getToken } from "@/lib/auth";

const EXPENSE_API = "/api/expenses";

export async function expenseRequest(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${EXPENSE_API}${endpoint}`, { ...options, headers });

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

export async function expenseUploadProof(expenseId: string, file: File) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${EXPENSE_API}/expenses/${expenseId}/proof`, {
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
