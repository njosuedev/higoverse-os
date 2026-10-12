"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, BellOff, BellRing, Car, CheckCheck, FileText, Package, Receipt, ShoppingCart, Trash2, TriangleAlert, Wallet, Clock, Volume2, VolumeX,
} from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { useShopSettings } from "@/lib/shop-settings-context";
import { useCanSeeFinancials } from "@/lib/permissions";
import {
  clearAll, configureNotifications, markAllRead, markRead, notifText, playChime, setSoundOn, useNotifications, useSoundOn, type Notif, type NotifKind,
} from "@/lib/notifications";

const ICON: Record<NotifKind, { icon: typeof Bell; tone: string }> = {
  sale: { icon: ShoppingCart, tone: "bg-emerald-50 text-emerald-700" },
  sale_deleted: { icon: Trash2, tone: "bg-slate-100 text-slate-600" },
  car_added: { icon: Car, tone: "bg-blue-50 text-blue-700" },
  cars_stocked: { icon: Car, tone: "bg-blue-50 text-blue-700" },
  product_new: { icon: Package, tone: "bg-blue-50 text-blue-700" },
  fine: { icon: TriangleAlert, tone: "bg-red-50 text-red-700" },
  pending: { icon: Clock, tone: "bg-amber-50 text-amber-700" },
  low_stock: { icon: TriangleAlert, tone: "bg-amber-50 text-amber-700" },
  out_of_stock: { icon: TriangleAlert, tone: "bg-red-50 text-red-700" },
  restocked: { icon: Package, tone: "bg-emerald-50 text-emerald-700" },
  debt_new: { icon: Wallet, tone: "bg-amber-50 text-amber-700" },
  debt_payment: { icon: Wallet, tone: "bg-emerald-50 text-emerald-700" },
  debt_paid: { icon: Wallet, tone: "bg-emerald-50 text-emerald-700" },
  expense: { icon: Receipt, tone: "bg-slate-100 text-slate-600" },
  purchase: { icon: Package, tone: "bg-blue-50 text-blue-700" },
  proforma_new: { icon: FileText, tone: "bg-blue-50 text-blue-700" },
  proforma_approved: { icon: FileText, tone: "bg-emerald-50 text-emerald-700" },
  proforma_sold: { icon: FileText, tone: "bg-emerald-50 text-emerald-700" },
  proforma_deposit: { icon: Wallet, tone: "bg-emerald-50 text-emerald-700" },
};

// The app's filters (activity_screen.dart): what each kind of event is about.
const SECTION: Record<NotifKind, "sales" | "stock" | "debts" | "money"> = {
  sale: "sales", sale_deleted: "sales", proforma_new: "sales", proforma_approved: "sales", proforma_sold: "sales", proforma_deposit: "sales",
  car_added: "stock", cars_stocked: "stock", product_new: "stock", fine: "stock", pending: "stock",
  low_stock: "stock", out_of_stock: "stock", restocked: "stock", purchase: "stock",
  debt_new: "debts", debt_payment: "debts", debt_paid: "debts",
  expense: "money",
};
type Filter = "all" | "unread" | "sales" | "stock" | "debts" | "money" | "cars";

/** Whole calendar days from `iso` to today. */
function daysAgo(iso: string) {
  const d = new Date(iso), n = new Date();
  return Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000);
}

// The browser's permission, kept in step when the person answers the prompt.
const permListeners = new Set<() => void>();
const readPerm = () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

/** The header bell: what happened in the business, newest first, with an
 *  unread count; also asks to show system notifications (Windows / browser). */
