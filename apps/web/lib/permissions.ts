"use client";

import { useAuth } from "@/lib/auth-context";
import { useShop } from "@/lib/shop-context";
import { normalizeLayout } from "@/lib/business-layout";

// Mirrors FINANCIAL_ROLES / hides_financials() in the backend services, which
// enforce the same rule on the data itself — this hook only keeps the UI tidy.
const FINANCIAL_ROLES = new Set(["owner", "admin"]);

/** Whether the signed-in user may see the business's money figures: profit,
 *  loss, cost prices, stock value, revenue totals, expenses and reports.
 *  Car companies keep these from their staff; everyone else sees them.
 *
 *  Fails closed: staff count as restricted until the shop's layout has
 *  loaded, so nothing financial renders (or is requested) in the meantime. */
export function useCanSeeFinancials(): boolean {
  const { user } = useAuth();
  const { shop, loading } = useShop();
  if (FINANCIAL_ROLES.has(user?.role ?? "")) return true;
  if (loading) return false;
  return normalizeLayout(shop?.layout) !== "car";
}

// Mirrors EXPENSE_ROLES in expense-service: the owner, the manager and the
// accountant keep the expense book, in every kind of business.
const EXPENSE_ROLES = new Set(["owner", "admin", "manager", "accountant"]);

/** Whether the signed-in user may open Expenses (view, add, edit, delete). */
export function useCanUseExpenses(): boolean {
  const { user } = useAuth();
  return EXPENSE_ROLES.has(user?.role ?? "");
}

/** Whether profit, loss and margin figures may be shown. Car companies don't
 *  show them at all (owners included); other businesses show them to anyone
 *  who can see financials. Fails closed until the shop's layout is known. */
export function useShowsProfit(): boolean {
  const fin = useCanSeeFinancials();
  const { shop, loading } = useShop();
  if (!fin || loading) return false;
  return normalizeLayout(shop?.layout) !== "car";
}

/** A car company's accountant: they may only view the expense book (no
 *  adding, editing or deleting, and no other page). Mirrors expenses_only()
 *  in the backend services, which enforce it on the data itself. */
export function isExpensesOnly(role: string | undefined, layout: string | undefined | null): boolean {
  return role === "accountant" && normalizeLayout(layout) === "car";
}

/** The pages a car company's accountant may open (view only). */
export const EXPENSES_ONLY_ROUTES = ["/expenses", "/messages", "/settings"];

/** Whether the signed-in user may only view expenses. Accountants count as
 *  restricted until the shop's layout has loaded (fails closed). */
export function useExpensesOnly(): boolean {
  const { user } = useAuth();
  const { shop, loading } = useShop();
  if (user?.role !== "accountant") return false;
  if (loading) return true;
  return isExpensesOnly(user.role, shop?.layout);
}

/** The General Ledger (Ledger page): a car company's owner (and admins).
 *  Mirrors require_ledger in sale-service and expense-service. */
export const LEDGER_ROLES = new Set(["owner", "admin"]);
export function useCanUseLedger(): boolean {
  const { user } = useAuth();
  const { shop, loading } = useShop();
  if (loading || !LEDGER_ROLES.has(user?.role ?? "")) return false;
  return normalizeLayout(shop?.layout) === "car";
}
