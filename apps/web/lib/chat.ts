"use client";

// Messages on the website and the desktop app: the business's people (owner
// and up to three employees), end-to-end encrypted with lib/chat-crypto.ts.
// One store for the whole site (the menu's unread count, the Messages page,
// global search), with its own live connection to sale-service's hub
// (wss://…/svc/sales/ws), which sends chat events only to the two people.

import { handleLiveEvent, playChime } from "@/lib/notifications";
import { useSyncExternalStore } from "react";
import { authFetch, refreshAccessToken } from "@/lib/session";
import { getToken, getUser } from "@/lib/auth";
import { AUTH_API, SALE_API } from "@/lib/api-config";
import { loadDevice, openBody, openFile, seal, sealFile, securityCode, supported, unb64, type Device, type FileRef } from "@/lib/chat-crypto";
import { compressImage, shrinkDataUrl } from "@/lib/image";

export interface Member { id: string; name: string; role: string; is_active: boolean; email?: string }
export interface Msg { id: string; from: string; to: string; text: string | null; at: string; readAt: string | null; pending?: boolean; files?: FileRef[] }
interface Raw {
  id: string; sender_id: string; recipient_id: string; sender_device_id: string; sender_public_key: string | null;
  ciphertext: string; nonce: string; created_at: string; read_at: string | null; key: { wrapped: string; nonce: string } | null;
  keys?: Record<string, { wrapped: string; nonce: string }>;
}

interface State {
  ready: boolean;
  unsupported: boolean;
  error: string | null;
  me: string;
  members: Member[];
  maxEmployees: number;
  employees: number;
  canManage: boolean;
  threads: Record<string, Msg[]>;
  unread: Record<string, number>;
  online: string[];
}

const empty = (): State => ({
  ready: false, unsupported: false, error: null, me: "", members: [], maxEmployees: 3, employees: 0, canManage: false,
  threads: {}, unread: {}, online: [],
});

let state: State = empty();
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
let device: Device | null = null;
let starting: Promise<void> | null = null;
let openWith: string | null = null;

/** Reads the store (re-renders on change). */
export function useChat(): State {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}
export const unreadTotal = (s: State) => Object.values(s.unread).reduce((a, b) => a + b, 0);

async function api(base: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const res = await authFetch(`${base}${path}`, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const d = (data as { detail?: unknown })?.detail;
    throw new Error(typeof d === "string" ? d : Array.isArray(d) && d[0]?.msg ? String(d[0].msg) : `Error ${res.status}`);
  }
  return (data as { data?: unknown })?.data;
}
const chatApi = (path: string, init?: RequestInit) => api(SALE_API, `/chat${path}`, init);

// ── Start ────────────────────────────────────────────────────────────────
/** Sets up this browser for Messages (key pair, registered public key),
 *  loads the team and conversations, and connects live. Safe to call often. */
export function startChat(): Promise<void> {
  const user = getUser();
  if (!user?.id || !user.shop_id) return Promise.resolve();
  if (state.me && state.me !== user.id) { state = empty(); device = null; starting = null; closeLive(); }
  if (starting) return starting;
  starting = (async () => {
    set({ me: user.id });
    if (!(await supported())) { set({ unsupported: true, ready: true }); return; }
    device = await loadDevice(user.id);
    const desktop = typeof window !== "undefined" && "higoverseDesktop" in window;
    await chatApi("/devices", { method: "PUT", body: JSON.stringify({ id: device.id, public_key: device.publicKey, label: desktop ? "Windows" : "Web" }) });
    await Promise.all([loadTeam(), loadConversations()]);
    set({ ready: true, error: null });
    connectLive();
  })().catch((e: unknown) => {
    starting = null;
    set({ error: e instanceof Error ? e.message : String(e), ready: true });
  });
  return starting;
}

export async function loadTeam() {
  const d = (await api(AUTH_API, "/api/v1/team")) as { members: Member[]; max_employees: number; employees: number; can_manage: boolean };
  set({ members: d.members, maxEmployees: d.max_employees, employees: d.employees, canManage: d.can_manage });
}

async function decrypt(m: Raw): Promise<Msg> {
  const k = (m.keys && device ? m.keys[device.id] : null) ?? m.key;
  let body: { text: string; files: FileRef[] } | null = null;
  if (device && k && m.sender_public_key) {
    body = await openBody(device, {
      ciphertext: m.ciphertext, nonce: m.nonce, wrapped: k.wrapped, wrapNonce: k.nonce,
      senderDeviceId: m.sender_device_id, senderPublicKey: m.sender_public_key, senderId: m.sender_id, recipientId: m.recipient_id,
    });
  }
  return { id: m.id, from: m.sender_id, to: m.recipient_id, text: body?.text ?? null, files: body?.files ?? [], at: m.created_at, readAt: m.read_at };
}

