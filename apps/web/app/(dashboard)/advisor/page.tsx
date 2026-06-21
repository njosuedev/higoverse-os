"use client";

import { useState, useRef, useCallback } from "react";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import { useLanguage } from "@/lib/language-context";
import { useShop } from "@/lib/shop-context";
import { Store } from "lucide-react";
import {
  sendChat,
  getConversations,
  getMessages,
  deleteConversation,
  type ChatMessage,
  type Conversation,
} from "@/lib/advisor-api";
import {
  Bot, Send, Sparkles, BarChart3, Package, DollarSign,
  TrendingUp, MessageSquare, Trash2, Plus, AlertCircle,
  RefreshCw, Star, X, Zap, ShoppingCart, User,
} from "lucide-react";

const QUICK_ACTIONS = [
  {
    icon: BarChart3, label: "advisor.quick.performance",
    message: "How is my business performing today?",
    color: "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-400",
    iconBg: "bg-blue-100 text-blue-600",
  },
  {
    icon: Package, label: "advisor.quick.inventory",
    message: "Which products are running low on stock? What should I restock urgently?",
    color: "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100 hover:border-orange-400",
    iconBg: "bg-orange-100 text-orange-600",
  },
  {
    icon: DollarSign, label: "advisor.quick.financial",
    message: "Give me a complete financial overview — revenue, expenses, and profit.",
    color: "bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:border-green-400",
    iconBg: "bg-green-100 text-green-600",
  },
  {
    icon: TrendingUp, label: "advisor.quick.growth",
    message: "What are my top-performing products and growth opportunities?",
    color: "bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100 hover:border-violet-400",
    iconBg: "bg-violet-100 text-violet-600",
  },
  {
    icon: ShoppingCart, label: "advisor.quick.attention",
    message: "Show me my sales analysis for today and this week.",
    color: "bg-cyan-50 border-cyan-200 text-cyan-700 hover:bg-cyan-100 hover:border-cyan-400",
    iconBg: "bg-cyan-100 text-cyan-600",
  },
  {
    icon: Star, label: "advisor.quick.report",
    message: "Generate a full business report with all insights and recommendations.",
    color: "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 hover:border-amber-400",
    iconBg: "bg-amber-100 text-amber-600",
  },
];

