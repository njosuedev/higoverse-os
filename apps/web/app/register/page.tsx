"use client";

import Link from "next/link";

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center p-6">
      <div className="w-full max-w-6xl grid lg:grid-cols-2 overflow-hidden rounded-3xl border bg-white shadow-2xl">

        {/* LEFT */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-12 flex flex-col justify-center">
          <div className="h-14 w-14 rounded-2xl bg-white/20 mb-8" />

          <h1 className="text-5xl font-bold leading-tight">
            Start growing your business today.
          </h1>

          <p className="mt-6 text-blue-100">
            Join thousands of businesses using Higoverse
            to manage inventory, sales, customers and suppliers.
          </p>

          <div className="mt-10 space-y-4">
            <div>✓ Inventory Management</div>
            <div>✓ Sales & Finance</div>
            <div>✓ Supplier Network</div>
            <div>✓ Real-Time Analytics</div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="p-10 lg:p-14">
          <h2 className="text-3xl font-bold">
            Create Your Account
          </h2>

          <p className="text-zinc-500 mt-2">
            Set up your business in minutes.
          </p>

          <form className="mt-8 space-y-5">
            <input
              placeholder="Shop Name"
              className="w-full rounded-xl border px-4 py-3"
            />

            <input
              placeholder="Email"
              className="w-full rounded-xl border px-4 py-3"
            />

            <input
              placeholder="Phone Number"
              className="w-full rounded-xl border px-4 py-3"
            />

            <input
              type="password"
              placeholder="Password"
              className="w-full rounded-xl border px-4 py-3"
            />

            <button
              className="w-full rounded-xl bg-blue-600 py-3 text-white font-medium hover:bg-blue-700"
            >
              Create Account
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-500">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-blue-600 font-medium"
            >
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}