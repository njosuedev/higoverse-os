"use client";

import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex">
      {/* LEFT */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-16">
        <div className="max-w-xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600" />
            <h1 className="text-3xl font-bold">Higoverse</h1>
          </div>

          <h2 className="text-5xl font-bold leading-tight">
            Business Operating System
          </h2>

          <p className="mt-6 text-lg text-zinc-600">
            Manage inventory, sales, suppliers, customers and analytics
            from one powerful platform.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4">
            <div className="rounded-2xl border bg-white p-5">
              <h3 className="font-semibold">Inventory</h3>
              <p className="text-sm text-zinc-500 mt-2">
                Real-time stock tracking
              </p>
            </div>

            <div className="rounded-2xl border bg-white p-5">
              <h3 className="font-semibold">Sales</h3>
              <p className="text-sm text-zinc-500 mt-2">
                Complete sales workflow
              </p>
            </div>

            <div className="rounded-2xl border bg-white p-5">
              <h3 className="font-semibold">Suppliers</h3>
              <p className="text-sm text-zinc-500 mt-2">
                Supplier relationship management
              </p>
            </div>

            <div className="rounded-2xl border bg-white p-5">
              <h3 className="font-semibold">Analytics</h3>
              <p className="text-sm text-zinc-500 mt-2">
                Business intelligence dashboard
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT */}
      <div className="w-full lg:w-[520px] bg-white flex items-center justify-center p-8 border-l">
        <div className="w-full max-w-md">
          <div className="mb-10">
            <h1 className="text-3xl font-bold">
              Welcome Back
            </h1>

            <p className="text-zinc-500 mt-2">
              Sign in to continue to Higoverse
            </p>
          </div>

          <form className="space-y-5">
            <div>
              <label className="text-sm font-medium">
                Email
              </label>

              <input
                type="email"
                placeholder="admin@company.com"
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-sm font-medium">
                Password
              </label>

              <input
                type="password"
                placeholder="••••••••"
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              className="w-full rounded-xl bg-blue-600 py-3 text-white font-medium hover:bg-blue-700 transition"
            >
              Sign In
            </button>
          </form>

          <p className="text-center text-sm text-zinc-500 mt-6">
            Don't have an account?{" "}
            <Link
              href="/register"
              className="text-blue-600 font-medium"
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}