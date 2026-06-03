"use client";

import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-6">
      <div className="w-full max-w-5xl grid lg:grid-cols-2 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl">

        {/* LEFT */}
        <div className="hidden lg:flex flex-col justify-center bg-zinc-900 text-white p-12">
          <div className="h-14 w-14 rounded-2xl bg-blue-600 mb-8" />

          <h1 className="text-5xl font-bold leading-tight">
            Welcome Back
          </h1>

          <p className="mt-6 text-zinc-300 text-lg">
            Sign in to access your inventory, sales,
            customers, suppliers and business analytics.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-white/5 p-4">
              Inventory
            </div>

            <div className="rounded-2xl bg-white/5 p-4">
              Sales
            </div>

            <div className="rounded-2xl bg-white/5 p-4">
              Customers
            </div>

            <div className="rounded-2xl bg-white/5 p-4">
              Analytics
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex items-center justify-center p-8 lg:p-14">
          <div className="w-full max-w-md">

            <div className="mb-8">
              <h2 className="text-3xl font-bold text-zinc-900">
                Sign In
              </h2>

              <p className="mt-2 text-zinc-500">
                Continue to your Higoverse workspace.
              </p>
            </div>

            <form className="space-y-5">

              <div>
                <label className="block text-sm font-semibold text-zinc-700 mb-2">
                  Email Address
                </label>

                <input
                  type="email"
                  placeholder="admin@company.com"
                  className="w-full rounded-xl border-2 border-zinc-200 bg-zinc-50 px-4 py-3.5 text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-zinc-700 mb-2">
                  Password
                </label>

                <input
                  type="password"
                  placeholder="Enter your password"
                  className="w-full rounded-xl border-2 border-zinc-200 bg-zinc-50 px-4 py-3.5 text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3.5 font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:scale-[1.01]"
              >
                Sign In
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-zinc-500">
              Don't have an account?{" "}
              <Link
                href="/register"
                className="font-semibold text-blue-600 hover:text-blue-700"
              >
                Create Account
              </Link>
            </p>

          </div>
        </div>
      </div>
    </div>
  );
}