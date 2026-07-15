"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Mail, Lock, Eye, EyeOff,
  ChevronRight, CheckCircle2, AlertCircle, Loader2, RefreshCw,
  ShieldCheck, User, Globe, TrendingUp, ShoppingBag,
} from "lucide-react";

/* ── Types ── */
interface FormData {
  name:    string;
  email:   string;
  password: string;
  confirm: string;
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordStrength(p: string) {
  let s = 0;
  if (p.length >= 6)           s++;
  if (p.length >= 10)          s++;
  if (/[A-Z]/.test(p))        s++;
  if (/[0-9]/.test(p))        s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  if (s <= 2) return { label: "Weak",   color: "bg-red-400",    text: "text-red-500",    width: "30%" };
  if (s <= 4) return { label: "Medium", color: "bg-orange-400", text: "text-orange-500", width: "65%" };
  return             { label: "Strong", color: "bg-green-500",  text: "text-green-600",  width: "100%" };
}

const field = "w-full h-12 rounded-lg bg-gray-100 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition";
const fieldIcon = "pl-10 pr-4";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep]       = useState<1 | 2>(1);
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [touched, setTouch]   = useState<Partial<Record<keyof FormData, boolean>>>({});
  const [emailTaken, setEmailTaken] = useState(false);
  const [nameTaken,  setNameTaken]  = useState(false);

  const [verifyEmail, setVerifyEmail]       = useState("");
  const [otp, setOtp]                       = useState("");
  const [verifyLoading, setVerifyLoading]   = useState(false);
  const [verifyError, setVerifyError]       = useState<string | null>(null);
  const [resendTimer, setResendTimer]       = useState(0);
  const [resendingVerify, setResendingVerify] = useState(false);

  const [form, setForm] = useState<FormData>({
    name: "", email: "", password: "", confirm: "",
  });

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  const set = (k: keyof FormData, v: string) => {
    setForm(p => ({ ...p, [k]: v }));
    setTouch(p => ({ ...p, [k]: true }));
    if (k === "email") { setEmailTaken(false); setError(null); }
    if (k === "name")  { setNameTaken(false);  setError(null); }
  };

  /* ── Validation ── */
  const v = {
    name:     form.name.trim().length >= 2,
    email:    emailRe.test(form.email),
    password: form.password.length >= 6,
    confirm:  form.confirm === form.password && form.confirm.length > 0,
  };
  const formOk = v.name && v.email && v.password && v.confirm;
  const pw     = passwordStrength(form.password);

  const ring = (valid: boolean, t: boolean) =>
    t ? (valid ? "ring-2 ring-blue-500 bg-white" : "ring-2 ring-red-400 bg-white") : "";

  /* ── Submit ── */
  const handleSubmit = async () => {
    if (!formOk) return;
    setError(null); setEmailTaken(false); setNameTaken(false); setLoading(true);
    try {
      const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_API || "https://auth-esys.vercel.app";
      const payload = {
        name:     form.name.trim(),
        email:    form.email.trim(),
        password: form.password,
      };

      let res: Response;
      try {
        res = await fetch(`${AUTH_URL}/api/v1/auth/register`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        setError("Connection problem. Please check your internet and try again.");
        setLoading(false);
        return;
      }

      const text = await res.text();
      if (!res.ok) {
        let raw = "";
        try { raw = JSON.parse(text)?.detail || ""; } catch { raw = text || ""; }
        const lower = raw.toLowerCase();

        // Email conflict
        if (lower.includes("email") && (lower.includes("already") || lower.includes("exists") || lower.includes("registered")) || (res.status === 409)) {
          setEmailTaken(true); return;
        }
        // Name conflict
        if (lower.includes("name") && (lower.includes("already") || lower.includes("exists") || lower.includes("taken"))) {
          setNameTaken(true); return;
        }
        if (lower.includes("verification email") || lower.includes("failed to send")) {
          setVerifyEmail(form.email.trim()); setOtp("");
          setVerifyError("We had trouble sending the verification email. Tap \"Resend code\" below.");
          setResendTimer(0); setStep(2); return;
        }
        setError(raw || `Registration failed (${res.status}). Please try again.`); return;
      }
      setVerifyEmail(form.email.trim()); setOtp(""); setVerifyError(null);
      setResendTimer(60); setStep(2);
    } finally { setLoading(false); }
  };

  /* ── Verify email ── */
  const handleVerify = async () => {
    if (otp.length !== 6) return;
    setVerifyError(null); setVerifyLoading(true);
    try {
      const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_API || "https://auth-esys.vercel.app";
      const res  = await fetch(`${AUTH_URL}/api/v1/auth/verify-registration`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verifyEmail, otp }),
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = "Verification failed";
        try { msg = JSON.parse(text)?.detail || msg; } catch { msg = text || msg; }
        setVerifyError(msg); return;
      }
      router.push("/login?registered=1");
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally { setVerifyLoading(false); }
  };

  /* ── Try to recover an unverified (abandoned) account ── */
  const handleCompleteVerification = async () => {
    setResendingVerify(true);
    try {
      const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_API || "https://auth-esys.vercel.app";
      const res = await fetch(`${AUTH_URL}/api/v1/auth/resend-verification`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim() }),
      });
      if (res.ok) {
        // Account exists but is unverified — move to verification step
        setVerifyEmail(form.email.trim());
        setOtp(""); setVerifyError(null); setResendTimer(60); setStep(2);
      } else {
        const data = await res.json().catch(() => ({}));
        const detail = (data?.detail ?? "").toLowerCase();
        if (detail.includes("already verified") || detail.includes("active")) {
          setError("This account is already verified. Please sign in instead.");
        } else if (res.status === 503 || detail.includes("not configured")) {
          setError("Email delivery is temporarily unavailable. Please try again later or contact support.");
        } else {
          setError("Could not resend code. The account may have been deleted. Try a different email or contact admin.");
        }
        setEmailTaken(false);
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally { setResendingVerify(false); }
  };

  /* ── Resend ── */
  const handleResend = async () => {
    setVerifyError(null); setVerifyLoading(true);
    try {
      const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_API || "https://auth-esys.vercel.app";
      await fetch(`${AUTH_URL}/api/v1/auth/resend-verification`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verifyEmail }),
      });
      setOtp(""); setResendTimer(60);
    } catch { setVerifyError("Network error. Please try again."); }
    finally  { setVerifyLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* ══ LEFT PANEL ══ */}
      <div className="hidden lg:flex lg:w-[52%] bg-[#f0f4ff] flex-col justify-between px-16 py-12">

        {/* Brand */}
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="A & T Consultants" width={36} height={36} className="rounded-xl" />
          <span className="text-slate-800 font-bold text-lg tracking-tight">A & T Consultants</span>
        </div>

        {/* Headline + features */}
        <div>
          <p className="text-xs font-semibold text-blue-500 uppercase tracking-widest mb-4">Rwanda&apos;s Business Platform</p>
          <h1 className="text-4xl font-bold text-slate-900 leading-tight mb-5">
            Create your<br />personal account,<br />
            <span className="text-blue-600">it&apos;s free.</span>
          </h1>
          <p className="text-slate-500 text-sm leading-relaxed max-w-sm mb-10">
            Join A & T Consultants with a personal account to browse products and place orders in minutes.
          </p>

          <div className="grid grid-cols-2 gap-3 max-w-sm mb-10">
            {[
              { icon: <Globe size={15} />,       label: "Marketplace",  sub: "Browse products" },
              { icon: <TrendingUp size={15} />,   label: "Analytics",    sub: "Live reports" },
              { icon: <ShoppingBag size={15} />,  label: "Shop Tools",   sub: "Run your business" },
              { icon: <ShieldCheck size={15} />,  label: "Secure",       sub: "Cloud storage" },
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

          {/* Step progress */}
          <div className="space-y-2 max-w-sm">
            {[
              { n: 1, title: "Create account",  sub: "Name, email, phone & password" },
              { n: 2, title: "Verify email",    sub: "Enter the code we send you" },
            ].map((s) => (
              <div key={s.n}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                  step === s.n ? "bg-white border border-blue-100 shadow-sm" : "opacity-40"
                }`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  step > s.n
                    ? "bg-green-100 text-green-600"
                    : step === s.n
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}>
                  {step > s.n ? <CheckCircle2 size={14} /> : s.n}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{s.title}</p>
                  <p className="text-[11px] text-slate-400">{s.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-slate-400">© {new Date().getFullYear()} A & T Consultants · Secure · Private</p>
      </div>

      {/* ══ RIGHT PANEL ══ */}
      <div className="flex-1 flex items-start justify-center bg-white px-6 py-10 overflow-y-auto">
        <div className="w-full max-w-[440px]">

          {/* Mobile brand */}
          <div className="flex lg:hidden items-center gap-2 mb-7">
            <Image src="/logo.png" alt="A & T Consultants" width={30} height={30} className="rounded-lg" />
            <span className="font-bold text-gray-900">A & T Consultants</span>
          </div>

          {/* Progress bar */}
          <div className="mb-7">
            <div className="flex justify-between text-xs text-gray-400 mb-2">
              <span>Step {step} of 2</span>
              <span>{step === 1 ? "Create account" : "Email verification"}</span>
            </div>
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: step === 1 ? "50%" : "100%" }} />
            </div>
          </div>

          {/* ── STEP 1: Account details ── */}
          {step === 1 && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Create your account</h2>
                <p className="text-sm text-gray-500 mt-1">Join thousands of businesses on A & T Consultants</p>
              </div>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Full name <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                    <input value={form.name} onChange={e => set("name", e.target.value)}
                      placeholder="e.g. John Doe"
                      className={`${field} ${fieldIcon} ${ring(v.name, !!touched.name)}`} />
                  </div>
                  {touched.name && !v.name && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} /> Minimum 2 characters</p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Email <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                    <input type="email" value={form.email} onChange={e => set("email", e.target.value)}
                      placeholder="you@example.com" autoComplete="email"
                      className={`${field} ${fieldIcon} ${ring(v.email, !!touched.email)}`} />
                  </div>
                  {touched.email && !v.email && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} /> Enter a valid email</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Password <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                    <input type={showPw ? "text" : "password"} value={form.password}
                      onChange={e => set("password", e.target.value)}
                      placeholder="Create a strong password" autoComplete="new-password"
                      className={`${field} pl-10 pr-10 ${ring(v.password, !!touched.password)}`} />
                    <button type="button" onClick={() => setShowPw(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {form.password && (
                    <div className="mt-2">
                      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${pw.color} transition-all duration-300`} style={{ width: pw.width }} />
                      </div>
                      <p className={`text-xs mt-1 ${pw.text}`}>{pw.label} password</p>
                    </div>
                  )}
                </div>

                {/* Confirm */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Confirm password <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                    <input type={showPw ? "text" : "password"} value={form.confirm}
                      onChange={e => set("confirm", e.target.value)}
                      placeholder="Repeat your password" autoComplete="new-password"
                      className={`${field} ${fieldIcon} ${ring(v.confirm, !!touched.confirm)}`} />
                  </div>
                  {touched.confirm && !v.confirm && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} /> Passwords do not match</p>
                  )}
                </div>
              </div>

              {/* Email taken */}
              {emailTaken && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-3">
                  <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                    <AlertCircle size={14} className="text-amber-500" /> This email is already registered
                  </p>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    An account with this email exists. It may be unverified — if you started registration before but didn&apos;t complete the email verification, you can finish it now.
                  </p>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleCompleteVerification}
                      disabled={resendingVerify}
                      className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center justify-center gap-2 transition disabled:opacity-50">
                      {resendingVerify
                        ? <><Loader2 size={12} className="animate-spin" /> Checking…</>
                        : <><RefreshCw size={12} /> Complete email verification</>}
                    </button>
                    <p className="text-xs text-amber-700 text-center">
                      or{" "}
                      <Link href="/login" className="font-semibold underline hover:text-amber-900">sign in</Link>
                      {" "}if you already verified · or use a different email
                    </p>
                  </div>
                </div>
              )}

              {nameTaken && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
                  <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                    <AlertCircle size={14} className="text-amber-500" /> Name already taken
                  </p>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    An account with this name already exists. Please use a different name.
                  </p>
                </div>
              )}

              {error && !emailTaken && !nameTaken && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
                </div>
              )}

              <button
                onClick={() => {
                  setTouch({ name: true, email: true, password: true, confirm: true });
                  if (formOk) handleSubmit();
                }}
                disabled={loading}
                className="mt-6 w-full h-12 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition">
                {loading
                  ? <><Loader2 size={15} className="animate-spin" /> Creating account…</>
                  : <>Create account <ChevronRight size={16} /></>}
              </button>

              <p className="text-center text-xs text-gray-400 mt-4">By registering you agree to our Terms of Service</p>
            </>
          )}

          {/* ── STEP 2: Verify ── */}
          {step === 2 && (
            <>
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-5">
                <Mail size={22} className="text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Check your inbox</h2>
              <p className="text-sm text-gray-500 mb-0.5">We sent a 6-digit code to</p>
              <p className="text-sm font-semibold text-gray-800 mb-6 break-all">{verifyEmail}</p>

              {verifyError && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-600">
                  <AlertCircle size={14} className="shrink-0" /> {verifyError}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">6-digit code</label>
                  <input
                    type="text" inputMode="numeric" maxLength={6} placeholder="000000"
                    value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full h-12 text-center text-2xl font-bold tracking-[0.4em] rounded-lg bg-gray-100 text-gray-900 placeholder-gray-300 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition"
                    autoFocus
                  />
                </div>

                <button onClick={handleVerify} disabled={otp.length !== 6 || verifyLoading}
                  className="w-full h-12 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition">
                  {verifyLoading ? <><Loader2 size={15} className="animate-spin" /> Verifying…</> : "Verify email"}
                </button>
              </div>

              <div className="mt-4 text-center">
                {resendTimer > 0 ? (
                  <p className="text-sm text-gray-400">Resend in <span className="font-semibold text-gray-600">{resendTimer}s</span></p>
                ) : (
                  <button onClick={handleResend} disabled={verifyLoading}
                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline disabled:opacity-50">
                    <RefreshCw size={12} /> Resend code
                  </button>
                )}
              </div>
            </>
          )}

          <p className="text-center text-sm text-gray-500 mt-8">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
