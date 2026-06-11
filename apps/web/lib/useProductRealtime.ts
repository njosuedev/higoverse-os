"use client";

import { useCallback, useEffect, useState } from "react";
import { itemRequest } from "@/lib/product-api";

export interface Product {
  id: string;
  name?: string;
  [key: string]: any;
}

export function useProductRealtime(interval = 5000) {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      setError(null);

      const res = await itemRequest("/products");

      let products: Product[] = [];

      if (Array.isArray(res)) {
        products = res;
      } else if (Array.isArray(res?.data)) {
        products = res.data;
      } else if (Array.isArray(res?.data?.items)) {
        products = res.data.items;
      } else if (Array.isArray(res?.items)) {
        products = res.items;
      }

      setItems(products);
    } catch (err) {
      console.error(
        "Realtime products fetch error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load products"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();

    const timer = setInterval(fetchItems, interval);

    return () => {
      clearInterval(timer);
    };
  }, [fetchItems, interval]);

  return {
    items,
    loading,
    error,
    refresh: fetchItems,
  };
}
