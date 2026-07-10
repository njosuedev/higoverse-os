"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShoppingCart, Minus, Plus, Trash2, Loader2, CheckCircle2, ChevronRight, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/hooks/useCart";
import { setCartQuantity, removeFromCart, clearCart, cartTotal } from "@/lib/cart";
import { formatRwf } from "@/lib/format";
import { orderRequest } from "@/lib/order-api";
import DeliveryFields, { deliveryValid, type DeliveryValue } from "@/app/components/public/DeliveryFields";

export default function CartPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const items = useCart();

  const [checkingOut, setCheckingOut] = useState(false);
  const [delivery, setDelivery] = useState<DeliveryValue>({
    phone: "", address: "", lat: null, lng: null, notes: "", paymentMethod: "cash",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [failedItems, setFailedItems] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(false);

  const total = cartTotal(items);

  function requireLogin() {
    router.push(`/login?next=${encodeURIComponent("/cart")}`);
  }

  async function placeOrders() {
    if (!user) return requireLogin();
    if (!deliveryValid(delivery) || submitting) return;
    setSubmitting(true);
    setError("");
    const failed = new Set<string>();
    let placedAny = false;

    for (const item of items) {
      try {
        const res = await orderRequest("/orders/", {
          method: "POST",
          body: JSON.stringify({
            product_id: item.productId,
            quantity: item.quantity,
            customer_name: user.name ?? user.email,
            delivery_phone: delivery.phone.trim(),
            delivery_address_text: delivery.address.trim(),
            delivery_lat: delivery.lat,
            delivery_lng: delivery.lng,
            delivery_notes: delivery.notes.trim() || undefined,
            payment_method: delivery.paymentMethod,
          }),
        });
        if (res?.success) {
          placedAny = true;
          removeFromCart(item.productId);
        } else {
          failed.add(item.productId);
        }
      } catch {
        failed.add(item.productId);
      }
    }

    setFailedItems(failed);
    setSubmitting(false);

    if (failed.size === 0) {
      setDone(true);
    } else if (placedAny) {
      setError(`${failed.size} item${failed.size > 1 ? "s" : ""} couldn't be ordered — check stock and try again.`);
    } else {
      setError("Could not place your order — please try again.");
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
        <CheckCircle2 size={44} className="mx-auto mb-4 text-emerald-500" />
        <h1 className="text-xl font-bold text-slate-900">Order placed</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
          We&apos;ll deliver everything to the address you provided. You can track status in My Orders.
        </p>
        <Link href="/orders" className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600">
          View My Orders <ChevronRight size={14} />
        </Link>
      </div>
    );
  }

  if (!ready || items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-xl font-bold text-slate-900">Cart</h1>
        {ready && (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-16 text-center">
            <ShoppingCart size={40} className="mx-auto mb-4 text-slate-200" />
            <p className="mb-1.5 text-sm font-semibold text-slate-600">Your cart is empty</p>
            <p className="mx-auto mb-5 max-w-sm text-xs leading-relaxed text-slate-400">
              Browse products and add them to your cart to check out here.
            </p>
            <Link href="/products" className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-5 py-2 text-xs font-bold text-white transition hover:bg-orange-600">
              Browse products <ChevronRight size={13} />
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-xl font-bold text-slate-900">Cart</h1>

      <div className="space-y-3">
        {items.map((item) => {
          const failed = failedItems.has(item.productId);
          return (
            <div key={item.productId} className={`flex items-center gap-3 rounded-2xl border p-3 ${failed ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
              {item.image ? (
                <img src={item.image} alt={item.name} className="h-14 w-14 shrink-0 rounded-lg border border-slate-100 object-cover" />
              ) : (
                <div className="h-14 w-14 shrink-0 rounded-lg bg-slate-100" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                <p className="text-xs font-bold text-orange-600">{formatRwf(item.price)}</p>
                {failed && <p className="mt-0.5 text-[11px] text-red-600">Couldn&apos;t order — check stock</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-2 py-1">
                <button type="button" onClick={() => setCartQuantity(item.productId, item.quantity - 1)} className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
                  <Minus size={12} />
                </button>
                <span className="w-5 text-center text-sm font-bold text-slate-800">{item.quantity}</span>
                <button type="button" onClick={() => setCartQuantity(item.productId, item.quantity + 1)} disabled={item.quantity >= item.maxQuantity} className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-30">
                  <Plus size={12} />
                </button>
              </div>
              <button type="button" onClick={() => removeFromCart(item.productId)} className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500" title="Remove">
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
        <button type="button" onClick={clearCart} className="text-xs font-semibold text-slate-400 hover:text-red-500">
          Clear cart
        </button>
        <div className="text-right">
          <p className="text-xs font-semibold text-slate-500">Subtotal</p>
          <p className="text-lg font-extrabold text-slate-900">{formatRwf(total)}</p>
        </div>
      </div>

      {!checkingOut ? (
        <button
          onClick={() => (user ? setCheckingOut(true) : requireLogin())}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-bold text-white transition hover:bg-orange-600"
        >
          {user ? "Proceed to checkout" : "Sign in to checkout"} <ChevronRight size={15} />
        </button>
      ) : (
        <div className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-bold text-slate-900">Delivery details</p>
          <DeliveryFields value={delivery} onChange={setDelivery} />

          {error && (
            <p className="flex items-center gap-1.5 text-xs text-red-600"><AlertCircle size={13} /> {error}</p>
          )}

          <button
            onClick={placeOrders}
            disabled={!deliveryValid(delivery) || submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
          >
            {submitting ? <><Loader2 size={15} className="animate-spin" /> Placing order…</> : <><CheckCircle2 size={15} /> Place order — {formatRwf(total)}</>}
          </button>
        </div>
      )}
    </div>
  );
}
