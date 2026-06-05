// app/components/AuthGuard.tsx
"use client";

import { useEffect, useState } from "react";
import { isAuthenticated } from "@/lib/auth";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      window.location.replace("/login");
      return;
    }

    setReady(true);
  }, []);

  if (!ready) return null;

  return <>{children}</>;
}