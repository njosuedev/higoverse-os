"use client";

import { ShopProvider } from "@/lib/shop-context";
import AIFloatingWidget from "./AIFloatingWidget";

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ShopProvider>
      {children}
      <AIFloatingWidget />
    </ShopProvider>
  );
}
