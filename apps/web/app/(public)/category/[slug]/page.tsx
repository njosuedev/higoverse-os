import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Package } from "lucide-react";
import { getMarketplaceFeedPage, getPublicShops, MARKETPLACE_PAGE_SIZE } from "@/lib/marketplace-public";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import InfiniteProductGrid from "@/app/components/public/InfiniteProductGrid";
import EmptyState from "@/app/components/ui/EmptyState";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const label = categoryLabel(slug);
  return {
    title: label,
    description: `Browse ${label} products from suppliers on the Higoverse marketplace.`,
    alternates: { canonical: `/category/${slug}` },
  };
}

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.key }));
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  if (!CATEGORIES.some((c) => c.key === slug)) notFound();

  const [feed, shops] = await Promise.all([
    getMarketplaceFeedPage(null, MARKETPLACE_PAGE_SIZE, { category: slug }),
    getPublicShops(),
  ]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://higoverse-os.vercel.app/" },
      { "@type": "ListItem", position: 2, name: categoryLabel(slug), item: `https://higoverse-os.vercel.app/category/${slug}` },
    ],
  };

  return (
    <div className="min-h-screen bg-slate-50">
    <div className="mx-auto max-w-7xl px-2.5 py-3 sm:px-6 sm:py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="text-lg font-bold text-slate-900 sm:text-2xl">{categoryLabel(slug)}</h1>
      {typeof feed.total === "number" && (
        <p className="mt-1 text-xs text-slate-500 sm:text-sm">{feed.total} products in this category.</p>
      )}

      <div className="mt-3 sm:mt-6">
        <InfiniteProductGrid
          initialItems={feed.items}
          initialNextCursor={feed.nextCursor}
          initialShops={shops}
          fetchParams={{ category: slug }}
          emptyState={
            <EmptyState
              icon={<Package size={30} />}
              tone="orange"
              title="No products in this category yet"
              description="Check back soon, or browse all products instead."
              actionLabel="Browse All Products"
              actionHref="/products"
              className="mt-10"
            />
          }
        />
      </div>
    </div>
    </div>
  );
}
