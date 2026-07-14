"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useShop } from "@/lib/shop-context";
import { useAuth } from "@/lib/auth-context";
import { getEffectiveRole } from "@/lib/auth";
import { getApplicationStatus, decodeShopHumanInfo } from "@/lib/product-meta";
import { Loader2, Store, Clock, XCircle } from "lucide-react";
import EmptyState from "@/app/components/ui/EmptyState";

// Routes freely accessible to any logged-in user regardless of role —
// a CUSTOMER (no approved shop yet) needs these to apply for a shop.
function isOpenRoute(pathname: string) {
  return (
    pathname === "/settings" ||
    pathname === "/notifications" ||
    pathname === "/apply-shop"
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
    // CUSTOMER on a protected (business) route → send them to apply for a shop
    router.replace("/apply-shop");
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
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
          <EmptyState
            icon={<XCircle size={30} />}
            tone="orange"
            title="Application Rejected"
            description={rejectionReason ? undefined : "You can edit your application and resubmit for another review."}
            actionLabel={rejectionReason ? undefined : "Edit & Resubmit Application"}
            actionHref={rejectionReason ? undefined : "/apply-shop"}
            className="max-w-md"
          />
          {rejectionReason && (
            <>
              <div className="-mt-2 mb-6 max-w-sm rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center">
                <p className="mb-1 text-xs font-semibold text-red-700">Reason from admin:</p>
                <p className="text-sm text-red-800">{rejectionReason}</p>
              </div>
              <a
                href="/apply-shop"
                className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600"
              >
                <Store size={15} />
                Edit &amp; Resubmit Application
              </a>
            </>
          )}
        </div>
      );
    }

    if (appStatus === "PENDING") {
      return (
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <EmptyState
            icon={<Clock size={30} />}
            tone="orange"
            title="Application Under Review"
            description="The Higoverse admin is reviewing your shop application. You'll get full dashboard access once approved. This usually takes 1–2 business days."
            className="max-w-md"
          />
        </div>
      );
    }

    // No application yet
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <EmptyState
          icon={<Store size={30} />}
          tone="orange"
          title="Create a Shop to Access This"
          description="Submit a shop application and get approved by the Higoverse admin to unlock the full business dashboard."
          actionLabel="Create my Shop"
          actionHref="/apply-shop"
          className="max-w-md"
        />
      </div>
    );
  }

  return <>{children}</>;
}
