"use client";

import { useEffect, useState } from "react";
import { productRequest } from "@/lib/product-api";

export function useProductRealtime(interval = 5000) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchProducts() {
    try {
      const res = await productRequest("/products");
      setProducts(res?.data?.items || []);
    } catch (err) {
      console.error("Realtime fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProducts(); // first load

    const timer = setInterval(() => {
      fetchProducts(); // refresh every X seconds
    }, interval);

    return () => clearInterval(timer);
  }, [interval]);

  return { products, loading, refresh: fetchProducts };
}