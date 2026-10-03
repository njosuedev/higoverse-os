"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { itemRequest } from "@/lib/product-api";
import { useDebounce } from "@/lib/hooks";
import { useLanguage } from "@/lib/language-context";
import { parseAttributes } from "@/lib/business-layout";

export interface PickerProduct {
  id: string;
  name: string;
  quantity: number;
  selling_price: number;
  cost_price: number;
  /** Car companies: vehicle details incl. pending-sale status (JSON text). */
  attributes?: string | null;
}

interface Props<T extends PickerProduct> {
  /** The currently chosen product, if any (shown when the picker is closed). */
  selected?: T | null;
  /** Receives the product row exactly as the list API returned it. */
  onSelect: (product: T) => void;
  /** Sales can't sell what isn't in stock; purchases and quotes can. */
  disableOutOfStock?: boolean;
  placeholder?: string;
  className?: string;
  /** Open the search straight away (e.g. the first line of a new sale). */
  autoOpen?: boolean;
}

const RESULTS = 20;
const LIST_MAX_H = 288;

type Anchor = { left: number; width: number; top?: number; bottom?: number };

/** Where to float the list: under the field, or above it when there's no room. */
function anchorFor(el: HTMLElement): Anchor {
  const r = el.getBoundingClientRect();
  const width = Math.max(r.width, 320);
  const left = Math.min(r.left, window.innerWidth - width - 8);
  return window.innerHeight - r.bottom < LIST_MAX_H + 12 && r.top > LIST_MAX_H
    ? { left, width, bottom: window.innerHeight - r.top + 4 }
    : { left, width, top: r.bottom + 4 };
}

/** Searchable product field backed by the API, so it works for any catalogue
 *  size instead of listing every product in a <select>. */
export default function ProductPicker<T extends PickerProduct = PickerProduct>({
  selected, onSelect, disableOutOfStock = false, placeholder, className = "", autoOpen = false,
}: Props<T>) {
  const { t } = useLanguage();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);
  // Which query the current results answer — still searching until it matches.
  const [resultsFor, setResultsFor] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const debounced = useDebounce(query, 250);
  const loading = open && resultsFor !== debounced;

  // Search whenever the open picker's query settles.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const qs = new URLSearchParams({ page: "1", limit: String(RESULTS) });
    if (debounced.trim()) qs.set("q", debounced.trim());
    itemRequest(`/products?${qs}`)
      .then((res) => {
        if (cancelled) return;
        setResults(res?.data?.items ?? []);
        setResultsFor(debounced);
        setActive(0);
      })
      .catch(() => { if (!cancelled) { setResults([]); setResultsFor(debounced); } });
    return () => { cancelled = true; };
  }, [open, debounced]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    // The list floats over the page, so follow the field when anything scrolls.
    const follow = () => { if (rootRef.current) setAnchor(anchorFor(rootRef.current)); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open]);

  // Mount-only: later re-renders must not reopen a picker the user closed.
  useEffect(() => {
    if (autoOpen && !selected) openPicker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDisabled = (p: T) => disableOutOfStock && p.quantity <= 0;

  function choose(p: T) {
    if (isDisabled(p)) return;
    onSelect(p);
    setOpen(false);
    setQuery("");
  }

  function openPicker() {
    if (rootRef.current) setAnchor(anchorFor(rootRef.current));
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[active]) choose(results[active]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {open ? (
        <div className="flex items-center gap-2 rounded-lg border border-ink bg-white px-2.5 py-1.5 ring-2 ring-ink/20">
          <Search size={15} className="shrink-0 text-text-faint" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("items.search")}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none"
          />
          {loading && <Loader2 size={14} className="shrink-0 animate-spin text-text-faint" />}
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-sm transition hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-ink/30"
        >
          <span className={`min-w-0 flex-1 truncate ${selected ? "text-text" : "text-text-faint"}`}>
            {selected ? selected.name : placeholder ?? t("sales.select_product")}
          </span>
          <ChevronDown size={14} className="shrink-0 text-text-faint" />
        </button>
      )}

      {open && anchor && createPortal(
        // Portalled with fixed positioning so modals/scroll areas can't clip it.
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          style={{ position: "fixed", left: anchor.left, width: anchor.width, top: anchor.top, bottom: anchor.bottom, maxHeight: LIST_MAX_H }}
          className="z-[100] overflow-y-auto rounded-lg border border-border bg-white py-1 shadow-[0_16px_40px_-12px_rgb(0_0_0_/_0.3)]"
        >
          {!loading && results.length === 0 && (
            <li className="px-3 py-3 text-sm text-text-muted">{t("common.no_data")}</li>
          )}
          {results.map((p, i) => {
            const disabled = isDisabled(p);
            return (
              <li
                key={p.id}
                role="option"
                aria-selected={i === active}
                aria-disabled={disabled}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); choose(p); }}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${i === active ? "bg-paper-dim" : ""} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{p.name}</span>
                {(() => {
                  // A car reserved for a buyer gathering transfer documents:
                  // still sellable (to that buyer), but flagged clearly.
                  const a = p.quantity > 0 ? parseAttributes(p.attributes) : {};
                  if (a.sale_status === "pending") {
                    return <span className="max-w-[45%] shrink-0 truncate text-[13px] font-semibold text-warning">{t("vehicle.status_pending")}{a.buyer_name ? ` · ${a.buyer_name}` : ""}</span>;
                  }
                  return (
                    <span className={`hgv-figure shrink-0 text-[13px] ${p.quantity <= 0 ? "text-accent-dark" : "text-text-muted"}`}>
                      {p.quantity <= 0 ? t("items.out_stock") : `${p.quantity.toLocaleString()} ${t("sales.left_suffix")}`}
                    </span>
                  );
                })()}
                <span className="hgv-figure w-20 shrink-0 text-right text-[13px] font-semibold text-text">
                  {Number(p.selling_price).toLocaleString()}
                </span>
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </div>
  );
}
