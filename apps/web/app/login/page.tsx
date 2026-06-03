"use client";

import { useEffect, useState } from "react";
import { setAuth, isAuthenticated } from "@/lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthenticated()) {
      window.location.replace("/dashboard");
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    setError("");

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    if (!password.trim()) {
      setError("Password is required");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        "https://higoverse-auth.vercel.app/api/v1/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.detail || "Invalid email or password");
        setLoading(false);
        return;
      }

      setAuth(data);

      window.location.replace("/dashboard");
    } catch {
      setError("Unable to connect to server");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* LEFT SIDE */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-blue-900 to-indigo-700" />

        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="flex items-center gap-3 mb-10">
            <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur" />
            <span className="font-bold text-2xl">Higoverse</span>
          </div>

          <h1 className="text-6xl font-bold leading-tight">
            Run Your Entire
            <br />
            Business From
            <br />
            One Platform
          </h1>

          <p className="mt-6 text-lg text-blue-100 max-w-xl">
            Inventory, sales, suppliers, customers, analytics,
            finance and business intelligence in one modern
            operating system.
          </p>

          <div className="grid grid-cols-2 gap-5 mt-12 max-w-xl">
            <div className="rounded-3xl border border-white/10 bg-white/10 backdrop-blur-xl p-6">
              <div className="text-3xl font-bold">10K+</div>
              <div className="mt-2 text-blue-100">
                Businesses Managed
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 backdrop-blur-xl p-6">
              <div className="text-3xl font-bold">99.9%</div>
              <div className="mt-2 text-blue-100">
                Platform Uptime
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE */}
      <div className="flex-1 flex items-center justify-center px-6 py-10 bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl p-8">
            <div className="mb-8">
              <div className="flex lg:hidden items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600" />
                <span className="font-bold text-xl">Higoverse</span>
              </div>

              <h2 className="text-4xl font-bold text-slate-900">
                Sign In
              </h2>

              <p className="mt-2 text-slate-500">
                Access your business workspace
              </p>
            </div>

            {error && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Email Address
                </label>

                <input
                  type="email"
                  placeholder="admin@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className="w-full h-14 rounded-2xl border border-slate-300 bg-white px-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Password
                </label>

                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full h-14 rounded-2xl border border-slate-300 bg-white px-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500 transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white font-semibold shadow-lg hover:shadow-xl transition disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing In...
                  </>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>

            <div className="mt-8 text-center text-slate-500">
              Don't have an account?
              <a
                href="/register"
                className="ml-2 font-medium text-blue-600 hover:text-blue-700"
              >
                Create Workspace
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}