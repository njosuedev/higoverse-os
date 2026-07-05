import Link from "next/link";
import { Store, MapPin } from "lucide-react";
import type { Shop } from "@/lib/shop-api";
import { shopSlug } from "@/lib/slug";

function isOnline(lastSeenAt: string | null) {
  if (!lastSeenAt) return false;
  const ts = lastSeenAt.endsWith("Z") || lastSeenAt.includes("+") ? lastSeenAt : `${lastSeenAt}Z`;
  return (Date.now() - new Date(ts).getTime()) / 1000 < 300;
}

export default function ShopCard({ shop, productCount = 0 }: { shop: Shop; productCount?: number }) {
  const online = isOnline(shop.last_seen_at);
  const location = (shop.address ?? "").split("|").pop()?.trim();

  return (
    <Link
      href={`/shop/${shopSlug(shop.name, shop.id)}`}
      className="hgv-card-hover flex h-full flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm"
    >
      <div className="relative">
        {shop.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shop.logo_url} alt={shop.name} className="h-16 w-16 rounded-full border border-slate-200 object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-50 text-orange-500">
            <Store size={26} />
          </div>
        )}
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${
            online ? "bg-emerald-500" : "bg-slate-300"
          }`}
        />
      </div>
      <p className="line-clamp-1 text-sm font-semibold text-slate-900">{shop.name}</p>
      {location && (
        <p className="flex items-center gap-1 text-xs text-slate-500">
          <MapPin size={11} /> <span className="line-clamp-1">{location}</span>
        </p>
      )}
      <span className="mt-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
        {productCount} products
      </span>
    </Link>
  );
}
