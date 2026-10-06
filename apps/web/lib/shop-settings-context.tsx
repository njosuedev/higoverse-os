"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { settingsRequest } from "@/lib/settings-api";
import { useAuth } from "@/lib/auth-context";

/** The shop's Settings page values, loaded once and shared app-wide. */
export interface ShopSettings {
  currency: string;
  /** Quantity at or below which an item counts as low stock. */
  lowStock: number;
  taxRate: number;
  /** The car company's own car types (Settings → Car types). */
  carTypes: string[];
  /** The car names staff pick from when adding a vehicle (Settings → Car names). */
  carNames: string[];
}

const DEFAULTS: ShopSettings = { currency: "RWF", lowStock: 10, taxRate: 0, carTypes: [], carNames: [] };

interface Ctx extends ShopSettings {
  loaded: boolean;
  /** Push values just saved on the Settings page so every page updates without a reload. */
  apply: (s: Partial<ShopSettings>) => void;
}

const SettingsCtx = createContext<Ctx>({ ...DEFAULTS, loaded: false, apply: () => {} });

export function useShopSettings() { return useContext(SettingsCtx); }

export function ShopSettingsProvider({ children }: { children: ReactNode }) {
  const { token, ready } = useAuth();
  const [value, setValue] = useState<ShopSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    settingsRequest("/settings/")
      .then((res) => {
        const d = res?.data;
        if (cancelled || !d) return;
        setValue({
          currency: d.currency || DEFAULTS.currency,
          lowStock: Number.isFinite(Number(d.low_stock_threshold)) ? Number(d.low_stock_threshold) : DEFAULTS.lowStock,
          taxRate:  Number(d.tax_rate) || 0,
          carTypes: Array.isArray(d.car_types) ? d.car_types : [],
          carNames: Array.isArray(d.car_names) ? d.car_names : [],
        });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [ready, token]);

  const apply = useCallback((s: Partial<ShopSettings>) => setValue((v) => ({ ...v, ...s })), []);

  return (
    <SettingsCtx.Provider value={{ ...value, loaded, apply }}>
      {children}
    </SettingsCtx.Provider>
  );
}

/** "1,250,000 RWF"-style amount in the shop's currency. */
export function formatMoney(n: number, currency: string): string {
  return `${Math.round(n || 0).toLocaleString()} ${currency}`;
}
