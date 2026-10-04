export function formatRwf(amount: number): string {
  return new Intl.NumberFormat("en-RW", {
    style: "currency",
    currency: "RWF",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** A figure that reads as zero ("0", "0.00", "+0", "1,000" is not). Stat
 *  cards colour a figure only when it is not zero: an empty "Low stock" is
 *  nothing to look at. */
export function isZero(value: string | number): boolean {
  return Number(String(value).replace(/[,\s+]/g, "")) === 0;
}
