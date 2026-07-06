import type { Metadata } from "next";
import { Store } from "lucide-react";
import { getMarketplaceShopCounts, getPublicShops } from "@/lib/marketplace-public";
import ShopCard from "@/app/components/public/ShopCard";
import EmptyState from "@/app/components/ui/EmptyState";

export const metadata: Metadata = {
  title: "Suppliers",
  description: "Browse verified suppliers and shops on the Higoverse marketplace.",
  alternates: { canonical: "/suppliers" },
};

export const revalidate = 60;

export default async function SuppliersPage() {
  const shops = await getPublicShops();
  const counts = await getMarketplaceShopCounts(shops.map((s) => s.id));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Suppliers</h1>
      <p className="mt-1 text-sm text-slate-500">{shops.length} shops registered on Higoverse.</p>

      {shops.length === 0 ? (
        <EmptyState
          icon={<Store size={30} />}
          tone="orange"
          title="No suppliers yet"
          description="Be the first business to list your shop on Higoverse."
          actionLabel="Create a Shop"
          actionHref="/register"
          className="mt-10"
        />
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {shops.map((s) => (
            <ShopCard key={s.id} shop={s} productCount={counts[s.id] ?? 0} />
          ))}
        </div>
      )}
    </div>
  );
}
