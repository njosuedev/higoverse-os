"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { LANGUAGES } from "@/lib/i18n";
import {
  Loader2, ArrowLeft, Eye, EyeOff, RefreshCw,
  CheckCircle2, KeyRound, Mail, Lock,
  Boxes, BarChart3, ShieldCheck, Truck,
  Package, Users, FileText, Wallet, Settings, Home,
} from "lucide-react";

// Real app routes only — these mirror the authenticated nav, so a logged-out
// visitor clicking one simply bounces to /login (same as typing the URL
// directly today). No fabricated marketing pages.
const PLATFORM_LINKS = [
  { key: "nav.dashboard", href: "/",          icon: Home },
  { key: "nav.inventory", href: "/items",     icon: Package },
  { key: "nav.purchases", href: "/purchases", icon: Truck },
  { key: "nav.partners",  href: "/partners",  icon: Users },
  { key: "nav.sales",     href: "/sales",     icon: Boxes },
  { key: "nav.proforma",  href: "/proforma",  icon: FileText },
  { key: "nav.expenses",  href: "/expenses",  icon: Wallet },
  { key: "nav.reports",   href: "/reports",   icon: BarChart3 },
  { key: "nav.settings",  href: "/settings",  icon: Settings },
];

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_API || "https://auth-esys.vercel.app";
type Step = "login" | "forgot" | "otp" | "success";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router         = useRouter();
  const searchParams   = useSearchParams();
  // Where to send the user after a successful login — defaults to the dashboard.
  const nextPath = searchParams.get("next") || "/";
  const { login, user, ready } = useAuth();
  const { t, lang, setLang } = useLanguage();

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
    const timer = setTimeout(() => setResendTimer((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendTimer]);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim())        return setError(t("login.err_email_required"));
    if (!email.includes("@")) return setError(t("login.err_invalid_email"));
    if (!password.trim())     return setError(t("login.err_password_required"));
    setLoading(true);
    try {
      const res  = await fetch(`${AUTH_URL}/api/v1/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data?.detail || t("login.err_incorrect_credentials"));
      login(data); router.replace(nextPath);
    } catch { setError(t("login.err_network")); }
    finally  { setLoading(false); }
  }, [email, password, login, router, t]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault(); setFpError("");
    const email = fpEmail.trim();
    if (!email || !email.includes("@")) return setFpError(t("login.err_invalid_email"));

    // Reject scrambled/deleted emails immediately — these end in @removed.invalid
    if (email.endsWith("@removed.invalid") || email.startsWith("_deleted_")) {
      return setFpError(t("login.err_deleted_account"));
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
          return setFpError(t("login.err_no_account"));
        }
        if (detail.includes("deleted") || detail.includes("inactive") || detail.includes("disabled")) {
          return setFpError(t("login.err_account_deactivated"));
        }
        return setFpError(data?.detail || t("login.err_send_code_failed"));
      }
      setStep("otp"); setResendTimer(60);
    } catch { setFpError(t("login.err_network")); }
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
    } catch { setFpError(t("login.err_network")); }
    finally { setFpLoading(false); }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault(); setFpError("");
    if (otp.trim().length !== 6) return setFpError(t("login.err_enter_code"));
    if (newPw.length < 6)        return setFpError(t("login.err_password_min"));
    setFpLoading(true);
    try {
      const res  = await fetch(`${AUTH_URL}/api/v1/auth/reset-password`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fpEmail, otp: otp.trim(), new_password: newPw }),
      });
      const data = await res.json();
      if (!res.ok) return setFpError(data?.detail || t("login.err_reset_failed"));
      setStep("success");
    } catch { setFpError(t("login.err_network")); }
    finally  { setFpLoading(false); }
  };

  const goBackToLogin = () => {
    setStep("login"); setFpEmail(""); setOtp(""); setNewPw("");
    setFpError(""); setResendTimer(0);
  };

  if (ready && user) return null;

  /* shared field chrome — bordered paper surface, ink focus ring handled globally */
  const field = "w-full h-12 rounded-press bg-white border border-border px-4 text-sm text-text placeholder-text-faint focus:outline-none focus:border-ink transition-colors duration-200";
  const label = "block text-xs font-medium text-text-muted mb-1.5";

  return (
    <div className="min-h-screen flex flex-col bg-paper">
    <div className="flex flex-col lg:flex-row flex-1">

      {/* ══ LEFT PANEL — ink surface, ledger feature index ══ */}
      <div className="hgv-surface hgv-surface--paper !border-0 !border-r !border-border hidden lg:flex lg:w-[48%] flex-col justify-between px-14 py-12">
        {/* top: brand */}
        <div className="flex items-center gap-3">
          <Image src="/higoverse-logo.png" alt="Higoverse" width={36} height={36} className="rounded-press" />
          <span className="font-display font-semibold text-lg tracking-tight">Higoverse</span>
        </div>

        {/* middle: headline */}
        <div>
          <p className="text-xs font-semibold text-paper/55 uppercase tracking-[0.14em] mb-4">{t("login.tagline")}</p>
          <h1 className="font-display text-4xl font-semibold leading-tight mb-5">
            {t("login.headline_1")}<br />{t("login.headline_2")}<br />
            <span className="text-ink">{t("login.headline_3")}</span>
          </h1>
          <p className="text-paper/60 text-sm leading-relaxed max-w-sm mb-10">
            {t("login.subheadline")}
          </p>

          {/* feature index — a ruled list, not four identical cards */}
          <div className="border-t border-white/12 max-w-sm">
            {[
              { icon: <Boxes size={15} />,       label: t("login.feature_inventory"), sub: t("login.feature_inventory_sub") },
              { icon: <BarChart3 size={15} />,   label: t("login.feature_analytics"), sub: t("login.feature_analytics_sub") },
              { icon: <Truck size={15} />,       label: t("login.feature_suppliers"), sub: t("login.feature_suppliers_sub") },
              { icon: <ShieldCheck size={15} />, label: t("login.feature_secure"),    sub: t("login.feature_secure_sub") },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-3 py-3 border-b border-white/12">
                <span className="text-paper/70 shrink-0">{f.icon}</span>
                <div>
                  <p className="text-xs font-semibold text-paper">{f.label}</p>
                  <p className="text-[11px] text-paper/50">{f.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* bottom: trust */}
        <p className="text-[11px] text-paper/45">© {new Date().getFullYear()} Higoverse · {t("login.footer_tagline")}</p>
      </div>

      {/* ══ RIGHT PANEL — the form ══ */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">

          {/* mobile brand + condensed value prop (left panel is desktop-only) */}
          <div className="flex lg:hidden flex-col gap-2 mb-8">
            <div className="flex items-center gap-2">
              <Image src="/higoverse-logo.png" alt="Higoverse" width={30} height={30} className="rounded-press" />
              <span className="font-display font-semibold text-text">Higoverse</span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">{t("login.subheadline")}</p>
          </div>

          {/* ── login ── */}
          {step === "login" && (
            <>
              <div className="mb-7">
                <h2 className="font-display text-2xl font-semibold text-text">{t("dash.welcome")}</h2>
                <p className="text-sm text-text-muted mt-1">{t("login.subtitle")}</p>
              </div>

              {error && (
                <div className="mb-4 rounded-press bg-accent-soft border border-accent/30 px-3 py-2.5 text-sm text-accent-dark">{error}</div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className={label} htmlFor="login-email">{t("login.email_label")}</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint w-4 h-4 pointer-events-none" />
                    <input id="login-email" type="email" placeholder={t("login.email_placeholder")} value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`${field} pl-10`} />
                  </div>
                  <p className="text-[11px] text-text-faint mt-1.5">{t("login.email_hint")}</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-text-muted" htmlFor="login-password">{t("login.password_label")}</label>
                    <button type="button"
                      onClick={() => { setFpEmail(email); setStep("forgot"); setFpError(""); }}
                      className="text-xs text-ink hover:text-ink-dark font-medium">
                      {t("login.forgot_password")}
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint w-4 h-4 pointer-events-none" />
                    <input id="login-password" type={showPw ? "text" : "password"} placeholder={t("login.password_placeholder")} value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`${field} pl-10 pr-10`} />
                    <button type="button" onClick={() => setShowPw((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-faint hover:text-text-muted transition-colors duration-200">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full h-12 rounded-press bg-ink hover:bg-ink-dark text-paper text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors duration-200">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("login.signing_in")}</> : t("login.sign_in")}
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-border">
                <p className="text-xs font-semibold text-text-muted">{t("login.help_title")}</p>
                <p className="text-xs text-text-faint mt-1">{t("login.admin_created_note")}</p>
              </div>
            </>
          )}

          {/* ── forgot ── */}
          {step === "forgot" && (
            <>
              <button onClick={goBackToLogin}
                className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text mb-6 transition-colors duration-200">
                <ArrowLeft size={14} /> {t("login.back_to_signin")}
              </button>

              <div className="w-10 h-10 rounded-press bg-paper flex items-center justify-center mb-4">
                <KeyRound className="w-5 h-5 text-ink" />
              </div>
              <h2 className="font-display text-xl font-semibold text-text mb-1">{t("login.reset_password_title")}</h2>
              <p className="text-sm text-text-muted mb-6">{t("login.reset_password_desc")}</p>

              {fpError && (
                <div className="mb-4 rounded-press bg-accent-soft border border-accent/30 px-3 py-2.5 text-sm text-accent-dark">{fpError}</div>
              )}

              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className={label} htmlFor="forgot-email">{t("login.email_label")}</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint w-4 h-4 pointer-events-none" />
                    <input id="forgot-email" type="email" placeholder={t("login.email_placeholder")} value={fpEmail}
                      onChange={(e) => setFpEmail(e.target.value)}
                      className={`${field} pl-10`} autoFocus />
                  </div>
                </div>
                <button type="submit" disabled={fpLoading}
                  className="w-full h-12 rounded-press bg-ink hover:bg-ink-dark text-paper text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors duration-200">
                  {fpLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("login.sending")}</> : t("login.send_code")}
                </button>
              </form>
            </>
          )}

          {/* ── otp ── */}
          {step === "otp" && (
            <>
              <button onClick={() => { setStep("forgot"); setFpError(""); }}
                className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text mb-6 transition-colors duration-200">
                <ArrowLeft size={14} /> {t("login.change_email")}
              </button>

              <div className="w-10 h-10 rounded-press bg-success-soft flex items-center justify-center mb-4">
                <Mail className="w-5 h-5 text-success" />
              </div>
              <h2 className="font-display text-xl font-semibold text-text mb-1">{t("login.check_inbox")}</h2>
              <p className="text-sm text-text-muted mb-1">{t("login.code_sent_to")}</p>
              <p className="text-sm font-semibold text-text mb-1 break-all">{fpEmail}</p>
              <p className="text-[11px] text-text-faint mb-6">{t("login.otp_hint")}</p>

              {fpError && (
                <div className="mb-4 rounded-press bg-accent-soft border border-accent/30 px-3 py-2.5 text-sm text-accent-dark">{fpError}</div>
              )}

              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className={label} htmlFor="otp-code">{t("login.otp_label")}</label>
                  <input
                    id="otp-code"
                    type="text" inputMode="numeric" maxLength={6} placeholder="000000"
                    value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="hgv-figure w-full h-12 text-center text-2xl font-semibold tracking-[0.4em] rounded-press bg-white border border-border text-text placeholder-text-faint/60 focus:outline-none focus:border-ink transition-colors duration-200"
                    autoFocus
                  />
                </div>
                <div>
                  <label className={label} htmlFor="new-password">{t("login.new_password_label")}</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint w-4 h-4 pointer-events-none" />
                    <input id="new-password" type={showNewPw ? "text" : "password"} placeholder={t("login.new_password_placeholder")}
                      value={newPw} onChange={(e) => setNewPw(e.target.value)}
                      className={`${field} pl-10 pr-10`} />
                    <button type="button" onClick={() => setShowNewPw((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-faint hover:text-text-muted transition-colors duration-200">
                      {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {newPw.length > 0 && newPw.length < 6 && (
                    <p className="text-xs text-accent-dark mt-1.5">{6 - newPw.length} {t("login.more_chars_needed")}</p>
                  )}
                </div>
                <button type="submit" disabled={fpLoading || otp.length !== 6 || newPw.length < 6}
                  className="w-full h-12 rounded-press bg-ink hover:bg-ink-dark text-paper text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors duration-200">
                  {fpLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("login.resetting")}</> : t("login.reset_password")}
                </button>
              </form>

              <div className="mt-4 text-center">
                {resendTimer > 0 ? (
                  <p className="text-sm text-text-faint">{t("login.resend_in")} <span className="hgv-figure font-semibold text-text-muted">{resendTimer}s</span></p>
                ) : (
                  <button onClick={handleResend} disabled={fpLoading}
                    className="inline-flex items-center gap-1.5 text-sm text-ink hover:text-ink-dark font-medium disabled:opacity-50">
                    <RefreshCw size={12} /> {t("login.resend_code")}
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── success ── */}
          {step === "success" && (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-data bg-success-soft flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-success" />
              </div>
              <h2 className="font-display text-xl font-semibold text-text mb-1.5">{t("login.password_updated")}</h2>
              <p className="text-sm text-text-muted mb-6">{t("login.password_updated_desc")}</p>
              <button onClick={goBackToLogin}
                className="w-full h-12 rounded-press bg-ink hover:bg-ink-dark text-paper text-sm font-semibold transition-colors duration-200">
                {t("login.sign_in_now")}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>

      {/* ══ FOOTER — language switcher + a full index of what Higoverse does ══ */}
      <footer className="border-t border-border bg-white">
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

          {/* Language row */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-text-faint mb-2">{t("login.footer_language")}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  className={`text-xs transition-colors duration-200 ${l.code === lang ? "text-ink font-semibold" : "text-text-muted hover:text-text"}`}
                >
                  {l.flag} {l.label}
                </button>
              ))}
            </div>
          </div>

          <div className="hgv-notch-divider" aria-hidden="true" />

          {/* Platform index */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-text-faint mb-2">{t("login.footer_explore")}</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {PLATFORM_LINKS.map((p) => {
                const Icon = p.icon;
                return (
                  <Link key={p.href} href={p.href} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-ink transition-colors duration-200">
                    <Icon size={12} />
                    {t(p.key)}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* About + copyright */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 pt-2">
            <p className="text-xs text-text-faint max-w-md leading-relaxed">{t("login.footer_about")}</p>
            <p className="text-[11px] text-text-faint shrink-0">© {new Date().getFullYear()} Higoverse · {t("login.footer_tagline")}</p>
          </div>

        </div>
      </footer>
    </div>
  );
}
