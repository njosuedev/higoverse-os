"use client";

import { ShopProvider } from "@/lib/shop-context";
import AIFloatingWidget from "./AIFloatingWidget";
import MarketplaceTransitionLoader from "./MarketplaceTransitionLoader";

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ShopProvider>
      <MarketplaceTransitionLoader />
      {children}
      <AIFloatingWidget />
    </ShopProvider>
  );
}
