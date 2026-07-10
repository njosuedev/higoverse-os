/** Client-side shopping cart — persisted to localStorage so it survives
 *  reloads. Checkout submits one order per line item via the existing
 *  single-product /orders endpoint (the order-service has no multi-item
 *  order concept), so the cart itself never talks to the backend. */

const CART_KEY = "hgv_cart";
const CART_EVENT = "hgv-cart-change";

export interface CartItem {
  productId: string;
  name: string;
  image?: string;
  price: number;
  quantity: number;
  maxQuantity: number;
}

function readCart(): CartItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeCart(items: CartItem[]): void {
  try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch { /* quota */ }
  window.dispatchEvent(new Event(CART_EVENT));
}

export function getCart(): CartItem[] {
  return readCart();
}

export function addToCart(item: { productId: string; name: string; image?: string; price: number; maxQuantity: number; quantity?: number }): void {
  const items = readCart();
  const add = Math.max(1, item.quantity ?? 1);
  const existing = items.find((i) => i.productId === item.productId);
  if (existing) {
    existing.quantity = Math.min(existing.maxQuantity, existing.quantity + add);
  } else {
    items.push({
      productId: item.productId,
      name: item.name,
      image: item.image,
      price: item.price,
      maxQuantity: item.maxQuantity,
      quantity: Math.min(item.maxQuantity, add),
    });
  }
  writeCart(items);
}

export function setCartQuantity(productId: string, quantity: number): void {
  const items = readCart();
  const item = items.find((i) => i.productId === productId);
  if (!item) return;
  if (quantity <= 0) {
    writeCart(items.filter((i) => i.productId !== productId));
    return;
  }
  item.quantity = Math.min(item.maxQuantity, quantity);
  writeCart(items);
}

export function removeFromCart(productId: string): void {
  writeCart(readCart().filter((i) => i.productId !== productId));
}

export function clearCart(): void {
  writeCart([]);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((n, i) => n + i.quantity, 0);
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((n, i) => n + i.quantity * i.price, 0);
}

/** Fires on every same-tab mutation (custom event) and cross-tab mutation
 *  (native `storage` event) so any number of components stay in sync. */
export function subscribeCart(cb: () => void): () => void {
  window.addEventListener(CART_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CART_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
