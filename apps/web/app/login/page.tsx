"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";

import { isAuthenticated, setAuth } from "@/lib/auth";

const inputClass =
  "w-full h-14 rounded-2xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] =
    useState(false);
  const [loading, setLoading] =
    useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/");
    }
  }, [router]);

  async function handleLogin(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setError("");

    if (!email.trim())
      return setError(
        "Email address is required"
      );

    if (!password.trim())
      return setError(
        "Password is required"
      );

    try {
      setLoading(true);

      const response = await fetch(
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

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data?.detail ||
            "Invalid credentials"
        );
        return;
      }

      setAuth(data);
      router.replace("/");
    } catch {
      setError(
        "Network error. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex bg-white">
      {/* LEFT */}
      <section className="hidden lg:flex w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-blue-900 to-indigo-700" />

        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-500/30 blur-3xl rounded-full" />

        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-500/30 blur-3xl rounded-full" />

        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="flex items-center gap-3 mb-10">
            <div className="h-12 w-12 rounded-2xl bg-white/20" />
            <span className="text-2xl font-bold">
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
            Manage inventory,
            suppliers, customers,
            purchases, sales, and
            reporting from one secure
            cloud platform.
          </p>

          <div className="grid grid-cols-2 gap-5 mt-12 max-w-xl">
            <div className="rounded-3xl bg-white/10 border border-white/10 p-6 backdrop-blur">
              <h3 className="text-3xl font-bold">
                10K+
              </h3>
              <p className="mt-2 text-sm text-blue-100">
                Businesses Powered
              </p>
            </div>

            <div className="rounded-3xl bg-white/10 border border-white/10 p-6 backdrop-blur">
              <h3 className="text-3xl font-bold">
                99.9%
              </h3>
              <p className="mt-2 text-sm text-blue-100">
                System Uptime
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* RIGHT */}
      <section className="flex-1 flex items-center justify-center px-6 py-10 bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl p-8">
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

              <p className="mt-3 text-slate-600">
                Access your business
                dashboard securely.
              </p>
            </div>

            {error && (
              <div className="mb-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                <AlertCircle size={18} />
                {error}
              </div>
            )}

            <form
              onSubmit={handleLogin}
              className="space-y-5"
            >
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-700">
                  Email Address
                </label>

                <div className="relative">
                  <Mail
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type="email"
                    value={email}
                    onChange={(e) =>
                      setEmail(
                        e.target.value
                      )
                    }
                    placeholder="admin@company.com"
                    autoComplete="email"
                    className={`${inputClass} pl-12`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-slate-700">
                  Password
                </label>

                <div className="relative">
                  <Lock
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    value={password}
                    onChange={(e) =>
                      setPassword(
                        e.target.value
                      )
                    }
                    placeholder="Enter password"
                    autoComplete="current-password"
                    className={`${inputClass} pl-12 pr-12`}
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (prev) =>
                          !prev
                      )
                    }
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    {showPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex gap-2">
                  <ShieldCheck
                    size={18}
                    className="text-blue-600 mt-0.5"
                  />

                  <p className="text-sm text-blue-800">
                    Your business data is
                    protected using secure
                    authentication.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white font-semibold flex items-center justify-center gap-3 disabled:opacity-70"
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

            <p className="text-center text-sm text-slate-500 mt-8">
              Don't have an account?{" "}
              <Link
                href="/register"
                className="text-blue-600 font-semibold"
              >
                Create Workspace
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
```
