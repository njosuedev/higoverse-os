import type { Metadata } from "next";
import { getPublicProducts, getPublicShops, findShopBySlugOrId } from "@/lib/marketplace-public";
import ShopDetailClient from "./ShopDetailClient";

interface Props {
  params: Promise<{ shopId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shopId } = await params;
  const shops = await getPublicShops();
  const shop = findShopBySlugOrId(shops, shopId);
  if (!shop) return { title: "Shop not found" };

  const location = shop.address?.split("|").pop()?.trim();
  const description = shop.description?.slice(0, 160) || `${shop.name} is a verified shop on the Higoverse marketplace${location ? ` in ${location}` : ""}.`;

  return {
    title: shop.name,
    description,
    alternates: { canonical: `/shop/${shopId}` },
    openGraph: {
      title: shop.name,
      description,
      type: "website",
      images: shop.logo_url ? [{ url: shop.logo_url }] : undefined,
    },
  };
}

export default async function ShopPage({ params }: Props) {
  const { shopId } = await params;
  const [shops, products] = await Promise.all([getPublicShops(), getPublicProducts()]);
  const shop = findShopBySlugOrId(shops, shopId);

  const jsonLd = shop
    ? {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        name: shop.name,
        description: shop.description,
        image: shop.logo_url,
        telephone: shop.phone,
        address: shop.address?.split("|").pop()?.trim(),
        makesOffer: products
          .filter((p) => p.shopId === shop.id)
          .slice(0, 20)
          .map((p) => ({ "@type": "Offer", itemOffered: { "@type": "Product", name: p.name }, price: p.price, priceCurrency: "RWF" })),
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <ShopDetailClient />
    </>
  );
}
