"use client";

import { useEffect, useMemo, useState } from "react";
import { productRequest } from "@/lib/product-api";
import { supplierRequest } from "@/lib/supplier-api";
import { Package, AlertCircle, Search, Filter } from "lucide-react";

/* ---------------- TIME AGO HELPER ---------------- */
function timeAgo(dateString?: string) {
  if (!dateString) return "—";

  const date = new Date(dateString);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} day ago`;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  /* ---------------- FETCH ---------------- */
  useEffect(() => {
    loadData();

    const interval = setInterval(() => {
      loadData(false);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  async function loadData(showLoading = true) {
    if (showLoading) setLoading(true);

    try {
      const [productsRes, suppliersRes] = await Promise.all([
        productRequest("/products"),
        supplierRequest("/suppliers"),
      ]);

      setProducts(productsRes?.data?.items || []);
      setSuppliers(suppliersRes?.data || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      setProducts([]);
      setSuppliers([]);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  /* ---------------- SUPPLIER MAP ---------------- */
  const supplierMap = useMemo(() => {
    const map: Record<string, any> = {};
    suppliers.forEach((s) => {
      map[s.id] = s;
    });
    return map;
  }, [suppliers]);

  /* ---------------- FILTER ---------------- */
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase())
      )
      .filter((p) => {
        if (filter === "all") return true;
        if (filter === "in_stock") return p.quantity > 10;
        if (filter === "low_stock")
          return p.quantity > 0 && p.quantity <= 10;
        if (filter === "out_stock") return p.quantity === 0;
        return true;
      });
  }, [products, search, filter]);

  /* ---------------- PRODUCT STATS ---------------- */
  const stats = useMemo(() => {
    const total = products.length;
    const inStock = products.filter((p) => p.quantity > 10).length;
    const lowStock = products.filter(
      (p) => p.quantity > 0 && p.quantity <= 10
    ).length;
    const outStock = products.filter((p) => p.quantity === 0).length;

    const totalProfit = products.reduce((sum, p) => {
      const profit = (p.selling_price || 0) - (p.cost_price || 0);
      return sum + (profit > 0 ? profit : 0);
    }, 0);

    return { total, inStock, lowStock, outStock, totalProfit };
  }, [products]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">

      {/* HEADER */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-6 mb-6">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package />
            <h1 className="text-xl font-bold">Product Inventory</h1>
          </div>

          <div className="text-sm flex items-center gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Live Sync
          </div>
        </div>

        <p className="text-blue-100 text-sm mt-1">
          Last update: {lastUpdated ? lastUpdated.toLocaleTimeString() : "—"}
        </p>

        {/* SEARCH + FILTER */}
        <div className="mt-4 flex flex-col md:flex-row gap-3">

          {/* SEARCH */}
          <div className="flex items-center bg-white/10 rounded-xl px-3 py-2 flex-1">
            <Search className="w-4 h-4 text-white/80" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product..."
              className="bg-transparent outline-none text-white placeholder-white/70 ml-2 w-full"
            />
          </div>

          {/* FILTER */}
          <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
            <Filter className="w-4 h-4 text-white" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-transparent text-white outline-none"
            >
              <option value="all">All</option>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_stock">Out of Stock</option>
            </select>
          </div>
        </div>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">

        <div className="bg-white border rounded-2xl p-5">
          <p className="text-slate-500 text-sm">Total Products</p>
          <h2 className="text-2xl font-bold text-slate-900 mt-1">
            {stats.total}
          </h2>
        </div>

        <div className="bg-white border rounded-2xl p-5">
          <p className="text-slate-500 text-sm">In Stock</p>
          <h2 className="text-2xl font-bold text-green-600 mt-1">
            {stats.inStock}
          </h2>
        </div>

        <div className="bg-white border rounded-2xl p-5">
          <p className="text-slate-500 text-sm">Low Stock</p>
          <h2 className="text-2xl font-bold text-amber-500 mt-1">
            {stats.lowStock}
          </h2>
        </div>

        <div className="bg-white border rounded-2xl p-5">
          <p className="text-slate-500 text-sm">Out of Stock</p>
          <h2 className="text-2xl font-bold text-red-600 mt-1">
            {stats.outStock}
          </h2>
        </div>

        <div className="bg-white border rounded-2xl p-5">
          <p className="text-slate-500 text-sm">Total Profit</p>
          <h2 className="text-2xl font-bold text-green-700 mt-1">
            {stats.totalProfit.toFixed(0)}
          </h2>
        </div>

      </div>

      {/* TABLE */}
      <div className="bg-white rounded-2xl border overflow-x-auto">

        <table className="w-full text-sm">

          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-4 text-left">Product</th>
              <th className="p-4 text-left">Description</th>
              <th className="p-4 text-left">Cost</th>
              <th className="p-4 text-left">Selling</th>
              <th className="p-4 text-left">Qty</th>
              <th className="p-4 text-left">Supplier</th>
              <th className="p-4 text-left">Status</th>
              <th className="p-4 text-left">Value</th>
              <th className="p-4 text-left">Added</th>
            </tr>
          </thead>

          <tbody>
            {filteredProducts.map((p) => {
              const supplier = supplierMap[p.supplier_id];

              return (
                <tr
                  key={p.id}
                  className="border-t hover:bg-slate-50 transition"
                >

                  <td className="p-4 font-medium text-slate-900">
                    {p.name}
                  </td>

                  <td className="p-4 text-slate-500">
                    {p.description}
                  </td>

                  <td className="p-4">
                    {p.cost_price}
                  </td>

                  <td className="p-4 text-green-600 font-medium">
                    {p.selling_price}
                  </td>

                  <td className="p-4">
                    {p.quantity}
                  </td>

                  <td className="p-4">
                    {supplier ? (
                      <div>
                        <p className="font-medium text-slate-800">
                          {supplier.name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {supplier.phone || "No phone"}
                        </p>
                      </div>
                    ) : (
                      <span className="text-slate-400">No supplier</span>
                    )}
                  </td>

                  <td className="p-4">
                    {p.profit_status === "profit" ? (
                      <span className="text-green-600 font-semibold">
                        +{p.profit_percent}%
                      </span>
                    ) : (
                      <span className="text-red-600 font-semibold">
                        Loss
                      </span>
                    )}
                  </td>

                   <td className="p-4">
                    {p.profit_status === "profit" ? (
                      <span className="text-green-600 font-semibold">
                        {p.profit_money}
                      </span>
                    ) : (
                      <span className="text-red-600 font-semibold">
                        Loss
                      </span>
                    )}
                  </td>

                  <td className="p-4 text-slate-500">
                    {timeAgo(p.created_at)}
                  </td>

                </tr>
              );
            })}
          </tbody>

        </table>

        {/* EMPTY STATE */}
        {filteredProducts.length === 0 && (
          <div className="p-10 text-center text-slate-500">
            <AlertCircle className="mx-auto mb-2" />
            No products found
          </div>
        )}

      </div>
    </div>
  );
}