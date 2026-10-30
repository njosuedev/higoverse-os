"use client";

import { useState } from "react";
import { Loader2, Pencil, X } from "lucide-react";
import { updateUser, type AdminUser } from "@/lib/admin-api";

/** Corrects a user's name or email (their role and company are set elsewhere). */
export default function EditUserDialog({ user, t, onClose, onSaved }: {
  user: AdminUser; t: (k: string) => string; onClose: () => void; onSaved: (u: AdminUser) => void;
}) {
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) return setError(t("admin.err_email_required"));
    setBusy(true); setError("");
    try {
      const payload: { name?: string | null; email?: string } = {};
      if (name.trim() !== (user.name ?? "")) payload.name = name.trim() || null;
      if (clean.toLowerCase() !== user.email.toLowerCase()) payload.email = clean;
      onSaved(Object.keys(payload).length ? await updateUser(user.id, payload) : user);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.err_generic"));
      setBusy(false);
    }
  }

  const input = "w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:border-[#0a66c2]";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("admin.edit_user")}
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Pencil size={14} /> {t("admin.edit_user")}</h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <div className="space-y-3 px-4 py-4">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">{t("common.name")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} autoFocus className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">{t("common.email")}</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-[#0a66c2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0958a8] disabled:opacity-50">
            {busy && <Loader2 size={12} className="animate-spin" />} {t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
