"use client";

import { useEffect, useState } from "react";
import { itemRequest } from "@/lib/product-api";

export interface Product {
  id: string;
  name?: string;
  [key: string]: any;
}

export function useProductRealtime(interval = 5000) {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    try {
      const res = await itemRequest("/products");

      console.log("Products API Response:", res);

      // Adjust this according to your API response structure
      if (Array.isArray(res)) {
        setItems(res);
      } else if (Array.isArray(res?.data)) {
        setItems(res.data);
      } else if (Array.isArray(res?.data?.items)) {
        setItems(res.data.items);
      } else {
        setItems([]);
      }
    } catch (error) {
      console.error(
        "Realtime products fetch error:",
        error
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();

    const timer = setInterval(() => {
      fetchItems();
    }, interval);

    return () => clearInterval(timer);
  }, [interval]);

  return {
    items,
    loading,
    refresh: fetchItems,
  };
}
