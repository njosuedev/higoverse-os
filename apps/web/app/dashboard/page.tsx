"use client";

import { useEffect, useState } from "react";
import { getUser, isAuthenticated } from "@/lib/auth";
import LogoutButton from "@/app/components/LogoutButton";

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      window.location.href = "/login";
      return;
    }

    setUser(getUser());
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-blue-50">

      {/* TOP BAR */}
      <div className="bg-white border-b px-8 py-4 flex justify-between">
        <h1 className="font-bold text-xl">Higoverse Dashboard</h1>
        <LogoutButton />
      </div>

      {/* CONTENT */}
      <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">

        <div className="bg-white p-6 rounded-2xl border shadow-sm">
          <h2 className="text-zinc-500">Email</h2>
          <p className="font-semibold">{user.email}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border shadow-sm">
          <h2 className="text-zinc-500">Shop ID</h2>
          <p className="font-semibold">{user.shop_id}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border shadow-sm">
          <h2 className="text-zinc-500">Status</h2>
          <p className="text-green-600 font-semibold">Active</p>
        </div>

      </div>
    </div>
  );
}
