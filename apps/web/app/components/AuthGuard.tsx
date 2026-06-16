"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

const PUBLIC_ROUTES = ["/login", "/register"];

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Allow public pages
    if (PUBLIC_ROUTES.includes(pathname)) {
      setReady(true);
      return;
    }

    const authenticated = isAuthenticated();

    console.log("AuthGuard", {
      pathname,
      authenticated,
    });

    if (!authenticated) {
      router.replace("/login");
      return;
    }

    setReady(true);
  }, [pathname, router]);

  if (!ready) {
    return null;
  }

  return <>{children}</>;
}