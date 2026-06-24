"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useShop } from "@/lib/shop-context";
import { useAuth } from "@/lib/auth-context";
import { Loader2, Store, Clock } from "lucide-react";
import Link from "next/link";

// Only /marketplace is freely accessible — everything else requires an approved shop
function isOpenRoute(pathname: string) {
  return pathname === "/marketplace" || pathname.startsWith("/marketplace/");
}

export default function ShopGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { user } = useAuth();
  const { shop, loading } = useShop();

  const isProtected = !isOpenRoute(pathname);
  const hasShop     = shop?.is_active === true;
  const isAdmin     = user?.role === "admin";

  useEffect(() => {
    if (loading || !isProtected || !user || isAdmin || hasShop) return;
    // Unverified user on a protected route → redirect to marketplace
    router.replace("/marketplace");
  }, [loading, hasShop, isProtected, user, isAdmin, router]);

  // Show spinner while shop context loads on a protected route
  if (loading && isProtected) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={28} className="animate-spin text-slate-300" />
      </div>
    );
  }

  // Unverified user on a protected route — show a friendly gate instead of blank flash
  if (isProtected && !hasShop && !isAdmin && !loading) {
    const isPending = shop && !shop.is_active && !!shop.address;
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: isPending ? "#fffbeb" : "#fff7ed" }}>
          {isPending
            ? <Clock size={32} style={{ color: "#d97706" }} />
            : <Store size={32} style={{ color: "#ff6a00" }} />}
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">
          {isPending ? "Your shop is pending approval" : "You don't have a shop yet"}
        </h2>
        <p className="text-sm text-gray-500 max-w-sm mb-6">
          {isPending
            ? "The Higoverse admin is reviewing your application. You'll get full dashboard access once approved."
            : "Create a shop and submit it for admin review. Once approved, your full dashboard will appear here."}
        </p>
        <Link
          href={isPending ? "/marketplace" : "/marketplace?apply=1"}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold transition hover:opacity-90"
          style={{ background: "#ff6a00" }}
        >
          <Store size={15} />
          {isPending ? "Back to Marketplace" : "Create my Shop"}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
