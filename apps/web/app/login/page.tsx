"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Head from "next/head";
import { setAuth, isAuthenticated } from "@/lib/auth";

import {
  Mail,
  Lock,
  Loader2,
  Activity,
  Boxes,
  DollarSign,
  Truck,
  BarChart3,
  ShieldCheck,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/");
    }
  }, [router]);

  const validateForm = useCallback(() => {
    if (!email.trim()) return "Email is required";
    if (!email.includes("@")) return "Enter a valid email";
    if (!password.trim()) return "Password is required";
    if (password.length < 4) return "Password must be at least 4 characters";
    return "";
  }, [email, password]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(
        "https://higoverse-auth.vercel.app/api/v1/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.detail || "Invalid credentials");
        return;
      }

      setAuth(data);
      router.replace("/");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Login | Higoverse</title>
      </Head>

      <div className="min-h-screen flex bg-white">

        {/* ================= LEFT PANEL ================= */}
        <div className="hidden lg:flex w-1/2 relative overflow-hidden">

          <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-blue-900 to-indigo-700" />

          <div className="absolute top-[-120px] left-[-120px] w-[400px] h-[400px] bg-blue-500/30 blur-3xl rounded-full" />
          <div className="absolute bottom-[-120px] right-[-120px] w-[400px] h-[400px] bg-indigo-500/30 blur-3xl rounded-full" />

          <div className="relative z-10 flex flex-col justify-center px-16 text-white">

            {/* BRAND */}
            <div className="flex items-center gap-3 mb-10">
              <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <span className="font-bold text-2xl">Higoverse</span>
            </div>

            {/* TITLE */}
            <h1 className="text-5xl font-bold leading-tight">
              Run Your Entire <br />
              Business in Real Time
            </h1>

            <p className="mt-5 text-lg text-blue-100 max-w-xl">
              A unified SaaS platform to manage inventory, sales, suppliers,
              customers, and analytics in one system.
            </p>

            {/* FEATURE GRID */}
            <div className="mt-10 grid grid-cols-2 gap-4 max-w-xl">

              <div className="bg-white/10 border border-white/20 rounded-2xl p-4 backdrop-blur">
                <Boxes className="w-5 h-5 mb-2 text-white" />
                <p className="font-semibold">Inventory</p>
                <p className="text-sm text-blue-100">
                  Real-time stock tracking
                </p>
              </div>

              <div className="bg-white/10 border border-white/20 rounded-2xl p-4 backdrop-blur">
                <DollarSign className="w-5 h-5 mb-2 text-white" />
                <p className="font-semibold">Sales</p>
                <p className="text-sm text-blue-100">
                  Instant transaction monitoring
                </p>
              </div>

              <div className="bg-white/10 border border-white/20 rounded-2xl p-4 backdrop-blur">
                <Truck className="w-5 h-5 mb-2 text-white" />
                <p className="font-semibold">Suppliers</p>
                <p className="text-sm text-blue-100">
                  Procurement management system
                </p>
              </div>

              <div className="bg-white/10 border border-white/20 rounded-2xl p-4 backdrop-blur">
                <BarChart3 className="w-5 h-5 mb-2 text-white" />
                <p className="font-semibold">Analytics</p>
                <p className="text-sm text-blue-100">
                  Business insights & reporting
                </p>
              </div>
            </div>

            {/* TRUST STRIP */}
            <div className="mt-10 flex items-center gap-6 text-sm text-blue-100">

              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-white" />
                Secure Authentication
              </div>

              <div className="w-1 h-1 bg-blue-300 rounded-full" />

              <div>
                Real-time synchronization
              </div>

              <div className="w-1 h-1 bg-blue-300 rounded-full" />

              <div>
                99.9% uptime
              </div>

            </div>

          </div>
        </div>

        {/* ================= RIGHT PANEL ================= */}
        <div className="flex-1 flex items-center justify-center px-6 bg-gradient-to-br from-slate-50 to-blue-50">

          <div className="w-full max-w-md">

            <div className="bg-white rounded-3xl shadow-xl border p-8">

              <h2 className="text-3xl font-bold text-slate-900">
                Workspace sign in
              </h2>

              <p className="text-slate-500 mb-6">
                Sign in to your shop
              </p>

              {error && (
                <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5">

                {/* EMAIL */}
                <div>
                  <label className="block text-sm text-gray-900 font-medium mb-2">
                    Email Address
                  </label>

                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />

                    <input
                      type="email"
                      placeholder="Enter Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-14 pl-12 pr-4 rounded-2xl border border-slate-300 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 text-gray-700 outline-none"
                    />
                  </div>
                </div>

                {/* PASSWORD */}
                <div>
                  <label className="block text-sm text-gray-900 font-medium mb-2">
                    Password
                  </label>

                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />

                    <input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full h-14 pl-12 pr-4 rounded-2xl border text-gray-700 border-slate-300 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>

                {/* BUTTON */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-14 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Signing In...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </button>

              </form>

              <p className="text-center text-sm text-slate-500 mt-6">
                Don’t have an account?{" "}
                <a href="/register" className="text-blue-600 font-medium">
                  Create Workspace
                </a>
              </p>

            </div>
          </div>
        </div>

      </div>
    </>
  );
}
