"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useShop } from "@/lib/shop-context";
import { useAuth } from "@/lib/auth-context";
import { getEffectiveRole } from "@/lib/auth";
import { getApplicationStatus, decodeShopHumanInfo } from "@/lib/product-meta";
import { Loader2, Store, Clock, XCircle } from "lucide-react";
import Link from "next/link";

// Routes freely accessible to any logged-in user regardless of role
function isOpenRoute(pathname: string) {
  return (
    pathname === "/marketplace" ||
    pathname.startsWith("/marketplace/") ||
    pathname === "/settings" ||
    pathname === "/notifications" ||
    pathname === "/messages"
  );
}

export default function ShopGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { user } = useAuth();
  const { shop, loading } = useShop();

  const role       = getEffectiveRole(user ?? null, shop?.is_active === true);
  const isAdmin    = role === "ADMIN";
  const isOwner    = role === "SHOP_OWNER";
  const isCustomer = role === "CUSTOMER";
  const isProtected = !isOpenRoute(pathname);

  useEffect(() => {
    if (loading || !isProtected || isAdmin || isOwner) return;
    // CUSTOMER on a protected (business) route → redirect to marketplace
    router.replace("/marketplace");
  }, [loading, isProtected, isAdmin, isOwner, router]);

  if (loading && isProtected) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={28} className="animate-spin text-slate-300" />
      </div>
    );
  }

  // CUSTOMER trying to access a business route — show friendly gate instead of blank flash
  if (isProtected && isCustomer && !loading) {
    const appStatus  = getApplicationStatus(shop?.description, shop?.address, shop?.is_active === true);
    const { rejectionReason } = decodeShopHumanInfo(shop?.description);

    if (appStatus === "REJECTED") {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: "#fef2f2" }}>
            <XCircle size={32} style={{ color: "#dc2626" }} />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Application Rejected</h2>
          {rejectionReason && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 max-w-sm">
              <p className="text-xs font-semibold text-red-700 mb-1">Reason from admin:</p>
              <p className="text-sm text-red-800">{rejectionReason}</p>
            </div>
          )}
          <p className="text-sm text-gray-500 max-w-sm mb-6">
            You can edit your application and resubmit for another review.
          </p>
          <Link
            href="/marketplace?apply=1"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold transition hover:opacity-90"
            style={{ background: "#ff6a00" }}
          >
            <Store size={15} />
            Edit &amp; Resubmit Application
          </Link>
        </div>
      );
    }

    if (appStatus === "PENDING") {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: "#fffbeb" }}>
            <Clock size={32} style={{ color: "#d97706" }} />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Application Under Review</h2>
          <p className="text-sm text-gray-500 max-w-sm mb-6">
            The Higoverse admin is reviewing your shop application. You&apos;ll get full dashboard access once approved. This usually takes 1–2 business days.
          </p>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold transition hover:opacity-90"
            style={{ background: "#ff6a00" }}
          >
            <Store size={15} />
            Back to Marketplace
          </Link>
        </div>
      );
    }

    // No application yet
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: "#fff7ed" }}>
          <Store size={32} style={{ color: "#ff6a00" }} />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Create a Shop to Access This</h2>
        <p className="text-sm text-gray-500 max-w-sm mb-6">
          Submit a shop application and get approved by the Higoverse admin to unlock the full business dashboard.
        </p>
        <Link
          href="/marketplace?apply=1"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold transition hover:opacity-90"
          style={{ background: "#ff6a00" }}
        >
          <Store size={15} />
          Create my Shop
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
