"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import {
  Mail, Lock, Loader2, Boxes, DollarSign,
  Truck, BarChart3, ShieldCheck, CheckCircle2,
  KeyRound, ArrowLeft, Eye, EyeOff, RefreshCw,
} from "lucide-react";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_API || "https://higoverse-auth.vercel.app";

type Step = "login" | "forgot" | "otp" | "success";

export default function LoginPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";
  const { login, user, ready } = useAuth();

  // ── Login state ──────────────────────────────────────────────────
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  // ── Forgot-password state ────────────────────────────────────────
  const [step,        setStep]        = useState<Step>("login");
  const [fpEmail,     setFpEmail]     = useState("");
  const [otp,         setOtp]         = useState("");
  const [newPw,       setNewPw]       = useState("");
  const [showNewPw,   setShowNewPw]   = useState(false);
  const [fpLoading,   setFpLoading]   = useState(false);
  const [fpError,     setFpError]     = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => { if (ready && user) router.replace("/"); }, [ready, user, router]);

  // Countdown for resend OTP button
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  // ── Login submit ─────────────────────────────────────────────────
  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) return setError("Email is required");
    if (!email.includes("@")) return setError("Enter a valid email");
    if (!password.trim()) return setError("Password is required");

    setLoading(true);
    try {
      const res  = await fetch(`${AUTH_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data?.detail || "Invalid credentials");
      login(data);
      router.replace("/");
    } catch { setError("Network error. Please try again."); }
    finally  { setLoading(false); }
  }, [email, password, login, router]);

  // ── Send OTP ─────────────────────────────────────────────────────
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setFpError("");
    if (!fpEmail.trim() || !fpEmail.includes("@")) return setFpError("Enter a valid email address");

    setFpLoading(true);
    try {
      const res  = await fetch(`${AUTH_URL}/api/v1/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fpEmail }),
      });
      const data = await res.json();
      if (!res.ok) return setFpError(data?.detail || "Failed to send OTP");
      setStep("otp");
      setResendTimer(60);
    } catch { setFpError("Network error. Please try again."); }
    finally  { setFpLoading(false); }
  };

  // ── Resend OTP ───────────────────────────────────────────────────
  const handleResend = async () => {
    setFpError("");
    setFpLoading(true);
    try {
      await fetch(`${AUTH_URL}/api/v1/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fpEmail }),
      });
      setOtp("");
      setResendTimer(60);
    } catch { setFpError("Network error."); }
    finally { setFpLoading(false); }
  };

  // ── Reset password ───────────────────────────────────────────────
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setFpError("");
    if (otp.trim().length !== 6) return setFpError("Enter the 6-digit code from your email");
    if (newPw.length < 6)        return setFpError("New password must be at least 6 characters");

    setFpLoading(true);
    try {
      const res  = await fetch(`${AUTH_URL}/api/v1/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fpEmail, otp: otp.trim(), new_password: newPw }),
      });
      const data = await res.json();
      if (!res.ok) return setFpError(data?.detail || "Reset failed. Check your code and try again.");
      setStep("success");
    } catch { setFpError("Network error. Please try again."); }
    finally  { setFpLoading(false); }
  };

  const goBackToLogin = () => {
    setStep("login"); setFpEmail(""); setOtp(""); setNewPw("");
    setFpError(""); setResendTimer(0);
  };

  if (ready && user) return null;

  const inputCls = "w-full h-14 pl-12 pr-4 rounded-2xl border border-slate-300 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 text-gray-700 outline-none transition";

  return (
    <div className="min-h-screen flex bg-white">

      {/* ── LEFT PANEL ── */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-slate-950 via-blue-900 to-indigo-700" />
        <div className="absolute top-[-120px] left-[-120px] w-[400px] h-[400px] bg-blue-500/30 blur-3xl rounded-full" />
        <div className="absolute bottom-[-120px] right-[-120px] w-[400px] h-[400px] bg-indigo-500/30 blur-3xl rounded-full" />

        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="flex items-center gap-3 mb-10">
            <Image src="/higoverse.png" alt="Higoverse" width={48} height={48} className="rounded-2xl" />
            <span className="font-bold text-2xl">Higoverse</span>
          </div>

          <h1 className="text-5xl font-bold leading-tight">
            Run Your Entire <br />Business in Real Time
          </h1>
          <p className="mt-5 text-lg text-blue-100 max-w-xl">
            A unified SaaS platform to manage inventory, sales, suppliers,
            customers, and analytics in one system.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4 max-w-xl">
            {[
              { icon: <Boxes className="w-5 h-5 mb-2" />,      title: "Inventory",  desc: "Real-time stock tracking" },
              { icon: <DollarSign className="w-5 h-5 mb-2" />, title: "Sales",      desc: "Instant transaction monitoring" },
              { icon: <Truck className="w-5 h-5 mb-2" />,      title: "Suppliers",  desc: "Procurement management" },
              { icon: <BarChart3 className="w-5 h-5 mb-2" />,  title: "Analytics",  desc: "Business insights & reporting" },
            ].map((f) => (
              <div key={f.title} className="bg-white/10 border border-white/20 rounded-2xl p-4 backdrop-blur">
                {f.icon}
                <p className="font-semibold">{f.title}</p>
                <p className="text-sm text-blue-100">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex items-center gap-6 text-sm text-blue-100">
            <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-white" /> Secure Auth</div>
            <div className="w-1 h-1 bg-blue-300 rounded-full" />
            <div>Real-time sync</div>
            <div className="w-1 h-1 bg-blue-300 rounded-full" />
            <div>99.9% uptime</div>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex items-center justify-center px-6 bg-linear-to-br from-slate-50 to-blue-50">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-xl border p-8">

            {/* ══ STEP: login ══════════════════════════════════════ */}
            {step === "login" && (
              <>
                <h2 className="text-3xl font-bold text-slate-900">Workspace sign in</h2>
                <p className="text-slate-500 mb-6">Sign in to your shop</p>

                {justRegistered && (
                  <div className="mb-4 p-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2">
                    <CheckCircle2 size={15} className="shrink-0" />
                    Workspace created! Sign in to get started.
                  </div>
                )}
                {error && (
                  <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl">{error}</div>
                )}

                <form onSubmit={handleLogin} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                      <input type="email" placeholder="Enter email" value={email}
                        onChange={(e) => setEmail(e.target.value)} className={inputCls} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-gray-900">Password</label>
                      <button type="button" onClick={() => { setFpEmail(email); setStep("forgot"); setFpError(""); }}
                        className="text-xs text-blue-600 hover:underline font-medium">
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                      <input type={showPw ? "text" : "password"} placeholder="••••••••" value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full h-14 pl-12 pr-12 rounded-2xl border border-slate-300 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 text-gray-700 outline-none transition" />
                      <button type="button" onClick={() => setShowPw((v) => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <button type="submit" disabled={loading}
                    className="w-full h-14 rounded-2xl bg-linear-to-r from-blue-600 to-indigo-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-70 transition">
                    {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Signing In…</> : "Sign In"}
                  </button>
                </form>

                <p className="text-center text-sm text-slate-500 mt-6">
                  Don&apos;t have an account?{" "}
                  <a href="/register" className="text-blue-600 font-medium hover:underline">Create Workspace</a>
                </p>
              </>
            )}

            {/* ══ STEP: forgot — enter email ═══════════════════════ */}
            {step === "forgot" && (
              <>
                <button onClick={goBackToLogin} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition">
                  <ArrowLeft size={15} /> Back to sign in
                </button>

                <div className="flex items-center justify-center w-14 h-14 bg-blue-50 rounded-2xl mb-4">
                  <KeyRound className="w-7 h-7 text-blue-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-1">Forgot your password?</h2>
                <p className="text-slate-500 text-sm mb-6">
                  Enter your registered email and we&apos;ll send a 6-digit code to reset your password.
                </p>

                {fpError && (
                  <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl">{fpError}</div>
                )}

                <form onSubmit={handleSendOtp} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                      <input type="email" placeholder="Enter your registered email" value={fpEmail}
                        onChange={(e) => setFpEmail(e.target.value)} className={inputCls} autoFocus />
                    </div>
                  </div>

                  <button type="submit" disabled={fpLoading}
                    className="w-full h-14 rounded-2xl bg-linear-to-r from-blue-600 to-indigo-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-70 transition">
                    {fpLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> Sending…</> : "Send Reset Code"}
                  </button>
                </form>
              </>
            )}

            {/* ══ STEP: otp — enter code + new password ═══════════ */}
            {step === "otp" && (
              <>
                <button onClick={() => { setStep("forgot"); setFpError(""); }}
                  className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition">
                  <ArrowLeft size={15} /> Change email
                </button>

                <div className="flex items-center justify-center w-14 h-14 bg-green-50 rounded-2xl mb-4">
                  <Mail className="w-7 h-7 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-1">Check your email</h2>
                <p className="text-slate-500 text-sm mb-1">
                  We sent a 6-digit code to
                </p>
                <p className="font-semibold text-slate-800 text-sm mb-6 break-all">{fpEmail}</p>

                {fpError && (
                  <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl">{fpError}</div>
                )}

                <form onSubmit={handleReset} className="space-y-5">
                  {/* OTP input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      6-digit code
                    </label>
                    <input
                      type="text" inputMode="numeric" maxLength={6} placeholder="000000"
                      value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="w-full h-14 text-center text-2xl font-bold tracking-[0.5em] rounded-2xl border border-slate-300 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 text-gray-700 outline-none transition"
                      autoFocus
                    />
                  </div>

                  {/* New password */}
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">New password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                      <input
                        type={showNewPw ? "text" : "password"} placeholder="Min. 6 characters"
                        value={newPw} onChange={(e) => setNewPw(e.target.value)}
                        className="w-full h-14 pl-12 pr-12 rounded-2xl border border-slate-300 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 text-gray-700 outline-none transition"
                      />
                      <button type="button" onClick={() => setShowNewPw((v) => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showNewPw ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {newPw.length > 0 && newPw.length < 6 && (
                      <p className="mt-1.5 text-xs text-red-500">{6 - newPw.length} more characters needed</p>
                    )}
                  </div>

                  <button type="submit" disabled={fpLoading || otp.length !== 6 || newPw.length < 6}
                    className="w-full h-14 rounded-2xl bg-linear-to-r from-blue-600 to-indigo-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition">
                    {fpLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> Resetting…</> : "Reset Password"}
                  </button>
                </form>

                {/* Resend */}
                <div className="mt-5 text-center">
                  {resendTimer > 0 ? (
                    <p className="text-sm text-slate-400">Resend code in <span className="font-semibold text-slate-600">{resendTimer}s</span></p>
                  ) : (
                    <button onClick={handleResend} disabled={fpLoading}
                      className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline mx-auto disabled:opacity-50">
                      <RefreshCw size={13} /> Resend code
                    </button>
                  )}
                </div>
              </>
            )}

            {/* ══ STEP: success ════════════════════════════════════ */}
            {step === "success" && (
              <div className="text-center py-4">
                <div className="flex items-center justify-center w-20 h-20 bg-green-50 rounded-3xl mx-auto mb-5">
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Password reset!</h2>
                <p className="text-slate-500 text-sm mb-8">
                  Your password has been updated successfully.<br />
                  You can now sign in with your new password.
                </p>
                <button onClick={goBackToLogin}
                  className="w-full h-14 rounded-2xl bg-linear-to-r from-blue-600 to-indigo-600 text-white font-semibold transition hover:opacity-90">
                  Sign In Now
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
