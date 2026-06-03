"use client";

import { useState } from "react";
import { setAuth, isAuthenticated } from "@/lib/auth";
import Loader from "@/components/Loader";

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
      window.location.replace("/dashboard");
    } catch {
      setError("Network error");
      setLoading(false);
    }
  };

  if (typeof window !== "undefined" && isAuthenticated()) {
    window.location.replace("/dashboard");
    return null;
  }

  if (loading) return <Loader />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">

      <div className="w-full max-w-md bg-white border shadow-xl rounded-2xl p-8">

        {/* TITLE */}
        <h1 className="text-3xl font-bold text-zinc-900">
          Welcome Back
        </h1>

        <p className="text-zinc-500 mt-2">
          Sign in to your Higoverse shop
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
            className="w-full h-12 px-4 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full h-12 px-4 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            type="submit"
            className="w-full h-12 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
          >
            Sign In
          </button>
        </form>

        <p className="text-sm text-center text-zinc-500 mt-6">
          Don’t have an account?{" "}
          <a href="/register" className="text-blue-600">
            Create shop
          </a>
        </p>
      </div>
    </div>
  );
}
