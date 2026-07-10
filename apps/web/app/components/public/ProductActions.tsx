"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShoppingCart, ShoppingBag, Check, CheckCircle2, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import Button from "@/app/components/ui/Button";
import OrderModal from "./OrderModal";
import { addToCart } from "@/lib/cart";
import type { Order } from "@/lib/order-api";

interface Props {
  productId: string;
  productName: string;
  productImage?: string;
  price: number;
  quantity: number;
}

export default function ProductActions({ productId, productName, productImage, price, quantity }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const [showOrder, setShowOrder] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);
  const [added, setAdded] = useState(false);

  const nextPath = `/product/${productId}`;
  const outOfStock = quantity <= 0;

  function requireLogin() {
    router.push(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  function openOrder() {
    if (!user) return requireLogin();
    setShowOrder(true);
  }

  function handleAddToCart() {
    addToCart({ productId, name: productName, image: productImage, price, maxQuantity: quantity });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  if (placedOrder) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-800">
          <CheckCircle2 size={16} /> Order placed
        </p>
        <p className="text-xs text-emerald-700">We&apos;ll deliver it to the address you provided. You can track its status in My Orders.</p>
        <Link href="/orders" className="mt-1 flex w-fit items-center gap-1 text-xs font-bold text-emerald-800 hover:text-emerald-900">
          View My Orders <ArrowRight size={12} />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" tone="orange" leftIcon={<ShoppingBag size={16} />} onClick={openOrder} disabled={outOfStock}>
          {outOfStock ? "Out of stock" : "Order Now"}
        </Button>
        <Button
          variant="secondary"
          tone="orange"
          leftIcon={added ? <Check size={16} /> : <ShoppingCart size={16} />}
          onClick={handleAddToCart}
          disabled={outOfStock}
        >
          {added ? "Added" : "Add to Cart"}
        </Button>
      </div>
      {!user && <p className="text-xs text-slate-400">Sign in to place an order.</p>}
      {added && (
        <p className="text-xs text-emerald-600">
          Added to cart — <Link href="/cart" className="font-semibold underline hover:text-emerald-700">view cart</Link>
        </p>
      )}

      {showOrder && (
        <OrderModal
          productId={productId}
          productName={productName}
          productImage={productImage}
          price={price}
          maxQuantity={quantity}
          onClose={() => setShowOrder(false)}
          onSuccess={(order) => { setShowOrder(false); setPlacedOrder(order); }}
        />
      )}
    </div>
  );
}
