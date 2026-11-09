// Income outside sales (the Income page, next to Expenses): what is
// recorded there (expense-service /incomes) plus anything kept in Expenses
// as "money received". Rentals are not income: they are part of Sales
// (Sales → Rentals); their rents are returned apart so Reports and Home can
// count them with sales in the profit.

import { expenseRequest } from "@/lib/expense-api";
import { listRentals, type Rental } from "@/lib/rental-api";

/** "rental" stays a type only for income recorded before rentals moved to Sales. */
export type IncomeSource = "rental" | "services" | "commission" | "transport" | "interest" | "other";
/** Sources offered when recording income (rentals are recorded in Sales → Rentals). */
export const INCOME_SOURCES: IncomeSource[] = ["services", "commission", "transport", "interest", "other"];
export type IncomeMethod = "cash" | "mtn" | "bank";

export interface Income {
  id: string;
  title: string;
  source: IncomeSource;
  amount: number;
  income_date: string;
  payment_method?: IncomeMethod | null;
  payer?: string | null;
  reference?: string | null;
  notes?: string | null;
  /** Receipts kept (moved here from Expenses). */
  has_proof?: boolean;
  /** It came here from Expenses by a correction. */
  corrected?: boolean;
  created_at?: string | null;
}

export interface IncomeInput {
  title: string;
  source: IncomeSource;
  amount: number;
  income_date: string;          // YYYY-MM-DDT00:00:00
  payment_method?: IncomeMethod | null;
  payer?: string | null;
  reference?: string | null;
  notes?: string | null;
}

export async function listIncomes(p: { from?: string; to?: string; source?: string; limit?: number } = {}): Promise<Income[]> {
  const q = new URLSearchParams({ page: "1", limit: String(p.limit ?? 1000) });
  if (p.from) q.set("from_date", p.from);
  if (p.to) q.set("to_date", p.to);
  if (p.source) q.set("source", p.source);
  const res = await expenseRequest(`/incomes?${q}`);
  return (res?.data?.items as Income[]) ?? [];
}
export async function saveIncome(input: IncomeInput, id?: string): Promise<Income> {
  const res = await expenseRequest(id ? `/incomes/${id}` : "/incomes", { method: id ? "PUT" : "POST", body: JSON.stringify(input) });
  return res?.data as Income;
}
export async function deleteIncome(id: string): Promise<void> {
  await expenseRequest(`/incomes/${id}`, { method: "DELETE" });
}

/** Rentals whose period starts in [from, to] (cancelled ones don't count). */
export function rentalsIn(rentals: Rental[], from?: string, to?: string): Rental[] {
  return rentals.filter((r) => r.status !== "cancelled" && (!from || r.start_date >= from) && (!to || r.start_date <= to));
}

export interface IncomeTotals {
  /** Income: recorded here + money received in Expenses (not rents). */
  total: number;
  /** Recorded on the Income page. */
  recorded: number;
  recordedCount: number;
  /** Rents from Sales → Rentals: part of sales, not of `total`. */
  rentals: number;
  rentalsCount: number;
  /** Kept in Expenses as "money received". */
  fromExpenses: number;
}

/** Income outside sales for a period (dates YYYY-MM-DD, both included),
 *  and the period's rents apart. */
export async function incomeTotals(from: string | undefined, to: string | undefined, isCar: boolean): Promise<IncomeTotals> {
  const q = new URLSearchParams();
  if (from) q.set("from_date", from);
  if (to) q.set("to_date", to);
  const [sum, rentals] = await Promise.all([
    expenseRequest(`/incomes/summary?${q}`).catch(() => null),
    isCar ? listRentals().catch(() => [] as Rental[]) : Promise.resolve([] as Rental[]),
  ]);
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const d = sum?.data ?? {};
  const fromExpenses = n(d.from_expenses);
  const recorded = n(d.total_income) - fromExpenses;
  const rs = rentalsIn(rentals, from, to);
  const rent = rs.reduce((s, r) => s + n(r.rent_amount), 0);
  return {
    total: recorded + fromExpenses, recorded, recordedCount: n(d.count),
    rentals: rent, rentalsCount: rs.length, fromExpenses,
  };
}

// ── Correcting the type (expense-service routes/incomes.py) ──────────────
// The record moves in one step on the server, receipts included, and the
// correction is written to a history that is never changed or deleted.
// Every total, report and dashboard is computed from the records, so they
// follow.

/** Who may correct a record's type (CORRECTION_ROLES in expense-service). */
export const CORRECTION_ROLES = new Set(["owner", "admin", "accountant"]);

export interface Correction {
  id: string;
  from_type: "expense" | "income";
  to_type: "expense" | "income";
  original_id: string;
  new_id: string;
  from_category?: string | null;
  to_category?: string | null;
  title: string;
  amount: number;
  transaction_date?: string | null;
  reason: string;
  corrected_by_name?: string | null;
  corrected_by_role?: string | null;
  corrected_at: string;
}

/** An expense that was really money received becomes income. */
export async function moveExpenseToIncome(expenseId: string, source: IncomeSource, reason: string): Promise<Income> {
  const res = await expenseRequest(`/incomes/from-expense/${expenseId}`, { method: "POST", body: JSON.stringify({ source, reason }) });
  return res?.data as Income;
}

/** Income that was really money spent becomes an expense. */
export async function moveIncomeToExpense(incomeId: string, category: string, reason: string, paymentMethod?: "mtn" | "bank"): Promise<void> {
  await expenseRequest(`/incomes/${incomeId}/to-expense`, {
    method: "POST", body: JSON.stringify({ category, reason, ...(paymentMethod ? { payment_method: paymentMethod } : {}) }),
  });
}

/** The history of corrections, newest first (or those of one record). */
export async function listCorrections(recordId?: string): Promise<Correction[]> {
  const res = await expenseRequest(`/incomes/corrections${recordId ? `?record_id=${encodeURIComponent(recordId)}` : ""}`);
  return (res?.data as Correction[]) ?? [];
}

/** Receipts kept with an income (moved here from Expenses). */
export async function incomeProof(incomeId: string): Promise<{ name: string; type: string; data: string }[]> {
  const res = await expenseRequest(`/incomes/${incomeId}/proof`);
  return res?.data?.files ?? [];
}

/** Expense categories (expense-service ExpenseCategory), for moving income to Expenses. */
export const EXPENSE_CATEGORIES = ["rent", "utilities", "salaries", "supplies", "maintenance", "marketing", "transport", "taxes", "other"] as const;

/** The server's message from a failed request ("… error: 422 {detail}"), or [fallback]. */
export function apiError(err: unknown, fallback: string): string {
  const m = /error: \d+ ([\s\S]*)$/.exec(err instanceof Error ? err.message : "");
  try {
    const d = m && JSON.parse(m[1])?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg).replace(/^Value error, /, "");
  } catch { /* not JSON */ }
  return fallback;
}
