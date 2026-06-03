"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BarChart3,
  Boxes,
  ShoppingCart,
  Users,
  ShieldCheck,
  TrendingUp,
  Home,
  Package,
  User,
  Menu,
} from "lucide-react";

export default function HomeClient() {
  const [tab, setTab] = useState("home");
  const [menu, setMenu] = useState(false);

  return (
    <div className="min-h-screen bg-white text-zinc-900 relative overflow-hidden">

      {/* 🌊 BACKGROUND */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-[-260px] left-1/2 -translate-x-1/2 w-[900px] h-[900px] bg-gradient-to-r from-blue-100 via-sky-100 to-indigo-100 blur-[170px] rounded-full" />
        <div className="absolute bottom-[-260px] right-[-140px] w-[800px] h-[800px] bg-blue-50 blur-[180px] rounded-full" />
        <div className="absolute inset-0 bg-gradient-to-b from-white via-blue-50/30 to-white" />
      </div>

      {/* ================= WEB NAV ================= */}
      <header className="hidden md:block sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-zinc-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500" />
            <span className="font-semibold">Higoverse</span>
          </div>

          <nav className="flex gap-8 text-sm text-zinc-600">
            <a>Features</a>
            <a>Pricing</a>
            <a>Docs</a>
            <a>Support</a>
          </nav>

          <Link
            href="/register"
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm"
          >
            Get Started
          </Link>
        </div>
      </header>

      {/* ================= WEB HERO ================= */}
      <div className="hidden md:block">
        <main className="max-w-6xl mx-auto px-6 pt-20 grid md:grid-cols-2 gap-12">

          <div>
            <h1 className="text-5xl font-semibold leading-tight">
              Run your business <span className="text-blue-600">smarter</span>
            </h1>

            <p className="mt-5 text-zinc-600">
              Inventory, sales, CRM, analytics — all in one system.
            </p>

            <div className="mt-8 flex gap-3">
              <Link href="/register" className="px-6 py-3 bg-blue-600 text-white rounded-xl">
                Start Free
              </Link>
              <Link href="/login" className="px-6 py-3 bg-blue-50 text-blue-600 rounded-xl">
                Login
              </Link>
            </div>

            <div className="mt-10 grid grid-cols-2 gap-4 text-sm text-zinc-600">
              <div className="flex items-center gap-2"><ShieldCheck className="w-4 text-blue-600" /> Secure</div>
              <div className="flex items-center gap-2"><TrendingUp className="w-4 text-blue-600" /> Growth</div>
              <div className="flex items-center gap-2"><Boxes className="w-4 text-blue-600" /> Inventory</div>
              <div className="flex items-center gap-2"><Users className="w-4 text-blue-600" /> CRM</div>
            </div>
          </div>

          {/* DASHBOARD */}
          <div className="rounded-2xl bg-white shadow-xl border border-zinc-100 p-6">

            <div className="flex justify-between text-sm text-blue-700">
              <p>Business Overview</p>
              <p>Live</p>
            </div>

            <div className="mt-6 h-28 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl flex items-end gap-2 p-3">
              <div className="w-3 h-10 bg-blue-400 rounded" />
              <div className="w-3 h-16 bg-blue-500 rounded" />
              <div className="w-3 h-12 bg-indigo-400 rounded" />
              <div className="w-3 h-20 bg-blue-600 rounded" />
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="p-4 bg-blue-50 rounded-xl">
                <ShoppingCart className="text-blue-600 w-5" />
                <p className="text-sm mt-2">Sales</p>
                <p className="font-bold">$12,400</p>
              </div>

              <div className="p-4 bg-indigo-50 rounded-xl">
                <BarChart3 className="text-indigo-600 w-5" />
                <p className="text-sm mt-2">Growth</p>
                <p className="font-bold">+18%</p>
              </div>
            </div>

          </div>

        </main>
      </div>

      {/* ================= MOBILE APP ================= */}
      <div className="md:hidden flex flex-col min-h-screen pb-20">

        {/* MOBILE TOP BAR */}
        <div className="flex justify-between items-center px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600" />
            <span className="font-semibold">Higoverse</span>
          </div>

          <button onClick={() => setMenu(!menu)}>
            <Menu className="w-5 text-zinc-600" />
          </button>
        </div>

        {/* MENU */}
        {menu && (
          <div className="px-4 pb-4 text-sm text-zinc-600 space-y-2">
            <p>Features</p>
            <p>Pricing</p>
            <p>Docs</p>
          </div>
        )}

        {/* MOBILE DASHBOARD */}
        <div className="px-4 flex-1">

          <h2 className="text-xl font-semibold">Welcome 👋</h2>
          <p className="text-sm text-zinc-500">Your business overview</p>

          <div className="mt-6 grid grid-cols-2 gap-3">

            <div className="p-4 bg-blue-50 rounded-2xl">
              <ShoppingCart className="text-blue-600 w-5" />
              <p className="text-xs mt-2">Sales</p>
              <p className="font-bold">$12.4k</p>
            </div>

            <div className="p-4 bg-indigo-50 rounded-2xl">
              <TrendingUp className="text-indigo-600 w-5" />
              <p className="text-xs mt-2">Growth</p>
              <p className="font-bold">+18%</p>
            </div>

            <div className="p-4 bg-blue-50 rounded-2xl">
              <Boxes className="text-blue-600 w-5" />
              <p className="text-xs mt-2">Stock</p>
              <p className="font-bold">1.2k</p>
            </div>

            <div className="p-4 bg-indigo-50 rounded-2xl">
              <Users className="text-indigo-600 w-5" />
              <p className="text-xs mt-2">Clients</p>
              <p className="font-bold">320</p>
            </div>

          </div>
        </div>

        {/* MOBILE BOTTOM NAV */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around py-3">

          <button onClick={() => setTab("home")} className="flex flex-col items-center text-xs">
            <Home className={`w-5 ${tab === "home" ? "text-blue-600" : "text-zinc-500"}`} />
            Home
          </button>

          <button onClick={() => setTab("sales")} className="flex flex-col items-center text-xs">
            <ShoppingCart className={`w-5 ${tab === "sales" ? "text-blue-600" : "text-zinc-500"}`} />
            Sales
          </button>

          <button onClick={() => setTab("inventory")} className="flex flex-col items-center text-xs">
            <Package className={`w-5 ${tab === "inventory" ? "text-blue-600" : "text-zinc-500"}`} />
            Stock
          </button>

          <button onClick={() => setTab("profile")} className="flex flex-col items-center text-xs">
            <User className={`w-5 ${tab === "profile" ? "text-blue-600" : "text-zinc-500"}`} />
            Profile
          </button>

        </div>

      </div>

    </div>
  );
}