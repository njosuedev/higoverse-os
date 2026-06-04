"use client";

import { useEffect, useState } from "react";
import { API } from "@/lib/api";
import { getAuthHeaders} from "@/lib/auth";

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const res = await fetch(API.products.list, {
      headers: getAuthHeaders(),
    });

    const data = await res.json();
    setProducts(data.data.items || []);
  }

  return (
    <div className="space-y-6">

      <h1 className="text-2xl font-bold text-blue-900">
        Products
      </h1>

      <div className="grid gap-4">

        {products.map((p) => (
          <div
            key={p.id}
            className="bg-white border border-blue-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition"
          >

            <h2 className="font-bold text-blue-900">
              {p.name}
            </h2>

            <p className="text-sm text-blue-500">
              {p.description}
            </p>

            <div className="mt-3 text-sm text-blue-900 space-y-1">

              <p>Stock: {p.quantity}</p>
              <p>Cost: {p.cost_price}</p>
              <p>Sell: {p.selling_price}</p>

              <p
                className={
                  p.profit_status === "profit"
                    ? "text-green-600 font-semibold"
                    : "text-red-500 font-semibold"
                }
              >
                Profit: {p.profit_money}
              </p>

              <p className="text-xs text-blue-400">
                Supplier: {p.supplier_id || "Not linked"}
              </p>

            </div>
          </div>
        ))}

      </div>
    </div>
  );
}