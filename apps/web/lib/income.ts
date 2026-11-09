// Income outside sales (the Income page, next to Expenses): what is
// recorded there (expense-service /incomes), plus rents from Sales →
// Rentals (car companies, sale-service /rentals), plus anything kept in
// Expenses as "money received". Reports and Home add it to the profit.

import { expenseRequest } from "@/lib/expense-api";
import { listRentals, type Rental } from "@/lib/rental-api";

export const INCOME_SOURCES = ["rental", "services", "commission", "transport", "interest", "other"] as const;
export type IncomeSource = (typeof INCOME_SOURCES)[number];
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
  /** Everything below together. */
  total: number;
  /** Recorded on the Income page. */
  recorded: number;
  recordedCount: number;
  /** Rents from Sales → Rentals. */
  rentals: number;
  rentalsCount: number;
  /** Kept in Expenses as "money received". */
  fromExpenses: number;
}

/** Income outside sales for a period (dates YYYY-MM-DD, both included). */
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
    total: recorded + fromExpenses + rent, recorded, recordedCount: n(d.count),
    rentals: rent, rentalsCount: rs.length, fromExpenses,
  };
}
