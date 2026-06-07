// app/components/AuthGuard.tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

const PUBLIC_ROUTES = [
  "/login",
  "/register",
];

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Allow public pages
    if (PUBLIC_ROUTES.includes(pathname)) {
      setReady(true);
      return;
    }

    // Protect private pages
    if (!isAuthenticated()) {
      window.location.replace("/login");
      return;
    }

    setReady(true);
  }, [pathname]);

  if (!ready) {
    return null;
  }

  return <>{children}</>;
}
