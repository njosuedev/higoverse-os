import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { getMarketplaceCategoryCounts } from "@/lib/marketplace-public";
import { CATEGORIES } from "@/lib/categories";

export const metadata: Metadata = {
  title: "Categories",
  description: "Explore Higoverse marketplace categories — Electronics, Vehicles, Fashion, Health, Furniture, Agriculture, Construction, Business Services and more.",
  alternates: { canonical: "/categories" },
};

export const revalidate = 60;

export default async function CategoriesPage() {
  const counts = await getMarketplaceCategoryCounts();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Categories</h1>
      <p className="mt-1 text-sm text-slate-500">Browse products by category.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {CATEGORIES.map((c) => (
          <Link
            key={c.key}
            href={`/category/${c.key}`}
            className="hgv-card-hover flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
              <LayoutGrid size={26} />
            </div>
            <p className="text-sm font-semibold text-slate-900">{c.label}</p>
            <p className="text-xs text-slate-400">{counts[c.key] ?? 0} products</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
