"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Globe, LogOut, Monitor, Moon, ShieldCheck, Sun } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { useThemePref } from "@/lib/theme";
import { LANGUAGES } from "@/lib/i18n";
import { ADMIN_TABS, adminTabHref, toAdminTab, type AdminTab } from "@/lib/admin-nav";

/** The platform admin's own frame: a dark bar marked "Admin", and the admin
 *  sections down the side (the tab bar on phones). None of a business's
 *  pages, search or quick actions — the admin runs the platform, not a shop. */
export default function AdminChrome() {
  return (
    <>
      <div className="hgv-no-print h-[calc(52px+env(safe-area-inset-top))]" />
      <AdminBar />
      <Suspense fallback={null}><AdminNav /></Suspense>
    </>
  );
}

function AdminBar() {
  const { t, lang, setLang } = useLanguage();
  const [themePref, setThemePref] = useThemePref();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const initial = (user?.name?.[0] ?? user?.email?.[0] ?? "A").toUpperCase();

  return (
    <header className="hgv-no-print fixed top-0 left-0 right-0 z-50 flex h-[calc(52px+env(safe-area-inset-top))] items-center justify-between bg-[#1d2226] pt-[env(safe-area-inset-top)] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] text-white sm:pl-[max(1rem,env(safe-area-inset-left))] sm:pr-[max(1rem,env(safe-area-inset-right))]">
      <Link href="/admin" className="flex items-center gap-2.5 rounded-press focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
        <img src="/higoverse-logo.png" alt="Higoverse" draggable={false} className="h-8 w-8 rounded-press object-cover" />
        <span className="font-display text-[17px] font-semibold tracking-tight">Higoverse</span>
        <span className="flex items-center gap-1 rounded-full bg-[#cc1016] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">
          <ShieldCheck size={12} /> {t("nav.admin")}
        </span>
      </Link>

      <div ref={ref} className="relative">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={t("nav.open_menu")}
          className={`flex items-center gap-2 rounded-press px-2 py-1.5 transition-colors ${open ? "bg-white/15" : "hover:bg-white/10"}`}>
          <span className="hidden max-w-[220px] truncate text-[13px] text-white/80 sm:inline">{user?.email}</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f4f2ee] font-display text-xs font-semibold text-[#1d2226]">{initial}</span>
          <ChevronDown size={14} className={`text-white/70 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute right-0 top-full z-50 mt-2 w-[280px] overflow-hidden rounded-data border border-border bg-white text-text shadow-[0_16px_40px_-12px_rgb(0_0_0_/_0.3)]">
            <div className="border-b border-border px-4 py-3">
              <p className="truncate text-[13px] font-semibold">{user?.name ?? t("nav.admin")}</p>
              <p className="truncate text-[11px] text-text-faint">{user?.email}</p>
            </div>
            <div className="p-2">
              <div className="flex items-center gap-3 rounded-press px-3 py-2.5">
                <Globe size={15} className="text-text-muted" />
                <span className="text-sm font-medium">{t("settings.language_section")}</span>
                <select value={lang} onChange={(e) => setLang(e.target.value as typeof lang)}
                  className="ml-auto cursor-pointer rounded-press border-0 bg-paper-dim py-1.5 pl-2 pr-2 text-[11px] font-semibold outline-none">
                  {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3 rounded-press px-3 py-2.5">
                {themePref === "dark" ? <Moon size={15} className="text-text-muted" /> : themePref === "light" ? <Sun size={15} className="text-text-muted" /> : <Monitor size={15} className="text-text-muted" />}
                <span className="text-sm font-medium">{t("theme.appearance")}</span>
                <div role="radiogroup" aria-label={t("theme.appearance")} className="ml-auto flex rounded-press bg-paper-dim p-0.5">
                  {(["system", "light", "dark"] as const).map((p) => (
                    <button key={p} type="button" role="radio" aria-checked={themePref === p} onClick={() => setThemePref(p)}
                      className={`rounded-[6px] px-2 py-1 text-[11px] font-semibold ${themePref === p ? "bg-white text-text shadow-sm" : "text-text-muted hover:text-text"}`}>
                      {t(`theme.${p}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="border-t border-border p-2">
              <button onClick={() => { setOpen(false); logout(); }}
                className="flex w-full items-center gap-3 rounded-press px-3 py-2.5 text-sm font-semibold text-accent-dark hover:bg-accent-soft">
                <LogOut size={15} /> {t("common.logout")}
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

/** The admin sections: down the side on tablets and computers, along the
 *  bottom on phones. The open one comes from /admin?tab=… */
function AdminNav() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const params = useSearchParams();
  const current: AdminTab | null = pathname === "/admin" ? toAdminTab(params.get("tab")) : null;

  return (
    <>
      <aside aria-label={t("admin.panel_title")} className="hgv-aside">
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3 lg:px-3">
          <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-text-faint max-lg:hidden">{t("admin.panel_title")}</p>
          {ADMIN_TABS.map(({ key, label, icon: Icon }) => {
            const active = current === key;
            return (
              <Link key={key} href={adminTabHref(key)} aria-current={active ? "page" : undefined} title={t(label)}
                className={`relative flex h-10 items-center gap-3 rounded-press px-3 text-[13.5px] font-semibold transition-colors max-lg:h-14 max-lg:flex-col max-lg:justify-center max-lg:gap-1 max-lg:px-0.5 max-lg:text-[10.5px] ${
                  active ? "bg-accent-soft text-accent-dark" : "text-text-muted hover:bg-paper-dim hover:text-text"}`}>
                {active && <span aria-hidden="true" className="absolute -left-2 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent-dark lg:-left-3" />}
                <Icon size={20} strokeWidth={active ? 2.25 : 1.75} className="shrink-0" />
                <span className="min-w-0 truncate max-lg:max-w-full max-lg:leading-none">{t(label)}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <nav aria-label={t("admin.panel_title")} className="hgv-tabbar md:hidden">
        {ADMIN_TABS.map(({ key, label, icon: Icon }) => {
          const active = current === key;
          return (
            <Link key={key} href={adminTabHref(key)} aria-current={active ? "page" : undefined} aria-label={t(label)}
              className={`hgv-tab ${active ? "text-accent-dark" : ""}`}>
              <span><Icon size={24} strokeWidth={active ? 2.25 : 1.75} /></span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
