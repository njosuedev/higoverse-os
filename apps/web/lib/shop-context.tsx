"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { getMyShop, clearMyShopCache, type Shop } from "@/lib/shop-api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { normalizeLayout } from "@/lib/business-layout";

interface ShopCtx {
  shop:    Shop | null;
  loading: boolean;
  reload:  () => void;
}

const Ctx = createContext<ShopCtx>({ shop: null, loading: true, reload: () => {} });

export function useShop() { return useContext(Ctx); }

export function ShopProvider({ children }: { children: ReactNode }) {
  const { token, ready } = useAuth();
  const [shop,    setShop]    = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [rev,     setRev]     = useState(0);
  const { setLayout } = useLanguage();

  // The shop's admin-assigned layout drives layout-specific wording app-wide.
  useEffect(() => { setLayout(normalizeLayout(shop?.layout)); }, [shop?.layout, setLayout]);

  useEffect(() => {
    // `/api/v1/shop` requires auth — guard against firing before the
    // auth context has resolved a token.
    if (!ready) return;
    if (!token) { setShop(null); setLoading(false); return; }

    setLoading(true);
    getMyShop()
      .then(setShop)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [rev, ready, token]);

  function reload() { clearMyShopCache(); setRev((r) => r + 1); }

  return (
    <Ctx.Provider value={{ shop, loading, reload }}>
      {children}
    </Ctx.Provider>
  );
}
