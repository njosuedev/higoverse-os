"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { isAuthenticated, logout } from "@/lib/auth";

const PUBLIC_ROUTES = ["/login", "/register"];

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (PUBLIC_ROUTES.includes(pathname)) {
      setReady(true);
      return;
    }

    const authenticated = isAuthenticated();

    console.log("AuthGuard", { pathname, authenticated });

    if (!authenticated) {
      logout(); // clears localStorage before redirecting — prevents redirect loop
      return;
    }

    setReady(true);
  }, [pathname]);

  if (!ready) return null;

  return <>{children}</>;
}
