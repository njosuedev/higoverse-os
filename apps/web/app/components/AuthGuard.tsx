"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { isAdminRoute } from "@/lib/admin-nav";

const PUBLIC_ROUTES = ["/login"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;                          // wait for localStorage hydration
    if (PUBLIC_ROUTES.includes(pathname)) return; // public — always ok
    // Unauthenticated on a protected route — come back here after signing in.
    if (!user) router.replace(pathname === "/" ? "/login" : `/login?next=${encodeURIComponent(pathname)}`);
    // The platform admin has no business of their own: only the admin panel.
    else if (user.role === "admin" && !isAdminRoute(pathname)) router.replace("/admin");
  }, [ready, user, pathname, router]);

  // Public routes render immediately, no auth needed
  if (PUBLIC_ROUTES.includes(pathname)) return <>{children}</>;

  // Hold render until hydration is complete
  if (!ready) return null;

  // Protected route: only render children once authenticated
  if (!user) return null;
  if (user.role === "admin" && !isAdminRoute(pathname)) return null;

  return <>{children}</>;
}
