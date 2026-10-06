"use client";

// The business's people. Its owner (or admin) adds up to three employees,
// each with their own sign-in, changes their role, switches them off or
// removes them (backend: auth-service /api/v1/team).

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, MoreVertical, UserPlus, X } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { addEmployee, changeEmployee, loadTeam, removeEmployee, startChat, useChat } from "@/lib/chat";
import { askConfirm, notify } from "@/lib/dialogs";

const ROLES = ["manager", "cashier", "storekeeper", "accountant"];
const inputCls = "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2] transition";

export default function TeamPage() {
  const { t } = useLanguage();
  const chat = useChat();
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);

  useEffect(() => { void startChat(); void loadTeam().catch(() => {}); }, []);

  const room = chat.maxEmployees - chat.employees;
  const act = async (f: () => Promise<void>) => { setMenu(null); try { await f(); } catch (e) { notify(e instanceof Error ? e.message : String(e)); } };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-text">{t("team.title")}</h1>
          <p className="mt-1 max-w-xl text-sm text-text-muted">{t("team.intro").replace("{n}", String(chat.maxEmployees))}</p>
        </div>
        {chat.canManage && (
          <button type="button" disabled={room <= 0} onClick={() => setAdding(true)}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-dark disabled:opacity-50">
            <UserPlus size={16} />
            {room > 0 ? t("team.add_n").replace("{n}", String(chat.employees)).replace("{max}", String(chat.maxEmployees))
              : t("team.full").replaceAll("{max}", String(chat.maxEmployees))}
          </button>
        )}
      </div>

      <div className="mt-6 divide-y divide-slate-100 overflow-visible rounded-data border border-border bg-white">
        {chat.members.length === 0 && <p className="px-4 py-6 text-sm text-text-faint">{t("common.loading")}</p>}
        {chat.members.map((m) => {
          const employee = ROLES.includes(m.role);
          return (
            <div key={m.id} className="relative flex items-center gap-3 px-4 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-soft text-sm font-bold text-ink">
                {m.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-text">{m.name}{m.id === chat.me ? ` (${t("chat.you")})` : ""}</p>
                <p className={`truncate text-xs ${m.is_active ? "text-text-faint" : "text-warning"}`}>
                  {t(`role.${m.role}`)}{m.email ? ` · ${m.email}` : ""}{!m.is_active ? ` · ${t("team.off")}` : ""}
                </p>
              </div>
              {m.id !== chat.me && (
                <Link href={`/messages?with=${m.id}`} title={t("nav.messages")} className="rounded-full p-2 text-ink hover:bg-ink-soft"><MessageCircle size={18} /></Link>
              )}
              {chat.canManage && employee && (
                <div className="relative">
                  <button type="button" onClick={() => setMenu(menu === m.id ? null : m.id)} className="rounded-full p-2 text-text-muted hover:bg-paper-dim" aria-label={t("common.more")}>
                    <MoreVertical size={18} />
                  </button>
                  {menu === m.id && (
                    <div role="menu" className="absolute right-0 top-10 z-20 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                      {ROLES.filter((r) => r !== m.role).map((r) => (
                        <button key={r} role="menuitem" type="button" onClick={() => act(() => changeEmployee(m.id, { role: r }))}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50">{t("team.make").replace("{role}", t(`role.${r}`))}</button>
                      ))}
                      <button role="menuitem" type="button" onClick={() => act(() => changeEmployee(m.id, { is_active: !m.is_active }))}
                        className="block w-full border-t border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50">{t(m.is_active ? "team.switch_off" : "team.switch_on")}</button>
                      <button role="menuitem" type="button"
                        onClick={async () => {
                          setMenu(null);
                          if (await askConfirm({ message: `${t("team.remove_q").replace("{name}", m.name)} ${t("team.remove_body")}`, danger: true })) await act(() => removeEmployee(m.id));
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-accent-dark hover:bg-slate-50">{t("team.remove")}</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {adding && <AddEmployee onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddEmployee({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const [v, setV] = useState({ name: "", email: "", password: "", role: "cashier" });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!v.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim()) || v.password.length < 8) { notify(t("team.check_fields")); return; }
    setSaving(true);
    try {
      await addEmployee({ ...v, name: v.name.trim(), email: v.email.trim() });
      notify(t("team.added"), "success");
      onClose();
    } catch (e) { notify(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">{t("team.add")}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-slate-500">{t("team.add_hint")}</p>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">{t("team.name")}</label>
            <input className={inputCls} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">{t("team.email")}</label>
            <input type="email" className={inputCls} value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">{t("team.password")} <span className="text-gray-400 font-normal">({t("team.password_hint")})</span></label>
            <input type="password" className={inputCls} value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} autoComplete="new-password" /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">{t("team.role")}</label>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <button key={r} type="button" onClick={() => setV({ ...v, role: r })}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${v.role === r ? "bg-ink-soft text-ink" : "bg-slate-100 text-slate-600"}`}>{t(`role.${r}`)}</button>
              ))}
            </div></div>
        </div>
        <div className="flex justify-end gap-2.5 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">{t("common.cancel")}</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-60 hover:opacity-90 bg-[#0a66c2]">{t("team.add")}</button>
        </div>
      </div>
    </div>
  );
}
