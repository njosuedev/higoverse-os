"use client";

import { useEffect, useMemo, useState } from "react";
import { supplierRequest } from "@/lib/supplier-api";
import { Users, AlertCircle, Search, Filter } from "lucide-react";

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

export default function SuppliersPage() {
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
      const res = await supplierRequest("/suppliers");
      setSuppliers(res?.data || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      setSuppliers([]);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  /* ---------------- STATS ---------------- */
  const stats = useMemo(() => {
    const total = suppliers.length;
    const active = suppliers.filter((s) => s.status === "active").length;
    const inactive = suppliers.filter((s) => s.status === "inactive").length;
    const noPhone = suppliers.filter((s) => !s.phone).length;

    return { total, active, inactive, noPhone };
  }, [suppliers]);

  /* ---------------- FILTER ---------------- */
  const filteredSuppliers = useMemo(() => {
    return suppliers
      .filter((s) =>
        s.name?.toLowerCase().includes(search.toLowerCase())
      )
      .filter((s) => {
        if (filter === "all") return true;
        if (filter === "active") return s.status === "active";
        if (filter === "inactive") return s.status === "inactive";
        return true;
      });
  }, [suppliers, search, filter]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">

      {/* HEADER */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-2xl p-6 mb-6">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users />
            <h1 className="text-xl font-bold">
              Supplier Management
            </h1>
          </div>

          <div className="text-sm flex items-center gap-2">
            <span className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
            Live Sync
          </div>
        </div>

        <p className="text-green-100 text-sm mt-1">
          Last update:{" "}
          {lastUpdated ? lastUpdated.toLocaleTimeString() : "—"}
        </p>

        {/* SEARCH + FILTER */}
        <div className="mt-4 flex flex-col md:flex-row gap-3">

          {/* SEARCH */}
          <div className="flex items-center bg-white/10 rounded-xl px-3 py-2 flex-1">
            <Search className="w-4 h-4 text-white/80" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search supplier..."
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
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">

        <div className="bg-white rounded-2xl border p-5">
          <p className="text-slate-500 text-sm">Total Suppliers</p>
          <h2 className="text-2xl font-bold text-slate-900 mt-1">
            {stats.total}
          </h2>
        </div>

        <div className="bg-white rounded-2xl border p-5">
          <p className="text-slate-500 text-sm">Active</p>
          <h2 className="text-2xl font-bold text-green-600 mt-1">
            {stats.active}
          </h2>
        </div>

        <div className="bg-white rounded-2xl border p-5">
          <p className="text-slate-500 text-sm">Inactive</p>
          <h2 className="text-2xl font-bold text-red-600 mt-1">
            {stats.inactive}
          </h2>
        </div>

        <div className="bg-white rounded-2xl border p-5">
          <p className="text-slate-500 text-sm">No Phone</p>
          <h2 className="text-2xl font-bold text-amber-500 mt-1">
            {stats.noPhone}
          </h2>
        </div>

      </div>

      {/* TABLE */}
      <div className="bg-white rounded-2xl border overflow-x-auto">

        <table className="w-full text-sm">

          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-4 text-left">Supplier</th>
              <th className="p-4 text-left">Phone</th>
              <th className="p-4 text-left">Email</th>
              <th className="p-4 text-left">Address</th>
              <th className="p-4 text-left">Status</th>
              <th className="p-4 text-left">Created</th>
            </tr>
          </thead>

          <tbody>
            {filteredSuppliers.map((s) => (
              <tr
                key={s.id}
                className="border-t hover:bg-slate-50 transition"
              >

                <td className="p-4 font-medium text-slate-900">
                  {s.name}
                </td>

                <td className="p-4 text-slate-600">
                  {s.phone || "—"}
                </td>

                <td className="p-4 text-slate-600">
                  {s.email || "—"}
                </td>

                <td className="p-4 text-slate-500">
                  {s.address || "—"}
                </td>

                <td className="p-4">
                  {s.status === "active" ? (
                    <span className="text-green-600 font-semibold">
                      Active
                    </span>
                  ) : (
                    <span className="text-red-600 font-semibold">
                      Inactive
                    </span>
                  )}
                </td>

                <td className="p-4 text-slate-500">
                  {timeAgo(s.created_at)}
                </td>

              </tr>
            ))}
          </tbody>

        </table>

        {/* EMPTY STATE */}
        {filteredSuppliers.length === 0 && (
          <div className="p-10 text-center text-slate-500">
            <AlertCircle className="mx-auto mb-2" />
            No suppliers found
          </div>
        )}

      </div>
    </div>
  );
}