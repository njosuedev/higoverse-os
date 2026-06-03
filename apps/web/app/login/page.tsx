"use client";

import { useState } from "react";
import { setAuth, isAuthenticated } from "@/lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // --------------------------
  // BASIC VALIDATION
  // --------------------------
  const validate = () => {
    setError("");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email || !password) {
      setError("All fields are required");
      return false;
    }

    if (!emailRegex.test(email)) {
      setError("Invalid email format");
      return false;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return false;
    }

    return true;
  };

  // --------------------------
  // LOGIN HANDLER
  // --------------------------
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(
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

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Login failed");
        setLoading(false);
        return;
      }

      // ✅ STORE AUTH (token + user)
      setAuth(data);

      // ✅ PREVENT BACK NAV TO LOGIN
      window.location.replace("/dashboard");
    } catch (err) {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // --------------------------
  // AUTO REDIRECT IF ALREADY LOGGED IN
  // --------------------------
  if (typeof window !== "undefined" && isAuthenticated()) {
    window.location.replace("/dashboard");
    return null;
  }

  return (
    <div className="min-h-screen bg-black flex">

      {/* LEFT SIDE */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-700 via-indigo-600 to-purple-700" />
        <div className="absolute inset-0 backdrop-blur-3xl bg-black/10" />

        <div className="relative z-10 flex flex-col justify-center px-20 text-white">
          <div className="mb-10">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md mb-6" />

            <h1 className="text-6xl font-bold leading-tight">
              Welcome Back to
              <span className="block text-blue-200">Higoverse</span>
            </h1>

            <p className="mt-6 text-xl text-white/80 max-w-lg">
              The modern operating system for inventory, sales, suppliers,
              customers and business intelligence.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-5 max-w-xl">
            <div className="rounded-2xl bg-white/10 backdrop-blur-xl p-5 border border-white/10">
              <div className="text-3xl font-bold">10K+</div>
              <div className="text-white/70 text-sm mt-1">Businesses Managed</div>
            </div>

            <div className="rounded-2xl bg-white/10 backdrop-blur-xl p-5 border border-white/10">
              <div className="text-3xl font-bold">99.9%</div>
              <div className="text-white/70 text-sm mt-1">System Uptime</div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE */}
      <div className="flex-1 flex items-center justify-center bg-zinc-950 px-6">

        <div className="w-full max-w-md">

          <div className="mb-10">
            <h2 className="text-4xl font-bold text-white">
              Sign In
            </h2>

            <p className="text-zinc-400 mt-3">
              Access your business workspace
            </p>
          </div>

          {/* ERROR MESSAGE */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">

            {/* EMAIL */}
            <div>
              <label className="block text-sm text-zinc-300 mb-2">
                Email Address
              </label>

              <input
                type="email"
                placeholder="admin@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-14 rounded-xl bg-zinc-900 border border-zinc-700 px-4 text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20"
              />
            </div>

            {/* PASSWORD */}
            <div>
              <label className="block text-sm text-zinc-300 mb-2">
                Password
              </label>

              <input
                type="password"
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-14 rounded-xl bg-zinc-900 border border-zinc-700 px-4 text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20"
              />
            </div>

            {/* BUTTON */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full h-14 rounded-xl font-semibold transition ${
                loading
                  ? "bg-zinc-700 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90"
              } text-white`}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          {/* REGISTER */}
          <div className="mt-8 text-center text-zinc-400">
            Don't have an account?
            <a
              href="/register"
              className="text-blue-400 ml-2 hover:text-blue-300"
            >
              Create Workspace
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
