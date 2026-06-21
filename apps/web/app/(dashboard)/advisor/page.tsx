"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useLanguage } from "@/lib/language-context";
import { useShop } from "@/lib/shop-context";
import { playAIResponse } from "@/lib/sound";
import { Store } from "lucide-react";
import {
  sendChat, getConversations, getMessages, deleteConversation,
  type ChatMessage, type Conversation,
} from "@/lib/advisor-api";
import {
  Send, Sparkles, BarChart3, Package, DollarSign,
  TrendingUp, MessageSquare, Trash2, Plus, AlertCircle,
  RefreshCw, Star, X, ShoppingCart, User, PenLine,
} from "lucide-react";

const QUICK_ACTIONS = [
  { icon: BarChart3,    label: "advisor.quick.performance", message: "How is my business performing today?" },
  { icon: Package,      label: "advisor.quick.inventory",   message: "Which products are running low on stock? What should I restock urgently?" },
  { icon: DollarSign,   label: "advisor.quick.financial",   message: "Give me a complete financial overview — revenue, expenses, and profit." },
  { icon: TrendingUp,   label: "advisor.quick.growth",      message: "What are my top-performing products and growth opportunities?" },
  { icon: ShoppingCart, label: "advisor.quick.attention",   message: "Show me my sales analysis for today and this week." },
  { icon: Star,         label: "advisor.quick.report",      message: "Generate a full business report with all insights and recommendations." },
];

function MessageText({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-1 text-[14px] leading-relaxed text-slate-800">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1.5" />;
        const isSectionHeader = /^[📊💰📦🛒📈📋🏆⚡💡🚀🧠💸🚚🕐🧾📅📂]/.test(trimmed) &&
          (trimmed.endsWith(":") || trimmed.length < 60);
        const isBullet   = trimmed.startsWith("•") || trimmed.startsWith("-") || /^\d+[.️⃣]/.test(trimmed);
        const isNumbered = /^[1-9][️⃣]/.test(trimmed);
        const isSeparator = /^[─━=]{3,}$/.test(trimmed);
        if (isSeparator)                       return <div key={i} className="border-t border-slate-200 my-2" />;
        if (isSectionHeader && !isBullet)      return <p key={i} className="font-semibold text-slate-900 mt-3 first:mt-0">{trimmed}</p>;
        if (isNumbered)                        return <p key={i} className="pl-1">{trimmed}</p>;
        if (isBullet)                          return <p key={i} className="pl-3">{trimmed}</p>;
        return                                        <p key={i}>{trimmed}</p>;
      })}
    </div>
  );
}

function MessageBubble({ msg, shopLogo, shopName, displayContent, isStreaming }: {
  msg: ChatMessage; shopLogo?: string; shopName?: string;
  displayContent?: string; isStreaming?: boolean;
}) {
  const isUser  = msg.role === "user";
  const content = displayContent ?? msg.content;
  const time    = new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[72%] bg-slate-100 rounded-3xl rounded-br-lg px-4 py-3">
          <p className="text-[14px] text-slate-800 leading-relaxed whitespace-pre-wrap">{content}</p>
          <p className="text-[10px] text-slate-400 mt-1 text-right">{time}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#1372e6] flex items-center justify-center mt-0.5 shadow-sm">
        <Sparkles size={14} className="text-white" />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-[11px] font-semibold text-slate-400 mb-1.5 tracking-wide uppercase">Higoverse AI</p>
        <MessageText content={content} />
        {isStreaming && (
          <span className="inline-block w-0.5 h-4 bg-[#1372e6] ml-0.5 align-middle animate-pulse rounded-full" />
        )}
        <p className="text-[10px] text-slate-400 mt-2">{time}</p>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#1372e6] flex items-center justify-center mt-0.5 shadow-sm">
        <Sparkles size={14} className="text-white" />
      </div>
      <div className="pt-3 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </div>
    </div>
  );
}

