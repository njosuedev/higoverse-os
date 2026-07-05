import Link from "next/link";
import { Package, BadgeCheck, Camera } from "lucide-react";
import { formatRwf } from "@/lib/format";
import type { PublicProduct } from "@/lib/marketplace-public";
import type { Shop } from "@/lib/shop-api";

function shopTenureLabel(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const raw = createdAt.endsWith("Z") || createdAt.includes("+") ? createdAt : createdAt + "Z";
  const years = (Date.now() - new Date(raw).getTime()) / (365.25 * 24 * 3600 * 1000);
  if (years < 1) return "New";
  return `${Math.floor(years)} yr${Math.floor(years) === 1 ? "" : "s"}`;
}

export default function ProductCard({ product, shop, shopName }: { product: PublicProduct; shop?: Shop; shopName?: string }) {
  const image = product.images[0];
  const outOfStock = product.quantity <= 0;
  const tenure = shop ? shopTenureLabel(shop.created_at) : null;
  const name = shopName ?? shop?.name;

  return (
    <Link
      href={`/product/${product.slug}`}
      className="hgv-card-hover group flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-slate-50">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={product.name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <Package size={32} />
          </div>
        )}
        {outOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs font-bold text-slate-500">
            Out of stock
          </div>
        )}
        {image && (
          <span className="absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow">
            <Camera size={12} />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <p className="line-clamp-2 min-h-[2.4em] text-xs leading-snug text-slate-700">{product.name}</p>
        <p className="text-base font-extrabold text-slate-900">{formatRwf(product.price)}</p>
        {name && (
          <p className="truncate text-[10px] text-slate-400">{name}</p>
        )}
        <div className="mt-auto flex items-center gap-1 pt-1 text-[10px] font-semibold text-emerald-600">
          <BadgeCheck size={11} /> Verified
          {tenure && <span className="font-normal text-slate-400">· {tenure}</span>}
        </div>
      </div>
    </Link>
  );
}
