"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Head from "next/head";
import { setAuth, isAuthenticated } from "@/lib/auth";

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
    if (!password.trim()) return "Password is required";
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
          headers: {
            "Content-Type": "application/json",
          },
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
        <meta
          name="description"
          content="Sign in to Higoverse and manage your business dashboard including sales, inventory, customers, suppliers, and analytics."
        />
        <meta name="robots" content="index, follow" />
      </Head>

      <div className="min-h-screen flex bg-white">
        {/* LEFT PANEL */}
        <div className="hidden lg:flex w-1/2 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-blue-900 to-indigo-700" />
          <div className="absolute top-[-120px] left-[-120px] w-[400px] h-[400px] bg-blue-500/30 blur-3xl rounded-full" />
          <div className="absolute bottom-[-120px] right-[-120px] w-[400px] h-[400px] bg-indigo-500/30 blur-3xl rounded-full" />

          <div className="relative z-10 flex flex-col justify-center px-16 text-white">
            <div className="flex items-center gap-3 mb-10">
              <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur" />
              <span className="font-bold text-2xl">Higoverse</span>
            </div>

            <h1 className="text-6xl font-bold leading-tight">
              Run Your Entire <br />
              Business From <br />
              One Platform
            </h1>

            <p className="mt-6 text-lg text-blue-100 max-w-xl">
              Inventory, sales, suppliers, customers, analytics, finance and intelligence — all in one SaaS system.
            </p>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="flex-1 flex items-center justify-center px-6 py-10 bg-gradient-to-br from-slate-50 via-white to-blue-50">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl p-8">
              
              <h2 className="text-4xl font-bold text-slate-900 mb-2">
                Sign In
              </h2>
              <p className="text-slate-500 mb-6">
                Access your business dashboard
              </p>

              {error && (
                <div className="mb-4 p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="admin@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-14 px-4 rounded-2xl border border-slate-300 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-14 px-4 rounded-2xl border border-slate-300 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-14 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold disabled:opacity-70"
                >
                  {loading ? "Signing In..." : "Sign In"}
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
