"use client";

import { useState } from "react";
import Link from "next/link";
import { Car } from "lucide-react";

export interface StackItem {
  id: string;
  /** Where a click goes — straight to that car/item and its action. */
  href: string;
  /** Read by screen readers and shown as the tooltip. */
  label: string;
  /** Ring fill 0–1 and its colour. */
  done: number;
  color: string;
  /** Inside the ring: a photo, or a short text like a count or rank. */
  thumb?: string | null;
  center?: React.ReactNode;
  centerTone?: "danger";
  /** Small red count on the circle's corner. */
  badge?: number;
}

/** Overlapping circles, one per car/item. Pointing at (or focusing) a circle
 *  previews it in the caption below; clicking it opens that car/item and its
 *  action. Keeps a panel one height however many entries there are. */
export default function CircleStack({ items, extra = 0, extraHref, caption, footer }: {
  items: StackItem[];
  extra?: number;
  extraHref?: string;
  caption: (id: string) => React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [active, setActive] = useState<string | null>(null);
  const shown = items.find((i) => i.id === active) ?? items[0];

  return (
    <div className="px-3.5 pb-3">
      <div className="flex items-center pl-1.5 pt-1" onMouseLeave={() => setActive(null)}>
        {items.map((it, i) => (
          <Link key={it.id} href={it.href} aria-label={it.label} title={it.label}
            onMouseEnter={() => setActive(it.id)} onFocus={() => setActive(it.id)}
            className="relative -ml-2.5 rounded-full transition-transform first:ml-0 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            style={{ zIndex: shown?.id === it.id ? 30 : items.length - i }}>
            <Ring {...it} />
            {!!it.badge && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-accent px-1 text-[10px] font-bold leading-none text-white">
                {it.badge}
              </span>
            )}
          </Link>
        ))}
        {extra > 0 && extraHref && (
          <Link href={extraHref} aria-label={`+${extra}`}
            className="relative -ml-2.5 flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-paper-dim text-xs font-bold text-text hover:bg-paper-deep">
            +{extra}
          </Link>
        )}
      </div>
      {shown && <div className="mt-2">{caption(shown.id)}</div>}
      {footer}
    </div>
  );
}

function Ring({ done, color, thumb, center, centerTone }: StackItem) {
  const R = 20, C = 2 * Math.PI * R;
  const danger = centerTone === "danger";
  return (
    <span className={`relative flex h-11 w-11 items-center justify-center rounded-full ${danger ? "bg-accent-soft" : "bg-white"}`}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="22" cy="22" r={R} fill="none" stroke={danger ? "var(--color-accent)" : "var(--color-border)"} strokeWidth="3" />
        {done > 0 && (
          <circle cx="22" cy="22" r={R} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${C * Math.min(1, done)} ${C}`} />
        )}
      </svg>
      {center !== undefined ? (
        <span className={`hgv-figure relative text-sm font-bold ${danger ? "text-accent-dark" : "text-text"}`}>{center}</span>
      ) : (
        <span className="absolute inset-[5px] flex items-center justify-center overflow-hidden rounded-full bg-paper-dim">
          {thumb
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
            : <Car size={15} className="text-text-faint" />}
        </span>
      )}
    </span>
  );
}
