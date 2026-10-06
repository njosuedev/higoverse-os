"use client";

// Notifications on the website and in the desktop app (which shows the
// website): the shop's live events (sale-service /ws, opened by lib/chat.ts)
// become entries in the header bell — and a system notification when the
// window isn't in front. Same rules as the phone's Activity (apps/mobile
// lib/src/live/activity.dart). Your own actions don't notify you.

import { useSyncExternalStore } from "react";
import { getUser } from "@/lib/auth";

export type NotifKind =
  | "sale" | "sale_deleted" | "car_added" | "product_new" | "fine" | "pending"
  | "low_stock" | "out_of_stock" | "restocked" | "debt_new" | "debt_payment" | "debt_paid"
  | "expense" | "purchase" | "proforma_new" | "proforma_approved" | "proforma_sold";

export interface Notif {
  id: string;
  kind: NotifKind;
  /** Values for the message ({by}, {name}, {amount}…). */
  args: Record<string, string>;
  href: string;
  at: string;
  read: boolean;
}

interface LiveMsg { type?: string; at?: string; by?: { id?: string; name?: string }; data?: Record<string, unknown> }
type T = (key: string) => string;

const MAX = 50;
let items: Notif[] = [];
let loadedFor: string | null = null;
let ctx: { t: T; isCar: boolean; lowStock: number; role: string } = { t: (k) => k, isCar: false, lowStock: 10, role: "" };
const listeners = new Set<() => void>();
const SERVER: Notif[] = [];

const storeKey = (userId: string) => `hgv-notifs:${userId}`;

function ensureLoaded() {
  const uid = getUser()?.id ?? null;
  if (uid === loadedFor) return;
  loadedFor = uid;
  items = [];
  if (!uid) return;
  try {
    const raw = localStorage.getItem(storeKey(uid));
    const v = raw ? JSON.parse(raw) : [];
    if (Array.isArray(v)) items = v.slice(0, MAX);
  } catch { /* storage unavailable: start empty */ }
}

function save() {
  if (!loadedFor) return;
  try { localStorage.setItem(storeKey(loadedFor), JSON.stringify(items)); } catch { /* best effort */ }
}

function emit() { listeners.forEach((l) => l()); }

/** Set by the bell: the language, the business type and who's looking. */
export function configureNotifications(c: Partial<typeof ctx>) { ctx = { ...ctx, ...c }; }

/** The message for an entry, in the current language. */
export function notifText(n: Pick<Notif, "kind" | "args">, t: T = ctx.t): { title: string; body: string } {
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => n.args[k] ?? "");
  const anon = !n.args.by;
  const title = fill(t(`notif.${n.kind}${anon && t(`notif.${n.kind}_anon`) !== `notif.${n.kind}_anon` ? "_anon" : ""}`));
  return { title, body: n.args.detail ? fill(n.args.detail) : "" };
}

const money = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? `${Math.round(x).toLocaleString()} RWF` : "";
};

