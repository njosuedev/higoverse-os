"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Building2, Mail, Phone, Lock, Eye, EyeOff,
  MapPin, FileText, ChevronRight, ChevronLeft, ChevronDown,
  CheckCircle2, AlertCircle, Loader2, RefreshCw,
  Store, ShieldCheck, Boxes, BarChart3, ImagePlus, X,
} from "lucide-react";

/* ── Types ── */
interface FormData {
  shop_name:     string;
  business_type: string;
  address:       string;
  description:   string;
  email:         string;
  phone:         string;
  password:      string;
  confirm:       string;
}

/* ── Image compressor ── */
function compressImage(file: File, maxPx = 256, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new window.Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

const BUSINESS_TYPES = [
  "Retail Store", "Food & Beverage", "Electronics",
  "Pharmacy / Health", "Fashion & Clothing", "Hardware & Tools",
  "Wholesale", "Other",
];

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRe = /^07\d{8}$/;

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

/* ── Shared input class (matches login page) ── */
const field = "w-full h-12 rounded-lg bg-gray-100 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition";
const fieldIcon = "pl-10 pr-4";

/* ── Page ── */
export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep]       = useState<1 | 2 | 3>(1);
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [touched, setTouch]   = useState<Partial<Record<keyof FormData, boolean>>>({});
  const [emailTaken, setEmailTaken] = useState(false);

  const [verifyEmail, setVerifyEmail]     = useState("");
  const [otp, setOtp]                     = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError]     = useState<string | null>(null);
  const [resendTimer, setResendTimer]     = useState(0);

  const [logoUrl, setLogoUrl]         = useState<string>("");
  const [logoLoading, setLogoLoading] = useState(false);

  const [form, setForm] = useState<FormData>({
    shop_name: "", business_type: "", address: "", description: "",
    email: "", phone: "", password: "", confirm: "",
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
  };

  const handleLogoFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setLogoLoading(true);
    try { setLogoUrl(await compressImage(file)); }
    finally { setLogoLoading(false); }
  };

  /* ── Validation ── */
  const v = {
    shop_name:     form.shop_name.trim().length >= 2,
    business_type: form.business_type !== "",
    address:       form.address !== "",
    description:   true,
    email:         emailRe.test(form.email),
    phone:         phoneRe.test(form.phone.replace(/\s/g, "")),
    password:      form.password.length >= 6,
    confirm:       form.confirm === form.password && form.confirm.length > 0,
  };
  const step1Ok = v.shop_name && v.business_type && v.address;
  const step2Ok = v.email && v.phone && v.password && v.confirm;
  const pw      = passwordStrength(form.password);

  /* ── Submit ── */
  const handleSubmit = async () => {
    if (!step2Ok) return;
    setError(null); setEmailTaken(false); setLoading(true);
    try {
      const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_API || "https://higoverse-auth.vercel.app";
      const descParts = [
        form.business_type !== "Other" ? form.business_type : "",
        form.description.trim(),
      ].filter(Boolean).join(" — ");
      const payload: Record<string, string> = {
        shop_name: form.shop_name.trim(),
        email:     form.email.trim(),
        phone:     form.phone.replace(/\s/g, ""),
        password:  form.password,
      };
      if (form.address.trim()) payload.address     = form.address.trim();
      if (descParts)           payload.description = descParts;
      if (logoUrl)             payload.logo_url    = logoUrl;

      const res  = await fetch(`${AUTH_URL}/api/v1/auth/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) {
        let raw = "";
        try { raw = JSON.parse(text)?.detail || ""; } catch { raw = text || ""; }
        const lower = raw.toLowerCase();
        if (lower.includes("already exists") || lower.includes("already registered")) { setEmailTaken(true); return; }
        if (lower.includes("verification email") || lower.includes("failed to send")) {
          setVerifyEmail(form.email.trim()); setOtp("");
          setVerifyError("We had trouble sending the verification email. Tap \"Resend code\" below.");
          setResendTimer(0); setStep(3); return;
        }
        setError(raw || "Registration failed. Please try again."); return;
      }
      setVerifyEmail(form.email.trim()); setOtp(""); setVerifyError(null);
      setResendTimer(60); setStep(3);
    } catch { setError("Connection problem. Please check your internet and try again."); }
    finally  { setLoading(false); }
  };

  /* ── Verify email ── */
  const handleVerify = async () => {
    if (otp.length !== 6) return;
    setVerifyError(null); setVerifyLoading(true);
    try {
      const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_API || "https://higoverse-auth.vercel.app";
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

  /* ── Resend ── */
  const handleResend = async () => {
    setVerifyError(null); setVerifyLoading(true);
    try {
      const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_API || "https://higoverse-auth.vercel.app";
      await fetch(`${AUTH_URL}/api/v1/auth/resend-verification`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verifyEmail }),
      });
      setOtp(""); setResendTimer(60);
    } catch { setVerifyError("Network error. Please try again."); }
    finally  { setVerifyLoading(false); }
  };

  /* ── Input ring helper ── */
  const ring = (valid: boolean, t: boolean) =>
    t ? (valid ? "ring-2 ring-blue-500 bg-white" : "ring-2 ring-red-400 bg-white") : "";

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* ══ LEFT PANEL ══ */}
      <div className="hidden lg:flex lg:w-[52%] bg-[#f0f4ff] flex-col justify-between px-16 py-12">

        {/* Brand */}
        <div className="flex items-center gap-3">
          <Image src="/higoverse.png" alt="Higoverse" width={36} height={36} className="rounded-xl" />
          <span className="text-slate-800 font-bold text-lg tracking-tight">Higoverse</span>
        </div>

        {/* Headline + features */}
        <div>
          <p className="text-xs font-semibold text-blue-500 uppercase tracking-widest mb-4">Business OS</p>
          <h1 className="text-4xl font-bold text-slate-900 leading-tight mb-5">
            Open your digital<br />shop today,<br />
            <span className="text-blue-600">it&apos;s free.</span>
          </h1>
          <p className="text-slate-500 text-sm leading-relaxed max-w-sm mb-10">
            Get a full-featured business workspace in under a minute — inventory, sales, analytics and more.
          </p>

          <div className="grid grid-cols-2 gap-3 max-w-sm mb-10">
            {[
              { icon: <Boxes size={15} />,      label: "Inventory",  sub: "Real-time stock" },
              { icon: <BarChart3 size={15} />,  label: "Analytics",  sub: "Live reports" },
              { icon: <Store size={15} />,       label: "Sales",      sub: "Fast checkout" },
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

          {/* Step progress */}
          <div className="space-y-2 max-w-sm">
            {[
              { n: 1, title: "Shop details",    sub: "Name, type & location" },
              { n: 2, title: "Your account",    sub: "Email, phone & password" },
              { n: 3, title: "Verify email",    sub: "Enter the code we send you" },
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

        <p className="text-[11px] text-slate-400">© 2025 Higoverse · Secure · Private</p>
      </div>

      {/* ══ RIGHT PANEL ══ */}
      <div className="flex-1 flex items-start justify-center bg-white px-6 py-10 overflow-y-auto">
        <div className="w-full max-w-[440px]">

          {/* Mobile brand */}
          <div className="flex lg:hidden items-center gap-2 mb-7">
            <Image src="/higoverse.png" alt="Higoverse" width={30} height={30} className="rounded-lg" />
            <span className="font-bold text-gray-900">Higoverse</span>
          </div>

          {/* Progress bar */}
          <div className="mb-7">
            <div className="flex justify-between text-xs text-gray-400 mb-2">
              <span>Step {step} of 3</span>
              <span>{step === 1 ? "Shop details" : step === 2 ? "Account setup" : "Email verification"}</span>
            </div>
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: step === 1 ? "33%" : step === 2 ? "66%" : "100%" }} />
            </div>
          </div>

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Shop details</h2>
                <p className="text-sm text-gray-500 mt-1">Tell us about your business</p>
              </div>

              <div className="space-y-4">
                {/* Shop name */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Shop name <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                    <input value={form.shop_name} onChange={e => set("shop_name", e.target.value)}
                      placeholder="e.g. Kigali Electronics"
                      className={`${field} ${fieldIcon} ${ring(v.shop_name, !!touched.shop_name)}`} />
                  </div>
                  {touched.shop_name && !v.shop_name && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} /> Minimum 2 characters</p>
                  )}
                </div>

                {/* Business type */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Business type <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <Store className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                    <select value={form.business_type} onChange={e => set("business_type", e.target.value)}
                      className={`${field} ${fieldIcon} pr-8 appearance-none ${ring(v.business_type, !!touched.business_type)} ${!form.business_type ? "text-gray-400" : "text-gray-900"}`}>
                      <option value="">Select type…</option>
                      {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                  </div>
                  {touched.business_type && !v.business_type && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} /> Please select a type</p>
                  )}
                </div>

                {/* Address */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">District <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                    <select value={form.address} onChange={e => set("address", e.target.value)}
                      className={`${field} ${fieldIcon} pr-8 appearance-none ${ring(v.address, !!touched.address)} ${!form.address ? "text-gray-400" : "text-gray-900"}`}>
                      <option value="" disabled>Select district…</option>
                      <optgroup label="── Kigali City ──">
                        {["Gasabo","Kicukiro","Nyarugenge"].map(d => <option key={d} value={`${d}, Kigali`}>{d}</option>)}
                      </optgroup>
                      <optgroup label="── Eastern Province ──">
                        {["Bugesera","Gatsibo","Kayonza","Kirehe","Ngoma","Nyagatare","Rwamagana"].map(d => <option key={d} value={`${d}, Eastern Province`}>{d}</option>)}
                      </optgroup>
                      <optgroup label="── Western Province ──">
                        {["Karongi","Ngororero","Nyabihu","Nyamasheke","Rubavu","Rusizi","Rutsiro"].map(d => <option key={d} value={`${d}, Western Province`}>{d}</option>)}
                      </optgroup>
                      <optgroup label="── Northern Province ──">
                        {["Burera","Gakenke","Gicumbi","Musanze","Rulindo"].map(d => <option key={d} value={`${d}, Northern Province`}>{d}</option>)}
                      </optgroup>
                      <optgroup label="── Southern Province ──">
                        {["Gisagara","Huye","Kamonyi","Muhanga","Nyamagabe","Nyanza","Nyaruguru","Ruhango"].map(d => <option key={d} value={`${d}, Southern Province`}>{d}</option>)}
                      </optgroup>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                  </div>
                  {touched.address && !v.address && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} /> Please select a district</p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">About your shop <span className="text-gray-400">(optional)</span></label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-3.5 text-gray-400 w-4 h-4 pointer-events-none" />
                    <textarea value={form.description} onChange={e => set("description", e.target.value)}
                      placeholder="Brief description of what you sell…" rows={3}
                      className="w-full rounded-lg bg-gray-100 pl-10 pr-4 pt-3 pb-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 resize-none transition" />
                  </div>
                </div>

                {/* Logo */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Shop logo <span className="text-gray-400">(optional)</span></label>
                  <div className="flex items-center gap-3">
                    {logoUrl ? (
                      <div className="relative w-14 h-14 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={logoUrl} alt="logo" className="w-14 h-14 rounded-xl object-cover border border-gray-200" />
                        <button type="button" onClick={() => setLogoUrl("")}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center">
                          <X size={11} />
                        </button>
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-300 shrink-0">
                        {logoLoading ? <Loader2 size={18} className="animate-spin text-blue-400" /> : <ImagePlus size={18} />}
                      </div>
                    )}
                    <label className="flex-1 cursor-pointer">
                      <div className="h-10 rounded-lg bg-gray-100 hover:bg-gray-200 transition flex items-center justify-center gap-2 text-sm text-gray-500 font-medium">
                        <ImagePlus size={14} /> {logoUrl ? "Change logo" : "Upload logo"}
                      </div>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); }} />
                    </label>
                  </div>
                </div>
              </div>

              <button onClick={() => { setTouch({ shop_name: true, business_type: true, address: true }); if (step1Ok) setStep(2); }}
                className="mt-6 w-full h-12 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition">
                Continue <ChevronRight size={16} />
              </button>
            </>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <>
              <div className="mb-5">
                <h2 className="text-2xl font-bold text-gray-900">Your account</h2>
                <p className="text-sm text-gray-500 mt-1">Set up your login credentials</p>
              </div>

              {/* Shop summary */}
              <div className="flex items-center gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 mb-5">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                  <Store size={14} className="text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{form.shop_name}</p>
                  <p className="text-xs text-gray-500 truncate">{form.business_type}{form.address ? ` · ${form.address}` : ""}</p>
                </div>
                <button onClick={() => setStep(1)} className="ml-auto text-xs text-blue-600 hover:underline shrink-0">Edit</button>
              </div>

              <div className="space-y-4">
                {/* Email */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Email <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                    <input type="email" value={form.email} onChange={e => set("email", e.target.value)}
                      placeholder="admin@yourshop.com" autoComplete="email"
                      className={`${field} ${fieldIcon} ${ring(v.email, !!touched.email)}`} />
                  </div>
                  {touched.email && !v.email && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} /> Enter a valid email</p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Phone <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                    <input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)}
                      placeholder="07XXXXXXXX" autoComplete="tel"
                      className={`${field} ${fieldIcon} ${ring(v.phone, !!touched.phone)}`} />
                  </div>
                  {touched.phone && !v.phone && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} /> Must be 07XXXXXXXX (10 digits)</p>
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
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                    <AlertCircle size={14} className="text-amber-500" /> Email already registered
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    <Link href="/login" className="font-semibold underline hover:text-amber-900">Sign in instead</Link>
                    {" "}or use a different email.
                  </p>
                </div>
              )}

              {error && !emailTaken && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
                </div>
              )}

              <div className="flex gap-3 mt-5">
                <button onClick={() => setStep(1)}
                  className="h-12 px-5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium flex items-center gap-1.5 transition">
                  <ChevronLeft size={15} /> Back
                </button>
                <button onClick={handleSubmit} disabled={!step2Ok || loading}
                  className="flex-1 h-12 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition">
                  {loading ? <><Loader2 size={15} className="animate-spin" /> Creating…</> : "Create workspace"}
                </button>
              </div>

              <p className="text-center text-xs text-gray-400 mt-4">By registering you agree to our Terms of Service</p>
            </>
          )}

          {/* ── STEP 3: Verify ── */}
          {step === 3 && (
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
