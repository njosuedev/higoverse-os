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
    <div className="min-h-screen bg-zinc-50">

      {/* TOP BAR */}
      <div className="flex justify-between items-center px-8 py-5 bg-white border-b">
        <h1 className="text-xl font-bold">Higoverse Dashboard</h1>
        <LogoutButton />
      </div>

      {/* CONTENT */}
      <div className="p-8 max-w-6xl mx-auto">

        {/* CARDS */}
        <div className="grid md:grid-cols-3 gap-5">

          <div className="bg-white p-6 rounded-2xl shadow">
            <p className="text-sm text-zinc-500">Email</p>
            <p className="font-semibold">{user?.email}</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow">
            <p className="text-sm text-zinc-500">Shop ID</p>
            <p className="font-semibold">{user?.shop_id}</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow">
            <p className="text-sm text-zinc-500">Status</p>
            <p className="text-green-600 font-semibold">Active</p>
          </div>

        </div>

        {/* MAIN PANEL */}
        <div className="mt-8 bg-white p-8 rounded-2xl shadow">
          <h2 className="text-lg font-semibold mb-2">
            Welcome to Higoverse
          </h2>

          <p className="text-zinc-600">
            Manage your inventory, sales, suppliers, and customers in one system.
          </p>
        </div>

      </div>
    </div>
  );
}
