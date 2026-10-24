"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { qrSvg } from "@/lib/doc-qr";
import { mfaDisable, mfaEnable, mfaSetup, mfaStatus } from "@/lib/mfa-api";

type Stage = "loading" | "off" | "setup" | "codes" | "on" | "disable";

/** The platform admin's two-step sign-in: status, turning it on (QR code,
 *  first code, recovery codes shown once) and off (password + code). */
export default function TwoStepCard() {
  const { t } = useLanguage();
  const [stage, setStage] = useState<Stage>("loading");
  const [left, setLeft] = useState(0);
  const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    mfaStatus()
      .then((s) => { setLeft(s.recovery_left); setStage(s.enabled ? "on" : "off"); })
      .catch(() => setStage("off"));
  }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : t("common.error")); }
    finally { setBusy(false); }
  }

  const input = "w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:border-[#0a66c2]";
  const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50";
  const qr = setup ? qrSvg(setup.otpauth_uri) : null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        {stage === "on" || stage === "codes" || stage === "disable"
          ? <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          : <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900">{t("mfa.card_title")}</h3>
          {stage === "loading" && <p className="text-sm text-slate-500">…</p>}
          {stage === "off" && <p className="text-sm text-slate-600">{t("mfa.card_off")}</p>}
          {(stage === "on" || stage === "disable") && (
            <p className="text-sm text-slate-600">{t("mfa.card_on")} · {t("mfa.recovery_left").replace("{n}", String(left))}</p>
          )}
          {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          {stage === "off" && (
            <button disabled={busy} onClick={() => run(async () => { setSetup(await mfaSetup()); setCode(""); setStage("setup"); })}
              className={`${btn} mt-3 bg-[#0a66c2] text-white hover:bg-[#0958a8]`}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} {t("mfa.turn_on")}
            </button>
          )}

          {stage === "setup" && setup && (
            <div className="mt-3 grid gap-4 sm:grid-cols-[180px_1fr]">
              <div className="h-[180px] w-[180px] rounded-lg border border-slate-200 bg-white p-2"
                // qrSvg builds the SVG itself from the otpauth URI (no user HTML).
                dangerouslySetInnerHTML={{ __html: qr ?? "" }} />
              <div className="space-y-2 text-sm">
                <p className="text-slate-700">{t("mfa.scan")}</p>
                <p className="text-slate-500">{t("mfa.manual")} <code className="break-all rounded bg-slate-100 px-1.5 py-0.5 text-xs">{setup.secret}</code></p>
                <form className="flex flex-wrap gap-2 pt-1" onSubmit={(e) => { e.preventDefault(); run(async () => { setCodes(await mfaEnable(code.trim())); setLeft(10); setStage("codes"); }); }}>
                  <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                    placeholder="123456" className={`${input} w-32 text-center tracking-[0.25em]`} />
                  <button disabled={busy || code.trim().length !== 6} className={`${btn} bg-[#0a66c2] text-white hover:bg-[#0958a8]`}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("mfa.confirm")}
                  </button>
                  <button type="button" onClick={() => { setStage("off"); setSetup(null); setError(""); }} className={`${btn} border border-slate-200 text-slate-700`}>
                    {t("common.cancel")}
                  </button>
                </form>
              </div>
            </div>
          )}

          {stage === "codes" && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-semibold text-slate-900">{t("mfa.recovery_title")}</p>
              <p className="text-sm text-slate-600">{t("mfa.recovery_note")}</p>
              <ol className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-50 p-3 font-mono text-sm sm:grid-cols-5">
                {codes.map((c) => <li key={c}>{c}</li>)}
              </ol>
              <button onClick={() => { setCodes([]); setStage("on"); }} className={`${btn} bg-[#0a66c2] text-white hover:bg-[#0958a8]`}>{t("mfa.done")}</button>
            </div>
          )}

          {stage === "on" && (
            <button onClick={() => { setStage("disable"); setPassword(""); setCode(""); setError(""); }} className={`${btn} mt-3 border border-slate-200 text-slate-700`}>
              {t("mfa.turn_off")}
            </button>
          )}

          {stage === "disable" && (
            <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await mfaDisable(password, code.trim()); setStage("off"); }); }}>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("mfa.your_password")} className={`${input} w-48`} />
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("mfa.code_label")} maxLength={20} className={`${input} w-40`} />
              <button disabled={busy || !password || code.trim().length < 6} className={`${btn} bg-red-600 text-white hover:bg-red-700`}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("mfa.turn_off")}
              </button>
              <button type="button" onClick={() => { setStage("on"); setError(""); }} className={`${btn} border border-slate-200 text-slate-700`}>{t("common.cancel")}</button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
