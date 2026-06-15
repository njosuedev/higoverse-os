"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2, Mail, Phone, Lock, Eye, EyeOff,
  MapPin, FileText, ChevronRight, ChevronLeft,
  CheckCircle2, AlertCircle, Loader2, Activity,
  Store, ShieldCheck, Boxes, BarChart3,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────── */
interface FormData {
  shop_name:    string;
  business_type: string;
  address:      string;
  description:  string;
  email:        string;
  phone:        string;
  password:     string;
  confirm:      string;
}

const BUSINESS_TYPES = [
  "Retail Store",
  "Food & Beverage",
  "Electronics",
  "Pharmacy / Health",
  "Fashion & Clothing",
  "Hardware & Tools",
  "Wholesale",
  "Other",
];

/* ── Helpers ────────────────────────────────────────────── */
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordStrength(p: string) {
  let s = 0;
  if (p.length >= 6)           s++;
  if (p.length >= 10)          s++;
  if (/[A-Z]/.test(p))        s++;
  if (/[0-9]/.test(p))        s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  if (s <= 2) return { label: "Weak",   color: "bg-red-500",    width: "30%" };
  if (s <= 4) return { label: "Medium", color: "bg-orange-400", width: "65%" };
  return             { label: "Strong", color: "bg-green-500",  width: "100%" };
}

