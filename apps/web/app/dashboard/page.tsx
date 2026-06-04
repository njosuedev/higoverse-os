"use client";

import { useEffect, useState } from "react";
import { getUser, isAuthenticated } from "@/lib/auth";
import LogoutButton from "@/app/components/LogoutButton";
import {
  User,
  Mail,
  Store,
  ShieldCheck,
  Activity,
  LayoutDashboard,
} from "lucide-react";

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white to-blue-50">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-slate-50">

      {/* ================= TOP BAR ================= */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">

          {/* BRAND */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white">
              <LayoutDashboard className="w-5 h-5" />
            </div>

            <div>
              <h1 className="font-bold text-slate-900 leading-tight">
                Higoverse
              </h1>
              <p className="text-xs text-slate-500">Business Dashboard</p>
            </div>
          </div>

          {/* USER ACTION */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
              <Activity className="w-4 h-4 text-green-500" />
              Live system active
            </div>

            <LogoutButton />
          </div>
        </div>
      </header>

      {/* ================= HERO SUMMARY ================= */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-8">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-6 sm:p-8 shadow-lg">

          <h2 className="text-xl sm:text-2xl font-bold">
            Welcome back 👋
          </h2>

          <p className="text-blue-100 text-sm mt-1">
            Your business system is running smoothly
          </p>

          <div className="mt-4 text-xs sm:text-sm text-blue-100">
            Manage your shop, track performance, and monitor your data in real-time.
          </div>
        </div>
      </section>

      {/* ================= CARDS ================= */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">

        {/* EMAIL */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition">
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm text-slate-500">Email</h3>
          </div>
          <p className="mt-3 font-semibold text-slate-900 break-all">
            {user.email}
          </p>
        </div>

        {/* SHOP ID */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition">
          <div className="flex items-center gap-3">
            <Store className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm text-slate-500">Shop ID</h3>
          </div>
          <p className="mt-3 font-semibold text-slate-900">
            {user.shop_id || "Not assigned"}
          </p>
        </div>

        {/* STATUS */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-green-600" />
            <h3 className="text-sm text-slate-500">Account Status</h3>
          </div>

          <p className="mt-3 font-semibold text-green-600 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Active
          </p>
        </div>

        {/* USER INFO CARD */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition">
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm text-slate-500">User</h3>
          </div>

          <p className="mt-3 font-semibold text-slate-900">
            {user.name || "Business Owner"}
          </p>
        </div>

        {/* QUICK STATS CARD */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-100">
          <h3 className="text-sm text-slate-600">System Health</h3>
          <p className="mt-3 font-semibold text-blue-700">
            99.9% Uptime
          </p>
          <p className="text-xs text-slate-500 mt-1">
            All services running normally
          </p>
        </div>

        {/* SECURITY CARD */}
        <div className="bg-gradient-to-br from-white to-blue-50 rounded-2xl p-5 border border-slate-100">
          <h3 className="text-sm text-slate-500">Security</h3>
          <p className="mt-3 font-semibold text-slate-900">
            Protected Account
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Your data is encrypted & secure
          </p>
        </div>
      </main>

      {/* ================= FOOTER ================= */}
      <footer className="text-center text-xs text-slate-500 py-8">
        © {new Date().getFullYear()} Higoverse — Built for modern business
      </footer>
    </div>
  );
}