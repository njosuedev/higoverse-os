"use client";

import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { changePassword } from "@/lib/auth-api";

const EMPTY = { current: "", next: "", confirm: "" };

/** The platform admin's own password (admins have no shop Settings page). */
export default function PasswordCard() {
  const { t } = useLanguage();
  const [form, setForm] = useState(EMPTY);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setDone(false);
    if (!form.current) return setError(t("settings.err_current_password_required"));
    if (form.next.length < 6) return setError(t("settings.err_password_too_short"));
    if (form.next !== form.confirm) return setError(t("settings.err_passwords_mismatch"));
    setBusy(true);
    try {
      await changePassword(form.current, form.next);
      setForm(EMPTY);
      setDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("settings.err_change_password_failed");
      setError(msg.includes("400") || msg.toLowerCase().includes("incorrect") ? t("settings.err_current_password_incorrect") : msg);
    } finally { setBusy(false); }
  }

  const input = "w-full h-10 rounded-lg border border-slate-200 px-3 pr-10 text-sm focus:outline-none focus:border-[#0a66c2]";
  const field = (key: keyof typeof EMPTY, label: string, autoComplete: string) => (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      <input type={show ? "text" : "password"} autoComplete={autoComplete} value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={input} />
    </label>
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
        <form onSubmit={save} className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{t("settings.change_password")}</h3>
            <p className="text-sm text-slate-600">{t("settings.security_subtitle")}</p>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {done && (
            <p className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              <CheckCircle2 size={14} /> {t("settings.password_changed")}
            </p>
          )}
          <div className="relative">
            {field("current", t("settings.current_password"), "current-password")}
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? t("admin.hide_password") : t("admin.show_password")}
              className="absolute right-3 top-[30px] text-slate-400 hover:text-slate-600">
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {field("next", t("settings.new_password"), "new-password")}
          {field("confirm", t("settings.confirm_password"), "new-password")}
          {form.confirm && form.next !== form.confirm && (
            <p className="text-[11px] text-red-500">{t("settings.passwords_mismatch")}</p>
          )}
          <button type="submit" disabled={busy || !form.current || !form.next}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0a66c2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0958a8] disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {busy ? t("settings.changing") : t("settings.change_password")}
          </button>
        </form>
      </div>
    </section>
  );
}
