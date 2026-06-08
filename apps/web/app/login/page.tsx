"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";

import {
  setAuth,
  isAuthenticated,
} from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    document.title =
      "Sign In | Higoverse";

    if (isAuthenticated()) {
      router.replace("/");
    }
  }, [router]);

  const handleLogin = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    setError("");

    if (!email.trim()) {
      return setError(
        "Email address is required"
      );
    }

    if (!password.trim()) {
      return setError(
        "Password is required"
      );
    }

    setLoading(true);

    try {
      const res = await fetch(
        "https://higoverse-auth.vercel.app/api/v1/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(
          data?.detail ||
            "Invalid email or password"
        );
        setLoading(false);
        return;
      }

      setAuth(data);

      router.replace("/");
    } catch {
      setError(
        "Unable to connect to the server. Please try again."
      );
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex bg-white">
      {/* LEFT SIDE */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-blue-900 to-indigo-700" />

        <div className="absolute top-[-120px] left-[-120px] w-[400px] h-[400px] bg-blue-500/30 blur-3xl rounded-full" />

        <div className="absolute bottom-[-120px] right-[-120px] w-[400px] h-[400px] bg-indigo-500/30 blur-3xl rounded-full" />

        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="flex items-center gap-3 mb-10">
            <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur" />

            <span className="font-bold text-2xl">
              Higoverse
            </span>
          </div>

          <h1 className="text-6xl font-bold leading-tight">
            Run Your Entire
            <br />
            Business From
            <br />
            One Platform
          </h1>

          <p className="mt-6 text-lg text-blue-100 max-w-xl">
            Higoverse helps
            businesses manage
            inventory, suppliers,
            customers, purchases,
            sales, reporting, and
            growth from a single
            secure cloud platform.
          </p>

          <div className="grid grid-cols-2 gap-5 mt-12 max-w-xl">
            <div className="rounded-3xl border border-white/10 bg-white/10 backdrop-blur-xl p-6">
              <div className="text-3xl font-bold">
                10K+
              </div>

              <div className="mt-2 text-blue-100 text-sm">
                Businesses Powered
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 backdrop-blur-xl p-6">
              <div className="text-3xl font-bold">
                99.9%
              </div>

              <div className="mt-2 text-blue-100 text-sm">
                System Uptime
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE */}
      <div className="flex-1 flex items-center justify-center px-6 py-10 bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl p-8">
            {/* HEADER */}
            <div className="mb-8">
              <div className="flex lg:hidden items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600" />

                <span className="font-bold text-xl">
                  Higoverse
                </span>
              </div>

              <h2 className="text-4xl font-bold text-slate-900">
                Welcome Back
              </h2>

              <p className="mt-3 text-slate-600 leading-relaxed">
                Sign in to access
                your business
                dashboard, inventory,
                customers, suppliers,
                purchases, sales, and
                reports.
              </p>
            </div>

            {/* ERROR */}
            {error && (
              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                <AlertCircle
                  size={18}
                />

                <span>{error}</span>
              </div>
            )}

            {/* FORM */}
            <form
              onSubmit={
                handleLogin
              }
              className="space-y-5"
            >
              {/* EMAIL */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Email Address
                </label>

                <div className="relative">
                  <Mail
                    size={20}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type="email"
                    placeholder="Enter your business email"
                    value={email}
                    onChange={(e) =>
                      setEmail(
                        e.target.value
                      )
                    }
                    autoComplete="email"
                    className="w-full h-14 pl-12 pr-4 rounded-2xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition"
                  />
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  Use the email
                  associated with
                  your Higoverse
                  workspace.
                </p>
              </div>

              {/* PASSWORD */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Password
                </label>

                <div className="relative">
                  <Lock
                    size={20}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    placeholder="Enter your password"
                    value={
                      password
                    }
                    onChange={(e) =>
                      setPassword(
                        e.target.value
                      )
                    }
                    autoComplete="current-password"
                    className="w-full h-14 pl-12 pr-12 rounded-2xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        !showPassword
                      )
                    }
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? (
                      <EyeOff
                        size={20}
                      />
                    ) : (
                      <Eye
                        size={20}
                      />
                    )}
                  </button>
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  Your password is
                  securely encrypted
                  and protected.
                </p>
              </div>

              {/* SECURITY NOTICE */}
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex gap-3">
                  <ShieldCheck
                    size={18}
                    className="text-blue-600 mt-0.5"
                  />

                  <p className="text-sm text-blue-800">
                    Secure
                    authentication
                    protects your
                    business data,
                    inventory records,
                    sales history, and
                    customer
                    information.
                  </p>
                </div>
              </div>

              {/* SUBMIT */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white font-semibold shadow-lg hover:shadow-xl transition flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
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

              {/* FEATURES */}
              <div className="space-y-2 pt-2">
                <div className="text-sm text-slate-600">
                  ✓ Inventory &
                  Stock Management
                </div>

                <div className="text-sm text-slate-600">
                  ✓ Supplier &
                  Customer Management
                </div>

                <div className="text-sm text-slate-600">
                  ✓ Purchase & Sales
                  Monitoring
                </div>

                <div className="text-sm text-slate-600">
                  ✓ Business Reports
                  & Analytics
                </div>
              </div>
            </form>

            {/* FOOTER */}
            <p className="text-center text-sm text-slate-500 mt-8">
              Don&apos;t have an
              account?{" "}
              <Link
                href="/register"
                className="text-blue-600 font-semibold hover:text-blue-700"
              >
                Create Workspace
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
```
