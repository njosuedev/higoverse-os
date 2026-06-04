"use client";

import { useEffect, useState } from "react";
import { API } from "@/lib/api";
import { getAuthHeaders, requireAuth } from "@/lib/auth";

type Stats = {
  products: number;
  suppliers: number;
};

export default function DashboardHome() {
  const [stats, setStats] = useState<Stats>({
    products: 0,
    suppliers: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    requireAuth();
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const [pRes, sRes] = await Promise.all([
        fetch(API.products.list, {
          headers: getAuthHeaders(),
        }),
        fetch(API.suppliers.list, {
          headers: getAuthHeaders(),
        }),
      ]);

      if (!pRes.ok || !sRes.ok) {
        throw new Error("Failed to fetch dashboard data");
      }

      const pd = await pRes.json();
      const sd = await sRes.json();

      setStats({
        products: pd?.data?.items?.length || 0,
        suppliers: sd?.data?.length || 0,
      });
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold text-blue-900">
          Dashboard Overview
        </h1>
        <p className="text-sm text-blue-500">
          Welcome back 👋 here is your business summary
        </p>
      </div>

      {/* LOADING */}
      {loading && (
        <div className="text-blue-500 text-sm animate-pulse">
          Loading dashboard data...
        </div>
      )}

      {/* ERROR */}
      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* STATS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* PRODUCTS */}
        <div className="bg-white border border-blue-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition">
          <p className="text-sm text-blue-500">Total Products</p>

          <h2 className="text-3xl font-bold text-blue-900 mt-2">
            {stats.products}
          </h2>

          <p className="text-xs text-slate-400 mt-1">
            Active inventory items
          </p>
        </div>

        {/* SUPPLIERS */}
        <div className="bg-white border border-blue-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition">
          <p className="text-sm text-blue-500">Total Suppliers</p>

          <h2 className="text-3xl font-bold text-blue-900 mt-2">
            {stats.suppliers}
          </h2>

          <p className="text-xs text-slate-400 mt-1">
            Registered suppliers
          </p>
        </div>
      </div>

      {/* STATUS CARD */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-2xl p-6 shadow-lg">
        <h3 className="font-bold text-lg">System Status</h3>

        <p className="text-blue-100 text-sm mt-1">
          All services are running smoothly 🚀
        </p>

        <div className="mt-3 text-xs text-blue-100">
          Auth • Products • Suppliers → OK
        </div>
      </div>
    </div>
  );
}