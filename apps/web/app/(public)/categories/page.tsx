import type { Metadata } from "next";
import Link from "next/link";
import {
  Package, Smartphone, Truck, Shirt, Heart, Home as HomeIcon,
  Leaf, Building2, Briefcase, UtensilsCrossed, Boxes,
} from "lucide-react";
import { getMarketplaceCategoryCounts } from "@/lib/marketplace-public";
import { CATEGORIES } from "@/lib/categories";

export const metadata: Metadata = {
  title: "Categories",
  description: "Explore Higoverse marketplace categories — Electronics, Vehicles, Fashion, Health, Furniture, Agriculture, Construction, Business Services and more.",
  alternates: { canonical: "/categories" },
};

export const revalidate = 60;

const CATEGORY_ICONS: Record<string, typeof Package> = {
  electronics: Smartphone,
  vehicles: Truck,
  fashion: Shirt,
  health: Heart,
  furniture: HomeIcon,
  agriculture: Leaf,
  construction: Building2,
  business: Briefcase,
  food: UtensilsCrossed,
  wholesale: Boxes,
  other: Package,
};

const CATEGORY_TINTS: Record<string, string> = {
  electronics: "bg-violet-50 text-violet-600",
  vehicles: "bg-blue-50 text-blue-600",
  fashion: "bg-pink-50 text-pink-600",
  health: "bg-rose-50 text-rose-600",
  furniture: "bg-amber-50 text-amber-600",
  agriculture: "bg-emerald-50 text-emerald-600",
  construction: "bg-slate-100 text-slate-600",
  business: "bg-indigo-50 text-indigo-600",
  food: "bg-orange-50 text-orange-600",
  wholesale: "bg-cyan-50 text-cyan-600",
  other: "bg-slate-100 text-slate-500",
};

export default async function CategoriesPage() {
  const counts = await getMarketplaceCategoryCounts();

  return (
    <div className="mx-auto max-w-7xl px-2.5 py-3 sm:px-6 sm:py-8">
      <h1 className="text-lg font-bold text-slate-900 sm:text-2xl">Categories</h1>
      <p className="mt-1 text-xs text-slate-500 sm:text-sm">Browse products by category.</p>

      <div className="mt-3 grid grid-cols-3 gap-1.5 sm:mt-6 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6 lg:gap-4">
        {CATEGORIES.map((c) => {
          const Icon = CATEGORY_ICONS[c.key] ?? Package;
          return (
            <Link
              key={c.key}
              href={`/category/${c.key}`}
              className="hgv-card-hover flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white px-1.5 py-2.5 text-center shadow-sm sm:gap-2 sm:rounded-2xl sm:px-4 sm:py-5"
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-full sm:h-12 sm:w-12 sm:rounded-2xl ${CATEGORY_TINTS[c.key] ?? "bg-orange-50 text-orange-500"}`}>
                <Icon size={15} className="sm:h-6 sm:w-6" />
              </div>
              <p className="line-clamp-2 text-[10px] font-semibold leading-tight text-slate-900 sm:text-sm">{c.label}</p>
              <p className="text-[9px] text-slate-400 sm:text-xs">{counts[c.key] ?? 0} products</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
