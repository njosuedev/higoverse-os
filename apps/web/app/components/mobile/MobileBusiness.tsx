"use client";

// The Business tab on a phone: the Android app's account screen
// (apps/mobile/lib/src/screens/more_screen.dart) — who is signed in, the
// business and its settings, money owed, the team and expenses, appearance,
// language and sign-out — plus the website's own sections the app doesn't
// have (purchases, partners, reports, proformas, payroll, settings, admin).

import Link from "next/link";
import type { ReactNode } from "react";
import {
  BarChart3, ChevronRight, CircleDollarSign, Download, FileText, HandCoins, Languages, LogOut, Monitor, Moon, Receipt,
  Settings, ShieldCheck, Store, Sun, Truck, TriangleAlert, Users, UsersRound, Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { useShop } from "@/lib/shop-context";
import { useShopSettings } from "@/lib/shop-settings-context";
import { useCanSeeFinancials } from "@/lib/permissions";
import { useThemePref } from "@/lib/theme";
import { LANGUAGES } from "@/lib/i18n";
import { settingsRequest } from "@/lib/settings-api";
import { getEffectiveRole } from "@/lib/auth";
import { PAYROLL_ROLES } from "@/lib/payroll-api";
import { askConfirm } from "@/lib/dialogs";
import { useChat } from "@/lib/chat";
import { useConnection } from "@/lib/connection";

const ROLES = ["owner", "admin", "manager", "cashier", "staff", "storekeeper", "accountant"];

export default function MobileBusiness() {
  const { user, logout } = useAuth();
  const { t, lang, setLang, layout } = useLanguage();
  const { shop } = useShop();
  const { currency, lowStock } = useShopSettings();
  const fin = useCanSeeFinancials();
  const [themePref, setThemePref] = useThemePref();
  const chat = useChat();
  const isCar = layout === "car";
  const role = user?.role ?? "";
  const isAdmin = getEffectiveRole(user ?? null) === "ADMIN";
  const online = chat.online.filter((id) => id !== chat.me).length;
  const live = useConnection() === "online";

  async function signOut() {
    const ok = await askConfirm({ title: t("acc.sign_out_q"), message: t("acc.sign_out_body"), confirmLabel: t("acc.sign_out"), cancelLabel: t("app.cancel"), danger: true });
    if (ok) logout();
  }
  function changeLang(code: typeof lang) {
    setLang(code);
    settingsRequest("/settings", { method: "PUT", body: JSON.stringify({ language: code }) }).catch(() => {});
  }

  const name = user?.name ?? shop?.name ?? "";
  return (
    <main className="px-2 pb-5 pt-2">
      {/* Who is signed in */}
      <Group>
        <div className="flex items-center gap-3 px-3 py-3">
          <span className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-ink-soft text-lg font-bold text-ink">
            {(name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
            <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-white bg-success" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-extrabold text-text">{name}</p>
            <p className="truncate text-[13px] text-text-muted">{user?.email ?? ""}</p>
            <p className="text-[13px] text-text-muted">{ROLES.includes(role) ? t(`role.${role}`) : isAdmin ? t("nav.admin") : t("common.shop_owner")}</p>
          </div>
        </div>
      </Group>

      <Title>{t("acc.business")}</Title>
      <Group>
        <Row icon={<Store size={20} />} title={shop?.name ?? t("acc.no_business")} sub={isCar ? t("acc.car_dealer") : t("acc.shop")} strong />
        <Row icon={<CircleDollarSign size={20} />} title={t("acc.currency")} end={currency} />
        <Row icon={<TriangleAlert size={20} />} title={t("acc.low_stock")} end={String(lowStock)} />
        <Row icon={<Wallet size={20} />} title={t("debts.title")} sub={t("acc.debts_sub")} href="/sales?view=debts" />
        <Row icon={<UsersRound size={20} />} title={t("team.title")} sub={t("team.menu_sub")} href="/team" />
        {fin && <Row icon={<Receipt size={20} />} title={t("exp.title")} sub={t("exp.menu_sub")} href="/expenses" />}
      </Group>

      {/* The website's sections the app doesn't have */}
      <Title>{t("nav.more")}</Title>
      <Group>
        {!isCar && <Row icon={<Truck size={20} />} title={t("nav.purchases")} href="/purchases" />}
        <Row icon={<Users size={20} />} title={t("nav.partners")} href="/partners" />
        <Row icon={<FileText size={20} />} title={t("nav.proforma")} href="/sales?tab=proforma" />
        {fin && <Row icon={<BarChart3 size={20} />} title={t("nav.reports")} href="/reports" />}
        {PAYROLL_ROLES.includes(role) && <Row icon={<HandCoins size={20} />} title={t("nav.payroll")} href="/payroll" />}
        <Row icon={<Settings size={20} />} title={t("nav.settings")} sub={t("nav.settings_hint")} href="/settings" />
        {isAdmin && <Row icon={<ShieldCheck size={20} />} title={t("nav.admin")} href="/admin" />}
      </Group>

      <Title>{t("acc.notifications")}</Title>
      <Group>
        <Row icon={<span className="relative flex h-2.5 w-2.5">
            {live && <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />}
            <span className={`relative h-2.5 w-2.5 rounded-full ${live ? "bg-success" : "bg-text-faint"}`} />
          </span>}
          title={t("acc.live")} sub={t(live ? "live.status_live" : "live.status_offline")}
          end={online > 0 ? <span className="text-[12px] text-text-faint">{t("live.online_n").replace("{n}", String(online))}</span> : undefined} />
      </Group>

      <Title>{t("acc.appearance")}</Title>
      <Group>
        <div className="p-3">
          <div role="radiogroup" aria-label={t("acc.appearance")} className="flex overflow-hidden rounded-full border border-border">
            {([["system", Monitor], ["light", Sun], ["dark", Moon]] as const).map(([p, Icon], i) => (
              <button key={p} type="button" role="radio" aria-checked={themePref === p} onClick={() => setThemePref(p)}
                className={`flex h-10 flex-1 items-center justify-center gap-1.5 text-[13px] font-semibold ${i > 0 ? "border-l border-border" : ""} ${
                  themePref === p ? "bg-ink-soft text-ink" : "text-text"}`}>
                <Icon size={16} /> <span className="truncate">{t(`theme.${p}`)}</span>
              </button>
            ))}
          </div>
        </div>
      </Group>

      <Title>{t("acc.language")}</Title>
      <Group>
        <label className="flex items-center gap-4 px-4 py-3">
          <Languages size={20} className="shrink-0 text-text-muted" />
          <select value={lang} onChange={(e) => changeLang(e.target.value as typeof lang)} aria-label={t("acc.language")}
            className="min-w-0 flex-1 appearance-none bg-transparent font-bold text-text outline-none">
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          <ChevronRight size={20} className="shrink-0 text-text-faint" />
        </label>
      </Group>

      <Title>{t("acc.app")}</Title>
      <Group>
        <Row icon={<Download size={20} />} title={t("acc.web_title")} sub={t("acc.web_sub")} href="/download" />
      </Group>

      <button type="button" onClick={signOut}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border font-bold text-text active:bg-paper-dim">
        <LogOut size={18} /> {t("acc.sign_out")}
      </button>
    </main>
  );
}

function Title({ children }: { children: ReactNode }) {
  return <h2 className="px-1 pb-2 pt-[18px] text-[13px] font-bold uppercase tracking-wide text-text-muted">{children}</h2>;
}

/** A card of rows divided by hairlines (the app's Card + ListTiles). */
function Group({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-xl border border-border bg-white [&>*+*]:border-t [&>*+*]:border-border">{children}</div>;
}

function Row({ icon, title, sub, end, href, strong }: {
  icon: ReactNode; title: string; sub?: string; end?: ReactNode; href?: string; strong?: boolean;
}) {
  const body = (
    <>
      <span className="flex w-6 shrink-0 items-center justify-center text-text-muted">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[15px] text-text ${strong ? "font-bold" : ""}`}>{title}</span>
        {sub && <span className="block text-[13px] leading-snug text-text-muted">{sub}</span>}
      </span>
      {end != null && <span className="shrink-0 text-[14px] text-text-muted">{end}</span>}
      {href && <ChevronRight size={20} className="shrink-0 text-text-faint" />}
    </>
  );
  const cls = "flex min-h-[56px] items-center gap-4 px-4 py-2.5";
  return href
    ? <Link href={href} className={`${cls} active:bg-paper-dim`}>{body}</Link>
    : <div className={cls}>{body}</div>;
}
