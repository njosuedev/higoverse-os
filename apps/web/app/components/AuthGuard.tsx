"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

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
  }, [ready, user, pathname, router]);

  // Public routes render immediately, no auth needed
  if (PUBLIC_ROUTES.includes(pathname)) return <>{children}</>;

  // Hold render until hydration is complete
  if (!ready) return null;

  // Protected route: only render children once authenticated
  if (!user) return null;

  return <>{children}</>;
}