export default function NotificationBell() {
  const { t, layout } = useLanguage();
  const { user } = useAuth();
  const { lowStock } = useShopSettings();
  const router = useRouter();
  const items = useNotifications();
  const sound = useSoundOn();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const fin = useCanSeeFinancials();
  const isCar = layout === "car";
  // "5 min ago" stays true while the list is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [open]);
  const ref = useRef<HTMLDivElement>(null);
  const perm = useSyncExternalStore(
    (l) => { permListeners.add(l); return () => { permListeners.delete(l); }; },
    readPerm,
    () => "unsupported",
  );

  useEffect(() => {
    configureNotifications({ t, isCar: layout === "car", lowStock: lowStock ?? 10, role: user?.role ?? "" });
  }, [t, layout, lowStock, user?.role]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const unread = items.filter((n) => !n.read).length;
  const filters: [Filter, string][] = [
    ["all", "act.f_all"], ["unread", "act.f_unread"], ["sales", "act.f_sales"], ["stock", "act.f_stock"], ["debts", "act.f_debts"],
    ...(fin ? [["money", "act.f_money"] as [Filter, string]] : []),
    ...(isCar ? [["cars", "act.f_fines"] as [Filter, string]] : []),
  ];
  const shown = items.filter((n) =>
    filter === "all" ? true
    : filter === "unread" ? !n.read
    : filter === "cars" ? n.kind === "fine" || n.kind === "pending"
    : SECTION[n.kind] === filter);
  // As on Facebook: New (unread) first, then the rest by day.
  const groups: [string, Notif[]][] = [
    ["act.new", shown.filter((n) => !n.read)],
    ["act.today", shown.filter((n) => n.read && daysAgo(n.at) <= 0)],
    ["act.yesterday", shown.filter((n) => n.read && daysAgo(n.at) === 1)],
    ["act.this_week", shown.filter((n) => n.read && daysAgo(n.at) > 1 && daysAgo(n.at) < 7)],
    ["act.earlier", shown.filter((n) => n.read && daysAgo(n.at) >= 7)],
  ];

  async function enableSystem() {
    if (typeof Notification === "undefined") return;
    await Notification.requestPermission().catch(() => "denied");
    permListeners.forEach((l) => l());
  }

  function go(n: Notif) {
    markRead(n.id);
    setOpen(false);
    router.push(n.href);
  }

  const ago = (iso: string) => {
    const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
    if (s < 60) return t("dash.time_now");
    if (s < 3600) return t("dash.time_min").replace("{n}", String(Math.floor(s / 60)));
    if (s < 86400) return t("dash.time_hour").replace("{n}", String(Math.floor(s / 3600)));
    const d = Math.floor(s / 86400);
    return d === 1 ? t("dash.time_day") : t("dash.days_ago_n").replace("{n}", String(d));
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { setNow(Date.now()); setOpen((o) => !o); }} aria-haspopup="dialog" aria-expanded={open}
        title={t("notif.title")} aria-label={unread ? `${t("notif.title")} (${unread})` : t("notif.title")}
        className={`relative flex h-11 w-11 items-center justify-center rounded-full bg-paper-dim text-text transition-colors md:h-9 md:w-9 md:bg-transparent ${open ? "md:bg-paper-dim md:text-text" : "md:text-text-muted md:hover:bg-paper-dim md:hover:text-text"}`}>
        {/* The app's 44px round button on phones; the website's small icon on wider screens. */}
        {!sound ? <BellOff size={18} className="h-[22px] w-[22px] md:h-[18px] md:w-[18px]" /> : unread ? <BellRing size={18} className="h-[22px] w-[22px] md:h-[18px] md:w-[18px]" /> : <Bell size={18} className="h-[22px] w-[22px] md:h-[18px] md:w-[18px]" />}
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[18px] h-[18px] rounded-full bg-accent px-1 text-[10px] font-bold leading-[18px] text-white text-center tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label={t("notif.title")}
          className="fixed inset-x-2 top-[calc(56px+env(safe-area-inset-top))] z-50 overflow-hidden rounded-xl border border-border bg-white shadow-[0_18px_40px_-16px_rgb(0_0_0_/_0.35)] md:absolute md:inset-x-auto md:right-0 md:top-11 md:w-[380px]">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-text">{t("notif.title")}</p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => { setSoundOn(!sound); if (!sound) playChime(true); }}
                title={t(sound ? "notif.mute" : "notif.unmute")} aria-label={t(sound ? "notif.mute" : "notif.unmute")} aria-pressed={!sound}
                className={`rounded-md p-1 hover:bg-paper-dim ${sound ? "text-text-faint hover:text-text" : "text-accent"}`}>
                {sound ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
              {unread > 0 && (
                <button type="button" onClick={markAllRead} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink hover:bg-paper-dim">
                  <CheckCheck size={13} /> {t("notif.mark_all")}
                </button>
              )}
              {items.length > 0 && (
                <button type="button" onClick={clearAll} title={t("notif.clear")} aria-label={t("notif.clear")} className="rounded-md p-1 text-text-faint hover:bg-paper-dim hover:text-text">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>

          {perm === "default" && (
            <div className="flex items-center gap-2 border-b border-border bg-[#EBF2FD]/60 px-4 py-2.5">
              <BellRing size={15} className="shrink-0 text-ink" />
              <p className="flex-1 text-xs text-text-muted">{t("notif.enable_hint")}</p>
              <button type="button" onClick={enableSystem} className="shrink-0 rounded-md bg-ink px-2.5 py-1 text-xs font-semibold text-white hover:bg-ink-dark">
                {t("notif.enable")}
              </button>
            </div>
          )}
          {perm === "denied" && (
            <p className="border-b border-border px-4 py-2 text-[11px] text-text-faint">{t("notif.blocked")}</p>
          )}

          {/* The app's filters */}
          <div className="hgv-stories flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2">
            {filters.map(([f, key]) => (
              <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${filter === f ? "bg-ink-soft text-ink" : "bg-paper-dim text-text"}`}>
                {t(key)}
              </button>
            ))}
          </div>

          <ul className="max-h-[calc(100dvh-220px)] overflow-y-auto md:max-h-[60dvh]">
            {shown.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-text-muted">{t("notif.empty")}</li>
            ) : groups.filter(([, g]) => g.length > 0).flatMap(([title, group]) => [
              <li key={`h-${title}`} className="px-4 pb-1 pt-3 text-[13px] font-extrabold text-text">{t(title)}</li>,
              ...group.map((n) => {
              const { icon: Icon, tone } = ICON[n.kind] ?? ICON.sale;
              const { title, body } = notifText(n, t);
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => go(n)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-paper-dim ${n.read ? "" : "bg-[#EBF2FD]/40"}`}>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone}`}><Icon size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm leading-snug ${n.read ? "text-text" : "font-semibold text-text"}`}>{title}</span>
                      {body && <span className="block text-xs text-text-muted tabular-nums">{body}</span>}
                      <span className="block text-[11px] text-text-faint mt-0.5">{ago(n.at)}</span>
                    </span>
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ink" aria-label={t("notif.unread")} />}
                  </button>
                </li>
              );
            }),
            ])}
          </ul>
        </div>
      )}
    </div>
  );
}
