"use client";

import { useEffect, useState } from "react";
import { getUser, isAuthenticated, logout } from "@/lib/auth";

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = isAuthenticated();

    if (!auth) {
      window.location.href = "/login";
      return;
    }

    const currentUser = getUser();

    if (!currentUser) {
      logout();
      return;
    }

    setUser(currentUser);
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* TOP BAR */}
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Higoverse</h1>
            <p className="text-sm text-zinc-400">
              Business Operating System
            </p>
          </div>

          <button
            onClick={() => logout()}
            className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 transition"
          >
            Logout
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main className="max-w-7xl mx-auto p-6">
        {/* USER CARD */}
        <div className="rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 p-8">
          <h2 className="text-3xl font-bold">
            Welcome Back 👋
          </h2>

          <p className="mt-3 text-blue-100">
            {user.email}
          </p>

          <p className="text-blue-200 text-sm mt-2">
            Shop ID: {user.shop_id}
          </p>
        </div>

        {/* MODULE GRID */}
        <div className="grid md:grid-cols-3 gap-6 mt-10">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-blue-500 transition">
            <h3 className="font-semibold text-lg">Inventory</h3>
            <p className="text-zinc-400 text-sm mt-2">
              Manage stock and products
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-blue-500 transition">
            <h3 className="font-semibold text-lg">Sales</h3>
            <p className="text-zinc-400 text-sm mt-2">
              Track orders and revenue
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-blue-500 transition">
            <h3 className="font-semibold text-lg">Customers</h3>
            <p className="text-zinc-400 text-sm mt-2">
              Manage customer relationships
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-blue-500 transition">
            <h3 className="font-semibold text-lg">Suppliers</h3>
            <p className="text-zinc-400 text-sm mt-2">
              Vendor management system
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-blue-500 transition">
            <h3 className="font-semibold text-lg">Reports</h3>
            <p className="text-zinc-400 text-sm mt-2">
              Analytics & insights
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-blue-500 transition">
            <h3 className="font-semibold text-lg">Settings</h3>
            <p className="text-zinc-400 text-sm mt-2">
              System configuration
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
