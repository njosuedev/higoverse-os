"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { LANGUAGES } from "@/lib/i18n";
import {
  Loader2, ArrowLeft, Eye, EyeOff, RefreshCw,
  CheckCircle2, KeyRound, Mail, Lock,
  Boxes, BarChart3, ShieldCheck, Package, Users, FileText, Wallet,
} from "lucide-react";
import { AUTH_API as AUTH_URL } from "@/lib/api-config";

type Step = "login" | "forgot" | "otp" | "success";

const noopSubscribe = () => () => {};

// Where to send the user after a successful login — defaults to the dashboard.
// Read from window.location at call time instead of useSearchParams(): that
// hook forces a Suspense boundary which made the prerendered HTML empty, so
// crawlers and link previews saw a blank page.
function getNextPath() {
  if (typeof window === "undefined") return "/";
  const next = new URLSearchParams(window.location.search).get("next") || "/";
  // Same-site paths only — never bounce a fresh login to another origin.
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/";
}

export default function LoginPage() {
  const router         = useRouter();
  const { login, user, ready } = useAuth();
  const { t, lang, setLang } = useLanguage();

  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [showPw,      setShowPw]      = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  // Set by expireSession() when a session could not be renewed.
  const expired = useSyncExternalStore(
    noopSubscribe,
    () => new URLSearchParams(window.location.search).get("expired") === "1",
    () => false,
  );

  const [step,        setStep]        = useState<Step>("login");
  const [fpEmail,     setFpEmail]     = useState("");
  const [otp,         setOtp]         = useState("");
  const [newPw,       setNewPw]       = useState("");
  const [showNewPw,   setShowNewPw]   = useState(false);
  const [fpLoading,   setFpLoading]   = useState(false);
  const [fpError,     setFpError]     = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => { if (ready && user) router.replace(getNextPath()); }, [ready, user, router]);
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
      login(data);
      // A full page load (not a client-side route change) so every screen
      // loads this account's data from scratch — nothing from before shows.
      window.location.replace(getNextPath());
    } catch { setError(t("login.err_network")); }
    finally  { setLoading(false); }
  }, [email, password, login, t]);

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
  const label = "block text-sm font-semibold text-text mb-1.5";

  return (
    <div className="min-h-screen flex flex-col bg-paper">
    <div className="flex flex-col lg:flex-row flex-1">

      {/* ══ LEFT PANEL — what Higoverse is, plainly (desktop) ══ */}
      <aside className="hidden lg:flex lg:w-[50%] flex-col border-r border-border bg-white px-14 py-12">
        <div className="flex items-center gap-3">
          <Image src="/higoverse-logo.png" alt="Higoverse" width={34} height={34} className="rounded-press" />
          <span className="font-display text-lg font-bold tracking-tight text-text">Higoverse</span>
        </div>
        <div className="my-auto max-w-[460px] py-10">
          <About t={t} />
        </div>
        <p className="text-xs text-text-faint">© {new Date().getFullYear()} Higoverse</p>
      </aside>

      {/* ══ RIGHT PANEL — the form ══ */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">

          {/* phones: brand above the form (the overview follows below it) */}
          <div className="flex lg:hidden items-center gap-2 mb-8">
            <Image src="/higoverse-logo.png" alt="Higoverse" width={30} height={30} className="rounded-press" />
            <span className="font-display font-bold text-text">Higoverse</span>
          </div>

          {/* ── login ── */}
          {step === "login" && (
            <>
              <div className="mb-7">
                <h2 className="font-display text-2xl font-semibold text-text">{t("login.title")}</h2>
                <p className="text-sm text-text-muted mt-1">{t("login.subtitle")}</p>
              </div>

              {expired && !error && (
                <div className="mb-4 rounded-press bg-warning-soft border border-warning/30 px-3 py-2.5 text-sm text-warning">{t("login.session_expired")}</div>
              )}
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
                    <label className="text-sm font-semibold text-text" htmlFor="login-password">{t("login.password_label")}</label>
                    <button type="button"
                      onClick={() => { setFpEmail(email); setStep("forgot"); setFpError(""); }}
                      className="text-sm text-ink hover:text-ink-dark hover:underline font-semibold">
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

              <div className="mt-6 rounded-press border border-border bg-white px-4 py-3">
                <p className="text-sm font-semibold text-text">{t("login.help_title")}</p>
                <p className="text-sm text-text-muted mt-0.5 leading-relaxed">{t("login.no_account_body")}</p>
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

      {/* ══ PHONES — the overview, below the form ══ */}
      <section className="lg:hidden border-t border-border bg-white px-6 py-10">
        <div className="mx-auto max-w-[400px]"><About t={t} /></div>
      </section>

      {/* ══ FOOTER — language ══ */}
      <footer className="border-t border-border bg-paper">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="text-xs font-semibold text-text-muted">{t("login.footer_language")}:</span>
            {LANGUAGES.map((l) => (
              <button key={l.code} onClick={() => setLang(l.code)} aria-pressed={l.code === lang}
                className={`text-sm transition-colors duration-200 ${l.code === lang ? "font-bold text-ink underline underline-offset-4" : "text-text-muted hover:text-text"}`}>
                {l.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-faint lg:hidden">© {new Date().getFullYear()} Higoverse</p>
        </div>
      </footer>
    </div>
  );
}

/** Plain account of what Higoverse does and how it keeps data — every line
 *  here describes something the app actually does. */
function About({ t }: { t: (key: string) => string }) {
  const MODULES: { icon: React.ReactNode; title: string; body: string }[] = [
    { icon: <Package size={16} />,  title: t("login.m_stock"),     body: t("login.m_stock_sub") },
    { icon: <Boxes size={16} />,    title: t("login.m_sales"),     body: t("login.m_sales_sub") },
    { icon: <Users size={16} />,    title: t("login.m_partners"),  body: t("login.m_partners_sub") },
    { icon: <FileText size={16} />, title: t("login.m_proforma"),  body: t("login.m_proforma_sub") },
    { icon: <Wallet size={16} />,   title: t("login.m_expenses"),  body: t("login.m_expenses_sub") },
    { icon: <BarChart3 size={16} />, title: t("login.m_reports"),  body: t("login.m_reports_sub") },
  ];
  const DATA = [t("login.data_1"), t("login.data_2"), t("login.data_3"), t("login.data_4")];
  return (
    <div>
      <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-text">{t("login.intro_title")}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-text-muted">{t("login.intro_body")}</p>

      <h2 className="mt-9 text-xs font-bold uppercase tracking-[0.12em] text-text-muted">{t("login.what_title")}</h2>
      <ul className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {MODULES.map((m) => (
          <li key={m.title} className="flex gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-press border border-border bg-paper text-ink">{m.icon}</span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-text">{m.title}</p>
              <p className="text-[13px] leading-snug text-text-muted">{m.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mt-9 text-xs font-bold uppercase tracking-[0.12em] text-text-muted">{t("login.data_title")}</h2>
      <ul className="mt-3 space-y-2">
        {DATA.map((line) => (
          <li key={line} className="flex gap-2.5 text-sm leading-snug text-text">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-success" /> <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