/** Pure: which entry (if any) a live event makes. */
export function fromEvent(m: LiveMsg, opts: { isCar: boolean; lowStock: number }): Omit<Notif, "id" | "read"> | null {
  const d = m.data ?? {};
  const at = m.at ?? new Date().toISOString();
  const by = m.by?.name ?? "";
  const s = (v: unknown) => (v == null ? "" : String(v));
  const n = (v: unknown) => Number(v) || 0;
  const make = (kind: NotifKind, args: Record<string, string>, href: string) => ({ kind, args: { by, ...args }, href, at });
  let attrs: Record<string, string> = {};
  try { attrs = typeof d.attributes === "string" ? JSON.parse(d.attributes) : {}; } catch { attrs = {}; }

  switch (m.type) {
    case "sale.created":
      return make("sale", { name: s(d.product_name), qty: s(d.quantity ?? 1), detail: money(d.total_amount) }, "/sales");
    case "sale.deleted":
      return make("sale_deleted", { name: s(d.product_name) }, "/sales");
    case "product.created":
      return make(opts.isCar ? "car_added" : "product_new", { name: s(d.name), detail: money(d.selling_price) }, `/items?open=${s(d.id)}`);
    case "product.updated": {
      const href = `/items?open=${s(d.id)}`;
      const fines = n(attrs.penalty_count);
      if ("prev_penalty_count" in d && fines > n(d.prev_penalty_count)) {
        return make("fine", { name: s(d.name), n: String(fines), detail: money(attrs.penalty_amount) }, `${href}&do=fines`);
      }
      if ("prev_sale_status" in d && attrs.sale_status === "pending" && d.prev_sale_status !== "pending") {
        return make("pending", { name: s(d.name), buyer: s(attrs.buyer_name) }, href);
      }
      if (opts.isCar || !("prev_quantity" in d) || !("quantity" in d)) return null;
      const q = n(d.quantity), prev = n(d.prev_quantity);
      const args = { name: s(d.name), n: String(q), by: "" };
      if (q <= 0 && prev > 0) return { ...make("out_of_stock", args, href), args };
      if (q > 0 && q <= opts.lowStock && prev > opts.lowStock) return { ...make("low_stock", args, href), args };
      if (q > opts.lowStock && prev <= opts.lowStock) return { ...make("restocked", args, href), args };
      return null;
    }
    case "debt.created":
      return make("debt_new", { name: s(d.debtor_name), detail: money(d.balance) }, "/sales");
    case "debt.updated":
      return d.is_paid
        ? make("debt_paid", { name: s(d.debtor_name) }, "/sales")
        : make("debt_payment", { name: s(d.debtor_name), detail: money(d.balance) }, "/sales");
    case "expense.created":
      return make("expense", { title: s(d.title), detail: money(d.amount) }, "/expenses");
    case "purchase.created":
      return make("purchase", { name: s(d.product_name), qty: s(d.quantity_added) }, "/purchases");
    case "proforma.created":
      return make("proforma_new", { no: s(d.invoice_no), customer: s(d.customer), detail: money(d.grand_total) }, "/sales?tab=proforma");
    case "proforma.approved":
      return make("proforma_approved", { no: s(d.invoice_no), customer: s(d.customer) }, "/sales?tab=proforma");
    case "proforma.sold":
      return make("proforma_sold", { no: s(d.invoice_no), customer: s(d.customer), detail: money(d.grand_total) }, "/sales");
  }
  return null;
}

/** Called for every live event that isn't a chat message. */
export function handleLiveEvent(m: LiveMsg) {
  ensureLoaded();
  const me = getUser()?.id;
  if (me && m.by?.id && String(m.by.id) === String(me)) return; // your own action
  // A new proforma matters to those who approve it (owner, admin, manager).
  if (m.type === "proforma.created" && !["owner", "admin", "manager"].includes(ctx.role)) return;
  const entry = fromEvent(m, ctx);
  if (!entry) return;
  const n: Notif = { ...entry, id: `${m.type}-${entry.at}-${Math.random().toString(36).slice(2, 7)}`, read: false };
  items = [n, ...items].slice(0, MAX);
  save();
  emit();
  showSystemNotification(n);
}

/** A Windows / browser notification, only when the window isn't in front. */
function showSystemNotification(n: Notif) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible" && document.hasFocus()) return;
  const { title, body } = notifText(n);
  try {
    const sys = new Notification(title, { body, tag: n.id, icon: "/icon.png" });
    sys.onclick = () => { window.focus(); markRead(n.id); window.location.href = n.href; };
  } catch { /* not allowed here */ }
}

export function markRead(id: string) {
  items = items.map((x) => (x.id === id ? { ...x, read: true } : x));
  save(); emit();
}
export function markAllRead() {
  if (!items.some((x) => !x.read)) return;
  items = items.map((x) => ({ ...x, read: true }));
  save(); emit();
}
export function clearAll() { items = []; save(); emit(); }

export function useNotifications(): Notif[] {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => { ensureLoaded(); return items; },
    () => SERVER,
  );
}
