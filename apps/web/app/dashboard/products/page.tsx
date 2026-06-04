"use client";

import { useEffect, useState } from "react";
import { productRequest } from "@/lib/product-api";

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProducts() {
      try {
        const data = await productRequest("/products");

        setProducts(data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    loadProducts();
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        Loading products...
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">
        Products
      </h1>

      <div className="grid gap-4">
        {products.map((product: any) => (
          <div
            key={product.id}
            className="bg-white border rounded-xl p-4"
          >
            <h3 className="font-semibold">
              {product.name}
            </h3>

            <p className="text-sm text-slate-500">
              {product.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}