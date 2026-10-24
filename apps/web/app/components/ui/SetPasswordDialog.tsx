"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, Wand2, X } from "lucide-react";
import { useLanguage } from "@/lib/language-context";

/** A random password that is easy to read out or type (no 0/O, 1/l/I). */
function suggest(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const pick = new Uint32Array(12);
  crypto.getRandomValues(pick);
  const s = Array.from(pick, (n) => chars[n % chars.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

/** Asks for a new password for [name] and saves it with [onSave]. The person
 *  is signed out everywhere and signs in with the new password. */
export default function SetPasswordDialog({ name, onSave, onClose }: {
  name: string;
  onSave: (password: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function save() {
    if (pw.length < 8) { setError(t("setpw.too_short")); return; }
    setSaving(true); setError("");
    try { await onSave(pw); setDone(true); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="flex items-center gap-2 font-semibold text-slate-900"><KeyRound size={16} /> {t("setpw.title")}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100" aria-label={t("common.close")}><X size={16} /></button>
        </div>
        <div className="space-y-3 px-5 py-4">
          {done ? (
            <>
              <p className="text-sm text-slate-700">{t("setpw.done").replace("{name}", name)}</p>
              <p className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 select-all">{pw}</p>
              <p className="text-xs text-slate-500">{t("setpw.done_hint")}</p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">{t("setpw.body").replace("{name}", name)}</p>
              <div className="relative">
                <input type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="new-password"
                  placeholder={t("setpw.placeholder")} maxLength={128}
                  className="h-11 w-full rounded-lg border border-slate-200 px-3 pr-20 text-sm focus:border-[#0a66c2] focus:outline-none" />
                <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1">
                  <button type="button" onClick={() => { setPw(suggest()); setShow(true); }} title={t("setpw.suggest")} aria-label={t("setpw.suggest")}
                    className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Wand2 size={15} /></button>
                  <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? t("setpw.hide") : t("setpw.show")}
                    className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                </div>
              </div>
              <p className="text-xs text-slate-500">{t("setpw.note")}</p>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          {done ? (
            <button onClick={onClose} className="rounded-lg bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white hover:opacity-90">{t("common.close")}</button>
          ) : (
            <>
              <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">{t("common.cancel")}</button>
              <button onClick={save} disabled={saving || pw.length < 8}
                className="flex items-center gap-1.5 rounded-lg bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {saving && <Loader2 size={14} className="animate-spin" />} {t("setpw.save")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