export default function AdvisorPage() {
  const { t, lang } = useLanguage();
  const { shop }    = useShop();

  const [messages,      setMessages]      = useState<ChatMessage[]>([]);
  const [input,         setInput]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [convId,        setConvId]        = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [error,         setError]         = useState<string | null>(null);
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [loadingConvs,  setLoadingConvs]  = useState(false);
  const [streamingId,   setStreamingId]   = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const streamRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const scrollBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
  }, []);

  useEffect(() => {
    return () => { if (streamRef.current) clearInterval(streamRef.current); };
  }, []);

  async function loadConversations() {
    setLoadingConvs(true);
    try { setConversations(await getConversations()); } catch {}
    setLoadingConvs(false);
  }

  async function loadConversation(id: string) {
    try {
      setMessages(await getMessages(id));
      setConvId(id);
      setSidebarOpen(false);
      scrollBottom();
    } catch { setError("Failed to load conversation."); }
  }

  async function handleDeleteConv(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      setConversations((p) => p.filter((c) => c.id !== id));
      if (convId === id) { setMessages([]); setConvId(null); }
    } catch {}
  }

  function newChat() {
    setMessages([]); setConvId(null); setSidebarOpen(false);
    if (streamRef.current) { clearInterval(streamRef.current); streamRef.current = null; }
    setStreamingId(null);
  }

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    setError(null);
    if (inputRef.current) inputRef.current.style.height = "auto";

    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`, role: "user", content: msg,
      language: lang, created_at: new Date().toISOString(),
    };
    setMessages((p) => [...p, optimistic]);
    setLoading(true);
    scrollBottom();

    try {
      const res = await sendChat(msg, convId, lang);
      const aiId = res.message_id || `ai-${Date.now()}`;
      const ai: ChatMessage = {
        id: aiId, role: "assistant",
        content: res.reply, language: res.language,
        created_at: new Date().toISOString(),
      };
      setMessages((p) => [...p, ai]);
      setConvId(res.conversation_id);
      playAIResponse();

      const words = res.reply.split(" ");
      let w = 0;
      setStreamingId(aiId);
      setStreamingText("");
      if (streamRef.current) clearInterval(streamRef.current);
      streamRef.current = setInterval(() => {
        w++;
        setStreamingText(words.slice(0, w).join(" "));
        if (w >= words.length) {
          clearInterval(streamRef.current!);
          streamRef.current = null;
          setStreamingId(null);
        }
      }, 55);
      scrollBottom();
    } catch (err: any) {
      setMessages((p) => p.filter((m) => m.id !== optimistic.id));
      setError(err?.message || "Failed to get a response. Please try again.");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  return (
    <div className="flex bg-white" style={{ height: "calc(100vh - 90px)" }}>

      {/* ── SIDEBAR ─────────────────────────────────────────────────── */}
      <aside className={`w-60 flex-shrink-0 border-r border-slate-200 flex flex-col bg-slate-50
        ${sidebarOpen ? "absolute inset-y-[90px] left-0 z-40 w-60 flex shadow-xl" : "hidden lg:flex"}`}>

        {/* New chat */}
        <div className="p-3 border-b border-slate-200">
          <button onClick={newChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white
              hover:border-[#1372e6] hover:text-[#1372e6] text-slate-600 text-sm font-medium transition">
            <PenLine size={14} /> New chat
          </button>
        </div>

        {/* Quick questions */}
        <div className="p-3 border-b border-slate-200">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">Quick questions</p>
          <div className="space-y-0.5">
            {QUICK_ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <button key={a.label} disabled={loading} onClick={() => handleSend(a.message)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-600
                    hover:bg-white hover:text-[#1372e6] transition text-left disabled:opacity-40">
                  <Icon size={12} className="flex-shrink-0 text-slate-400" />
                  <span>{t(a.label)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* History */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">History</p>
            <button onClick={loadConversations} disabled={loadingConvs} title="Refresh"
              className="p-1 hover:bg-white rounded transition">
              <RefreshCw size={11} className={loadingConvs ? "animate-spin text-slate-400" : "text-slate-400"} />
            </button>
          </div>
          {conversations.length === 0 ? (
            <p className="text-[10px] text-slate-400 text-center py-4">
              {loadingConvs ? "Loading…" : "No history yet"}
            </p>
          ) : (
            <div className="space-y-0.5">
              {conversations.map((c) => (
                <div key={c.id} onClick={() => loadConversation(c.id)}
                  className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition text-xs
                    ${convId === c.id ? "bg-white text-[#1372e6] font-semibold shadow-sm" : "text-slate-600 hover:bg-white"}`}>
                  <MessageSquare size={11} className="flex-shrink-0 opacity-50" />
                  <span className="truncate flex-1">{c.title || "Chat"}</span>
                  <button onClick={(e) => handleDeleteConv(c.id, e)}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition p-0.5">
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Shop identity */}
        {shop && (
          <div className="p-3 border-t border-slate-200">
            <div className="flex items-center gap-2 px-2 py-1">
              {shop.logo_url ? (
                <img src={shop.logo_url} alt={shop.name} className="w-6 h-6 rounded-lg object-cover" />
              ) : (
                <div className="w-6 h-6 rounded-lg bg-[#1372e6] flex items-center justify-center">
                  <Store size={11} className="text-white" />
                </div>
              )}
              <span className="text-xs font-medium text-slate-700 truncate">{shop.name}</span>
            </div>
          </div>
        )}
      </aside>

      {/* ── CHAT MAIN ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <div className="border-b border-slate-200 px-4 h-[52px] flex items-center gap-3 bg-white flex-shrink-0">
          <button onClick={() => { setSidebarOpen(!sidebarOpen); loadConversations(); }}
            className="lg:hidden p-1.5 hover:bg-slate-100 rounded-lg transition">
            <MessageSquare size={16} className="text-slate-500" />
          </button>
          <div className="flex items-center gap-2.5 flex-1">
            <div className="w-7 h-7 rounded-full bg-[#1372e6] flex items-center justify-center">
              <Sparkles size={13} className="text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-900">Higoverse AI</span>
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${loading ? "bg-amber-400 animate-pulse" : "bg-green-500"}`} />
              {loading ? "Thinking…" : "Online"}
            </span>
          </div>
          {convId && (
            <button onClick={newChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 transition">
              <Plus size={12} /> New chat
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 && !loading ? (

            /* ── Empty state ── */
            <div className="h-full flex flex-col items-center justify-center px-6 py-8">
              <div className="w-14 h-14 rounded-2xl bg-[#1372e6] flex items-center justify-center mb-4 shadow-lg">
                <Sparkles size={24} className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-1">{t("advisor.welcome")}</h2>
              <p className="text-sm text-slate-500 mb-8 max-w-sm text-center leading-relaxed">
                {t("advisor.welcome_sub")}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full max-w-lg">
                {QUICK_ACTIONS.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button key={a.label} onClick={() => handleSend(a.message)} disabled={loading}
                      className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 bg-white
                        hover:border-[#1372e6] hover:bg-[#EBF4FF] hover:text-[#1372e6]
                        text-slate-600 text-xs font-medium transition text-left">
                      <Icon size={14} className="flex-shrink-0 opacity-70" />
                      {t(a.label)}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 mt-6">
                Or just say <span className="font-semibold text-[#1372e6]">"Hi"</span> to start 👋
              </p>
            </div>

          ) : (

            /* ── Message list ── */
            <div className="max-w-3xl mx-auto w-full px-4 py-6 space-y-6">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg}
                  shopLogo={shop?.logo_url ?? undefined}
                  shopName={shop?.name ?? undefined}
                  displayContent={msg.id === streamingId ? streamingText : undefined}
                  isStreaming={msg.id === streamingId} />
              ))}
              {loading && <TypingIndicator />}
              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  <span className="flex-1">{error}</span>
                  <button onClick={() => setError(null)}><X size={13} /></button>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

          )}
        </div>

        {/* ── Input bar ── */}
        <div className="border-t border-slate-200 bg-white px-4 py-3 flex-shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-3 bg-white border border-slate-300 rounded-2xl px-4 py-3
              focus-within:border-[#1372e6] focus-within:ring-2 focus-within:ring-[#1372e6]/10 transition shadow-sm">
              <textarea ref={inputRef} value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={handleKeyDown}
                placeholder={t("advisor.placeholder")}
                rows={1}
                disabled={loading}
                className="flex-1 resize-none text-sm text-slate-800 placeholder-slate-400 outline-none bg-transparent min-h-[22px]" />
              <button onClick={() => handleSend()} disabled={!input.trim() || loading}
                className="flex-shrink-0 w-8 h-8 rounded-xl bg-[#1372e6] hover:bg-[#1060c9]
                  disabled:bg-slate-100 disabled:text-slate-300 text-white
                  flex items-center justify-center transition mb-0.5">
                <Send size={14} />
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 text-center">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
