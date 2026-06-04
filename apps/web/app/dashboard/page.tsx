"use client";

import { useEffect, useState } from "react";
import { API } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

export default function DashboardHome() {
  const [stats, setStats] = useState({
    products: 0,
    suppliers: 0,
    loading: true,
  });

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "/login";
      return;
    }

    load();
  }, []);

  async function load() {
    try {
      const [productsRes, suppliersRes] = await Promise.all([
        fetch(API.products.list, { headers: getAuthHeaders() }),
        fetch(API.suppliers.list, { headers: getAuthHeaders() }),
      ]);

      const products = await productsRes.json().catch(() => null);
      const suppliers = await suppliersRes.json().catch(() => null);

      setStats({
        products: products?.data?.items?.length ?? 0,
        suppliers: suppliers?.data?.length ?? 0,
        loading: false,
      });
    } catch (err) {
      console.error(err);

      setStats({
        products: 0,
        suppliers: 0,
        loading: false,
      });
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 mt-6">
        <div className="p-4 bg-white border rounded">
          Products: {stats.loading ? "..." : stats.products}
        </div>

        <div className="p-4 bg-white border rounded">
          Suppliers: {stats.loading ? "..." : stats.suppliers}
        </div>
      </div>
    </div>
  );
}