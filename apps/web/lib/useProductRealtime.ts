"use client";

import { useEffect, useState } from "react";
import { ItemRequest } from "@/lib/product-api";

export function useProductRealtime(interval = 5000) {
  const [Items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchItems() {
    try {
      const res = await ItemRequest("/products");
      setItems(res?.data?.items || []);
    } catch (err) {
      console.error("Realtime fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchItems(); // first load

    const timer = setInterval(() => {
      fetchItems(); // refresh every X seconds
    }, interval);

    return () => clearInterval(timer);
  }, [interval]);

  return { items, loading, refresh: fetchItem };
}
