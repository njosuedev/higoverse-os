"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setAuth, isAuthenticated } from "@/lib/auth";
import { Mail, Lock, LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthenticated()) router.replace("/dashboard");
  }, [router]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) return setError("Email is required");
    if (!password.trim()) return setError("Password is required");

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
        setLoading(false);
        return;
      }

      setAuth(data);
      router.replace("/dashboard");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gradient-to-br from-slate-50 via-white to-blue-50">

      {/* LEFT INFO */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-slate-950 via-blue-900 to-indigo-800 text-white">
        <div className="flex flex-col justify-center px-16">
          <h1 className="text-5xl font-bold leading-tight">
            Run your entire business in one system
          </h1>

          <p className="mt-6 text-blue-100 text-lg">
            Higoverse centralizes inventory, sales, customers, suppliers and analytics.
          </p>

          <div className="mt-10 space-y-3 text-blue-100 text-sm">
            <p>✔ Real-time business tracking</p>
            <p>✔ Smart analytics dashboard</p>
            <p>✔ Secure enterprise login</p>
          </div>
        </div>
      </div>

      {/* RIGHT FORM */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 py-10">

        <div className="w-full max-w-md">

          {/* BRAND */}
          <div className="text-center lg:text-left mb-8">
            <div className="flex items-center justify-center lg:justify-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600" />
              <span className="text-xl font-bold text-slate-900">
                Higoverse
              </span>
            </div>

            <h2 className="text-3xl font-bold text-slate-900">
              Welcome back
            </h2>

            <p className="mt-2 text-slate-600 text-sm">
              Sign in to access your business dashboard
            </p>
          </div>

          {/* CARD */}
          <div className="bg-white/90 backdrop-blur-xl border border-slate-200 shadow-xl rounded-2xl p-6 sm:p-8">

            {error && (
              <div className="mb-5 bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-xl">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">

              {/* EMAIL */}
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Email Address
                </label>

                <div className="relative mt-2">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />

                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}

                    // 👇 IMPROVED PLACEHOLDER (VISIBLE + INFORMATIVE)
                    placeholder="Enter your business email (e.g. admin@company.com)"

                    className="w-full h-12 sm:h-14 pl-10 pr-4 rounded-xl border border-slate-300
                    text-slate-900 placeholder:text-slate-500 placeholder:opacity-100
                    focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition"
                  />
                </div>
              </div>

              {/* PASSWORD */}
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Password
                </label>

                <div className="relative mt-2">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />

                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}

                    // 👇 IMPROVED PLACEHOLDER
                    placeholder="Enter your secure password (min 8 characters)"

                    className="w-full h-12 sm:h-14 pl-10 pr-4 rounded-xl border border-slate-300
                    text-slate-900 placeholder:text-slate-500 placeholder:opacity-100
                    focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition"
                  />
                </div>
              </div>

              {/* BUTTON */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 sm:h-14 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600
                text-white font-semibold shadow-md hover:shadow-lg transition flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            {/* FOOTER */}
            <p className="text-center text-sm text-slate-500 mt-6">
              Don’t have an account?{" "}
              <a href="/register" className="text-blue-600 font-medium">
                Create workspace
              </a>
            </p>

          </div>
        </div>
      </div>
    </div>
  );
}