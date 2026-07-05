"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import {
  Loader2, ArrowLeft, Eye, EyeOff, RefreshCw,
  CheckCircle2, KeyRound, Mail, Lock,
  Boxes, BarChart3, ShieldCheck, Truck,
} from "lucide-react";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_API || "https://higoverse-auth.vercel.app";
type Step = "login" | "forgot" | "otp" | "success";

export default function LoginPage() {
  const router         = useRouter();
  const searchParams   = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";
  // Where to send the user after a successful login — defaults to the public
  // marketplace home; guest-only actions (follow, message, etc.) pass ?next=
  // so the user lands back where they were.
  const nextPath = searchParams.get("next") || "/";
  const { login, user, ready } = useAuth();

  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [showPw,      setShowPw]      = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

  const [step,        setStep]        = useState<Step>("login");
  const [fpEmail,     setFpEmail]     = useState("");
  const [otp,         setOtp]         = useState("");
  const [newPw,       setNewPw]       = useState("");
  const [showNewPw,   setShowNewPw]   = useState(false);
  const [fpLoading,   setFpLoading]   = useState(false);
  const [fpError,     setFpError]     = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => { if (ready && user) router.replace(nextPath); }, [ready, user, router, nextPath]);
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim())        return setError("Email is required.");
    if (!email.includes("@")) return setError("Enter a valid email address.");
    if (!password.trim())     return setError("Password is required.");
    setLoading(true);
    try {
      const res  = await fetch(`${AUTH_URL}/api/v1/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data?.detail || "Incorrect email or password.");
      login(data); router.replace(nextPath);
    } catch { setError("Network error. Please try again."); }
    finally  { setLoading(false); }
  }, [email, password, login, router]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault(); setFpError("");
    const email = fpEmail.trim();
    if (!email || !email.includes("@")) return setFpError("Enter a valid email address.");

    // Reject scrambled/deleted emails immediately — these end in @removed.invalid
    if (email.endsWith("@removed.invalid") || email.startsWith("_deleted_")) {
      return setFpError("This email address belongs to a deleted account. Please register a new account.");
    }

    setFpLoading(true);
    try {
      // The backend intentionally returns a generic success response for forgot-password
      // regardless of whether the account exists, is verified, or is active — this avoids
      // leaking account existence/status to an unauthenticated caller (email enumeration).
      // So we just send the OTP request directly and surface whatever real error comes back.
      const res = await fetch(`${AUTH_URL}/api/v1/auth/forgot-password`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = (data?.detail ?? "").toLowerCase();
        if (detail.includes("not found") || detail.includes("no user") || detail.includes("does not exist")) {
          return setFpError("No account found with this email address. Please register first.");
        }
        if (detail.includes("deleted") || detail.includes("inactive") || detail.includes("disabled")) {
          return setFpError("This account has been deactivated. Contact the Higoverse admin.");
        }
        return setFpError(data?.detail || "Failed to send reset code. Please try again.");
      }
      setStep("otp"); setResendTimer(60);
    } catch { setFpError("Network error. Please check your connection and try again."); }
    finally  { setFpLoading(false); }
  };

  const handleResend = async () => {
    setFpError(""); setFpLoading(true);
    try {
      await fetch(`${AUTH_URL}/api/v1/auth/forgot-password`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fpEmail }),
      });
      setOtp(""); setResendTimer(60);
    } catch { setFpError("Network error."); }
    finally { setFpLoading(false); }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault(); setFpError("");
    if (otp.trim().length !== 6) return setFpError("Enter the 6-digit code from your email.");
    if (newPw.length < 6)        return setFpError("New password must be at least 6 characters.");
    setFpLoading(true);
    try {
      const res  = await fetch(`${AUTH_URL}/api/v1/auth/reset-password`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fpEmail, otp: otp.trim(), new_password: newPw }),
      });
      const data = await res.json();
      if (!res.ok) return setFpError(data?.detail || "Reset failed. Check your code.");
      setStep("success");
    } catch { setFpError("Network error. Please try again."); }
    finally  { setFpLoading(false); }
  };

  const goBackToLogin = () => {
    setStep("login"); setFpEmail(""); setOtp(""); setNewPw("");
    setFpError(""); setResendTimer(0);
  };

  if (ready && user) return null;

  /* shared input style — filled gray background, no border until focus */
  const field = "w-full h-12 rounded-lg bg-gray-100 px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition";

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* ══ LEFT PANEL ══ */}
      <div className="hidden lg:flex lg:w-[52%] bg-[#f0f4ff] flex-col justify-between px-16 py-12">
        {/* top: brand */}
        <div className="flex items-center gap-3">
          <Image src="/higoverse.png" alt="Higoverse" width={36} height={36} className="rounded-xl" />
          <span className="text-slate-800 font-bold text-lg tracking-tight">Higoverse</span>
        </div>

        {/* middle: headline */}
        <div>
          <p className="text-xs font-semibold text-blue-500 uppercase tracking-widest mb-4">Business OS</p>
          <h1 className="text-4xl font-bold text-slate-900 leading-tight mb-5">
            Everything your<br />shop needs,<br />
            <span className="text-blue-600">in one place.</span>
          </h1>
          <p className="text-slate-500 text-sm leading-relaxed max-w-sm mb-10">
            From inventory to invoices — manage your entire operation without switching tabs.
          </p>

          {/* feature cards */}
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            {[
              { icon: <Boxes size={15} />,      label: "Inventory",  sub: "Real-time stock" },
              { icon: <BarChart3 size={15} />,  label: "Analytics",  sub: "Live reports" },
              { icon: <Truck size={15} />,       label: "Suppliers",  sub: "Purchase orders" },
              { icon: <ShieldCheck size={15} />, label: "Secure",     sub: "Cloud storage" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm border border-blue-100">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                  {f.icon}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800">{f.label}</p>
                  <p className="text-[11px] text-slate-400">{f.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* bottom: trust */}
        <p className="text-[11px] text-slate-400">© {new Date().getFullYear()} Higoverse · Secure · Private</p>
      </div>

      {/* ══ RIGHT PANEL ══ */}
      <div className="flex-1 flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-[400px]">

          {/* mobile brand */}
          <div className="flex lg:hidden items-center gap-2 mb-8">
            <Image src="/higoverse.png" alt="Higoverse" width={30} height={30} className="rounded-lg" />
            <span className="font-bold text-gray-900">Higoverse</span>
          </div>

          {/* ── login ── */}
          {step === "login" && (
            <>
              <div className="mb-7">
                <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
                <p className="text-sm text-gray-500 mt-1">Sign in to your Higoverse account</p>
              </div>

              {justRegistered && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 text-sm text-green-700">
                  <CheckCircle2 size={14} className="shrink-0" />
                  Account created — sign in to continue.
                </div>
              )}
              {error && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-600">{error}</div>
              )}

              <form onSubmit={handleLogin} className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                  <input type="email" placeholder="Email address" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`${field} pl-10`} />
                </div>

                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                  <input type={showPw ? "text" : "password"} placeholder="Password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${field} pl-10 pr-10`} />
                  <button type="button" onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <div className="flex justify-end">
                  <button type="button"
                    onClick={() => { setFpEmail(email); setStep("forgot"); setFpError(""); }}
                    className="text-xs text-blue-600 hover:underline">
                    Forgot password?
                  </button>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full h-12 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : "Sign in"}
                </button>
              </form>

              <div className="flex items-center gap-3 my-6">
                <hr className="flex-1 border-gray-200" />
                <span className="text-xs text-gray-400">or</span>
                <hr className="flex-1 border-gray-200" />
              </div>

              <a href="/register"
                className="flex items-center justify-center w-full h-12 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm font-semibold text-gray-700 transition">
                Create an account
              </a>

              <p className="text-center text-xs text-gray-400 mt-4">
                Free to join — no credit card required.
              </p>
            </>
          )}

          {/* ── forgot ── */}
          {step === "forgot" && (
            <>
              <button onClick={goBackToLogin}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition">
                <ArrowLeft size={14} /> Back to sign in
              </button>

              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
                <KeyRound className="w-5 h-5 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Reset your password</h2>
              <p className="text-sm text-gray-500 mb-6">We&apos;ll send a 6-digit code to your email.</p>

              {fpError && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-600">{fpError}</div>
              )}

              <form onSubmit={handleSendOtp} className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                  <input type="email" placeholder="Email address" value={fpEmail}
                    onChange={(e) => setFpEmail(e.target.value)}
                    className={`${field} pl-10`} autoFocus />
                </div>
                <button type="submit" disabled={fpLoading}
                  className="w-full h-12 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition">
                  {fpLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : "Send code"}
                </button>
              </form>
            </>
          )}

          {/* ── otp ── */}
          {step === "otp" && (
            <>
              <button onClick={() => { setStep("forgot"); setFpError(""); }}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition">
                <ArrowLeft size={14} /> Change email
              </button>

              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center mb-4">
                <Mail className="w-5 h-5 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Check your inbox</h2>
              <p className="text-sm text-gray-500 mb-1">Code sent to</p>
              <p className="text-sm font-semibold text-gray-800 mb-6 break-all">{fpEmail}</p>

              {fpError && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-600">{fpError}</div>
              )}

              <form onSubmit={handleReset} className="space-y-3">
                <input
                  type="text" inputMode="numeric" maxLength={6} placeholder="000000"
                  value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full h-12 text-center text-2xl font-bold tracking-[0.4em] rounded-lg bg-gray-100 text-gray-900 placeholder-gray-300 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition"
                  autoFocus
                />
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                  <input type={showNewPw ? "text" : "password"} placeholder="New password"
                    value={newPw} onChange={(e) => setNewPw(e.target.value)}
                    className={`${field} pl-10 pr-10`} />
                  <button type="button" onClick={() => setShowNewPw((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
                    {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {newPw.length > 0 && newPw.length < 6 && (
                  <p className="text-xs text-red-500">{6 - newPw.length} more characters needed</p>
                )}
                <button type="submit" disabled={fpLoading || otp.length !== 6 || newPw.length < 6}
                  className="w-full h-12 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition">
                  {fpLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Resetting…</> : "Reset password"}
                </button>
              </form>

              <div className="mt-4 text-center">
                {resendTimer > 0 ? (
                  <p className="text-sm text-gray-400">Resend in <span className="font-semibold text-gray-600">{resendTimer}s</span></p>
                ) : (
                  <button onClick={handleResend} disabled={fpLoading}
                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline disabled:opacity-50">
                    <RefreshCw size={12} /> Resend code
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── success ── */}
          {step === "success" && (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1.5">Password updated!</h2>
              <p className="text-sm text-gray-500 mb-6">You can now sign in with your new password.</p>
              <button onClick={goBackToLogin}
                className="w-full h-12 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition">
                Sign in now
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
