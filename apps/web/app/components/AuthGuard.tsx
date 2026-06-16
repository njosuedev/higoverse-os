"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getToken, getUser } from "@/lib/auth";

const PUBLIC_ROUTES = ["/login", "/register"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Always allow public routes
    if (PUBLIC_ROUTES.includes(pathname)) {
      setReady(true);
      return;
    }

    // Check auth AFTER hydration
    const token = getToken();
    const user = getUser();

    if (!token || !user) {
      router.replace("/login");
      return;
    }

    setReady(true);
  }, [pathname, router]);

  if (!ready) return null;

  return <>{children}</>;
}