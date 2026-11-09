// Every number Higoverse shows is grouped with commas: 53,673,998.
//
// Numbers are shown with `n.toLocaleString()` in many places (pages, PDF and
// Excel exports). Without a locale that follows the browser's language, so a
// French or Kinyarwanda browser showed "53 673 998" or "53.673.998". This
// makes a Number's toLocaleString() use English grouping when no locale is
// given; a caller that names a locale keeps it. Dates are not touched.
//
// Imported once on the server and in the browser (lib/query-provider.tsx).

export const NUMBER_LOCALE = "en-US";

type ToLocale = (this: number, locales?: string | string[], options?: Intl.NumberFormatOptions) => string;
const proto = Number.prototype as unknown as { toLocaleString: ToLocale; __hgvGrouped?: boolean };

if (!proto.__hgvGrouped) {
  const original = proto.toLocaleString;
  proto.toLocaleString = function (this: number, locales?: string | string[], options?: Intl.NumberFormatOptions) {
    return original.call(this, locales ?? NUMBER_LOCALE, options);
  };
  proto.__hgvGrouped = true;
}

/** 53673998.76 → "53,673,999" (or with [decimals] digits after the point). */
export function groupNumber(n: number, decimals = 0): string {
  return Number(n || 0).toLocaleString(NUMBER_LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
