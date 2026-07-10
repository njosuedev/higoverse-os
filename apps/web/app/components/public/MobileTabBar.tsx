"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, ShoppingCart, Package, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/hooks/useCart";
import { cartCount } from "@/lib/cart";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export default function MobileTabBar() {
  const pathname = usePathname();
  const { user, ready } = useAuth();
  const cartItems = useCart();
  const cartQty = cartCount(cartItems);

  const accountHref = !ready || user ? "/settings" : `/login?next=${encodeURIComponent(pathname)}`;

  const tabs = [
    { label: "Home", href: "/", icon: Home },
    { label: "Categories", href: "/categories", icon: LayoutGrid },
    { label: "Cart", href: "/cart", icon: ShoppingCart, badge: cartQty },
    { label: "Orders", href: "/orders", icon: Package },
    { label: "Account", href: accountHref, icon: User, matchHref: "/settings" },
  ] as const;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(pathname, "matchHref" in tab ? tab.matchHref : tab.href);
        return (
          <Link
            key={tab.label}
            href={tab.href}
            className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition ${
              active ? "text-orange-600" : "text-slate-500"
            }`}
          >
            <span className="relative">
              <Icon size={19} strokeWidth={active ? 2.4 : 2} />
              {"badge" in tab && tab.badge > 0 && (
                <span className="absolute -right-2 -top-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white">
                  {tab.badge > 99 ? "99+" : tab.badge}
                </span>
              )}
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
