"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    shop_name: "",
    email: "",
    phone: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ---------------- VALIDATION ----------------
  const isShopValid = form.shop_name.trim().length >= 3;
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const isPhoneValid = form.phone.trim().length >= 10;
  const isPasswordValid = form.password.trim().length >= 6;

  const canSubmit =
    isShopValid && isEmailValid && isPhoneValid && isPasswordValid;

  // ---------------- PASSWORD STRENGTH ----------------
  const strength = (() => {
    let s = 0;
    if (form.password.length >= 6) s++;
    if (form.password.length >= 10) s++;
    if (/[A-Z]/.test(form.password)) s++;
    if (/[0-9]/.test(form.password)) s++;
    if (/[^A-Za-z0-9]/.test(form.password)) s++;

    if (s <= 2) return "weak";
    if (s <= 4) return "medium";
    return "strong";
  })();

  const strengthColor =
    strength === "weak"
      ? "bg-red-500"
      : strength === "medium"
      ? "bg-yellow-500"
      : "bg-green-500";

  // ---------------- SUBMIT ----------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      setLoading(true);

      const res = await fetch(
        "https://higoverse-auth.vercel.app/api/v1/auth/register",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.detail || "Registration failed");
        return;
      }

      router.push("/login");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-50 via-white to-blue-50">

      {/* LEFT SIDE - INFORMATION PANEL */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-900 to-indigo-700 text-white">

        <div className="absolute w-[500px] h-[500px] bg-blue-500/30 blur-3xl rounded-full top-[-120px] left-[-120px]" />
        <div className="absolute w-[400px] h-[400px] bg-indigo-500/30 blur-3xl rounded-full bottom-[-100px] right-[-100px]" />

        <div className="relative z-10 p-16 flex flex-col justify-center">

          <h1 className="text-5xl font-bold leading-tight">
            Start Managing Your Business
            <br />
            Like a Modern SaaS Platform
          </h1>

          <p className="mt-5 text-blue-100 max-w-md">
            Create your shop workspace in seconds. Track inventory,
            sales, customers, and revenue in real-time.
          </p>

          {/* FEATURE LIST */}
          <div className="mt-8 space-y-3 text-blue-100 text-sm">
            <p>✔ Real-time sales tracking</p>
            <p>✔ Inventory management system</p>
            <p>✔ Multi-shop support</p>
            <p>✔ Analytics dashboard</p>
          </div>

          {/* KPI CARDS */}
          <div className="grid grid-cols-2 gap-4 mt-10">

            <div className="bg-white/10 backdrop-blur-xl border border-white/10 p-5 rounded-2xl">
              <p className="text-sm text-blue-100">Revenue</p>
              <p className="text-2xl font-bold">$24,890</p>
              <p className="text-xs text-blue-200 mt-1">+12% growth</p>
            </div>

            <div className="bg-white/10 backdrop-blur-xl border border-white/10 p-5 rounded-2xl">
              <p className="text-sm text-blue-100">Orders</p>
              <p className="text-2xl font-bold">1,840</p>
              <p className="text-xs text-blue-200 mt-1">This month</p>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE - FORM */}
      <div className="flex-1 flex items-center justify-center p-6">

        <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-2xl p-8">

          <h2 className="text-3xl font-bold text-slate-900">
            Create Your Shop
          </h2>

          <p className="text-slate-500 mt-1">
            Fill in your business details to get started
          </p>

          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">

            {/* SHOP NAME */}
            <div>
              <input
                placeholder="Shop Name (e.g. Kigali Electronics)"
                value={form.shop_name}
                onChange={(e) => updateField("shop_name", e.target.value)}
                autoComplete="off"
                className={`w-full h-14 px-4 rounded-2xl border ${
                  isShopValid || !form.shop_name
                    ? "border-slate-300 focus:border-blue-500"
                    : "border-red-500"
                } outline-none`}
              />
              <p className="text-xs text-slate-400 mt-1">
                Minimum 3 characters required
              </p>
            </div>

            {/* EMAIL */}
            <div>
              <input
                placeholder="Business Email (e.g. admin@shop.com)"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                autoComplete="off"
                className={`w-full h-14 px-4 rounded-2xl border ${
                  isEmailValid || !form.email
                    ? "border-slate-300 focus:border-blue-500"
                    : "border-red-500"
                } outline-none`}
              />
              <p className="text-xs text-slate-400 mt-1">
                Must be a valid email address
              </p>
            </div>

            {/* PHONE */}
            <div>
              <input
                placeholder="Phone Number (e.g. +2507...)"
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                autoComplete="off"
                className={`w-full h-14 px-4 rounded-2xl border ${
                  isPhoneValid || !form.phone
                    ? "border-slate-300 focus:border-blue-500"
                    : "border-red-500"
                } outline-none`}
              />
              <p className="text-xs text-slate-400 mt-1">
                Used for business notifications
              </p>
            </div>

            {/* PASSWORD */}
            <div>
              <input
                type="password"
                placeholder="Create Strong Password"
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
                autoComplete="new-password"
                className={`w-full h-14 px-4 rounded-2xl border ${
                  isPasswordValid || !form.password
                    ? "border-slate-300 focus:border-blue-500"
                    : "border-red-500"
                } outline-none`}
              />

              {form.password && (
                <div className="mt-2">
                  <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${strengthColor}`}
                      style={{
                        width:
                          strength === "weak"
                            ? "30%"
                            : strength === "medium"
                            ? "65%"
                            : "100%",
                      }}
                    />
                  </div>

                  <p className="text-xs mt-1 text-slate-500">
                    Password strength:{" "}
                    <span className="font-semibold capitalize">
                      {strength}
                    </span>
                  </p>
                </div>
              )}
            </div>

            {/* SUBMIT */}
            <button
              disabled={loading || !canSubmit}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold flex items-center justify-center disabled:opacity-50"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Create Your Shop"
              )}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}