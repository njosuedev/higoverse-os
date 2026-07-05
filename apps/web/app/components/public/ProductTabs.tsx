"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin, Phone, Star } from "lucide-react";
import type { PublicProduct } from "@/lib/marketplace-public";
import type { Shop } from "@/lib/shop-api";
import { categoryLabel } from "@/lib/categories";
import { formatRwf } from "@/lib/format";
import { shopSlug } from "@/lib/slug";

const TABS = ["Attributes", "Reviews", "Supplier", "Description"] as const;
type Tab = (typeof TABS)[number];

function AttributeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-2 text-sm">
      <span className="border-r border-slate-100 bg-slate-50 px-4 py-3 text-slate-500">{label}</span>
      <span className="px-4 py-3 font-semibold text-slate-800">{value}</span>
    </div>
  );
}

export default function ProductTabs({ product, shop }: { product: PublicProduct; shop?: Shop }) {
  const [active, setActive] = useState<Tab>("Attributes");

  return (
    <section className="mt-12">
      <div className="flex gap-6 border-b border-slate-200">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActive(tab)}
            className={`border-b-2 px-1 pb-3 text-sm font-semibold transition ${
              active === tab ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="py-6">
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
            <p className="max-w-sm text-xs">Be the first to order from this supplier and share your experience.</p>
          </div>
        )}

        {active === "Supplier" && (
          shop ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <Link href={`/shop/${shopSlug(shop.name, shop.id)}`} className="flex items-center gap-3">
                {shop.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shop.logo_url} alt={shop.name} className="h-12 w-12 rounded-full border border-slate-200 object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-base font-bold text-orange-600">
                    {shop.name[0]?.toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-slate-900 hover:text-orange-600">{shop.name}</p>
                  <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                    {shop.address && (
                      <p className="flex items-center gap-1.5">
                        <MapPin size={12} /> {shop.address.split("|").pop()?.trim()}
                      </p>
                    )}
                    {shop.phone && (
                      <p className="flex items-center gap-1.5">
                        <Phone size={12} /> {shop.phone}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
              <Link
                href={`/shop/${shopSlug(shop.name, shop.id)}`}
                className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-orange-200 px-4 py-2 text-xs font-bold text-orange-600 transition hover:bg-orange-50"
              >
                Visit Store
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Supplier information unavailable.</p>
          )
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
