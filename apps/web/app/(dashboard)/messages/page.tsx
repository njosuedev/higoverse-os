"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  MessageSquare,
  Send,
  Tag,
  Check,
  X,
  ChevronLeft,
  Package,
  Loader2,
  ShoppingBag,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  listConversations,
  listMessages,
  sendMessage,
  sendTyping,
  editMessage,
  deleteMessage,
  respondToOffer,
  openMessageStream,
  Conversation,
  Message,
} from "@/lib/messages-api";
import { getUser } from "@/lib/auth";
import { formatDistanceToNow } from "date-fns";

const BRAND = "#ff6a00";
// Catch-up poll interval — SSE delivers instantly; this just catches any missed events
const CATCHUP_MS = 30_000;

function playMessageSound() {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    (
      [
        [587.3, 0,    0.13],
        [783.9, 0.09, 0.18],
      ] as const
    ).forEach(([freq, when, dur]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + when);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + when + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + dur);
      osc.start(ctx.currentTime + when);
      osc.stop(ctx.currentTime + when + dur);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch { /* AudioContext unavailable */ }
}

function timeAgo(iso: string | null) {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function priceStr(n: number | null | undefined) {
  if (n == null) return "";
  return new Intl.NumberFormat("en-RW", {
    style: "currency", currency: "RWF", maximumFractionDigits: 0,
  }).format(Number(n));
}

// ── Message bubble ────────────────────────────────────────────────────────────
function Bubble({
  msg,
  isMine,
  isShop,
  onAccept,
  onReject,
  onEdit,
  onDelete,
}: {
  msg: Message;
  isMine: boolean;
  isShop: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isOffer    = msg.message_type === "offer";
  const isAccepted = msg.message_type === "offer_accepted";
  const isRejected = msg.message_type === "offer_rejected";
  const isSystem   = isAccepted || isRejected || msg.message_type === "system";
  const canEdit    = isMine && msg.message_type === "text" && !msg.is_deleted;
  const canDelete  = isMine && !msg.is_deleted;
  const hasMenu    = canEdit || canDelete;

  useEffect(() => {
    if (!menuOpen) return;
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [menuOpen]);

  if (isSystem) {
    return (
      <div className="flex justify-center my-3">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
          isAccepted ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          : isRejected ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
        }`}>
          {isAccepted ? <Check size={12} /> : isRejected ? <X size={12} /> : null}
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-end gap-1 ${isMine ? "flex-row-reverse" : "flex-row"} mb-1 group`}>

      {/* ··· menu button — visible on hover / tap */}
      {hasMenu && !msg.is_deleted && (
        <div className="relative shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
              <circle cx="8" cy="2.5" r="1.3"/>
              <circle cx="8" cy="8"   r="1.3"/>
              <circle cx="8" cy="13.5" r="1.3"/>
            </svg>
          </button>

          {menuOpen && (
            <div className={`absolute z-50 bottom-8 ${isMine ? "right-0" : "left-0"} w-28 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 py-0.5 overflow-hidden`}>
              {canEdit && (
                <button
                  onClick={() => { onEdit?.(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition text-left"
                >
                  <Pencil size={11} className="text-gray-400 dark:text-gray-500 shrink-0" />
                  Edit
                </button>
              )}
              {canDelete && (
                <>
                  {canEdit && <div className="mx-2 border-t border-gray-100 dark:border-gray-700" />}
                  <button
                    onClick={() => { onDelete?.(); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition text-left"
                  >
                    <Trash2 size={11} className="shrink-0" />
                    Remove
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bubble */}
      <div className={`max-w-[68%] flex flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}>
        {msg.is_deleted ? (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
              <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
            <span className="text-sm italic">You deleted this message</span>
          </div>
        ) : isOffer ? (
          <div className={`rounded-2xl overflow-hidden border ${isMine ? "border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20" : "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20"}`}>
            <div className="px-4 py-2 text-xs font-bold text-white flex items-center gap-1.5" style={{ background: isMine ? BRAND : "#3b82f6" }}>
              <Tag size={11} /> Price Offer
            </div>
            <div className="px-4 py-3">
              <p className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-0.5">{priceStr(msg.offer_price)}</p>
              {msg.content && <p className="text-sm text-gray-600 dark:text-gray-400">{msg.content}</p>}
            </div>
            {isShop && !isMine && onAccept && onReject && (
              <div className="flex border-t border-blue-200 dark:border-blue-800">
                <button onClick={onAccept} className="flex-1 py-2.5 text-sm font-bold text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition flex items-center justify-center gap-1">
                  <Check size={14} /> Accept
                </button>
                <div className="w-px bg-blue-200 dark:bg-blue-800" />
                <button onClick={onReject} className="flex-1 py-2.5 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition flex items-center justify-center gap-1">
                  <X size={14} /> Reject
                </button>
              </div>
            )}
          </div>
        ) : (
          <div
            className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
              isMine ? "text-white rounded-br-sm" : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-sm"
            }`}
            style={isMine ? { background: BRAND } : {}}
          >
            {msg.content}
          </div>
        )}

        <div className={`flex items-center gap-1 px-1 ${isMine ? "self-end" : "self-start"}`}>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">{timeAgo(msg.created_at)}</span>
          {msg.edited_at && !msg.is_deleted && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">· Edited</span>
          )}
          {/* Read receipts — only on own messages */}
          {isMine && !msg.is_deleted && (
            <span className={`flex items-center -space-x-1 ${msg.is_read ? "text-blue-500" : "text-gray-300 dark:text-gray-600"}`}>
              {/* First tick */}
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="2,6 5,9 10,3"/>
              </svg>
              {/* Second tick — only when seen */}
              {msg.is_read && (
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2,6 5,9 10,3"/>
                </svg>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MessagesPage() {
  const me       = getUser();
  const myId     = me?.id ?? "";
  const myShopId = me?.shop_id ?? "";
  const isShopView = !!myShopId;

  const searchParams = useSearchParams();
  const convParam    = searchParams.get("conv");

  const [convs, setConvs]           = useState<Conversation[]>([]);
  const [active, setActive]         = useState<Conversation | null>(null);
  const [messages, setMessages]     = useState<Message[]>([]);
  const [text, setText]             = useState("");
  const [offerMode, setOfferMode]   = useState(false);
  const [offerAmt, setOfferAmt]     = useState("");
  const [sending, setSending]       = useState(false);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [editingMsg, setEditingMsg]   = useState<Message | null>(null);
  const [peerTyping, setPeerTyping]   = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef<number>(0);

  const bottomRef    = useRef<HTMLDivElement>(null);
  const lastMsgTime  = useRef<string | null>(null);
  const prevMsgCount = useRef(0);
  const myIdRef      = useRef(myId);
  useEffect(() => { myIdRef.current = myId; }, [myId]);

  // Used by SSE handler to know current active conversation without stale closure
  const activeRef = useRef<Conversation | null>(null);
  useEffect(() => { activeRef.current = active; }, [active]);

  // ── Load conversations ─────────────────────────────────────────────────────
  const loadConvs = useCallback(async () => {
    try {
      const data = await listConversations();
      setConvs(data);
    } catch {
      // silent — show stale data
    } finally {
      setLoading(false);
    }
  }, []);

  // Catch-up poll for conversation list (unread counts, new convs)
  useEffect(() => {
    loadConvs();
    const t = setInterval(loadConvs, CATCHUP_MS);
    return () => clearInterval(t);
  }, [loadConvs]);

  // Auto-open conversation when redirected from marketplace with ?conv=<id>
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current || !convParam || convs.length === 0) return;
    const found = convs.find((c) => c.id === convParam);
    if (found) {
      const groupKey = isShopView ? found.customer_id : found.shop_id;
      setExpandedKey(groupKey);
      setActive(found);
      setMobileOpen(true);
      autoOpenedRef.current = true;
    }
  }, [convParam, convs, isShopView]);

  // ── Load messages ──────────────────────────────────────────────────────────
  const loadMessages = useCallback(async (conv: Conversation, after?: string) => {
    try {
      const msgs = await listMessages(conv.id, after);
      if (msgs.length > 0) {
        setMessages((prev) => {
          if (!after) return msgs;
          const ids = new Set(prev.map((m) => m.id));
          const newOnes = msgs.filter((m) => !ids.has(m.id));
          return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
        lastMsgTime.current = msgs[msgs.length - 1].created_at;
      } else if (!after) {
        setMessages([]);
      }
    } catch {
      // silent
    }
  }, []);

  // Load initial messages + catch-up poll when active conversation changes
  useEffect(() => {
    if (!active) return;
    lastMsgTime.current = null;
    prevMsgCount.current = 0;
    setMessages([]);
    setPeerTyping(false);
    loadMessages(active);

    // Catch-up poll — SSE handles real-time; this catches any missed events
    const t = setInterval(() => {
      loadMessages(active, lastMsgTime.current ?? undefined);
    }, CATCHUP_MS);

    return () => clearInterval(t);
  }, [active, loadMessages]);

  // ── SSE — real-time message delivery ──────────────────────────────────────
  useEffect(() => {
    const ctrl = openMessageStream(
      (evt) => {
        if (evt.type === "ping" || evt.type === "connected") return;

        if (evt.type === "new_message" && evt.message && evt.conversation_id) {
          const msg = evt.message;
          if (activeRef.current?.id === evt.conversation_id) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
            if (msg.created_at) lastMsgTime.current = msg.created_at;
          }
          loadConvs();
        }

        if (
          (evt.type === "message_updated" || evt.type === "message_deleted") &&
          evt.message && evt.conversation_id &&
          activeRef.current?.id === evt.conversation_id
        ) {
          const updated = evt.message;
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        }

        // Recipient opened the conversation — mark our sent messages as seen
        if (evt.type === "messages_read" && evt.conversation_id === activeRef.current?.id) {
          setMessages((prev) => prev.map((m) => m.is_read ? m : { ...m, is_read: true }));
        }

        // Peer is typing — show indicator, auto-clear after 3 s
        if (evt.type === "user_typing" && evt.conversation_id === activeRef.current?.id) {
          setPeerTyping(true);
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          typingTimerRef.current = setTimeout(() => setPeerTyping(false), 3000);
        }
      },
      () => {
        // SSE unavailable — the 30s catch-up poll already handles recovery
      },
    );
    return () => ctrl.abort();
  }, [loadConvs]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Play sound when new incoming messages arrive (not on initial load)
  useEffect(() => {
    const prev = prevMsgCount.current;
    prevMsgCount.current = messages.length;
    if (prev === 0 || messages.length <= prev) return;
    const newMsgs = messages.slice(prev);
    const hasIncoming = newMsgs.some((m) => m.sender_id !== myIdRef.current);
    if (hasIncoming) playMessageSound();
  }, [messages]);

  // ── Send / Save edit ───────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!active || sending) return;
    const content = text.trim();

    // Saving an edit
    if (editingMsg) {
      if (!content) return;
      setSending(true);
      setError(null);
      try {
        const updated = await editMessage(active.id, editingMsg.id, content);
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        setText("");
        setEditingMsg(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to edit message");
      } finally {
        setSending(false);
      }
      return;
    }

    if (!content && !offerMode) return;
    if (offerMode && !offerAmt) return;

    setSending(true);
    setError(null);
    try {
      const msg = await sendMessage(active.id, {
        content: offerMode
          ? content || `I'd like to offer ${priceStr(parseFloat(offerAmt))} for this product.`
          : content,
        message_type: offerMode ? "offer" : "text",
        offer_price:  offerMode ? parseFloat(offerAmt) : undefined,
        sender_name:  me?.name ?? undefined,
      });
      setMessages((prev) => [...prev, msg]);
      lastMsgTime.current = msg.created_at;
      setText("");
      setOfferAmt("");
      setOfferMode(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handleEdit = async (msgId: string, content: string) => {
    if (!active) return;
    try {
      const updated = await editMessage(active.id, msgId, content);
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to edit message");
    }
  };

  const handleDelete = async (msgId: string) => {
    if (!active) return;
    try {
      const updated = await deleteMessage(active.id, msgId);
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete message");
    }
  };

  const handleOffer = async (msgId: string, action: "accept" | "reject") => {
    if (!active) return;
    try {
      const sys = await respondToOffer(active.id, msgId, action);
      setMessages((prev) => [...prev, sys]);
      if (action === "accept") {
        setActive((c) => c ? { ...c, status: "accepted" } : c);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to respond");
    }
  };

  const openConv = (c: Conversation) => {
    setActive(c);
    setMobileOpen(true);
  };

  // ── Group conversations by counterpart (shop for customers, customer for shop owners) ──
  interface ConvGroup {
    key: string;
    name: string;
    initial: string;
    convs: Conversation[];
    unread: number;
    latestTime: string | null;
  }

  const groups = useMemo<ConvGroup[]>(() => {
    const map = new Map<string, ConvGroup>();
    for (const c of convs) {
      const key  = isShopView ? c.customer_id : c.shop_id;
      const name = isShopView ? (c.customer_name || "Customer") : (c.shop_name || "Shop");
      if (!map.has(key)) {
        map.set(key, { key, name, initial: name[0]?.toUpperCase() ?? "?", convs: [], unread: 0, latestTime: null });
      }
      const g = map.get(key)!;
      g.convs.push(c);
      g.unread += c.unread_count;
      if (c.last_message_at && (!g.latestTime || c.last_message_at > g.latestTime)) {
        g.latestTime = c.last_message_at;
      }
    }
    return [...map.values()].sort((a, b) => {
      if (!a.latestTime && !b.latestTime) return 0;
      if (!a.latestTime) return 1;
      if (!b.latestTime) return -1;
      return b.latestTime.localeCompare(a.latestTime);
    });
  }, [convs, isShopView]);

  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Sidebar — conversation list */}
      <div
        className={`${
          mobileOpen ? "hidden" : "flex"
        } md:flex flex-col w-full md:w-[320px] lg:w-[360px] bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700 shrink-0`}
      >
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Messages</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Chat with shops · negotiate prices</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={22} className="animate-spin text-orange-400" />
            </div>
          ) : convs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center mb-4">
                <MessageSquare size={26} className="text-orange-400" />
              </div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">No messages yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Start a conversation from any product in the marketplace.
              </p>
            </div>
          ) : (
            groups.map((g) => {
              const isExpanded   = expandedKey === g.key;
              const hasMany      = g.convs.length > 1;
              const isGroupActive = g.convs.some((c) => c.id === active?.id);

              return (
                <div key={g.key}>
                  {/* ── Group row (one per shop / customer) ── */}
                  <button
                    onClick={() => {
                      if (hasMany) {
                        setExpandedKey(isExpanded ? null : g.key);
                      } else {
                        openConv(g.convs[0]);
                      }
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition border-b border-gray-50 dark:border-gray-700/50 hover:bg-orange-50 dark:hover:bg-orange-900/20 ${
                      isGroupActive && !hasMany ? "bg-orange-50 dark:bg-orange-900/20" : ""
                    }`}
                  >
                    {/* Avatar */}
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-black"
                      style={{ background: BRAND }}
                    >
                      {g.initial}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{g.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {g.latestTime && (
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">{timeAgo(g.latestTime)}</span>
                          )}
                          {g.unread > 0 && (
                            <span
                              className="w-5 h-5 rounded-full text-[10px] font-black text-white flex items-center justify-center"
                              style={{ background: BRAND }}
                            >
                              {g.unread > 99 ? "99+" : g.unread}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                        {hasMany
                          ? `${g.convs.length} conversations`
                          : (g.convs[0].product_name || "Product inquiry")}
                      </p>
                    </div>

                    {/* Chevron for expandable groups */}
                    {hasMany && (
                      <span className={`text-gray-300 dark:text-gray-600 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`}>
                        ▾
                      </span>
                    )}
                  </button>

                  {/* ── Sub-list: individual product threads ── */}
                  {hasMany && isExpanded && g.convs.map((c) => {
                    const isActive = active?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => openConv(c)}
                        className={`w-full flex items-center gap-3 pl-[52px] pr-4 py-2.5 text-left transition border-b border-gray-50 dark:border-gray-700/50 hover:bg-orange-50 dark:hover:bg-orange-900/20 ${
                          isActive ? "bg-orange-50 dark:bg-orange-900/20" : "bg-gray-50/60 dark:bg-gray-700/30"
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
                          {c.product_image ? (
                            <img src={c.product_image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Package size={14} className="text-gray-400 dark:text-gray-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">
                            {c.product_name || "Product inquiry"}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                              c.status === "accepted" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : c.status === "closed"  ? "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                              : "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                            }`}>
                              {c.status === "open" ? "Active" : c.status}
                            </span>
                            {c.listed_price != null && (
                              <span className="text-[9px] text-gray-400 dark:text-gray-500">
                                {priceStr(c.listed_price)}
                              </span>
                            )}
                          </div>
                        </div>
                        {c.unread_count > 0 && (
                          <span
                            className="w-4 h-4 rounded-full text-[9px] font-black text-white flex items-center justify-center shrink-0"
                            style={{ background: BRAND }}
                          >
                            {c.unread_count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Chat window */}
      <div
        className={`${
          mobileOpen ? "flex" : "hidden"
        } md:flex flex-col flex-1 min-w-0 bg-gray-50 dark:bg-gray-900`}
      >
        {!active ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center mb-5">
              <MessageSquare size={30} className="text-orange-400" />
            </div>
            <p className="text-lg font-bold text-gray-700 dark:text-gray-200 mb-2">Select a conversation</p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Pick a chat from the left or start one by clicking&nbsp;
              <span className="font-semibold text-orange-500">Message Shop</span> on any product.
            </p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 shrink-0">
              <button
                className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => setMobileOpen(false)}
              >
                <ChevronLeft size={18} className="text-gray-600 dark:text-gray-300" />
              </button>
              <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden shrink-0">
                {active.product_image ? (
                  <img src={active.product_image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ShoppingBag size={16} className="text-gray-400 dark:text-gray-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">
                  {myShopId === active.shop_id
                    ? active.customer_name || "Customer"
                    : active.shop_name || "Shop"}
                </p>
                {active.product_name && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {active.product_name}
                    {active.listed_price != null && (
                      <span className="ml-1 text-orange-500 font-semibold">
                        · Listed {priceStr(active.listed_price)}
                      </span>
                    )}
                  </p>
                )}
              </div>
              {active.agreed_price != null && (
                <div className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold">
                  <Check size={11} />
                  Deal {priceStr(active.agreed_price)}
                </div>
              )}
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center opacity-60">
                  <MessageSquare size={32} className="text-gray-300 dark:text-gray-600 mb-2" />
                  <p className="text-sm text-gray-400 dark:text-gray-500">No messages yet. Say hello!</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <Bubble
                    key={msg.id}
                    msg={msg}
                    isMine={msg.sender_id === myId}
                    isShop={!!myShopId && myShopId === active.shop_id}
                    onAccept={msg.message_type === "offer" ? () => handleOffer(msg.id, "accept") : undefined}
                    onReject={msg.message_type === "offer" ? () => handleOffer(msg.id, "reject") : undefined}
                    onEdit={() => { setEditingMsg(msg); setText(msg.content); }}
                    onDelete={() => handleDelete(msg.id)}
                  />
                ))
              )}
              {/* Typing indicator */}
              {peerTyping && (
                <div className="flex justify-start mb-2">
                  <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-bl-sm bg-gray-100 dark:bg-gray-700">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500"
                        style={{ animation: "typing-bounce 1.2s infinite", animationDelay: `${i * 0.2}s` }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Error strip */}
            {error && (
              <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-400 border-t border-red-100 dark:border-red-800 flex justify-between items-center">
                {error}
                <button onClick={() => setError(null)}><X size={12} /></button>
              </div>
            )}

            {/* Composer */}
            {active.status === "open" ? (
              <div className="bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 p-3 shrink-0">
                {/* Editing banner */}
                {editingMsg && (
                  <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl border-l-4 border-blue-400 dark:border-blue-500">
                    <Pencil size={13} className="text-blue-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wide mb-0.5">Editing message</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{editingMsg.content}</p>
                    </div>
                    <button
                      onClick={() => { setEditingMsg(null); setText(""); }}
                      className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                {offerMode && (
                  <div className="flex items-center gap-2 mb-2 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-200 dark:border-orange-800">
                    <span className="text-xs font-bold text-orange-500 shrink-0">FRW</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Your offer price"
                      value={offerAmt}
                      onChange={(e) => setOfferAmt(e.target.value)}
                      className="flex-1 bg-transparent text-sm font-bold text-gray-800 dark:text-gray-100 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    />
                    <button
                      onClick={() => { setOfferMode(false); setOfferAmt(""); }}
                      className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <div className="flex-1 flex items-end gap-2 bg-gray-50 dark:bg-gray-700 rounded-2xl px-3 py-2">
                    <textarea
                      rows={1}
                      placeholder={editingMsg ? "Edit your message…" : offerMode ? "Add a note (optional)…" : "Type a message…"}
                      value={text}
                      onChange={(e) => {
                        setText(e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                        // Throttle typing events — at most once every 2 s
                        if (active && Date.now() - lastTypingSent.current > 2000) {
                          lastTypingSent.current = Date.now();
                          sendTyping(active.id).catch(() => {});
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-100 outline-none resize-none max-h-[120px] placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    />
                  </div>
                  {myShopId !== active.shop_id && !offerMode && (
                    <button
                      onClick={() => setOfferMode(true)}
                      title="Make an offer"
                      className="p-2.5 rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 text-orange-500 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition shrink-0"
                    >
                      <Tag size={16} />
                    </button>
                  )}
                  <button
                    onClick={handleSend}
                    disabled={sending || (!text.trim() && !(offerMode && offerAmt))}
                    className="p-2.5 rounded-xl text-white transition shrink-0 disabled:opacity-40"
                    style={{ background: editingMsg ? "#3b82f6" : BRAND }}
                  >
                    {sending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : editingMsg ? (
                      <Check size={16} />
                    ) : (
                      <Send size={16} />
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 text-center">
                <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                  {active.status === "accepted"
                    ? `Deal agreed at ${priceStr(active.agreed_price)} · Conversation closed`
                    : "This conversation is closed"}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
