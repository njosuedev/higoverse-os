import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
  getPublicProductBySlug, getPublicProductsByCategory,
  getPublicProducts, findProductBySlug,
} from "@/lib/marketplace-public";
import { categoryLabel } from "@/lib/categories";
import { formatRwf } from "@/lib/format";
import ProductActions from "@/app/components/public/ProductActions";
import ProductGallery from "@/app/components/public/ProductGallery";
import ProductTabs from "@/app/components/public/ProductTabs";
import RelatedCarousel from "@/app/components/public/RelatedCarousel";

interface Props {
  params: Promise<{ slug: string }>;
}

async function loadData(slug: string) {
  // Targeted lookup — a single product + a bounded related list, instead of
  // downloading the entire (base64-image-laden) catalog just to find one
  // product by slug.
  let product = await getPublicProductBySlug(slug);
  // Fall back to the full-catalog scan only if the fast path comes up empty —
  // covers the deploy window before the backend's /marketplace/by-id route
  // ships. Once it's live everywhere this branch never runs.
  if (!product) {
    const products = await getPublicProducts();
    product = findProductBySlug(products, slug) ?? null;
  }
  if (!product) return null;

  const related = await getPublicProductsByCategory(product.category, product.id, 10);
  return { product, related };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadData(slug);
  if (!data) return { title: "Product not found" };
  const { product } = data;
  const title = `${product.name} — ${formatRwf(product.price)}`;
  const description = product.description?.slice(0, 160) || `${product.name} available on Higoverse.`;
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
  const { product, related } = data;

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
      seller: { "@type": "Organization", name: "Higoverse" },
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
    <div className="mx-auto max-w-6xl px-2.5 py-3 sm:px-6 sm:py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <nav className="mb-2.5 flex items-center gap-1.5 text-[11px] text-slate-500 sm:mb-4 sm:text-xs">
        <Link href="/" className="hover:text-orange-600">Home</Link>
        <ChevronRight size={11} />
        <Link href={`/category/${product.category}`} className="hover:text-orange-600">{categoryLabel(product.category)}</Link>
        <ChevronRight size={11} />
        <span className="line-clamp-1 text-slate-700">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-8">
        <ProductGallery images={product.images} alt={product.name} />

        <div>
          <span className="mb-1.5 inline-block rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-600 sm:mb-2">
            {categoryLabel(product.category)}
          </span>
          <h1 className="text-lg font-bold text-slate-900 sm:text-2xl">{product.name}</h1>
          <p className="mt-1.5 text-2xl font-bold text-orange-600 sm:mt-2 sm:text-3xl">{formatRwf(product.price)}</p>
          <p className={`mt-1 text-sm font-medium ${product.quantity > 0 ? "text-emerald-600" : "text-red-500"}`}>
            {product.quantity > 0 ? `${product.quantity} in stock` : "Out of stock"}
          </p>

          <div className="mt-3 sm:mt-6">
            <ProductActions
              productId={product.id}
              productName={product.name}
              productImage={product.images[0]}
              price={product.price}
              quantity={product.quantity}
            />
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-6 sm:mt-12">
          <h2 className="mb-2.5 text-base font-bold text-slate-900 sm:mb-4 sm:text-lg">Other recommendations for your business</h2>
          <RelatedCarousel products={related} />
        </section>
      )}

      <ProductTabs product={product} />
    </div>
  );
}
