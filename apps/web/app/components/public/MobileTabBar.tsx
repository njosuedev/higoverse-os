"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Home, LayoutGrid, ShoppingCart, Package, User, Settings, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/hooks/useCart";
import { cartCount } from "@/lib/cart";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export default function MobileTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready, logout } = useAuth();
  const cartItems = useCart();
  const cartQty = cartCount(cartItems);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) setAccountMenuOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  useEffect(() => { setAccountMenuOpen(false); }, [pathname]);

  function handleLogout() {
    setAccountMenuOpen(false);
    logout();
    router.replace("/");
  }

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
      {accountMenuOpen && (
        <div
          ref={accountMenuRef}
          className="absolute bottom-full right-2 mb-2 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl"
        >
          <Link
            href="/settings"
            onClick={() => setAccountMenuOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Settings size={16} /> Account & Settings
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-500 transition hover:bg-red-50"
          >
            <LogOut size={16} /> Log Out
          </button>
        </div>
      )}

      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(pathname, "matchHref" in tab ? tab.matchHref : tab.href);
        const iconEl = (
          <span className="relative">
            <Icon size={19} strokeWidth={active ? 2.4 : 2} />
            {"badge" in tab && tab.badge > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white">
                {tab.badge > 99 ? "99+" : tab.badge}
              </span>
            )}
          </span>
        );
        const className = `relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition ${
          active ? "text-orange-600" : "text-slate-500"
        }`;

        if (tab.label === "Account" && user) {
          return (
            <button key={tab.label} type="button" onClick={() => setAccountMenuOpen((o) => !o)} className={className}>
              {iconEl}
              {tab.label}
            </button>
          );
        }

        return (
          <Link key={tab.label} href={tab.href} className={className}>
            {iconEl}
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
