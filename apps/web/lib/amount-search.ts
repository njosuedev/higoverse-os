/**
 * Search by money amount: "500000", "500,000" or "500 000" finds an amount
 * that starts with those digits (so typing "500" already shows 500,000).
 * A search with letters in it is not an amount and matches nothing here.
 */
export function matchesAmount(query: string, amounts: (number | null | undefined)[]): boolean {
  const digits = query.replace(/[\s,.'’_]/g, "");
  if (!/^\d+$/.test(digits)) return false;
  return amounts.some((a) => a != null && Number(a) > 0 && String(Math.round(Number(a))).startsWith(digits));
}