const byTime = (a: Msg, b: Msg) => a.at.localeCompare(b.at);
function merge(other: string, msgs: Msg[]) {
  const list = [...(state.threads[other] ?? [])];
  for (const m of msgs) {
    const i = list.findIndex((x) => x.id === m.id);
    if (i < 0) list.push(m); else list[i] = m;
  }
  list.sort(byTime);
  set({ threads: { ...state.threads, [other]: list } });
}

export async function loadConversations() {
  if (!device) return;
  const rows = (await chatApi(`/conversations?device_id=${device.id}`)) as { user_id: string; last: Raw; unread: number }[];
  const unread: Record<string, number> = { ...state.unread };
  for (const r of rows) {
    merge(r.user_id, [await decrypt(r.last)]);
    unread[r.user_id] = r.unread;
  }
  set({ unread });
}

/** The latest messages with [other], or older ones; true when there are more. */
export async function loadThread(other: string, older = false): Promise<boolean> {
  if (!device) return false;
  const first = state.threads[other]?.[0];
  const q = new URLSearchParams({ with: other, device_id: device.id, limit: "40" });
  if (older && first) q.set("before", first.at);
  const rows = (await chatApi(`/messages?${q}`)) as Raw[];
  merge(other, await Promise.all(rows.map(decrypt)));
  return rows.length >= 40;
}

export function setOpenConversation(other: string | null) {
  openWith = other;
  if (other) void markRead(other);
}

export async function markRead(other: string) {
  if (!(state.unread[other] > 0)) return;
  set({ unread: { ...state.unread, [other]: 0 } });
  await chatApi("/read", { method: "POST", body: JSON.stringify({ with: other }) }).catch(() => {});
}

async function devicesOf(other: string): Promise<Record<string, string>> {
  const rows = (await chatApi(`/devices?users=${state.me},${other}`)) as { id: string; public_key: string }[];
  return Object.fromEntries(rows.map((d) => [d.id, d.public_key]));
}

export async function codeWith(other: string) {
  return securityCode(Object.values(await devicesOf(other)));
}

// ── Photos ───────────────────────────────────────────────────────────────
const photoUrls = new Map<string, Promise<string | null>>();
const dataUrlBytes = (u: string) => unb64(u.slice(u.indexOf(",") + 1));

/** A message's photo as an object URL: fetched encrypted, opened here. */
export function photoUrl(f: FileRef): Promise<string | null> {
  let p = photoUrls.get(f.id);
  if (!p) {
    p = (async () => {
      try {
        const d = (await chatApi(`/attachments/${f.id}`)) as { data: string };
        const bytes = await openFile(d.data, f.k, f.n);
        return bytes ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: "image/jpeg" })) : null;
      } catch {
        photoUrls.delete(f.id);
        return null;
      }
    })();
    photoUrls.set(f.id, p);
  }
  return p;
}

export const MAX_PHOTOS = 4;

/** Sends [text] and up to 4 photos: each is resized like product photos
 *  (1280 px), encrypted with its own key and uploaded first; their keys go
 *  inside the encrypted message, as WhatsApp does. */
export async function send(other: string, text: string, images: File[] = []) {
  const clean = text.trim();
  if ((!clean && images.length === 0) || !device) return;
  const prepared = await Promise.all(images.slice(0, MAX_PHOTOS).map(async (file) => {
    const photo = await compressImage(file, 1280, 0.78);
    return { photo, tiny: await shrinkDataUrl(photo, 40, 0.5).catch(() => "") };
  }));
  const localRefs: FileRef[] = prepared.map((p, i) => {
    const id = `local-${Date.now()}-${i}`;
    photoUrls.set(id, Promise.resolve(p.photo));
    return { id, k: "", n: "", th: p.tiny || undefined };
  });
  const temp: Msg = { id: `tmp-${Date.now()}`, from: state.me, to: other, text: clean, at: new Date().toISOString(), readAt: null, pending: true, files: localRefs };
  merge(other, [temp]);
  const drop = () => set({ threads: { ...state.threads, [other]: (state.threads[other] ?? []).filter((m) => m.id !== temp.id) } });
  try {
    const files: FileRef[] = [];
    for (const p of prepared) {
      const sf = await sealFile(dataUrlBytes(p.photo));
      const up = (await chatApi("/attachments", { method: "POST", body: JSON.stringify({ data: sf.data }) })) as { id: string };
      photoUrls.set(up.id, Promise.resolve(p.photo));
      files.push({ id: up.id, k: sf.key, n: sf.nonce, ...(p.tiny ? { th: p.tiny } : {}) });
    }
    const sealed = await seal(device, clean, state.me, other, await devicesOf(other), files);
    const saved = (await chatApi("/messages", {
      method: "POST",
      body: JSON.stringify({
        recipient_id: other, device_id: device.id, ciphertext: sealed.ciphertext, nonce: sealed.nonce,
        keys: Object.entries(sealed.keys).map(([device_id, k]) => ({ device_id, wrapped: k.wrapped, nonce: k.nonce })),
      }),
    })) as Raw;
    drop();
    merge(other, [{ id: saved.id, from: state.me, to: other, text: clean, files, at: saved.created_at, readAt: null }]);
  } catch (e) {
    drop();
    throw e;
  }
}

