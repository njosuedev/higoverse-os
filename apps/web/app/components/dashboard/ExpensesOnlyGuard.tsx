"use client";

// A car company's accountant may only view expenses: every other page
// sends them to Expenses (the services refuse the data anyway).

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useShop } from "@/lib/shop-context";
import { EXPENSES_ONLY_ROUTES, isExpensesOnly } from "@/lib/permissions";

const allowed = (path: string) => EXPENSES_ONLY_ROUTES.some((r) => path === r || path.startsWith(`${r}/`));

export default function ExpensesOnlyGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { shop, loading } = useShop();
  const pathname = usePathname();
  const router = useRouter();
  const accountant = user?.role === "accountant";
  const restricted = accountant && !loading && isExpensesOnly(user?.role, shop?.layout);

  useEffect(() => {
    if (restricted && !allowed(pathname)) router.replace("/expenses");
  }, [restricted, pathname, router]);

  // An accountant waits for the business type, so no other page flashes.
  if (accountant && loading) return null;
  if (restricted && !allowed(pathname)) return null;
  return <>{children}</>;
}