/* Render message text with emoji lines styled as sections */
function MessageText({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;

        // Section header line (starts with emoji + uppercase or ends with colon)
        const isSectionHeader = /^[📊💰📦🛒📈📋🏆⚡💡🚀🏥🧠💸🚚🕐🧾📅📂]/.test(trimmed) &&
          (trimmed.endsWith(":") || trimmed === trimmed.toUpperCase() || trimmed.length < 60);

        // Bullet/list line
        const isBullet = trimmed.startsWith("•") || trimmed.startsWith("-") || /^\d+[.️⃣]/.test(trimmed);
        const isNumbered = /^[1-9][️⃣]/.test(trimmed);
        const isSeparator = /^[─━=]{3,}$/.test(trimmed);

        if (isSeparator) {
          return <div key={i} className="border-t border-current opacity-20 my-2" />;
        }
        if (isSectionHeader && !isBullet) {
          return (
            <p key={i} className="font-semibold text-[13px] mt-3 first:mt-0">{trimmed}</p>
          );
        }
        if (isNumbered) {
          return (
            <p key={i} className="text-[13px] leading-relaxed pl-1">{trimmed}</p>
          );
        }
        if (isBullet) {
          return (
            <p key={i} className="text-[13px] leading-relaxed pl-2">{trimmed}</p>
          );
        }
        return (
          <p key={i} className="text-[13px] leading-relaxed">{trimmed}</p>
        );
      })}
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>

      {/* Avatar */}
      <div className={`flex-shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center shadow-sm
        ${isUser
          ? "bg-[#1372e6] text-white"
          : "bg-gradient-to-br from-violet-500 to-purple-600 text-white"}`}>
        {isUser ? <User size={16} /> : <Sparkles size={16} />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm
        ${isUser
          ? "bg-[#1372e6] text-white rounded-tr-sm"
          : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm"}`}>
        <MessageText content={msg.content} />
        <div className={`text-[10px] mt-2 ${isUser ? "text-blue-200 text-right" : "text-slate-400"}`}>
          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shadow-sm flex-shrink-0">
        <Sparkles size={16} className="animate-pulse" />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3.5 flex items-center gap-1.5 shadow-sm">
        <span className="text-[11px] text-slate-400 mr-1">Thinking</span>
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"
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

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const scrollBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
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

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    setInput("");
    setError(null);

    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`, role: "user", content: msg,
      language: lang, created_at: new Date().toISOString(),
    };
    setMessages((p) => [...p, optimistic]);
    setLoading(true);
    scrollBottom();

    try {
      const res = await sendChat(msg, convId, lang);
      const ai: ChatMessage = {
        id: res.message_id || `ai-${Date.now()}`, role: "assistant",
        content: res.reply, language: res.language,
        created_at: new Date().toISOString(),
      };
      setMessages((p) => [...p, ai]);
      setConvId(res.conversation_id);
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
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader title="AI Advisor" />

      <div className="max-w-7xl mx-auto px-4 py-5 flex gap-4 h-[calc(100vh-78px)]">

        {/* ── SIDEBAR ─────────────────────────────────────────── */}
        <aside className={`flex-shrink-0 w-64 flex-col gap-3
          ${sidebarOpen ? "flex absolute inset-0 z-40 bg-slate-50 p-4" : "hidden lg:flex"}`}>

          {/* Brand */}
          <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-4 shadow-lg text-white">
            <div className="flex items-center gap-3 mb-2">
              {shop?.logo_url ? (
                <img src={shop.logo_url} alt={shop.name}
                  className="w-9 h-9 rounded-xl object-cover border-2 border-white/30 shadow"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Sparkles size={18} />
                </div>
              )}
              <div>
                <p className="text-sm font-bold">{shop?.name ?? "AI Advisor"}</p>
                <p className="text-[10px] text-purple-200">Higoverse AI · Free</p>
              </div>
            </div>
            <p className="text-[11px] text-purple-200 leading-relaxed">
              Your intelligent business companion — real-time insights from your shop data.
            </p>
          </div>

          {/* Quick actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2.5 px-1 flex items-center gap-1.5">
              <Zap size={10} /> Quick Questions
            </p>
            <div className="space-y-1">
              {QUICK_ACTIONS.map((a) => {
                const Icon = a.icon;
                return (
                  <button key={a.label} disabled={loading}
                    onClick={() => handleSend(a.message)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs
                      border transition text-left disabled:opacity-40 ${a.color}`}>
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${a.iconBg}`}>
                      <Icon size={12} />
                    </span>
                    <span className="font-medium">{t(a.label)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* History */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <MessageSquare size={10} /> History
              </p>
              <div className="flex gap-1">
                <button onClick={loadConversations} disabled={loadingConvs}
                  title="Refresh history"
                  className="p-1.5 hover:bg-slate-100 rounded-lg transition">
                  <RefreshCw size={11} className={loadingConvs ? "animate-spin text-slate-400" : "text-slate-400"} />
                </button>
                <button onClick={() => { setMessages([]); setConvId(null); setSidebarOpen(false); }}
                  title="New chat"
                  className="p-1.5 hover:bg-slate-100 rounded-lg transition">
                  <Plus size={11} className="text-slate-400" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 space-y-0.5">
              {conversations.length === 0 && (
                <p className="text-[10px] text-slate-400 px-1 py-3 text-center">
                  {loadingConvs ? "Loading…" : "Click ↻ to load history"}
                </p>
              )}
              {conversations.map((c) => (
                <div key={c.id} onClick={() => loadConversation(c.id)}
                  className={`group flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition
                    ${convId === c.id ? "bg-violet-50 text-violet-700 border border-violet-200" : "hover:bg-slate-50 text-slate-600"}`}>
                  <MessageSquare size={11} className="flex-shrink-0 opacity-60" />
                  <span className="text-xs truncate flex-1 font-medium">{c.title || "Chat"}</span>
                  <button onClick={(e) => handleDeleteConv(c.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 transition">
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ── CHAT MAIN ─────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0">

          {/* Header */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 mb-3 flex items-center gap-3">
            <button onClick={() => { setSidebarOpen(!sidebarOpen); loadConversations(); }}
              className="lg:hidden p-1.5 hover:bg-slate-100 rounded-lg transition">
              <MessageSquare size={16} className="text-slate-500" />
            </button>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
              <Bot size={20} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-900">Higoverse AI Advisor</p>
              <p className="text-[10px] font-medium flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${loading ? "bg-amber-400 animate-pulse" : "bg-green-500"}`} />
                <span className={loading ? "text-amber-500" : "text-green-500"}>
                  {loading ? "Analyzing your data…" : "Online · Ready to help"}
                </span>
              </p>
            </div>
            {/* Shop identity */}
            {shop && (
              <div className="hidden sm:flex items-center gap-2 border border-slate-200 rounded-xl px-2.5 py-1.5 bg-slate-50">
                {shop.logo_url ? (
                  <img src={shop.logo_url} alt={shop.name}
                    className="w-6 h-6 rounded-lg object-cover border border-slate-200"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#1372e6] to-blue-700 flex items-center justify-center">
                    <Store size={11} className="text-white" />
                  </div>
                )}
                <span className="text-xs font-semibold text-slate-700 max-w-[120px] truncate">{shop.name}</span>
              </div>
            )}
            {convId && (
              <button onClick={() => { setMessages([]); setConvId(null); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 transition">
                <Plus size={12} /> New chat
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-3 min-h-0">
            {messages.length === 0 && !loading && (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-xl">
                    <Sparkles size={34} className="text-white" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
                    <span className="text-white text-[9px] font-bold">AI</span>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  {t("advisor.welcome")}
                </h3>
                <p className="text-sm text-slate-500 mb-8 max-w-sm leading-relaxed">
                  {t("advisor.welcome_sub")}
                </p>
                <div className="grid grid-cols-2 gap-2.5 w-full max-w-md">
                  {QUICK_ACTIONS.slice(0, 4).map((a) => {
                    const Icon = a.icon;
                    return (
                      <button key={a.label} onClick={() => handleSend(a.message)}
                        className={`flex items-center gap-2.5 p-3 rounded-2xl border transition text-left ${a.color}`}>
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${a.iconBg}`}>
                          <Icon size={15} />
                        </span>
                        <span className="text-xs font-semibold leading-tight">{t(a.label)}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400 mt-6">
                  Or just say <span className="font-semibold text-violet-500">"Hi"</span> to start a conversation 👋
                </p>
              </div>
            )}

            <div className="space-y-5">
              {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
              {loading && <TypingIndicator />}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-3 text-sm text-red-700">
              <AlertCircle size={14} className="flex-shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)}><X size={13} /></button>
            </div>
          )}

          {/* Input */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5">
            <div className="flex items-end gap-3">
              <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 mb-0.5">
                <User size={15} className="text-slate-500" />
              </div>
              <textarea ref={inputRef} value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={handleKeyDown}
                placeholder={t("advisor.placeholder")}
                rows={1}
                className="flex-1 resize-none text-sm text-slate-800 placeholder-slate-400
                  bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 outline-none
                  focus:border-violet-400 focus:bg-white transition min-h-[40px]"
                disabled={loading} />
              <button onClick={() => handleSend()} disabled={!input.trim() || loading}
                className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#1372e6] hover:bg-[#1060c9]
                  disabled:bg-slate-200 disabled:text-slate-400 text-white flex items-center justify-center
                  transition shadow-sm mb-0.5">
                <Send size={16} />
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 pl-11">
              Enter to send · Shift+Enter for newline
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
