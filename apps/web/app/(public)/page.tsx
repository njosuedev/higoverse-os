import { Suspense } from "react";
import type { Metadata } from "next";
import {
  getMarketplaceFeedPage, getPublicShops, parseImages,
  MARKETPLACE_PAGE_SIZE as PAGE_SIZE,
} from "@/lib/marketplace-public";
import { productSlug } from "@/lib/slug";
import MarketplaceHome from "@/app/components/public/MarketplaceHome";

// ISR: the shell + first page of products is cached and reused for up to 60s
// across all visitors, with one background regeneration per window — this
// (not any backend response header) is what stops every homepage visit from
// hitting the database. 60s matches the client-side SSE-fallback poll cadence
// already used once the page is open, so "at most ~1 minute stale" is a
// single consistent mental model from any angle.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Higoverse Marketplace — Buy from Verified Shops in Rwanda",
    description: "Browse products from verified shops across Rwanda on Higoverse. Electronics, fashion, food, furniture, agriculture, and more — updated daily.",
    alternates: { canonical: "/" },
    openGraph: {
      title: "Higoverse Marketplace",
      description: "Browse products from verified shops across Rwanda.",
      url: "https://higoverse-os.vercel.app",
      siteName: "Higoverse",
      type: "website",
      images: [{ url: "/higoverse.png", width: 1200, height: 630, alt: "Higoverse Marketplace" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Higoverse Marketplace",
      description: "Browse products from verified shops across Rwanda.",
      images: ["/higoverse.png"],
    },
  };
}

export default async function MarketplacePage() {
  // Server-rendered first page — real HTML for fast first paint and
  // crawlability, before any client JS runs. Infinite scroll beyond this
  // continues client-side (see MarketplaceHome).
  const [firstPage, shops] = await Promise.all([
    getMarketplaceFeedPage(null, PAGE_SIZE),
    getPublicShops(),
  ]);

  // ItemList JSON-LD scoped to just the SSR'd first page — the correct,
  // Google-recommended pattern for a paginated/infinite-scroll listing (a
  // full-catalog ItemList here would be misleading, since the list isn't
  // the complete or stable set).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: firstPage.items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `https://higoverse-os.vercel.app/product/${productSlug(item.name, item.id)}`,
      item: {
        "@type": "Product",
        name: item.name,
        image: parseImages(item.images)[0],
        offers: {
          "@type": "Offer",
          price: item.selling_price,
          priceCurrency: "RWF",
        },
      },
    })),
  };

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Suspense fallback={null}>
        <MarketplaceHome initialFeed={firstPage} initialShops={shops} />
      </Suspense>
    </>
  );
}
