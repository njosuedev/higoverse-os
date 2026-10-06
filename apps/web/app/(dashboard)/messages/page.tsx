"use client";

// Messages, laid out like WhatsApp Desktop: people on the left (search,
// last message, unread count, online), the conversation on the right. End-
// to-end encrypted (lib/chat.ts, lib/chat-crypto.ts): the shield shows the
// security code to compare with the other person.

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, CheckCheck, Clock, Download, ImagePlus, Lock, MessageCircle, Search, Send, ShieldCheck, Smile, UserPlus, X } from "lucide-react";
import EmojiPicker from "@/app/components/EmojiPicker";
import type { FileRef } from "@/lib/chat-crypto";
import { useLanguage } from "@/lib/language-context";
import { codeWith, loadThread, MAX_PHOTOS, photoUrl, send, setOpenConversation, startChat, unreadTotal, useChat, type Member, type Msg } from "@/lib/chat";
import { notify } from "@/lib/dialogs";

const AVATAR = ["#0a66c2", "#7a3e9d", "#057642", "#b24020", "#00788a", "#915907", "#5e5ce6", "#c3277a"];
function Avatar({ name, size = 44, online = false }: { name: string; size?: number; online?: boolean }) {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) & 0x7fffffff;
  const color = AVATAR[h % AVATAR.length];
  const parts = name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{ width: size, height: size, background: `${color}22`, color, fontSize: size * 0.36 }}>
      {initials}
      {online && <span className="absolute bottom-0 right-0 rounded-full border-2 border-white bg-[#31a24c]" style={{ width: size * 0.28, height: size * 0.28 }} />}
    </span>
  );
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
function ago(iso: string) {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return time(iso);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "—";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function MessagesInner() {
  const { t } = useLanguage();
  const chat = useChat();
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  const selected = params.get("with");

  useEffect(() => { void startChat(); }, []);
  useEffect(() => {
    setOpenConversation(selected);
    return () => setOpenConversation(null);
  }, [selected]);
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission().catch(() => {});
  }, []);

  const others = useMemo(() => chat.members.filter((m) => m.id !== chat.me), [chat.members, chat.me]);
  const people = useMemo(() => {
    const last = (m: Member) => chat.threads[m.id]?.at(-1)?.at ?? "";
    return others
      .filter((m) => !q.trim() || m.name.toLowerCase().includes(q.trim().toLowerCase()))
      .sort((a, b) => last(b).localeCompare(last(a)) || a.name.localeCompare(b.name));
  }, [others, chat.threads, q]);
  const person = others.find((m) => m.id === selected) ?? null;
  const roleOf = (r: string) => t(`role.${r}`);

  if (chat.unsupported) {
    return <p className="mx-auto max-w-lg p-8 text-center text-sm text-text-muted">{t("chat.unsupported")}</p>;
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-52px)] max-w-7xl overflow-hidden border-x border-border bg-white">
      {/* ── People ── */}
      <aside className={`${person ? "hidden md:flex" : "flex"} w-full flex-col border-r border-border md:w-[360px] md:flex-none`}>
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h1 className="font-display text-xl font-bold text-text">{t("chat.title")}</h1>
          {chat.canManage && (
            <Link href="/team" className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink-soft">
              <UserPlus size={14} /> {t("team.title")}
            </Link>
          )}
        </div>
        <p className="flex items-center gap-1.5 px-4 pb-2 text-xs text-text-faint"><Lock size={12} /> {t("chat.e2e")}</p>
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 rounded-lg bg-paper-dim px-3">
            <Search size={15} className="text-text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("chat.search")}
              className="h-9 w-full border-0 bg-transparent text-sm outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!chat.ready && Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="h-11 w-11 animate-pulse rounded-full bg-paper-deep" />
              <div className="flex-1 space-y-2"><div className="h-3 w-32 animate-pulse rounded bg-paper-deep" /><div className="h-2.5 w-48 animate-pulse rounded bg-paper-dim" /></div>
            </div>
          ))}
          {chat.ready && chat.error && <p className="px-4 py-6 text-sm text-accent-dark">{chat.error}</p>}
          {chat.ready && !chat.error && others.length === 0 && (
            <div className="px-6 py-10 text-center">
              <UserPlus size={36} className="mx-auto text-text-faint" />
              <p className="mt-3 text-sm text-text-muted">{t(chat.canManage ? "chat.no_team_owner" : "chat.no_team")}</p>
              {chat.canManage && <Link href="/team" className="mt-4 inline-flex rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">{t("team.add")}</Link>}
            </div>
          )}
          {people.map((m) => {
            const last = chat.threads[m.id]?.at(-1);
            const unread = chat.unread[m.id] ?? 0;
            const body = last ? (last.text == null ? t("chat.locked") : last.text || (last.files?.length ? `📷 ${t("chat.photo")}` : "")) : "";
            const preview = last ? `${last.from === chat.me ? `${t("chat.you")}: ` : ""}${body}` : roleOf(m.role);
            return (
              <button key={m.id} type="button" onClick={() => router.push(`/messages?with=${m.id}`)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${selected === m.id ? "bg-paper-dim" : "hover:bg-paper-dim"}`}>
                <Avatar name={m.name} online={chat.online.includes(m.id)} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`flex-1 truncate text-[15px] ${unread ? "font-bold" : "font-semibold"} text-text`}>{m.name}</span>
                    {last && <span className={`text-[11px] ${unread ? "font-bold text-ink" : "text-text-faint"}`}>{ago(last.at)}</span>}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className={`flex-1 truncate text-[13px] ${unread ? "font-semibold text-text" : "text-text-faint"}`}>{preview}</span>
                    {unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e41e3f] px-1.5 text-[11px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Conversation ── */}
      <section className={`${person ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        {person ? <Conversation key={person.id} person={person} online={chat.online.includes(person.id)} />
          : (
            <div className="m-auto max-w-sm text-center">
              <MessageCircle size={48} className="mx-auto text-text-faint" />
              <p className="mt-3 font-display text-lg font-semibold text-text">{t("chat.title")}</p>
              <p className="mt-1 text-sm text-text-muted">{t("chat.pick")}</p>
              <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-text-faint"><Lock size={12} /> {t("chat.e2e")}</p>
            </div>
          )}
      </section>
      <span className="sr-only" aria-live="polite">{unreadTotal(chat) > 0 ? `${unreadTotal(chat)}` : ""}</span>
    </div>
  );
}

function Conversation({ person, online }: { person: Member; online: boolean }) {
  const { t } = useLanguage();
  const chat = useChat();
  const router = useRouter();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [more, setMore] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [emoji, setEmoji] = useState(false);
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [viewing, setViewing] = useState<FileRef | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  function addPhotos(files: FileList | File[] | null) {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    setPhotos((cur) => [...cur, ...list.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX_PHOTOS));
  }
  function insertEmoji(e: string) {
    const el = input.current;
    const at = el?.selectionStart ?? text.length;
    setText((v) => v.slice(0, at) + e + v.slice(el?.selectionEnd ?? at));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + e.length, at + e.length); });
  }
  const msgs = chat.threads[person.id] ?? [];

  useEffect(() => {
    if (!chat.ready) return;
    loadThread(person.id).then(setMore).catch(() => {});
  }, [person.id, chat.ready]);
  // Keep the newest message in view.
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [msgs.length]);

  async function doSend() {
    const v = text;
    const pics = photos;
    if ((!v.trim() && pics.length === 0) || sending) return;
    setSending(true);
    setText("");
    setPhotos([]);
    setEmoji(false);
    try { await send(person.id, v, pics.map((p) => p.file)); } catch (e) { setText(v); setPhotos(pics); notify(e instanceof Error ? e.message : String(e)); } finally { setSending(false); }
  }

  const dayOf = (iso: string) => new Date(iso).toDateString();
  return (
    <>
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <button type="button" onClick={() => router.push("/messages")} className="rounded-full p-1.5 hover:bg-paper-dim md:hidden" aria-label={t("common.back")}>
          <ArrowLeft size={18} />
        </button>
        <Avatar name={person.name} size={40} online={online} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-text">{person.name}</p>
          <p className={`text-xs ${online ? "text-[#31a24c]" : "text-text-faint"}`}>{online ? t("chat.online") : t(`role.${person.role}`)}</p>
        </div>
        <button type="button" title={t("chat.code_title")} aria-label={t("chat.code_title")}
          onClick={() => codeWith(person.id).then(setCode).catch(() => {})}
          className="rounded-full p-2 text-text-muted hover:bg-paper-dim"><ShieldCheck size={20} /></button>
      </header>

      <div ref={box} className="flex-1 overflow-y-auto bg-paper px-4 py-3"
        onScroll={(e) => {
          if (e.currentTarget.scrollTop < 80 && more) loadThread(person.id, true).then(setMore).catch(() => {});
        }}>
        {msgs.length === 0 && (
          <p className="mx-auto mt-16 max-w-xs text-center text-sm text-text-muted">
            <Lock size={22} className="mx-auto mb-2 text-text-faint" />
            {t("chat.empty").replace("{name}", person.name)}
          </p>
        )}
        {msgs.map((m: Msg, i) => {
          const mine = m.from === chat.me;
          const showDay = i === 0 || dayOf(m.at) !== dayOf(msgs[i - 1].at);
          return (
            <div key={m.id}>
              {showDay && (
                <p className="my-3 text-center"><span className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-text-muted shadow-sm">
                  {new Date(m.at).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}
                </span></p>
              )}
              <div className={`my-0.5 flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] px-3 pb-1.5 pt-2 text-[14.5px] leading-snug ${mine
                  ? "rounded-2xl rounded-br-md bg-[#0095f6] text-white" : "rounded-2xl rounded-bl-md bg-white text-text shadow-sm"}`}>
                  {(m.files?.length ?? 0) > 0 && (
                    <div className={`-mx-1.5 -mt-0.5 mb-1 grid gap-1 ${(m.files?.length ?? 0) > 1 ? "grid-cols-2" : ""}`}>
                      {m.files!.map((f) => <ChatPhoto key={f.id} file={f} single={m.files!.length === 1} onOpen={() => setViewing(f)} />)}
                    </div>
                  )}
                  {m.text == null
                    ? <p className="flex items-center gap-1.5 italic opacity-75"><Lock size={13} /> {t("chat.locked")}</p>
                    : m.text ? <p className="whitespace-pre-wrap break-words">{m.text}</p> : null}
                  <p className={`mt-0.5 flex items-center justify-end gap-1 text-[10.5px] ${mine ? "text-white/75" : "text-text-faint"}`}>
                    {time(m.at)}
                    {mine && (m.pending ? <Clock size={12} /> : m.readAt ? <CheckCheck size={13} className="text-[#b3e5ff]" /> : <Check size={13} />)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {photos.length > 0 && (
        <div className="flex gap-2 border-t border-border px-3 pt-2.5">
          {photos.map((p, i) => (
            <div key={p.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="h-16 w-16 rounded-lg object-cover" />
              <button type="button" onClick={() => setPhotos((cur) => cur.filter((_, j) => j !== i))} aria-label={t("common.delete")}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/80 text-white"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="relative flex items-end gap-1.5 border-t border-border px-3 py-2.5">
        {emoji && (
          <EmojiPicker onPick={insertEmoji} onClose={() => setEmoji(false)} labels={{
            search: t("chat.emoji_search"), recent: t("chat.recent"), none: t("chat.emoji_none"),
            groups: { smileys: t("chat.em_smileys"), gestures: t("chat.em_gestures"), business: t("chat.em_business"), objects: t("chat.em_objects"), symbols: t("chat.em_symbols") },
          }} />
        )}
        <button type="button" onClick={() => setEmoji((v) => !v)} aria-label={t("chat.emoji")} title={t("chat.emoji")}
          className={`flex h-[42px] w-10 shrink-0 items-center justify-center rounded-full ${emoji ? "text-ink" : "text-text-muted"} hover:bg-paper-dim`}><Smile size={21} /></button>
        <button type="button" onClick={() => picker.current?.click()} disabled={photos.length >= MAX_PHOTOS} aria-label={t("chat.photo")} title={t("chat.photo")}
          className="flex h-[42px] w-10 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-paper-dim disabled:opacity-40"><ImagePlus size={20} /></button>
        <input ref={picker} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
        <textarea ref={input} value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder={t("chat.write")}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void doSend(); } }}
          onPaste={(e) => { const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/")); if (imgs.length) { e.preventDefault(); addPhotos(imgs); } }}
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-[21px] border-0 bg-paper-dim px-4 py-2.5 text-sm outline-none" />
        <button type="button" onClick={() => void doSend()} disabled={sending || (!text.trim() && photos.length === 0)} aria-label={t("chat.send")}
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[#0095f6] text-white hover:bg-[#1877f2] disabled:opacity-40">
          <Send size={18} />
        </button>
      </div>

      {viewing && <PhotoLightbox file={viewing} onClose={() => setViewing(null)} />}
      {code && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setCode(null)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="flex items-center gap-2 font-display text-lg font-bold text-text"><ShieldCheck size={20} className="text-success" /> {t("chat.code_title")}</p>
            <p className="mt-2 text-sm text-text-muted">{t("chat.code_body").replace("{name}", person.name)}</p>
            <p className="mt-5 text-center font-mono text-xl font-semibold tracking-widest text-text">{code}</p>
            <button type="button" onClick={() => setCode(null)} className="mt-6 w-full rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium">{t("common.close")}</button>
          </div>
        </div>
      )}
    </>
  );
}

/** A photo in a message: blurred tiny preview until it has been fetched
 *  and opened in this browser. */
function ChatPhoto({ file, single, onOpen }: { file: FileRef; single: boolean; onOpen: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    photoUrl(file).then((u) => { if (alive) { if (u) setUrl(u); else setFailed(true); } });
    return () => { alive = false; };
  }, [file]);
  return (
    <button type="button" onClick={onOpen} disabled={!url}
      className={`relative overflow-hidden rounded-xl bg-black/10 ${single ? "aspect-[4/3] w-[280px] max-w-full" : "aspect-square w-[136px]"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        : file.th ? <img src={file.th} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-md" /> : null}
      {!url && (
        <span className="absolute inset-0 flex items-center justify-center">
          {failed ? <Lock size={18} className="text-white/80" /> : <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
        </span>
      )}
    </button>
  );
}

function PhotoLightbox({ file, onClose }: { file: FileRef; onClose: () => void }) {
  const { t } = useLanguage();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { void photoUrl(file).then(setUrl); }, [file]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" className="hgv-story-viewer fixed inset-0 z-[150] flex items-center justify-center bg-[#0c1014]/95 p-6" onClick={onClose}>
      <div className="absolute right-4 top-4 flex gap-2">
        {url && (
          <a href={url} download="higoverse-photo.jpg" onClick={(e) => e.stopPropagation()} aria-label={t("photo.download")} title={t("photo.download")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><Download size={19} /></a>
        )}
        <button type="button" onClick={onClose} aria-label={t("common.close")}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><X size={20} /></button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />}
    </div>
  );
}

export default function MessagesPage() {
  return <Suspense fallback={null}><MessagesInner /></Suspense>;
}
