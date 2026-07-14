"use client";

import { ShopProvider } from "@/lib/shop-context";

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ShopProvider>
      {children}
    </ShopProvider>
  );
}
