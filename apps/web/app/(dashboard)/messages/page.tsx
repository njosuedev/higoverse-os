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
} from "lucide-react";
import {
  listConversations,
  listMessages,
  sendMessage,
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
}: {
  msg: Message;
  isMine: boolean;
  isShop: boolean;
  onAccept?: () => void;
  onReject?: () => void;
}) {
  const isOffer    = msg.message_type === "offer";
  const isAccepted = msg.message_type === "offer_accepted";
  const isRejected = msg.message_type === "offer_rejected";
  const isSystem   = isAccepted || isRejected || msg.message_type === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center my-3">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
            isAccepted
              ? "bg-green-100 text-green-700"
              : isRejected
              ? "bg-red-100 text-red-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {isAccepted ? <Check size={12} /> : isRejected ? <X size={12} /> : null}
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"} mb-2`}>
      <div className={`max-w-[72%] ${isMine ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {isOffer ? (
          <div
            className={`rounded-2xl overflow-hidden border ${
              isMine ? "border-orange-200 bg-orange-50" : "border-blue-200 bg-blue-50"
            }`}
          >
            <div
              className="px-4 py-2 text-xs font-bold text-white flex items-center gap-1.5"
              style={{ background: isMine ? BRAND : "#3b82f6" }}
            >
              <Tag size={11} />
              Price Offer
            </div>
            <div className="px-4 py-3">
              <p className="text-2xl font-black text-gray-800 mb-0.5">
                {priceStr(msg.offer_price)}
              </p>
              {msg.content && (
                <p className="text-sm text-gray-600">{msg.content}</p>
              )}
            </div>
            {isShop && !isMine && onAccept && onReject && (
              <div className="flex border-t border-blue-200">
                <button
                  onClick={onAccept}
                  className="flex-1 py-2.5 text-sm font-bold text-green-700 hover:bg-green-50 transition flex items-center justify-center gap-1"
                >
                  <Check size={14} /> Accept
                </button>
                <div className="w-px bg-blue-200" />
                <button
                  onClick={onReject}
                  className="flex-1 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 transition flex items-center justify-center gap-1"
                >
                  <X size={14} /> Reject
                </button>
              </div>
            )}
          </div>
        ) : (
          <div
            className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
              isMine
                ? "text-white rounded-br-sm"
                : "bg-gray-100 text-gray-800 rounded-bl-sm"
            }`}
            style={isMine ? { background: BRAND } : {}}
          >
            {msg.content}
          </div>
        )}
        <span className="text-[10px] text-gray-400 px-1">{timeAgo(msg.created_at)}</span>
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

          // Append to visible messages if this conversation is open
          if (activeRef.current?.id === evt.conversation_id) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
            if (msg.created_at) lastMsgTime.current = msg.created_at;
          }

          // Always refresh conversation list for unread counts
          loadConvs();
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

  // ── Send ───────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!active || sending) return;
    const content = text.trim();
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
        sender_name:  me?.email,
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
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-gray-50">
      {/* Sidebar — conversation list */}
      <div
        className={`${
          mobileOpen ? "hidden" : "flex"
        } md:flex flex-col w-full md:w-[320px] lg:w-[360px] bg-white border-r border-gray-100 shrink-0`}
      >
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">Messages</h2>
          <p className="text-xs text-gray-400 mt-0.5">Chat with shops · negotiate prices</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={22} className="animate-spin text-orange-400" />
            </div>
          ) : convs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mb-4">
                <MessageSquare size={26} className="text-orange-400" />
              </div>
              <p className="text-sm font-semibold text-gray-700 mb-1">No messages yet</p>
              <p className="text-xs text-gray-400">
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
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition border-b border-gray-50 hover:bg-orange-50 ${
                      isGroupActive && !hasMany ? "bg-orange-50" : ""
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
                        <span className="text-sm font-bold text-gray-800 truncate">{g.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {g.latestTime && (
                            <span className="text-[10px] text-gray-400">{timeAgo(g.latestTime)}</span>
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
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {hasMany
                          ? `${g.convs.length} conversations`
                          : (g.convs[0].product_name || "Product inquiry")}
                      </p>
                    </div>

                    {/* Chevron for expandable groups */}
                    {hasMany && (
                      <span className={`text-gray-300 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`}>
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
                        className={`w-full flex items-center gap-3 pl-[52px] pr-4 py-2.5 text-left transition border-b border-gray-50 hover:bg-orange-50 ${
                          isActive ? "bg-orange-50" : "bg-gray-50/60"
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                          {c.product_image ? (
                            <img src={c.product_image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Package size={14} className="text-gray-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-700 truncate">
                            {c.product_name || "Product inquiry"}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                              c.status === "accepted" ? "bg-green-100 text-green-700"
                              : c.status === "closed"  ? "bg-gray-100 text-gray-500"
                              : "bg-orange-100 text-orange-600"
                            }`}>
                              {c.status === "open" ? "Active" : c.status}
                            </span>
                            {c.listed_price != null && (
                              <span className="text-[9px] text-gray-400">
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
        } md:flex flex-col flex-1 min-w-0`}
      >
        {!active ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center mb-5">
              <MessageSquare size={30} className="text-orange-400" />
            </div>
            <p className="text-lg font-bold text-gray-700 mb-2">Select a conversation</p>
            <p className="text-sm text-gray-400">
              Pick a chat from the left or start one by clicking&nbsp;
              <span className="font-semibold text-orange-500">Message Shop</span> on any product.
            </p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 shrink-0">
              <button
                className="md:hidden p-1.5 rounded-lg hover:bg-gray-100"
                onClick={() => setMobileOpen(false)}
              >
                <ChevronLeft size={18} />
              </button>
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                {active.product_image ? (
                  <img src={active.product_image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ShoppingBag size={16} className="text-gray-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate">
                  {myShopId === active.shop_id
                    ? active.customer_name || "Customer"
                    : active.shop_name || "Shop"}
                </p>
                {active.product_name && (
                  <p className="text-xs text-gray-500 truncate">
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
                <div className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                  <Check size={11} />
                  Deal {priceStr(active.agreed_price)}
                </div>
              )}
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center opacity-60">
                  <MessageSquare size={32} className="text-gray-300 mb-2" />
                  <p className="text-sm text-gray-400">No messages yet. Say hello!</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <Bubble
                    key={msg.id}
                    msg={msg}
                    isMine={msg.sender_id === myId}
                    isShop={!!myShopId && myShopId === active.shop_id}
                    onAccept={
                      msg.message_type === "offer" ? () => handleOffer(msg.id, "accept") : undefined
                    }
                    onReject={
                      msg.message_type === "offer" ? () => handleOffer(msg.id, "reject") : undefined
                    }
                  />
                ))
              )}
              <div ref={bottomRef} />
            </div>

            {/* Error strip */}
            {error && (
              <div className="px-4 py-2 bg-red-50 text-xs text-red-600 border-t border-red-100 flex justify-between items-center">
                {error}
                <button onClick={() => setError(null)}><X size={12} /></button>
              </div>
            )}

            {/* Composer */}
            {active.status === "open" ? (
              <div className="bg-white border-t border-gray-100 p-3 shrink-0">
                {offerMode && (
                  <div className="flex items-center gap-2 mb-2 p-3 bg-orange-50 rounded-xl border border-orange-200">
                    <span className="text-xs font-bold text-orange-500 shrink-0">FRW</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Your offer price"
                      value={offerAmt}
                      onChange={(e) => setOfferAmt(e.target.value)}
                      className="flex-1 bg-transparent text-sm font-bold text-gray-800 outline-none placeholder:text-gray-400"
                    />
                    <button
                      onClick={() => { setOfferMode(false); setOfferAmt(""); }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <div className="flex-1 flex items-end gap-2 bg-gray-50 rounded-2xl px-3 py-2">
                    <textarea
                      rows={1}
                      placeholder={offerMode ? "Add a note (optional)…" : "Type a message…"}
                      value={text}
                      onChange={(e) => {
                        setText(e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      className="flex-1 bg-transparent text-sm text-gray-800 outline-none resize-none max-h-[120px] placeholder:text-gray-400"
                    />
                  </div>
                  {myShopId !== active.shop_id && !offerMode && (
                    <button
                      onClick={() => setOfferMode(true)}
                      title="Make an offer"
                      className="p-2.5 rounded-xl border border-orange-200 bg-orange-50 text-orange-500 hover:bg-orange-100 transition shrink-0"
                    >
                      <Tag size={16} />
                    </button>
                  )}
                  <button
                    onClick={handleSend}
                    disabled={sending || (!text.trim() && !(offerMode && offerAmt))}
                    className="p-2.5 rounded-xl text-white transition shrink-0 disabled:opacity-40"
                    style={{ background: BRAND }}
                  >
                    {sending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-center">
                <p className="text-xs text-gray-400 font-medium">
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
