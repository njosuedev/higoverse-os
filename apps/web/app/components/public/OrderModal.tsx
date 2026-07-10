"use client";

import { useState } from "react";
import { X, Minus, Plus, Loader2, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { formatRwf } from "@/lib/format";
import { orderRequest, type Order } from "@/lib/order-api";
import DeliveryFields, { deliveryValid, type DeliveryValue } from "./DeliveryFields";

interface Props {
  productId: string;
  productName: string;
  productImage?: string;
  price: number;
  maxQuantity: number;
  onClose: () => void;
  onSuccess: (order: Order) => void;
}

export default function OrderModal({ productId, productName, productImage, price, maxQuantity, onClose, onSuccess }: Props) {
  const { user } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [delivery, setDelivery] = useState<DeliveryValue>({
    phone: "", address: "", lat: null, lng: null, notes: "", paymentMethod: "cash",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const total = price * quantity;
  const canSubmit = quantity > 0 && quantity <= maxQuantity && deliveryValid(delivery);

  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await orderRequest("/orders/", {
        method: "POST",
        body: JSON.stringify({
          product_id: productId,
          quantity,
          customer_name: user?.name ?? user?.email,
          delivery_phone: delivery.phone.trim(),
          delivery_address_text: delivery.address.trim(),
          delivery_lat: delivery.lat,
          delivery_lng: delivery.lng,
          delivery_notes: delivery.notes.trim() || undefined,
          payment_method: delivery.paymentMethod,
        }),
      });
      if (!res?.success) {
        setError(res?.detail || "Could not place order — please try again.");
        return;
      }
      onSuccess(res.data as Order);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Order API error: \d+ /, "") : "Could not place order — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <p className="text-sm font-bold text-slate-900">Order Now</p>
            <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100">
              <X size={15} />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
              {productImage ? (
                <img src={productImage} alt={productName} className="h-12 w-12 shrink-0 rounded-lg border border-slate-100 object-cover" />
              ) : (
                <div className="h-12 w-12 shrink-0 rounded-lg bg-slate-100" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{productName}</p>
                <p className="text-xs font-bold text-orange-600">{formatRwf(price)}</p>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Quantity</label>
              <div className="flex w-fit items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
                <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
                  <Minus size={13} />
                </button>
                <span className="w-6 text-center text-sm font-bold text-slate-800">{quantity}</span>
                <button type="button" onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))} className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
                  <Plus size={13} />
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{maxQuantity} in stock</p>
            </div>

            <DeliveryFields value={delivery} onChange={setDelivery} />

            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>

          <div className="border-t border-slate-100 px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Total</span>
              <span className="text-lg font-extrabold text-slate-900">{formatRwf(total)}</span>
            </div>
            <button
              onClick={submit}
              disabled={!canSubmit || submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
            >
              {submitting ? <><Loader2 size={15} className="animate-spin" /> Placing order…</> : <><CheckCircle2 size={15} /> Place Order</>}
            </button>
          </div>
        </div>
      </div>
  );
}
