import { useEffect, useState } from "react";
import { getCart, subscribeCart, type CartItem } from "@/lib/cart";

/** Reactive read of the cart — re-renders on any add/update/remove/clear,
 *  in this tab or another. Starts empty on the server/first paint (avoids a
 *  hydration mismatch against localStorage) and syncs for real on mount. */
export function useCart(): CartItem[] {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(getCart());
    return subscribeCart(() => setItems(getCart()));
  }, []);

  return items;
}
