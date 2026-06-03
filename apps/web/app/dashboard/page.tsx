"use client";

import { useEffect, useState } from "react";
import {
  getUser,
  isAuthenticated,
  logout,
} from "@/lib/auth";

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      window.location.href = "/login";
      return;
    }

    const currentUser = getUser();

    if (!currentUser) {
      logout();
      return;
    }

    setUser(currentUser);
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* TOP NAVBAR */}
      <header className="border-b border-zinc-800 bg-zinc-900/70 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              Higoverse
            </h1>
            <p className="text-zinc-400 text-sm">
              Business Operating System
            </p>
          </div>

          <button
            onClick={logout}
            className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 transition"
          >
            Logout
          </button>
        </div>
      </header>

      {/* CONTENT */}
      <main className="max-w-7xl mx-auto p-6">
        {/* WELCOME CARD */}
        <div className="rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 p-8 shadow-xl">
          <h2 className="text-4xl font-bold">
            Welcome Back 👋
          </h2>

          <p className="mt-3 text-blue-100">
            {user.email}
          </p>

          <p className="text-blue-200 text-sm mt-2">
            Shop ID: {user.shop_id}
          </p>
        </div>

        {/* STATS */}
        <div className="grid md:grid-cols-4 gap-6 mt-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">
              Total Products
            </p>
            <h3 className="text-3xl font-bold mt-2">
              0
            </h3>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">
              Customers
            </p>
            <h3 className="text-3xl font-bold mt-2">
              0
            </h3>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">
              Sales
            </p>
            <h3 className="text-3xl font-bold mt-2">
              RWF 0
            </h3>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <p className="text-zinc-400 text-sm">
              Profit
            </p>
            <h3 className="text-3xl font-bold mt-2 text-green-400">
              RWF 0
            </h3>
          </div>
        </div>

        {/* MODULES */}
        <div className="mt-10">
          <h3 className="text-2xl font-bold mb-6">
            Business Modules
          </h3>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 hover:border-blue-500 transition cursor-pointer">
              <h4 className="font-semibold text-lg">
                Inventory Management
              </h4>
              <p className="text-zinc-400 mt-2">
                Products, stock movements and warehouse control.
              </p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 hover:border-blue-500 transition cursor-pointer">
              <h4 className="font-semibold text-lg">
                Sales Management
              </h4>
              <p className="text-zinc-400 mt-2">
                Orders, invoices and sales analytics.
              </p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 hover:border-blue-500 transition cursor-pointer">
              <h4 className="font-semibold text-lg">
                Customer Management
              </h4>
              <p className="text-zinc-400 mt-2">
                CRM, customer history and engagement.
              </p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 hover:border-blue-500 transition cursor-pointer">
              <h4 className="font-semibold text-lg">
                Supplier Management
              </h4>
              <p className="text-zinc-400 mt-2">
                Vendor relationships and procurement.
              </p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 hover:border-blue-500 transition cursor-pointer">
              <h4 className="font-semibold text-lg">
                Financial Reports
              </h4>
              <p className="text-zinc-400 mt-2">
                Profit, expenses and business intelligence.
              </p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 hover:border-blue-500 transition cursor-pointer">
              <h4 className="font-semibold text-lg">
                Business Network
              </h4>
              <p className="text-zinc-400 mt-2">
                Connect customers, suppliers and partners.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}