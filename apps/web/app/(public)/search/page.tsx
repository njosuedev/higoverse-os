import type { Metadata } from "next";
import { Search as SearchIcon } from "lucide-react";
import { getMarketplaceFeedPage, getPublicShops, MARKETPLACE_PAGE_SIZE } from "@/lib/marketplace-public";
import { categoryLabel } from "@/lib/categories";
import InfiniteProductGrid from "@/app/components/public/InfiniteProductGrid";
import EmptyState from "@/app/components/ui/EmptyState";
import SearchBox from "@/app/components/public/SearchBox";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: true },
};

export const revalidate = 60;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string }> }) {
  const { q = "", cat = "" } = await searchParams;
  const query = q.trim();
  const hasQuery = query.length > 0;
  const hasSearch = hasQuery || !!cat;

  const [feed, shops] = await Promise.all([
    hasSearch
      ? getMarketplaceFeedPage(null, MARKETPLACE_PAGE_SIZE, { category: cat || undefined, q: hasQuery ? query : undefined })
      : Promise.resolve({ items: [], nextCursor: null }),
    getPublicShops(),
  ]);

  const noResults = hasSearch && feed.items.length === 0;

  return (
    <div className="min-h-screen bg-slate-50">
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">
        {cat ? `Search in ${categoryLabel(cat)}` : "Search"}
      </h1>
      <div className="mt-4 max-w-xl">
        <SearchBox defaultValue={q} />
      </div>

      {!hasSearch ? (
        <p className="mt-8 text-sm text-slate-400">Search for products or categories.</p>
      ) : noResults ? (
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
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Products</h2>
          <InfiniteProductGrid
            initialItems={feed.items}
            initialNextCursor={feed.nextCursor}
            initialShops={shops}
            fetchParams={{ category: cat || undefined, q: hasQuery ? query : undefined }}
            emptyState={<p className="py-8 text-sm text-slate-400">No matching products.</p>}
          />
        </section>
      )}
    </div>
    </div>
  );
}
