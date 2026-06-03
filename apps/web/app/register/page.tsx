"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Mail,
  Phone,
  Lock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    shop_name: "",
    email: "",
    phone: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ================= LIVE VALIDATION =================
  const validation = {
    shop_name: {
      valid: form.shop_name.trim().length >= 3,
      msg: "Minimum 3 characters required",
    },
    email: {
      valid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email),
      msg: "Enter a valid email address",
    },
    phone: {
      valid: form.phone.trim().length >= 10,
      msg: "Phone must be at least 10 digits",
    },
    password: {
      valid: form.password.length >= 6,
      msg: "Minimum 6 characters required",
    },
  };

  const canSubmit =
    validation.shop_name.valid &&
    validation.email.valid &&
    validation.phone.valid &&
    validation.password.valid;

  // ================= PASSWORD STRENGTH =================
  const strength = (() => {
    let s = 0;
    if (form.password.length >= 6) s++;
    if (form.password.length >= 10) s++;
    if (/[A-Z]/.test(form.password)) s++;
    if (/[0-9]/.test(form.password)) s++;
    if (/[^A-Za-z0-9]/.test(form.password)) s++;

    if (s <= 2) return "weak";
    if (s <= 4) return "medium";
    return "strong";
  })();

  const strengthColor =
    strength === "weak"
      ? "bg-red-500"
      : strength === "medium"
      ? "bg-orange-500"
      : "bg-blue-600";

  const inputClass = (valid: boolean, value: string) =>
    `w-full h-12 sm:h-14 pl-11 pr-4 rounded-xl border outline-none transition bg-white
    ${
      value.length === 0
        ? "border-slate-300 focus:border-blue-500"
        : valid
        ? "border-blue-400 focus:border-blue-600"
        : "border-red-400 focus:border-red-500"
    }
    focus:ring-4 focus:ring-blue-100 text-slate-900 placeholder:text-slate-400`;

  // ================= SUBMIT =================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      setLoading(true);

      const res = await fetch(
        "https://higoverse-auth.vercel.app/api/v1/auth/register",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.detail || "Registration failed");
        return;
      }

      router.push("/login");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gradient-to-br from-slate-50 via-white to-blue-50">

      {/* ================= LEFT INFO PANEL ================= */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-slate-950 via-blue-900 to-indigo-700 text-white relative overflow-hidden">

        {/* decorative glow */}
        <div className="absolute w-[400px] h-[400px] bg-blue-500/30 blur-3xl rounded-full top-[-100px] left-[-100px]" />
        <div className="absolute w-[400px] h-[400px] bg-indigo-500/30 blur-3xl rounded-full bottom-[-120px] right-[-120px]" />

        <div className="relative z-10 flex flex-col justify-center px-14">
          <h1 className="text-5xl font-bold leading-tight">
            Build & Manage Your Business
          </h1>

          <p className="mt-5 text-blue-100 text-lg">
            Create your workspace and access inventory, sales, customers,
            and analytics in one powerful system.
          </p>

          {/* INFO POINTS */}
          <div className="mt-8 space-y-3 text-blue-100 text-sm">
            <p>✔ Real-time business tracking</p>
            <p>✔ Inventory & sales control</p>
            <p>✔ Secure cloud system</p>
            <p>✔ Smart analytics dashboard</p>
          </div>

          {/* MINI STATS */}
          <div className="grid grid-cols-2 gap-4 mt-10">
            <div className="bg-white/10 backdrop-blur-xl p-4 rounded-2xl">
              <p className="text-sm text-blue-100">Active Shops</p>
              <p className="text-2xl font-bold">10K+</p>
            </div>

            <div className="bg-white/10 backdrop-blur-xl p-4 rounded-2xl">
              <p className="text-sm text-blue-100">Uptime</p>
              <p className="text-2xl font-bold">99.9%</p>
            </div>
          </div>
        </div>
      </div>

      {/* ================= FORM ================= */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 py-10">

        <div className="w-full max-w-md">

          {/* HEADER */}
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-slate-900">
              Create Workspace
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Fill all fields to continue
            </p>
          </div>

          {/* ERROR BOX */}
          {error && (
            <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* SHOP NAME */}
            <div className="relative">
              <Building2 className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
              <input
                value={form.shop_name}
                onChange={(e) => updateField("shop_name", e.target.value)}
                placeholder="Shop Name (e.g. Kigali Electronics)"
                autoComplete="off"
                className={inputClass(
                  validation.shop_name.valid,
                  form.shop_name
                )}
              />
              <p className="text-xs mt-1 text-slate-500">
                {validation.shop_name.valid ? (
                  <span className="text-blue-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Looks good
                  </span>
                ) : (
                  validation.shop_name.msg
                )}
              </p>
            </div>

            {/* EMAIL */}
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
              <input
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="Business Email (admin@shop.com)"
                autoComplete="off"
                className={inputClass(validation.email.valid, form.email)}
              />
              <p className="text-xs mt-1 text-slate-500">
                {validation.email.valid ? (
                  <span className="text-blue-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Valid email
                  </span>
                ) : (
                  validation.email.msg
                )}
              </p>
            </div>

            {/* PHONE */}
            <div className="relative">
              <Phone className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
              <input
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="Phone (+250...)"
                autoComplete="off"
                className={inputClass(validation.phone.valid, form.phone)}
              />
              <p className="text-xs mt-1 text-slate-500">
                {validation.phone.valid ? (
                  <span className="text-blue-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Valid phone
                  </span>
                ) : (
                  validation.phone.msg
                )}
              </p>
            </div>

            {/* PASSWORD */}
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
              <input
                type="password"
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
                placeholder="Create strong password"
                autoComplete="new-password"
                className={inputClass(
                  validation.password.valid,
                  form.password
                )}
              />

              {/* STRENGTH BAR */}
              {form.password && (
                <div className="mt-2">
                  <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${strengthColor}`}
                      style={{
                        width:
                          strength === "weak"
                            ? "30%"
                            : strength === "medium"
                            ? "65%"
                            : "100%",
                      }}
                    />
                  </div>
                  <p className="text-xs mt-1 text-slate-500">
                    Password strength:{" "}
                    <span className="font-semibold capitalize">
                      {strength}
                    </span>
                  </p>
                </div>
              )}
            </div>

            {/* BUTTON */}
            <button
              disabled={!canSubmit || loading}
              className="w-full h-12 sm:h-14 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold disabled:opacity-50 transition flex items-center justify-center"
            >
              {loading ? "Creating..." : "Create Workspace"}
            </button>
          </form>

          {/* LOGIN LINK */}
          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}