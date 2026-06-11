"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Head from "next/head";
import { setAuth, isAuthenticated } from "@/lib/auth";
import { Mail, Lock, Loader2 } from "lucide-react";

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
    if (!email.includes("@")) return "Enter a valid email";
    if (password.length < 4) return "Password too short";
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
        <meta
          name="description"
          content="Sign in to Higoverse business dashboard"
        />
      </Head>

      <div className="min-h-screen flex bg-white">

        {/* LEFT SIDE */}
        <div className="hidden lg:flex w-1/2 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-blue-900 to-indigo-700" />

          <div className="relative z-10 flex flex-col justify-center px-16 text-white">
            <h1 className="text-5xl font-bold leading-tight">
              Welcome Back 👋
            </h1>
            <p className="mt-6 text-blue-100 text-lg">
              Manage your business operations, sales, inventory, and analytics in real time.
            </p>
          </div>
        </div>

        {/* RIGHT SIDE */}
        <div className="flex-1 flex items-center justify-center px-6 bg-gradient-to-br from-slate-50 to-blue-50">
          <div className="w-full max-w-md">

            <div className="bg-white rounded-3xl shadow-xl border p-8">

              <h2 className="text-3xl font-bold text-slate-900">
                Sign In
              </h2>
              <p className="text-slate-500 mb-6">
                Enter your credentials to continue
              </p>

              {error && (
                <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5">

                {/* EMAIL */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Email Address
                  </label>

                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />

                    <input
                      type="email"
                      placeholder="admin@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-14 pl-12 pr-4 rounded-2xl border border-slate-300 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>

                {/* PASSWORD */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Password
                  </label>

                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />

                    <input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full h-14 pl-12 pr-4 rounded-2xl border border-slate-300 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
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
