"use client";

import Link from "next/link";
import {
  BarChart3,
  Boxes,
  ShoppingCart,
  Users,
  ShieldCheck,
  TrendingUp,
  Menu,
} from "lucide-react";

import { useState } from "react";

export default function Home() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-zinc-900 relative overflow-hidden">

      {/* 🌊 BACKGROUND */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-[-260px] left-1/2 -translate-x-1/2 w-[900px] h-[900px] bg-gradient-to-r from-blue-100 via-sky-100 to-indigo-100 blur-[170px] rounded-full" />
        <div className="absolute bottom-[-260px] right-[-140px] w-[800px] h-[800px] bg-blue-50 blur-[180px] rounded-full" />
        <div className="absolute inset-0 bg-gradient-to-b from-white via-blue-50/30 to-white" />
      </div>

      {/* NAV */}
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-zinc-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">

          {/* LOGO */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500" />
            <span className="font-semibold">Higoverse</span>
          </div>

          {/* DESKTOP NAV */}
          <nav className="hidden md:flex gap-8 text-sm text-zinc-600">
            <a className="hover:text-blue-600">Features</a>
            <a className="hover:text-blue-600">Pricing</a>
            <a className="hover:text-blue-600">Docs</a>
            <a className="hover:text-blue-600">Support</a>
          </nav>

          {/* ACTIONS */}
          <div className="flex items-center gap-3">

            <Link
              href="/login"
              className="hidden sm:block text-sm text-zinc-600 hover:text-zinc-900"
            >
              Sign in
            </Link>

            <Link
              href="/register"
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-500 text-white text-sm shadow"
            >
              Get Started
            </Link>

            {/* MOBILE MENU BUTTON */}
            <button
              onClick={() => setOpen(!open)}
              className="md:hidden p-2 rounded-lg bg-blue-50"
            >
              <Menu className="w-5 h-5 text-blue-600" />
            </button>

          </div>

        </div>

        {/* MOBILE MENU */}
        {open && (
          <div className="md:hidden px-4 pb-4 space-y-3 text-sm text-zinc-600 bg-white border-t border-zinc-100">

            <a className="block py-2">Features</a>
            <a className="block py-2">Pricing</a>
            <a className="block py-2">Docs</a>
            <a className="block py-2">Support</a>

          </div>
        )}
      </header>

      {/* HERO */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-12 grid lg:grid-cols-2 gap-10 items-center">

        {/* LEFT */}
        <div className="text-center lg:text-left">

          <span className="inline-flex px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs">
            Business Operating System
          </span>

          <h1 className="mt-5 text-3xl sm:text-4xl lg:text-5xl font-semibold leading-tight">
            Run your entire business
            <span className="text-blue-600"> intelligently</span>
          </h1>

          <p className="mt-5 text-zinc-600 text-sm sm:text-base">
            Manage inventory, sales, customers, suppliers, and analytics in one
            unified platform built for modern companies.
          </p>

          {/* CTA */}
          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
            <Link
              href="/register"
              className="px-6 py-3 rounded-xl bg-blue-600 text-white text-sm shadow"
            >
              Start Free Trial
            </Link>

            <Link
              href="/login"
              className="px-6 py-3 rounded-xl bg-blue-50 text-blue-600 text-sm"
            >
              View Demo
            </Link>
          </div>

          {/* QUICK STATS */}
          <div className="mt-8 grid grid-cols-2 gap-3 text-sm text-zinc-600">

            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              Secure
            </div>

            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              Growth
            </div>

            <div className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-blue-600" />
              Inventory
            </div>

            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              CRM
            </div>

          </div>

        </div>

        {/* RIGHT DASHBOARD (RESPONSIVE CARD UI) */}
        <div className="relative">

          <div className="rounded-2xl bg-white shadow-xl overflow-hidden border border-zinc-100">

            {/* HEADER */}
            <div className="px-4 sm:px-5 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 flex justify-between items-center">
              <p className="text-sm font-medium text-blue-700">
                Live Business Dashboard
              </p>

              <div className="flex gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-300" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-300" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-300" />
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-5">

              {/* CHART */}
              <div className="h-24 sm:h-28 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 flex items-end gap-2 p-3">
                <div className="w-2 sm:w-3 h-10 bg-blue-400 rounded" />
                <div className="w-2 sm:w-3 h-16 bg-blue-500 rounded" />
                <div className="w-2 sm:w-3 h-12 bg-indigo-400 rounded" />
                <div className="w-2 sm:w-3 h-20 bg-blue-600 rounded" />
                <div className="w-2 sm:w-3 h-14 bg-indigo-500 rounded" />
              </div>

              {/* KPI */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">

                <div className="p-3 sm:p-4 rounded-xl bg-blue-50">
                  <ShoppingCart className="text-blue-600 w-5 h-5" />
                  <p className="text-xs sm:text-sm text-zinc-500 mt-2">Sales</p>
                  <p className="font-semibold text-blue-600">$12,400</p>
                </div>

                <div className="p-3 sm:p-4 rounded-xl bg-indigo-50">
                  <BarChart3 className="text-indigo-600 w-5 h-5" />
                  <p className="text-xs sm:text-sm text-zinc-500 mt-2">
                    Analytics
                  </p>
                  <p className="font-semibold text-indigo-600">+18%</p>
                </div>

              </div>

              {/* LIVE STATUS */}
              <div className="h-10 sm:h-12 rounded-xl bg-gradient-to-r from-blue-50 to-white flex items-center justify-center text-xs sm:text-sm text-blue-600 animate-pulse">
                ● Live system active
              </div>

            </div>
          </div>

          {/* GLOW */}
          <div className="absolute inset-0 -z-10 blur-3xl bg-blue-200/30 rounded-full" />

        </div>

      </main>

      {/* FEATURES */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-16">

        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold">
            Everything your business needs
          </h2>
          <p className="mt-3 text-zinc-600 text-sm sm:text-base">
            Built for operations, scale, and control
          </p>
        </div>

        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">

          {[
            {
              icon: Boxes,
              title: "Inventory System",
              desc: "Real-time stock tracking and automation.",
            },
            {
              icon: ShoppingCart,
              title: "Sales Engine",
              desc: "Invoices, orders, and payments system.",
            },
            {
              icon: BarChart3,
              title: "Analytics",
              desc: "Understand your business instantly.",
            },
          ].map((f, i) => (
            <div
              key={i}
              className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-blue-50 via-white to-indigo-50 border border-zinc-100 hover:shadow-lg transition"
            >
              <f.icon className="text-blue-600 w-5 h-5" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-zinc-500">{f.desc}</p>
            </div>
          ))}

        </div>

      </section>

      {/* FOOTER */}
      <footer className="border-t border-zinc-100 bg-white">

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 text-center text-sm text-zinc-500">
          © {new Date().getFullYear()} Higoverse — Built for modern business growth
        </div>

      </footer>

    </div>
  );
}