function Field({
  icon, children, hint, valid, touched,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  hint?: string;
  valid?: boolean;
  touched?: boolean;
}) {
  return (
    <div>
      <div className={`relative flex items-center rounded-xl border transition-all bg-white ${
        !touched       ? "border-slate-200"
        : valid        ? "border-blue-400 ring-2 ring-blue-100"
        :                "border-red-400 ring-2 ring-red-100"
      }`}>
        <span className="absolute left-3.5 text-slate-400">{icon}</span>
        {children}
      </div>
      {touched && hint && (
        <p className={`text-xs mt-1.5 flex items-center gap-1 ${valid ? "text-blue-600" : "text-red-500"}`}>
          {valid ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
          {hint}
        </p>
      )}
    </div>
  );
}

const inputCls = "w-full h-12 pl-10 pr-4 bg-transparent outline-none text-slate-800 placeholder:text-slate-400 text-sm rounded-xl";

/* ── Page ───────────────────────────────────────────────── */
export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep]       = useState<1 | 2>(1);
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [touched, setTouch]   = useState<Partial<Record<keyof FormData, boolean>>>({});

  const [form, setForm] = useState<FormData>({
    shop_name: "", business_type: "", address: "", description: "",
    email: "", phone: "", password: "", confirm: "",
  });

  const set = (k: keyof FormData, v: string) => {
    setForm(p => ({ ...p, [k]: v }));
    setTouch(p => ({ ...p, [k]: true }));
  };

  /* ── Validation ──────────────────────────────────────── */
  const v = {
    shop_name:     form.shop_name.trim().length >= 2,
    business_type: form.business_type !== "",
    address:       true,                               // optional
    description:   true,                              // optional
    email:         emailRe.test(form.email),
    phone:         form.phone.replace(/\D/g, "").length >= 9,
    password:      form.password.length >= 6,
    confirm:       form.confirm === form.password && form.confirm.length > 0,
  };

  const step1Ok = v.shop_name && v.business_type;
  const step2Ok = v.email && v.phone && v.password && v.confirm;
  const pw      = passwordStrength(form.password);

  /* ── Submit ──────────────────────────────────────────── */
  const handleSubmit = async () => {
    if (!step2Ok) return;
    setError(null);
    setLoading(true);
    try {
      const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_API || "https://higoverse-auth.vercel.app";
      const descParts = [
        form.business_type !== "Other" ? form.business_type : "",
        form.description.trim() ? form.description.trim() : "",
      ].filter(Boolean).join(" — ");
      const payload: Record<string, string> = {
        shop_name: form.shop_name.trim(),
        email:     form.email.trim(),
        phone:     form.phone.trim(),
        password:  form.password,
      };
      if (form.address.trim())  payload.address     = form.address.trim();
      if (descParts)            payload.description = descParts;

      const res  = await fetch(`${AUTH_URL}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = "Registration failed";
        try { msg = JSON.parse(text)?.detail || msg; } catch { msg = text || msg; }
        setError(msg);
        return;
      }
      router.push("/login?registered=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ── UI ──────────────────────────────────────────────── */
  return (
    <div className="min-h-screen flex bg-white">

      {/* ── LEFT PANEL ─────────────────────────────────── */}
      <div className="hidden lg:flex w-5/12 relative overflow-hidden flex-col justify-between">
        <div className="absolute inset-0 bg-linear-to-br from-slate-950 via-blue-900 to-indigo-700" />
        <div className="absolute top-[-120px] left-[-120px] w-96 h-96 bg-blue-500/30 blur-3xl rounded-full" />
        <div className="absolute bottom-[-120px] right-[-120px] w-96 h-96 bg-indigo-500/30 blur-3xl rounded-full" />

        <div className="relative z-10 flex flex-col justify-center flex-1 px-12 text-white">
          {/* Brand */}
          <div className="flex items-center gap-3 mb-10">
            <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center">
              <Activity size={22} />
            </div>
            <span className="font-bold text-xl tracking-tight">Higoverse</span>
          </div>

          <h1 className="text-4xl font-bold leading-tight">
            Open your digital <br /> shop today
          </h1>
          <p className="mt-4 text-blue-100 text-sm leading-relaxed max-w-xs">
            Get a full-featured business management workspace in under a minute — inventory, sales, analytics and more.
          </p>

          {/* Feature list */}
          <div className="mt-8 space-y-3">
            {[
              { icon: <Boxes size={16} />,    label: "Real-time inventory tracking" },
              { icon: <BarChart3 size={16} />, label: "Business analytics dashboard" },
              { icon: <Store size={16} />,     label: "Multi-service management" },
              { icon: <ShieldCheck size={16}/>, label: "Secure cloud storage" },
            ].map(f => (
              <div key={f.label} className="flex items-center gap-3 text-sm text-blue-100">
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">{f.icon}</div>
                {f.label}
              </div>
            ))}
          </div>

          {/* Step progress preview */}
          <div className="mt-10 space-y-3">
            {[
              { n: 1, title: "Shop Information",   sub: "Name, type & location" },
              { n: 2, title: "Account & Security", sub: "Email, phone & password" },
            ].map(s => (
              <div key={s.n} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${step === s.n ? "bg-white/15" : "opacity-50"}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${step > s.n ? "bg-green-400 text-white" : step === s.n ? "bg-white text-slate-900" : "bg-white/20 text-white"}`}>
                  {step > s.n ? <CheckCircle2 size={14} /> : s.n}
                </div>
                <div>
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="text-xs text-blue-200">{s.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-10 bg-slate-50">
        <div className="w-full max-w-md">

          {/* Mobile brand */}
          <div className="flex lg:hidden items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <Activity size={16} className="text-white" />
            </div>
            <span className="font-bold text-slate-800">Higoverse</span>
          </div>

          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-500">Step {step} of 2</p>
              <p className="text-xs text-slate-400">{step === 1 ? "Shop details" : "Account setup"}</p>
            </div>
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-linear-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                style={{ width: step === 1 ? "50%" : "100%" }} />
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">

            {/* Error */}
            {error && (
              <div className="mb-5 flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                <AlertCircle size={15} className="shrink-0" /> {error}
              </div>
            )}

            {/* ── STEP 1: Shop Info ─────────────────────── */}
            {step === 1 && (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-slate-900">Shop Information</h2>
                  <p className="text-slate-500 text-sm mt-1">Tell us about your business</p>
                </div>

                <div className="space-y-4">
                  {/* Shop name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Shop Name *</label>
                    <Field icon={<Building2 size={16} />} valid={v.shop_name} touched={!!touched.shop_name}
                      hint={v.shop_name ? "Looks good" : "Minimum 2 characters required"}>
                      <input value={form.shop_name} onChange={e => set("shop_name", e.target.value)}
                        placeholder="e.g. Kigali Electronics" className={inputCls} />
                    </Field>
                  </div>

                  {/* Business type */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Business Type *</label>
                    <div className={`relative rounded-xl border transition-all bg-white ${
                      !touched.business_type ? "border-slate-200"
                      : v.business_type      ? "border-blue-400 ring-2 ring-blue-100"
                      :                        "border-red-400 ring-2 ring-red-100"
                    }`}>
                      <Store size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <select value={form.business_type}
                        onChange={e => set("business_type", e.target.value)}
                        className="w-full h-12 pl-10 pr-4 bg-transparent outline-none text-sm text-slate-800 appearance-none rounded-xl">
                        <option value="">Select business type…</option>
                        {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    {touched.business_type && !v.business_type && (
                      <p className="text-xs mt-1.5 text-red-500 flex items-center gap-1"><AlertCircle size={11} /> Please select a type</p>
                    )}
                  </div>

                  {/* Address */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                      Address <span className="text-slate-400 font-normal normal-case">(optional)</span>
                    </label>
                    <Field icon={<MapPin size={16} />}>
                      <input value={form.address} onChange={e => set("address", e.target.value)}
                        placeholder="e.g. Kigali, Gasabo District" className={inputCls} />
                    </Field>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                      About your shop <span className="text-slate-400 font-normal normal-case">(optional)</span>
                    </label>
                    <div className="relative rounded-xl border border-slate-200 bg-white">
                      <FileText size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                      <textarea value={form.description} onChange={e => set("description", e.target.value)}
                        placeholder="Brief description of what you sell…" rows={3}
                        className="w-full pl-10 pr-4 pt-3 pb-3 bg-transparent outline-none text-slate-800 placeholder:text-slate-400 text-sm resize-none rounded-xl" />
                    </div>
                  </div>
                </div>

                <button onClick={() => { setTouch({ shop_name: true, business_type: true }); if (step1Ok) setStep(2); }}
                  className="mt-6 w-full h-12 rounded-xl bg-linear-to-r from-blue-600 to-indigo-600 text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition">
                  Continue <ChevronRight size={16} />
                </button>
              </>
            )}

            {/* ── STEP 2: Account ───────────────────────── */}
            {step === 2 && (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-slate-900">Account & Security</h2>
                  <p className="text-slate-500 text-sm mt-1">Set up your login credentials</p>
                </div>

                {/* Shop summary chip */}
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 mb-5">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Store size={14} className="text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{form.shop_name}</p>
                    <p className="text-xs text-slate-500 truncate">{form.business_type}{form.address ? ` · ${form.address}` : ""}</p>
                  </div>
                  <button onClick={() => setStep(1)} className="ml-auto text-xs text-blue-600 hover:underline shrink-0">Edit</button>
                </div>

                <div className="space-y-4">
                  {/* Email */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Business Email *</label>
                    <Field icon={<Mail size={16} />} valid={v.email} touched={!!touched.email}
                      hint={v.email ? "Valid email" : "Enter a valid email address"}>
                      <input type="email" value={form.email} onChange={e => set("email", e.target.value)}
                        placeholder="admin@yourshop.com" autoComplete="email" className={inputCls} />
                    </Field>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Phone Number *</label>
                    <Field icon={<Phone size={16} />} valid={v.phone} touched={!!touched.phone}
                      hint={v.phone ? "Valid phone" : "At least 9 digits required"}>
                      <input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)}
                        placeholder="+250 7XX XXX XXX" autoComplete="tel" className={inputCls} />
                    </Field>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Password *</label>
                    <Field icon={<Lock size={16} />} valid={v.password} touched={!!touched.password}
                      hint={v.password ? `Strength: ${pw.label}` : "Minimum 6 characters"}>
                      <input type={showPw ? "text" : "password"} value={form.password}
                        onChange={e => set("password", e.target.value)}
                        placeholder="Create a strong password" autoComplete="new-password"
                        className={inputCls + " pr-10"} />
                      <button type="button" onClick={() => setShowPw(p => !p)}
                        className="absolute right-3 text-slate-400 hover:text-slate-600">
                        {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </Field>
                    {form.password && (
                      <div className="mt-2">
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${pw.color} transition-all duration-300`} style={{ width: pw.width }} />
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-xs text-slate-400">Weak</span>
                          <span className={`text-xs font-semibold ${pw.color.replace("bg-", "text-")}`}>{pw.label}</span>
                          <span className="text-xs text-slate-400">Strong</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confirm password */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Confirm Password *</label>
                    <Field icon={<ShieldCheck size={16} />} valid={v.confirm} touched={!!touched.confirm}
                      hint={v.confirm ? "Passwords match" : "Passwords do not match"}>
                      <input type={showPw ? "text" : "password"} value={form.confirm}
                        onChange={e => set("confirm", e.target.value)}
                        placeholder="Repeat your password" autoComplete="new-password" className={inputCls} />
                    </Field>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button onClick={() => setStep(1)}
                    className="h-12 px-5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition flex items-center gap-1.5 text-sm font-medium">
                    <ChevronLeft size={15} /> Back
                  </button>
                  <button onClick={handleSubmit} disabled={!step2Ok || loading}
                    className="flex-1 h-12 rounded-xl bg-linear-to-r from-blue-600 to-indigo-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition">
                    {loading ? <><Loader2 size={16} className="animate-spin" /> Creating…</> : "Create Workspace"}
                  </button>
                </div>

                <p className="text-center text-xs text-slate-400 mt-4">
                  By registering you agree to our Terms of Service
                </p>
              </>
            )}
          </div>

          <p className="text-center text-sm text-slate-500 mt-5">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 font-semibold">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
