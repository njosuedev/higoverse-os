"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { useLanguage } from "@/lib/language-context";

export interface PickerCustomer {
  id: string; name: string; phone?: string | null; id_number?: string | null;
  company?: string | null; email?: string | null; created_at?: string | null;
}

const MAX_SHOWN = 50;
const NEW_DAYS = 3;

/** Ignores case, accents and spaces, so "jean-claude" finds "Jean Claude". */
const fold = (s?: string | null) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s\-+().]/g, "");

/** Added in the last few days: marked "New" in the list. */
function isNew(c: PickerCustomer): boolean {
  if (!c.created_at) return false;
  const at = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(c.created_at) ? c.created_at : `${c.created_at}Z`);
  return !isNaN(at) && Date.now() - at < NEW_DAYS * 86_400_000;
}

/** Saved customers, newest first (the order the API sends them), with a
 *  search on name, phone, ID number, company and email. Arrow keys move,
 *  Enter picks, Escape closes. */
export default function CustomerPicker({ customers, value, onChange, placeholder, clearLabel, invalid = false, disabled = false }: {
  customers: PickerCustomer[];
  value: string | null | undefined;
  onChange: (id: string) => void;
  placeholder: string;
  /** A first row that picks no saved customer (e.g. "type a new one below"). */
  clearLabel?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const selected = customers.find((c) => c.id === value) ?? null;

  const matches = useMemo(() => {
    const q = fold(query);
    const hits = q
      ? customers.filter((c) => [c.name, c.phone, c.id_number, c.company, c.email].some((v) => fold(v).includes(q)))
      : customers;
    return hits.slice(0, MAX_SHOWN);
  }, [customers, query]);

  // Closes when the person clicks or taps anywhere else.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // Keeps the highlighted row in view while using the arrow keys.
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, listId]);

  function show() {
    if (disabled) return;
    setQuery("");
    setActive(0);
    setOpen(true);
    requestAnimationFrame(() => field.current?.focus());
  }

  function pick(c: PickerCustomer) {
    onChange(c.id);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (matches[active]) pick(matches[active]); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  }

  const frame = `w-full rounded-lg border bg-white text-sm transition ${invalid ? "border-red-400" : "border-slate-200"}`;

  return (
    <div ref={box} className="relative">
      {open ? (
        <div className={`${frame} flex items-center gap-2 px-3 ring-2 ${invalid ? "ring-red-500/20" : "ring-blue-500/20 border-blue-400"}`}>
          <Search size={15} className="shrink-0 text-slate-400" aria-hidden="true" />
          <input ref={field} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey}
            role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={matches[active] ? `${listId}-${active}` : undefined}
            placeholder={t("customer.search")}
            className="w-full bg-transparent py-2 text-gray-800 placeholder:text-gray-400 focus:outline-none" />
          {query && (
            <button type="button" onClick={() => { setQuery(""); field.current?.focus(); }} aria-label={t("customer.change")}
              className="rounded p-0.5 text-slate-400 hover:text-slate-700"><X size={14} /></button>
          )}
        </div>
      ) : (
        <button type="button" onClick={show} disabled={disabled} role="combobox" aria-expanded="false" aria-invalid={invalid} aria-haspopup="listbox" aria-controls={listId}
          title={selected ? t("customer.change") : undefined}
          className={`${frame} flex items-center gap-2 px-3 py-2 text-left hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-600`}>
          <span className={`min-w-0 flex-1 truncate ${selected ? "text-gray-800" : "text-gray-500"}`}>
            {selected ? <>{selected.name}{selected.phone && <span className="text-slate-400"> · {selected.phone}</span>}</> : placeholder}
          </span>
          <ChevronDown size={16} className="shrink-0 text-slate-500" aria-hidden="true" />
        </button>
      )}

      {open && (
        <ul id={listId} role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {clearLabel && !query && value && (
            <li role="option" aria-selected="false" onPointerDown={(e) => e.preventDefault()} onClick={() => { onChange(""); setOpen(false); }}
              className="cursor-pointer border-b border-slate-100 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">{clearLabel}</li>
          )}
          {matches.length === 0 && <li className="px-3 py-3 text-center text-sm text-slate-500">{t("customer.none_found")}</li>}
          {matches.map((c, i) => (
            <li key={c.id} id={`${listId}-${i}`} role="option" aria-selected={c.id === value}
              onPointerDown={(e) => e.preventDefault()} onClick={() => pick(c)} onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${i === active ? "bg-blue-50" : ""} ${c.id === value ? "font-semibold" : ""}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-gray-800">{c.name}</span>
                {(c.phone || c.id_number || c.company) && (
                  <span className="block truncate text-[11px] text-slate-500">
                    {[c.phone, c.id_number, c.company].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
              {isNew(c) && (
                <span className="shrink-0 rounded-full border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                  {t("customer.new_badge")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
