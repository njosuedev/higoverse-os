"use client";

import { useEffect, useMemo, useState } from "react";
import { productRequest } from "@/lib/product-api";
import { supplierRequest } from "@/lib/supplier-api";
import {
  Package,
  AlertCircle,
  Search,
  Filter,
} from "lucide-react";

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

  /* ---------------- SUPPLIER MAP (FAST LOOKUP) ---------------- */
  const supplierMap = useMemo(() => {
    const map: Record<string, any> = {};
    suppliers.forEach((s) => {
      map[s.id] = s;
    });
    return map;
  }, [suppliers]);

  /* ---------------- FILTER LOGIC ---------------- */
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
            <h1 className="text-xl font-bold">
              Product Inventory
            </h1>
          </div>

          <div className="text-sm flex items-center gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Live Sync
          </div>
        </div>

        <p className="text-blue-100 text-sm mt-1">
          Last update:{" "}
          {lastUpdated
            ? lastUpdated.toLocaleTimeString()
            : "—"}
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
              <th className="p-4 text-left">Profit</th>
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

                  {/* PRODUCT */}
                  <td className="p-4 font-medium text-slate-900">
                    {p.name}
                  </td>

                  {/* DESCRIPTION */}
                  <td className="p-4 text-slate-500">
                    {p.description}
                  </td>

                  {/* COST */}
                  <td className="p-4">
                    {p.cost_price}
                  </td>

                  {/* SELLING */}
                  <td className="p-4 text-green-600 font-medium">
                    {p.selling_price}
                  </td>

                  {/* QTY */}
                  <td className="p-4">
                    {p.quantity}
                  </td>

                  {/* SUPPLIER (REAL NAME NOW) */}
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
                      <span className="text-slate-400">
                        No supplier
                      </span>
                    )}
                  </td>

                  {/* PROFIT / LOSS */}
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

                  {/* TIME AGO */}
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