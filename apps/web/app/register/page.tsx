"use client";

import Link from "next/link";

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-6">
      <div className="w-full max-w-6xl grid lg:grid-cols-2 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl">

        {/* LEFT SIDE */}
        <div className="hidden lg:flex flex-col justify-center bg-gradient-to-br from-blue-600 to-indigo-700 p-12 text-white">
          <div className="h-14 w-14 rounded-2xl bg-white/20 mb-8" />

          <h1 className="text-5xl font-bold leading-tight">
            Start growing your business.
          </h1>

          <p className="mt-6 text-blue-100 text-lg">
            Create your Higoverse account and manage inventory,
            sales, suppliers, customers, and analytics in one place.
          </p>

          <div className="mt-10 space-y-4">
            <div>✓ Inventory Management</div>
            <div>✓ Sales & Finance</div>
            <div>✓ Customer Management</div>
            <div>✓ Supplier Network</div>
            <div>✓ Real-Time Analytics</div>
          </div>
        </div>

        {/* RIGHT SIDE */}
        <div className="flex items-center justify-center p-8 lg:p-14">
          <div className="w-full max-w-md">

            <div className="mb-8">
              <h2 className="text-3xl font-bold text-zinc-900">
                Create Account
              </h2>

              <p className="mt-2 text-zinc-500">
                Set up your business in less than 2 minutes.
              </p>
            </div>

            <form className="space-y-5">

              <div>
                <label className="block text-sm font-semibold text-zinc-700 mb-2">
                  Shop Name
                </label>

                <input
                  type="text"
                  placeholder="Higoverse Store"
                  className="w-full rounded-xl border-2 border-zinc-200 bg-zinc-50 px-4 py-3.5 text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
              </div>

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
                  Phone Number
                </label>

                <input
                  type="text"
                  placeholder="+250 788 000 000"
                  className="w-full rounded-xl border-2 border-zinc-200 bg-zinc-50 px-4 py-3.5 text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-zinc-700 mb-2">
                  Password
                </label>

                <input
                  type="password"
                  placeholder="Create a strong password"
                  className="w-full rounded-xl border-2 border-zinc-200 bg-zinc-50 px-4 py-3.5 text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3.5 font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:scale-[1.01]"
              >
                Create Account
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-zinc-500">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-blue-600 hover:text-blue-700"
              >
                Sign In
              </Link>
            </p>

          </div>
        </div>
      </div>
    </div>
  );
}