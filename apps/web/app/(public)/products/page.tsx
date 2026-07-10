import type { Metadata } from "next";
import { Package } from "lucide-react";
import { getMarketplaceFeedPage, getPublicShops, MARKETPLACE_PAGE_SIZE } from "@/lib/marketplace-public";
import InfiniteProductGrid from "@/app/components/public/InfiniteProductGrid";
import EmptyState from "@/app/components/ui/EmptyState";

export const metadata: Metadata = {
  title: "All Products",
  description: "Browse every product listed on the Higoverse marketplace — from electronics to agriculture, fashion to furniture.",
  alternates: { canonical: "/products" },
};

export const revalidate = 60;

export default async function ProductsPage() {
  const [feed, shops] = await Promise.all([
    getMarketplaceFeedPage(null, MARKETPLACE_PAGE_SIZE),
    getPublicShops(),
  ]);

  return (
    <div className="min-h-screen bg-slate-50">
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">All Products</h1>
      {typeof feed.total === "number" && (
        <p className="mt-1 text-sm text-slate-500">{feed.total} products available on Higoverse.</p>
      )}

      <div className="mt-6">
        <InfiniteProductGrid
          initialItems={feed.items}
          initialNextCursor={feed.nextCursor}
          initialShops={shops}
          emptyState={
            <EmptyState
              icon={<Package size={30} />}
              tone="orange"
              title="No products yet"
              description="Check back soon — new products are added regularly."
              actionLabel="Back to Home"
              actionHref="/"
              className="mt-10"
            />
          }
        />
      </div>
    </div>
    </div>
  );
}
