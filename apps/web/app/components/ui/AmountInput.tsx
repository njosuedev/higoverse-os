"use client";

// A number box that shows commas while you type (53,673,998), for amounts,
// prices and quantities. A drop-in for <input type="number">: it takes the
// same props, and onChange gets the plain number text ("53673998") in
// e.target.value, so the code around it doesn't change. Decimals are kept
// when [step] allows them ("0.01"); min and max are checked by the forms,
// as before.

import { forwardRef, useLayoutEffect, useRef } from "react";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string | number | null | undefined;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

/** "53673998.5" → "53,673,998.5" (a trailing "." or decimals as typed are kept). */
export function withCommas(raw: string): string {
  if (!raw) return "";
  const neg = raw.startsWith("-");
  const [int, dec] = raw.replace(/^-/, "").split(".");
  const grouped = (int || (dec !== undefined ? "0" : "")).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + grouped + (dec !== undefined ? `.${dec}` : "");
}

/** What was typed, as plain number text: digits, one point (if allowed), a leading minus. */
function clean(text: string, decimals: boolean, negative: boolean): string {
  let s = text.replace(/[^\d.\-]/g, "");
  const neg = negative && s.startsWith("-");
  s = s.replace(/-/g, "");
  if (decimals) {
    const i = s.indexOf(".");
    if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
  } else {
    s = s.replace(/\./g, "");
  }
  s = s.replace(/^0+(?=\d)/, "");
  return (neg ? "-" : "") + s;
}

const AmountInput = forwardRef<HTMLInputElement, Props>(function AmountInput(
  { value, onChange, step, min, ...rest }, outer,
) {
  const inner = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);
  const decimals = step !== undefined && String(step).includes(".");
  const negative = min !== undefined && Number(min) < 0;
  const raw = value === null || value === undefined ? "" : String(value);
  const shown = withCommas(clean(raw, true, true));

  // Keeps the cursor after the same digit once commas move.
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || caret.current === null || document.activeElement !== el) return;
    let digits = caret.current, pos = 0;
    while (pos < el.value.length && digits > 0) { if (/[\d.\-]/.test(el.value[pos])) digits--; pos++; }
    el.setSelectionRange(pos, pos);
    caret.current = null;
  }, [shown]);

  return (
    <input
      {...rest}
      ref={(el) => {
        inner.current = el;
        if (typeof outer === "function") outer(el); else if (outer) outer.current = el;
      }}
      type="text"
      inputMode={decimals ? "decimal" : "numeric"}
      autoComplete="off"
      value={shown}
      onChange={(e) => {
        const before = e.target.value.slice(0, e.target.selectionStart ?? e.target.value.length);
        caret.current = before.replace(/[^\d.\-]/g, "").length;
        const plain = clean(e.target.value, decimals, negative);
        // The page's handler reads e.target.value: give it the plain number.
        const target = { value: plain, name: e.target.name, id: e.target.id } as HTMLInputElement;
        onChange?.({ ...e, target, currentTarget: target } as React.ChangeEvent<HTMLInputElement>);
      }}
    />
  );
});

export default AmountInput;
