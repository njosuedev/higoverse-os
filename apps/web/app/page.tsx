"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser, isAuthenticated, logout, User } from "@/lib/auth";

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }

    const currentUser = getUser();

    if (!currentUser) {
      router.replace("/login");
      return;
    }

    setUser(currentUser);
    setLoading(false);
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-10 w-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Higoverse Dashboard
            </h1>
            <p className="text-sm text-slate-500">
              Welcome back, {user?.email}
            </p>
          </div>

          <button
            onClick={() => logout()}
            className="px-4 py-2 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6">
        {/* User Card */}
        <div className="bg-white rounded-2xl border p-6 shadow-sm mb-6">
          <h2 className="text-lg font-semibold mb-4">
            Account Information
          </h2>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-slate-500">Email</p>
              <p className="font-medium">{user?.email}</p>
            </div>

            <div>
              <p className="text-sm text-slate-500">Shop ID</p>
              <p className="font-medium">{user?.shop_id}</p>
            </div>

            <div>
              <p className="text-sm text-slate-500">Role</p>
              <p className="font-medium">
                {user?.role || "Owner"}
              </p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-6 md:grid-cols-3">
          <div className="bg-white rounded-2xl border p-6 shadow-sm">
            <p className="text-sm text-slate-500">Sales</p>
            <h3 className="text-3xl font-bold">$12,430</h3>
          </div>

          <div className="bg-white rounded-2xl border p-6 shadow-sm">
            <p className="text-sm text-slate-500">Orders</p>
            <h3 className="text-3xl font-bold">1,240</h3>
          </div>

          <div className="bg-white rounded-2xl border p-6 shadow-sm">
            <p className="text-sm text-slate-500">Customers</p>
            <h3 className="text-3xl font-bold">320</h3>
          </div>
        </div>

        {/* Performance */}
        <div className="mt-8 bg-white rounded-2xl border p-6 shadow-sm">
          <h3 className="font-semibold mb-4">Performance</h3>

          <svg viewBox="0 0 100 40" className="w-full h-48">
            <polyline
              fill="none"
              stroke="#2563eb"
              strokeWidth="2"
              points="0,30 10,28 20,32 30,20 40,22 50,12 60,18 70,10 80,14 90,6 100,10"
            />
          </svg>
        </div>
      </div>
    </main>
  );
}