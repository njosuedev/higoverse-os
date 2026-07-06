import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, MapPin, Phone } from "lucide-react";
import {
  getPublicProductBySlug, getPublicProductsByCategory, getPublicShops,
  getPublicProducts, findProductBySlug,
} from "@/lib/marketplace-public";
import { categoryLabel } from "@/lib/categories";
import { formatRwf } from "@/lib/format";
import { shopSlug } from "@/lib/slug";
import ProductActions from "@/app/components/public/ProductActions";
import ProductGallery from "@/app/components/public/ProductGallery";
import ProductTabs from "@/app/components/public/ProductTabs";
import RelatedCarousel from "@/app/components/public/RelatedCarousel";

interface Props {
  params: Promise<{ slug: string }>;
}

async function loadData(slug: string) {
  // Targeted lookups — a single product + its shop + a bounded related list,
  // instead of downloading the entire (base64-image-laden) catalog just to
  // find one product by slug.
  let product = await getPublicProductBySlug(slug);
  // Fall back to the full-catalog scan only if the fast path comes up empty —
  // covers the deploy window before the backend's /marketplace/by-id route
  // ships. Once it's live everywhere this branch never runs.
  if (!product) {
    const products = await getPublicProducts();
    product = findProductBySlug(products, slug) ?? null;
  }
  if (!product) return null;

  const [shops, related] = await Promise.all([
    getPublicShops(),
    getPublicProductsByCategory(product.category, product.id, 10),
  ]);
  const shop = shops.find((s) => s.id === product.shopId);
  return { product, shop, related };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadData(slug);
  if (!data) return { title: "Product not found" };
  const { product, shop } = data;
  const title = `${product.name} — ${formatRwf(product.price)}`;
  const description = product.description?.slice(0, 160) || `${product.name} available from ${shop?.name ?? "a Higoverse supplier"} on the Higoverse marketplace.`;
  const image = product.images[0];

  return {
    title,
    description,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const data = await loadData(slug);
  if (!data) notFound();
  const { product, shop, related } = data;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.images,
    category: categoryLabel(product.category),
    offers: {
      "@type": "Offer",
      price: product.price,
      priceCurrency: "RWF",
      availability: product.quantity > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: shop ? { "@type": "Organization", name: shop.name } : undefined,
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://higoverse-os.vercel.app/" },
      { "@type": "ListItem", position: 2, name: categoryLabel(product.category), item: `https://higoverse-os.vercel.app/category/${product.category}` },
      { "@type": "ListItem", position: 3, name: product.name, item: `https://higoverse-os.vercel.app/product/${product.slug}` },
    ],
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <nav className="mb-4 flex items-center gap-1.5 text-xs text-slate-500">
        <Link href="/" className="hover:text-orange-600">Home</Link>
        <ChevronRight size={12} />
        <Link href={`/category/${product.category}`} className="hover:text-orange-600">{categoryLabel(product.category)}</Link>
        <ChevronRight size={12} />
        <span className="line-clamp-1 text-slate-700">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <ProductGallery images={product.images} alt={product.name} />

        <div>
          <span className="mb-2 inline-block rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-600">
            {categoryLabel(product.category)}
          </span>
          <h1 className="text-2xl font-bold text-slate-900">{product.name}</h1>
          <p className="mt-2 text-3xl font-bold text-orange-600">{formatRwf(product.price)}</p>
          <p className={`mt-1 text-sm font-medium ${product.quantity > 0 ? "text-emerald-600" : "text-red-500"}`}>
            {product.quantity > 0 ? `${product.quantity} in stock` : "Out of stock"}
          </p>

          {shop && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sold by</p>
              <Link href={`/shop/${shopSlug(shop.name, shop.id)}`} className="mt-1 flex items-center gap-3">
                {shop.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shop.logo_url} alt={shop.name} className="h-10 w-10 rounded-full border border-slate-200 object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-600">
                    {shop.name[0]?.toUpperCase()}
                  </div>
                )}
                <span className="text-sm font-semibold text-slate-900 hover:text-orange-600">{shop.name}</span>
              </Link>
              <div className="mt-2 space-y-1 text-xs text-slate-500">
                {shop.address && (
                  <p className="flex items-center gap-1.5">
                    <MapPin size={12} /> {shop.address.split("|").pop()?.trim()}
                  </p>
                )}
                {shop.phone && (
                  <p className="flex items-center gap-1.5">
                    <Phone size={12} /> {shop.phone}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="mt-6">
            <ProductActions
              productId={product.id}
              productName={product.name}
              productImage={product.images[0]}
              price={product.price}
              shopId={product.shopId}
              shopName={shop?.name ?? "Shop"}
            />
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Other recommendations for your business</h2>
          <RelatedCarousel products={related} shop={shop} />
        </section>
      )}

      <ProductTabs product={product} shop={shop} />
    </div>
  );
}
