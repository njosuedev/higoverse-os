"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, MessageSquare, ShoppingCart, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useShop } from "@/lib/shop-context";
import { followShop, unfollowShop, isFollowingShop } from "@/lib/product-meta";
import { createOrGetConversation } from "@/lib/messages-api";
import { formatRwf } from "@/lib/format";
import Button from "@/app/components/ui/Button";

interface Props {
  productId: string;
  productName: string;
  productImage?: string;
  price: number;
  shopId: string;
  shopName: string;
}

export default function ProductActions({ productId, productName, productImage, price, shopId, shopName }: Props) {
  const { user } = useAuth();
  const { shop } = useShop();
  const router = useRouter();
  const [following, setFollowing] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setFollowing(isFollowingShop(shopId));
  }, [shopId]);

  const nextPath = `/product/${productId}`;

  function requireLogin() {
    router.push(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  function toggleFollow() {
    if (!user) return requireLogin();
    if (following) {
      unfollowShop(shopId);
      setFollowing(false);
    } else {
      followShop(shopId, shopName);
      setFollowing(true);
    }
  }

  async function startOrder() {
    if (!user) return requireLogin();
    setOrdering(true);
    setError("");
    try {
      const conv = await createOrGetConversation({
        shop_id: shopId,
        shop_name: shopName,
        customer_name: shop?.name ?? user.name ?? user.email,
        product_id: productId,
        product_name: productName,
        product_image: productImage,
        listed_price: price,
        first_message: [
          `🛒 I'd like to order:`,
          `• ${productName} — ${formatRwf(price)} each`,
          ``,
          `Please confirm availability and arrange delivery.`,
        ].join("\n"),
      });
      router.push(`/messages?conv=${conv.id}`);
    } catch {
      setError("Could not open chat — please try again.");
    } finally {
      setOrdering(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" tone="orange" leftIcon={<ShoppingCart size={16} />} onClick={startOrder} disabled={ordering}>
          {ordering ? <Loader2 size={16} className="animate-spin" /> : "Start Order"}
        </Button>
        <Button variant="secondary" tone="orange" leftIcon={<MessageSquare size={16} />} onClick={startOrder} disabled={ordering}>
          Contact Supplier
        </Button>
        <Button
          variant={following ? "primary" : "ghost"}
          tone="orange"
          leftIcon={<Heart size={16} fill={following ? "currentColor" : "none"} />}
          onClick={toggleFollow}
        >
          {following ? "Following" : "Follow Shop"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!user && <p className="text-xs text-slate-400">Sign in to contact the supplier or place an order.</p>}
    </div>
  );
}
