"use client";

import { ShopProvider } from "@/lib/shop-context";
import { ShopSettingsProvider } from "@/lib/shop-settings-context";

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ShopProvider>
      <ShopSettingsProvider>
        {children}
      </ShopSettingsProvider>
    </ShopProvider>
  );
}
