import type { Metadata } from "next";
import Link from "next/link";
import { Package } from "lucide-react";
import { getPublicProducts, getPublicShops } from "@/lib/marketplace-public";
import ProductCard from "@/app/components/public/ProductCard";
import EmptyState from "@/app/components/ui/EmptyState";

export const metadata: Metadata = {
  title: "All Products",
  description: "Browse every product listed on the Higoverse marketplace — from electronics to agriculture, fashion to furniture.",
};

const PAGE_SIZE = 24;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const [products, shops] = await Promise.all([getPublicProducts(), getPublicShops()]);
  const shopMap = new Map(shops.map((s) => [s.id, s]));
  const sorted = [...products].sort((a, b) => b.id.localeCompare(a.id));
  const start = (page - 1) * PAGE_SIZE;
  const visible = sorted.slice(start, start + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-slate-50">
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">All Products</h1>
      <p className="mt-1 text-sm text-slate-500">{products.length} products from shops across Higoverse.</p>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Package size={30} />}
          tone="orange"
          title="No products yet"
          description="Shops are getting set up — check back soon, or explore suppliers already on Higoverse."
          actionLabel="Browse Suppliers"
          actionHref="/suppliers"
          className="mt-10"
        />
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {visible.map((p) => (
              <ProductCard key={p.id} product={p} shop={shopMap.get(p.shopId)} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <Link
                  key={n}
                  href={n === 1 ? "/products" : `/products?page=${n}`}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold ${
                    n === page ? "bg-orange-500 text-white" : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {n}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
    </div>
  );
}
