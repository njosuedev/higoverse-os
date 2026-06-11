"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Head from "next/head";
import { setAuth, isAuthenticated } from "@/lib/auth";

import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Package,
  Users,
  TrendingUp,
  BarChart3,
  ShieldCheck,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/");
    }
  }, [router]);

  // VALIDATION
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordValid = password.length >= 6;

  const validateForm = useCallback(() => {
    if (!email.trim()) return "Email is required";
    if (!emailValid) return "Enter a valid email address";
    if (!password.trim()) return "Password is required";
    if (!passwordValid) return "Password must be at least 6 characters";
    return "";
  }, [email, password, emailValid, passwordValid]);

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
          content="Sign in to Higoverse business dashboard"
        />
      </Head>

      <div className="min-h-screen flex bg-white">

        {/* LEFT PANEL */}
        <div className="hidden lg:flex w-1/2 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-blue-900 to-indigo-700" />

          <div className="relative z-10 flex flex-col justify-center px-16 text-white">

            <div className="flex items-center gap-3 mb-10">
              <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur" />
              <span className="font-bold text-2xl">Higoverse</span>
            </div>

            <h1 className="text-5xl font-bold leading-tight">
              Run Your Entire Business From One Platform
            </h1>

            <p className="mt-6 text-blue-100">
              Inventory, sales, suppliers, customers, analytics and reports in one system.
            </p>

            {/* INFO CARDS */}
            <div className="grid grid-cols-2 gap-4 mt-10">
              <div className="bg-white/10 p-4 rounded-2xl">
                <Package className="mb-2" />
                <p className="font-bold">Inventory</p>
                <p className="text-sm text-blue-100">Stock tracking</p>
              </div>

              <div className="bg-white/10 p-4 rounded-2xl">
                <Users className="mb-2" />
                <p className="font-bold">Customers</p>
                <p className="text-sm text-blue-100">CRM system</p>
              </div>

              <div className="bg-white/10 p-4 rounded-2xl">
                <TrendingUp className="mb-2" />
                <p className="font-bold">Sales</p>
                <p className="text-sm text-blue-100">Revenue tracking</p>
              </div>

              <div className="bg-white/10 p-4 rounded-2xl">
                <BarChart3 className="mb-2" />
                <p className="font-bold">Reports</p>
                <p className="text-sm text-blue-100">Analytics</p>
              </div>
            </div>

          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="flex-1 flex items-center justify-center px-6 bg-gradient-to-br from-slate-50 to-blue-50">

          <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-2xl border">

            <h2 className="text-3xl font-bold">Sign In</h2>
            <p className="text-slate-500 mb-6">
              Access your business dashboard
            </p>

            {error && (
              <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 rounded-xl border">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">

              {/* EMAIL */}
              <div>
                <label className="text-sm font-medium">Email</label>

                <div className="relative mt-2">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />

                  <input
                    type="email"
                    placeholder="admin@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`w-full h-14 pl-12 pr-10 rounded-2xl border outline-none
                      ${email.length === 0
                        ? "border-slate-300"
                        : emailValid
                        ? "border-green-500"
                        : "border-red-500"
                      }`}
                  />

                  {email.length > 0 && (
                    emailValid ? (
                      <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500" />
                    ) : (
                      <AlertCircle className="absolute right-4 top-1/2 -translate-y-1/2 text-red-500" />
                    )
                  )}
                </div>
              </div>

              {/* PASSWORD */}
              <div>
                <label className="text-sm font-medium">Password</label>

                <div className="relative mt-2">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />

                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`w-full h-14 pl-12 pr-12 rounded-2xl border outline-none
                      ${password.length === 0
                        ? "border-slate-300"
                        : passwordValid
                        ? "border-green-500"
                        : "border-red-500"
                      }`}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2"
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </div>

              {/* BUTTON */}
              <button
                type="submit"
                disabled={loading || !emailValid || !passwordValid}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Signing In...
                  </>
                ) : (
                  "Sign In"
                )}
              </button>

            </form>

            {/* SECURITY NOTE */}
            <div className="mt-6 p-4 bg-blue-50 rounded-2xl border">
              <div className="flex gap-3">
                <ShieldCheck className="text-blue-600" />
                <p className="text-sm text-slate-600">
                  Secure access to your business dashboard.
                </p>
              </div>
            </div>

          </div>
        </div>

      </div>
    </>
  );
}
