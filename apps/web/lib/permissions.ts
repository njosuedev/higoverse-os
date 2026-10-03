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

/** Whether profit, loss and margin figures may be shown. Car companies don't
 *  show them at all (owners included); other businesses show them to anyone
 *  who can see financials. Fails closed until the shop's layout is known. */
export function useShowsProfit(): boolean {
  const fin = useCanSeeFinancials();
  const { shop, loading } = useShop();
  if (!fin || loading) return false;
  return normalizeLayout(shop?.layout) !== "car";
}
