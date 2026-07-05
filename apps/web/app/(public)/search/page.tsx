import type { Metadata } from "next";
import { Search as SearchIcon } from "lucide-react";
import { getPublicProducts, getPublicShops } from "@/lib/marketplace-public";
import { categoryLabel } from "@/lib/categories";
import ProductCard from "@/app/components/public/ProductCard";
import ShopCard from "@/app/components/public/ShopCard";
import EmptyState from "@/app/components/ui/EmptyState";
import SearchBox from "@/app/components/public/SearchBox";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: true },
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string }> }) {
  const { q = "", cat = "" } = await searchParams;
  const query = q.trim().toLowerCase();

  const [products, shops] = await Promise.all([getPublicProducts(), getPublicShops()]);
  const shopMap = new Map(shops.map((s) => [s.id, s]));
  const counts = new Map<string, number>();
  for (const p of products) counts.set(p.shopId, (counts.get(p.shopId) ?? 0) + 1);

  const byCategory = cat ? products.filter((p) => p.category === cat) : products;
  const matchedProducts = query
    ? byCategory.filter((p) => p.name.toLowerCase().includes(query) || (p.description ?? "").toLowerCase().includes(query))
    : cat ? byCategory : [];
  const matchedShops = query && !cat
    ? shops.filter((s) => (s.name ?? "").toLowerCase().includes(query) || (s.address ?? "").toLowerCase().includes(query))
    : [];

  return (
    <div className="min-h-screen bg-slate-50">
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">
        {cat ? `Search in ${categoryLabel(cat)}` : "Search"}
      </h1>
      <div className="mt-4 max-w-xl">
        <SearchBox defaultValue={q} />
      </div>

      {!query && !cat ? (
        <p className="mt-8 text-sm text-slate-400">Search for products, suppliers, or categories.</p>
      ) : matchedProducts.length === 0 && matchedShops.length === 0 ? (
        <EmptyState
          icon={<SearchIcon size={30} />}
          tone="orange"
          title={q ? `No results for "${q}"` : `No products in ${categoryLabel(cat)}`}
          description="Try a different search term, or browse all products instead."
          actionLabel="Browse All Products"
          actionHref="/products"
          className="mt-10"
        />
      ) : (
        <>
          {matchedShops.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-4 text-lg font-bold text-slate-900">Shops ({matchedShops.length})</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {matchedShops.map((s) => (
                  <ShopCard key={s.id} shop={s} productCount={counts.get(s.id) ?? 0} />
                ))}
              </div>
            </section>
          )}
          {matchedProducts.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-4 text-lg font-bold text-slate-900">Products ({matchedProducts.length})</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                {matchedProducts.map((p) => (
                  <ProductCard key={p.id} product={p} shop={shopMap.get(p.shopId)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
    </div>
  );
}
