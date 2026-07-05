import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Package } from "lucide-react";
import { getPublicProducts, getPublicShops } from "@/lib/marketplace-public";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import ProductCard from "@/app/components/public/ProductCard";
import EmptyState from "@/app/components/ui/EmptyState";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const label = categoryLabel(slug);
  return {
    title: label,
    description: `Browse ${label} products from suppliers on the Higoverse marketplace.`,
  };
}

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.key }));
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  if (!CATEGORIES.some((c) => c.key === slug)) notFound();

  const [products, shops] = await Promise.all([getPublicProducts(), getPublicShops()]);
  const shopMap = new Map(shops.map((s) => [s.id, s]));
  const filtered = products.filter((p) => p.category === slug);

  return (
    <div className="min-h-screen bg-slate-50">
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">{categoryLabel(slug)}</h1>
      <p className="mt-1 text-sm text-slate-500">{filtered.length} products in this category.</p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Package size={30} />}
          tone="orange"
          title="No products in this category yet"
          description="Check back soon, or browse all products instead."
          actionLabel="Browse All Products"
          actionHref="/products"
          className="mt-10"
        />
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} shop={shopMap.get(p.shopId)} />
          ))}
        </div>
      )}
    </div>
    </div>
  );
}
