"use client";

import { useEffect, useState } from "react";
import { setAuth, isAuthenticated } from "@/lib/auth";
import Loader from "@/app/components/Loader";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validate = () => {
    setError("");

    if (!email || !password) {
      setError("All fields are required");
      return false;
    }

    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

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
        setError(data.detail || "Login failed");
        setLoading(false);
        return;
      }

      setAuth(data);

      // safe redirect (no hydration issues)
      window.location.href = "/dashboard";
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  // ✅ SAFE AUTH REDIRECT (fix hydration + build issues)
  useEffect(() => {
    if (isAuthenticated()) {
      window.location.href = "/dashboard";
    }
  }, []);

  // LOADER
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white to-zinc-100 px-4">

      <div className="w-full max-w-md bg-white border shadow-2xl rounded-2xl p-8">

        {/* HEADER */}
        <h1 className="text-3xl font-bold text-zinc-900">
          Welcome Back
        </h1>

        <p className="text-zinc-500 mt-2">
          Sign in to your Higoverse workspace
        </p>

        {/* ERROR */}
        {error && (
          <div className="mt-4 p-3 text-sm rounded-lg bg-red-50 text-red-600 border border-red-200">
            {error}
          </div>
        )}

        {/* FORM */}
        <form onSubmit={handleLogin} className="mt-6 space-y-4">

          <input
            type="email"
            placeholder="Email address"
            className="w-full h-12 px-4 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full h-12 px-4 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            type="submit"
            className="w-full h-12 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {/* FOOTER */}
        <p className="text-sm text-center text-zinc-500 mt-6">
          Don’t have an account?{" "}
          <a href="/register" className="text-blue-600 font-medium">
            Create shop
          </a>
        </p>
      </div>
    </div>
  );
}
