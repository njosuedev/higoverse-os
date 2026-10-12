"use client";

// The phone top bar's extras, as in the Android app (quick_add.dart,
// live/live_sheet.dart): "+" opens every form one tap away, and the logo
// carries the live connection's dot — held, it shows the connection and
// who of the team is online.

import Link from "next/link";
import { useRef, useState } from "react";
import { Car, FileText, HandCoins, MessageCircle, Package, Plus, Receipt, Wallet } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { useCanUseExpenses } from "@/lib/permissions";
import { useConnection, checkNow } from "@/lib/connection";
import { useChat } from "@/lib/chat";
import { full } from "./PhoneOr";
import { Sheet } from "./kit";

/** What "+" creates (the app's quickActions). */
function useQuickActions() {
  const { t, layout } = useLanguage();
  const expenses = useCanUseExpenses();
  const isCar = layout === "car";
  return [
    { label: t("form.new_sale"), icon: Receipt, href: full("/sales", { new: 1 }) },
    isCar
      ? { label: t("vehicle.new"), icon: Car, href: full("/items", { add: 1 }) }
      : { label: t("form.new_product"), icon: Package, href: full("/items", { add: 1 }) },
    ...(expenses ? [{ label: t("form.new_expense"), icon: Wallet, href: full("/expenses", { new: 1 }) }] : []),
    { label: t("form.new_debt"), icon: HandCoins, href: full("/sales", { debt: "new" }) },
    { label: t("pf.new"), icon: FileText, href: full("/sales", { proforma: "new" }) },
  ];
}

/** The "+" button and its sheet of big tiles. */
export function QuickAddButton() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const actions = useQuickActions();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t("add.title")} title={t("add.title")}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-paper-dim text-text md:hidden">
        <Plus size={24} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <p className="text-[20px] font-extrabold tracking-[-0.3px] text-text">{t("add.title")}</p>
        <div className="mt-3.5 grid grid-cols-3 gap-2.5">
          {actions.map(({ label, icon: Icon, href }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}
              className="flex aspect-[1.05] flex-col items-center justify-center gap-2 rounded-2xl bg-paper p-2.5 text-center active:scale-[0.97]">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink/10 text-ink"><Icon size={22} /></span>
              <span className="line-clamp-2 text-[13px] font-bold leading-tight text-text">{label}</span>
            </Link>
          ))}
        </div>
      </Sheet>
    </>
  );
}

/** Long-press handlers for the logo: held for half a second, the live sheet
 *  opens (and the tap that ends the press doesn't go Home). */
export function useLiveSheet() {
  const [open, setOpen] = useState(false);
  const held = useRef<{ timer?: ReturnType<typeof setTimeout>; fired: boolean }>({ fired: false });
  const handlers = {
    onPointerDown: () => {
      held.current.fired = false;
      held.current.timer = setTimeout(() => { held.current.fired = true; setOpen(true); }, 500);
    },
    onPointerUp: () => clearTimeout(held.current.timer),
    onPointerLeave: () => clearTimeout(held.current.timer),
    onPointerCancel: () => clearTimeout(held.current.timer),
    onContextMenu: (e: React.MouseEvent) => { if (window.matchMedia("(max-width: 767px)").matches) e.preventDefault(); },
  };
  /** Call first in the link's onClick: true when the press opened the sheet. */
  const swallowed = (e: React.MouseEvent) => {
    if (!held.current.fired) return false;
    e.preventDefault();
    held.current.fired = false;
    return true;
  };
  // `handlers` go on the element as they are; `swallowed` is for its onClick.
  return { open, close: () => setOpen(false), handlers, swallowed };
}

/** The connection and who of the team is online now. */
export function LiveSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLanguage();
  const online = useConnection() === "online";
  const chat = useChat();
  const team = chat.members.filter((m) => m.id !== chat.me && chat.online.includes(m.id));
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="flex items-center gap-3">
        <span className="relative flex h-3 w-3">
          {online && <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />}
          <span className={`relative h-3 w-3 rounded-full ${online ? "bg-success" : "bg-text-faint"}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[18px] font-extrabold text-text">{t(online ? "live.status_live" : "live.status_offline")}</p>
          <p className="text-text-muted">{t(online ? "live.live_sub" : "live.offline_sub")}</p>
        </div>
        {!online && (
          <button type="button" onClick={() => void checkNow()} className="rounded-full px-3 py-2 font-semibold text-ink">{t("live.reconnect")}</button>
        )}
      </div>
      <p className="mt-[18px] text-[13px] font-bold text-text-muted">{t("live.active_now")}</p>
      {team.length === 0 ? (
        <p className="py-3.5 text-text-faint">{t("live.nobody")}</p>
      ) : (
        team.map((m) => (
          <Link key={m.id} href={`/messages?with=${m.id}`} onClick={onClose} className="flex items-center gap-3 py-2.5">
            <span className="relative flex h-[42px] w-[42px] items-center justify-center rounded-full bg-ink-soft font-bold text-ink">
              {m.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-success" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold text-text">{m.name}</span>
              <span className="block text-[13px] text-text-muted">{t(`role.${m.role}`)}</span>
            </span>
            <MessageCircle size={20} className="text-ink" />
          </Link>
        ))
      )}
    </Sheet>
  );
}
