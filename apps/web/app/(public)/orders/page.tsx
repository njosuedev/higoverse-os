"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Package, Loader2, MapPin, Phone, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { orderRequest, type Order, type OrderStatus } from "@/lib/order-api";
import { formatRwf } from "@/lib/format";

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_TINT: Record<OrderStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  confirmed: "bg-blue-50 text-blue-700",
  out_for_delivery: "bg-violet-50 text-violet-700",
  delivered: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
};

export default function OrdersPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) { router.replace(`/login?next=${encodeURIComponent("/orders")}`); return; }
    orderRequest("/orders/mine").then((res) => setOrders(res?.data?.items ?? []));
  }, [ready, user, router]);

  if (!ready || !user || orders === null) {
    return (
      <div className="mx-auto flex max-w-3xl items-center justify-center px-4 py-24">
        <Loader2 size={20} className="animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-xl font-bold text-slate-900">My Orders</h1>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-16 text-center">
          <Package size={40} className="mx-auto mb-4 text-slate-200" />
          <p className="mb-1.5 text-sm font-semibold text-slate-600">No orders yet</p>
          <p className="mx-auto mb-5 max-w-sm text-xs leading-relaxed text-slate-400">
            Browse products and place an order — it'll show up here.
          </p>
          <Link href="/products" className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-5 py-2 text-xs font-bold text-white transition hover:bg-orange-600">
            Browse products <ChevronRight size={13} />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                {o.product_image ? (
                  <img src={o.product_image} alt={o.product_name ?? ""} className="h-14 w-14 shrink-0 rounded-lg border border-slate-100 object-cover" />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                    <Package size={20} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-800">{o.product_name ?? "Product"}</p>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_TINT[o.status]}`}>
                      {STATUS_LABEL[o.status]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">Qty {o.quantity} · {formatRwf(o.total_amount)}</p>
                  <p className="mt-1.5 flex items-center gap-1.5 truncate text-[11px] text-slate-400">
                    <MapPin size={11} className="shrink-0" /> {o.delivery_address_text}
                  </p>
                  <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <Phone size={11} className="shrink-0" /> {o.delivery_phone}
                  </p>
                  <p className="mt-1.5 text-[10px] text-slate-300">
                    Placed {new Date(o.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
