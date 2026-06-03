"use client";

import { useState } from "react";
import { setAuth, isAuthenticated } from "@/lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
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
      window.location.href = "/dashboard";
    } catch {
      setError("Network error");
      setLoading(false);
    }
  };

  if (typeof window !== "undefined" && isAuthenticated()) {
    window.location.href = "/dashboard";
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white to-blue-50 px-4">

      <div className="w-full max-w-md bg-white border rounded-2xl shadow-xl p-8">

        <h1 className="text-3xl font-bold text-zinc-900">
          Welcome back
        </h1>

        <p className="text-zinc-500 mt-2">
          Sign in to your Higoverse workspace
        </p>

        {error && (
          <div className="mt-4 bg-red-50 text-red-600 p-3 rounded-lg text-sm border">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="mt-6 space-y-4">

          <input
            className="w-full h-12 px-4 rounded-xl border focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="w-full h-12 px-4 rounded-xl border focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            disabled={loading}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-medium flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <p className="text-sm text-center mt-6 text-zinc-500">
          No account?
          <a className="text-blue-600 ml-1" href="/register">
            Create shop
          </a>
        </p>
      </div>
    </div>
  );
}
