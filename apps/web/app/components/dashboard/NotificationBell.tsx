"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, BellRing, Car, CheckCheck, FileText, Package, Receipt, ShoppingCart, Trash2, TriangleAlert, Wallet, Clock,
} from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { useShopSettings } from "@/lib/shop-settings-context";
import {
  clearAll, configureNotifications, markAllRead, markRead, notifText, useNotifications, type Notif, type NotifKind,
} from "@/lib/notifications";

const ICON: Record<NotifKind, { icon: typeof Bell; tone: string }> = {
  sale: { icon: ShoppingCart, tone: "bg-emerald-50 text-emerald-700" },
  sale_deleted: { icon: Trash2, tone: "bg-slate-100 text-slate-600" },
  car_added: { icon: Car, tone: "bg-blue-50 text-blue-700" },
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
};

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
  const [open, setOpen] = useState(false);
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
        className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-colors ${open ? "bg-paper-dim text-text" : "text-text-muted hover:bg-paper-dim hover:text-text"}`}>
        {unread ? <BellRing size={18} /> : <Bell size={18} />}
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[18px] h-[18px] rounded-full bg-accent px-1 text-[10px] font-bold leading-[18px] text-white text-center tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label={t("notif.title")}
          className="absolute right-0 top-11 z-50 w-[min(92vw,380px)] overflow-hidden rounded-xl border border-border bg-white shadow-[0_18px_40px_-16px_rgb(0_0_0_/_0.35)]">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-text">{t("notif.title")}</p>
            <div className="flex items-center gap-1">
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

          <ul className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-text-muted">{t("notif.empty")}</li>
            ) : items.map((n) => {
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
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
