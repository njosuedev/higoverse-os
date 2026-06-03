"use client";

import { useEffect, useState } from "react";
import { isAuthenticated, getUser } from "@/lib/auth";
import Loader from "@/components/Loader";
import LogoutButton from "@/components/LogoutButton";

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) {
      window.location.href = "/login";
      return;
    }

    setUser(getUser());
    setLoading(false);
  }, []);

  if (loading) return <Loader />;

  return (
    <div className="min-h-screen bg-zinc-50 flex">

      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r p-6 hidden md:block">
        <h1 className="text-xl font-bold text-zinc-900">
          Higoverse
        </h1>

        <nav className="mt-8 space-y-3 text-sm text-zinc-600">
          <p className="text-blue-600 font-medium">Dashboard</p>
          <p>Inventory</p>
          <p>Sales</p>
          <p>Customers</p>
          <p>Reports</p>
        </nav>

        <div className="mt-10">
          <LogoutButton />
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 p-8">

        {/* HEADER */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-zinc-900">
              Dashboard
            </h2>
            <p className="text-zinc-500 text-sm">
              Welcome back, {user?.email}
            </p>
          </div>
        </div>

        {/* CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">

          <div className="bg-white border rounded-2xl p-6 shadow-sm">
            <p className="text-zinc-500 text-sm">Total Sales</p>
            <h3 className="text-2xl font-bold mt-2">$12,400</h3>
          </div>

          <div className="bg-white border rounded-2xl p-6 shadow-sm">
            <p className="text-zinc-500 text-sm">Products</p>
            <h3 className="text-2xl font-bold mt-2">128</h3>
          </div>

          <div className="bg-white border rounded-2xl p-6 shadow-sm">
            <p className="text-zinc-500 text-sm">Customers</p>
            <h3 className="text-2xl font-bold mt-2">1,240</h3>
          </div>
        </div>

        {/* USER INFO */}
        <div className="mt-10 bg-white border rounded-2xl p-6">
          <h3 className="font-semibold text-zinc-900">
            Account Info
          </h3>

          <div className="mt-4 text-sm text-zinc-600 space-y-2">
            <p>Email: {user?.email}</p>
            <p>Shop ID: {user?.shop_id}</p>
            <p>Status: Active</p>
          </div>
        </div>

      </main>
    </div>
  );
}
