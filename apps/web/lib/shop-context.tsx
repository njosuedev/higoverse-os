"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { getMyShop, clearMyShopCache, type Shop } from "@/lib/shop-api";

interface ShopCtx {
  shop:    Shop | null;
  loading: boolean;
  reload:  () => void;
}

const Ctx = createContext<ShopCtx>({ shop: null, loading: true, reload: () => {} });

export function useShop() { return useContext(Ctx); }

export function ShopProvider({ children }: { children: ReactNode }) {
  const [shop,    setShop]    = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [rev,     setRev]     = useState(0);

  useEffect(() => {
    setLoading(true);
    getMyShop()
      .then(setShop)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [rev]);

  function reload() { clearMyShopCache(); setRev((r) => r + 1); }

  return (
    <Ctx.Provider value={{ shop, loading, reload }}>
      {children}
    </Ctx.Provider>
  );
}