// ── Team (owner / admin) ─────────────────────────────────────────────────
export async function addEmployee(v: { name: string; email: string; password: string; role: string }) {
  await api(AUTH_API, "/api/v1/team", { method: "POST", body: JSON.stringify(v) });
  await loadTeam();
}
export async function changeEmployee(id: string, v: { role?: string; is_active?: boolean }) {
  await api(AUTH_API, `/api/v1/team/${id}`, { method: "PATCH", body: JSON.stringify(v) });
  await loadTeam();
}
export async function removeEmployee(id: string) {
  await api(AUTH_API, `/api/v1/team/${id}`, { method: "DELETE" });
  await loadTeam();
}

// ── Live ─────────────────────────────────────────────────────────────────
let ws: WebSocket | null = null;
let ping: ReturnType<typeof setInterval> | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let backoff = 1000;

function closeLive() {
  if (ping) clearInterval(ping);
  if (retry) clearTimeout(retry);
  ping = retry = null;
  if (ws) { ws.onclose = null; ws.close(); }
  ws = null;
}

function connectLive() {
  if (typeof window === "undefined" || ws) return;
  const base = SALE_API.startsWith("http") ? SALE_API.replace(/^http/, "ws") : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${SALE_API}`;
  const sock = new WebSocket(`${base}/ws`);
  ws = sock;
  sock.onopen = () => {
    sock.send(JSON.stringify({ type: "auth", token: getToken() }));
    ping = setInterval(() => { if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ type: "ping" })); }, 25_000);
  };
  sock.onmessage = (ev) => {
    let msg: { type?: string; data?: Record<string, unknown>; online?: { id: string }[] };
    try { msg = JSON.parse(String(ev.data)); } catch { return; }
    if (msg.type === "hello" || msg.type === "presence") {
      backoff = 1000;
      set({ online: (msg.online ?? []).map((u) => String(u.id)) });
      if (msg.type === "hello") void loadConversations().catch(() => {});
    } else if (msg.type === "chat.message" && msg.data) {
      void onMessage(msg.data as unknown as Raw);
    } else if (msg.type === "chat.read" && msg.data) {
      onRead(msg.data as { by: string; with: string; at: string });
    } else if (msg.type === "resync") {
      void loadConversations().catch(() => {});
    } else if (msg.type && msg.type.includes(".")) {
      // Sales, stock, debts, proformas…: the header bell and system notifications.
      handleLiveEvent(msg as Parameters<typeof handleLiveEvent>[0]);
    }
  };
  sock.onclose = async (ev) => {
    if (ping) clearInterval(ping);
    ping = null;
    ws = null;
    if (ev.code === 4001) await refreshAccessToken(getToken()).catch(() => null);
    if (ev.code === 4003) return; // no business: nothing to follow
    retry = setTimeout(connectLive, backoff);
    backoff = Math.min(backoff * 2, 30_000);
  };
}

async function onMessage(raw: Raw) {
  if (!device) return;
  const other = raw.sender_id === state.me ? raw.recipient_id : raw.sender_id;
  if (!raw.ciphertext) { void loadThread(other).catch(() => {}); return; }
  const m = await decrypt(raw);
  const list = state.threads[other] ?? [];
  if (list.some((x) => x.id === m.id)) return;
  if (m.from === state.me && list.some((x) => x.pending && x.text === m.text && (x.files?.length ?? 0) === (m.files?.length ?? 0))) return;
  merge(other, [m]);
  if (m.from !== state.me) {
    if (openWith === other && typeof document !== "undefined" && document.visibilityState === "visible") {
      set({ unread: { ...state.unread, [other]: 1 } });
      void markRead(other);
    } else {
      set({ unread: { ...state.unread, [other]: (state.unread[other] ?? 0) + 1 } });
      playChime();
      notifyNew(other, m.text);
    }
  }
}

function onRead(d: { by: string; with: string; at: string }) {
  if (d.by === state.me) { set({ unread: { ...state.unread, [d.with]: 0 } }); return; }
  const list = (state.threads[d.by] ?? []).map((m) => (m.from === state.me && !m.readAt ? { ...m, readAt: d.at } : m));
  set({ threads: { ...state.threads, [d.by]: list } });
}

/** A system notification for a message (the text stays on this device). */
function notifyNew(from: string, text: string | null) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const name = state.members.find((m) => m.id === from)?.name ?? "Higoverse";
  try {
    const n = new Notification(name, { body: text || "📷", tag: `chat-${from}`, icon: "/icon.png", silent: true });
    n.onclick = () => { window.focus(); window.location.href = `/messages?with=${from}`; };
  } catch { /* not allowed here */ }
}
