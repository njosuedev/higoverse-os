"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import type { PublicProduct } from "@/lib/marketplace-public";
import { categoryLabel } from "@/lib/categories";
import { formatRwf } from "@/lib/format";

const TABS = ["Attributes", "Reviews", "Description"] as const;
type Tab = (typeof TABS)[number];

function AttributeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-2 text-sm">
      <span className="border-r border-slate-100 bg-slate-50 px-4 py-3 text-slate-500">{label}</span>
      <span className="px-4 py-3 font-semibold text-slate-800">{value}</span>
    </div>
  );
}

export default function ProductTabs({ product }: { product: PublicProduct }) {
  const [active, setActive] = useState<Tab>("Attributes");

  return (
    <section className="mt-6 sm:mt-12">
      <div className="flex gap-4 border-b border-slate-200 sm:gap-6">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActive(tab)}
            className={`border-b-2 px-1 pb-2 text-xs font-semibold transition sm:pb-3 sm:text-sm ${
              active === tab ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="py-4 sm:py-6">
        {active === "Attributes" && (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="divide-y divide-slate-100">
              <AttributeRow label="Category" value={categoryLabel(product.category)} />
              <AttributeRow label="Price" value={formatRwf(product.price)} />
              <AttributeRow label="Availability" value={product.quantity > 0 ? `${product.quantity} in stock` : "Out of stock"} />
            </div>
          </div>
        )}

        {active === "Reviews" && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-slate-400">
            <Star size={28} />
            <p className="text-sm font-medium text-slate-500">No reviews yet</p>
            <p className="max-w-sm text-xs">Be the first to order this product and share your experience.</p>
          </div>
        )}

        {active === "Description" && (
          product.description ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{product.description}</p>
          ) : (
            <p className="text-sm text-slate-400">No description provided.</p>
          )
        )}
      </div>
    </section>
  );
}
