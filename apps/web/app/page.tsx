"use client";

import { useEffect, useState } from "react";
import { API } from "@/lib/api";
import { getAuthHeaders, requireAuth } from "@/lib/auth";

export default function DashboardHome() {
  const [stats, setStats] = useState({
    products: 0,
    suppliers: 0,
    loading: true,
  });

  useEffect(() => {
    requireAuth();
    load();
  }, []);

  async function load() {
    try {
      const [p, s] = await Promise.all([
        fetch(API.products.list, {
          headers: getAuthHeaders(),
        }),
        fetch(API.suppliers.list, {
          headers: getAuthHeaders(),
        }),
      ]);

      const pd = await p.json();
      const sd = await s.json();

      setStats({
        products: pd?.data?.items?.length || 0,
        suppliers: sd?.data?.length || 0,
        loading: false,
      });
    } catch (err) {
      console.error("Dashboard load error:", err);

      setStats({
        products: 0,
        suppliers: 0,
        loading: false,
      });
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-blue-900">
        Dashboard Overview
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* PRODUCTS */}
        <div className="bg-white border border-blue-100 rounded-2xl p-6 shadow-sm">
          <p className="text-sm text-blue-500">Total Products</p>
          <h2 className="text-3xl font-bold text-blue-900 mt-2">
            {stats.loading ? "..." : stats.products}
          </h2>
        </div>

        {/* SUPPLIERS */}
        <div className="bg-white border border-blue-100 rounded-2xl p-6 shadow-sm">
          <p className="text-sm text-blue-500">Total Suppliers</p>
          <h2 className="text-3xl font-bold text-blue-900 mt-2">
            {stats.loading ? "..." : stats.suppliers}
          </h2>
        </div>
      </div>

      {/* STATUS */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-2xl p-6 shadow-lg">
        <h3 className="font-bold text-lg">System Status</h3>
        <p className="text-blue-100 text-sm mt-1">
          All services are running smoothly 🚀
        </p>
      </div>
    </div>
  );
}