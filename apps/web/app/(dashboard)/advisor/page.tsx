"use client";

import { useState, useRef, useCallback } from "react";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import { useLanguage } from "@/lib/language-context";
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
  RefreshCw, Star, X,
} from "lucide-react";

const QUICK_ACTIONS = [
  { icon: BarChart3,   label: "advisor.quick.performance", message: "Give me a complete summary of my shop's performance today and this week." },
  { icon: Package,     label: "advisor.quick.inventory",   message: "Which products are running low on stock? What should I restock urgently?" },
  { icon: DollarSign,  label: "advisor.quick.financial",   message: "Analyze my finances: revenue, expenses, and net profit." },
  { icon: TrendingUp,  label: "advisor.quick.growth",      message: "What are my top-performing products and growth opportunities?" },
  { icon: AlertCircle, label: "advisor.quick.attention",   message: "What issues need my immediate attention in my business?" },
  { icon: Star,        label: "advisor.quick.report",      message: "Generate a full business report with all insights and recommendations." },
];

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold
        ${isUser ? "bg-[#1372e6]" : "bg-gradient-to-br from-violet-500 to-purple-600"}`}>
        {isUser ? "You" : <Bot size={15} />}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm
        ${isUser
          ? "bg-[#1372e6] text-white rounded-tr-sm"
          : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm"}`}>
        <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
        <div className={`text-[10px] mt-1.5 ${isUser ? "text-blue-200" : "text-slate-400"}`}>
          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white flex-shrink-0">
        <Bot size={15} />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5 shadow-sm">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

export default function AdvisorPage() {
  const { t, lang } = useLanguage();

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
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
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

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-4 h-[calc(100vh-78px)]">

        {/* ── SIDEBAR ─────────────────────────────────────────── */}
        <aside className={`flex-shrink-0 w-60 flex-col gap-3
          ${sidebarOpen ? "flex absolute inset-0 z-40 bg-slate-50 p-4" : "hidden lg:flex"}`}>

          {/* Brand card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Sparkles size={17} className="text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">AI Business Advisor</p>
                <p className="text-[10px] text-slate-400">Higoverse AI · Free</p>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2 px-1">
              Quick Questions
            </p>
            <div className="space-y-0.5">
              {QUICK_ACTIONS.map((a) => {
                const Icon = a.icon;
                return (
                  <button key={a.label} disabled={loading}
                    onClick={() => handleSend(a.message)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-slate-600
                      hover:bg-[#EBF2FD] hover:text-[#1372e6] transition text-left disabled:opacity-40">
                    <Icon size={13} className="flex-shrink-0" />
                    {t(a.label)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conversation history */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">History</p>
              <div className="flex gap-1">
                <button onClick={loadConversations} disabled={loadingConvs}
                  className="p-1 hover:bg-slate-100 rounded-lg transition">
                  <RefreshCw size={11} className={loadingConvs ? "animate-spin text-slate-400" : "text-slate-400"} />
                </button>
                <button onClick={() => { setMessages([]); setConvId(null); setSidebarOpen(false); }}
                  className="p-1 hover:bg-slate-100 rounded-lg transition">
                  <Plus size={11} className="text-slate-400" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 space-y-0.5">
              {conversations.length === 0 && (
                <p className="text-[10px] text-slate-400 px-1 py-2">
                  {loadingConvs ? "Loading…" : "Click ↻ to load history"}
                </p>
              )}
              {conversations.map((c) => (
                <div key={c.id} onClick={() => loadConversation(c.id)}
                  className={`group flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition
                    ${convId === c.id ? "bg-[#EBF2FD] text-[#1372e6]" : "hover:bg-slate-50 text-slate-600"}`}>
                  <MessageSquare size={11} className="flex-shrink-0" />
                  <span className="text-xs truncate flex-1">{c.title || "Conversation"}</span>
                  <button onClick={(e) => handleDeleteConv(c.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 transition">
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ── MAIN CHAT ────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0">

          {/* Chat header */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 mb-3 flex items-center gap-3">
            <button onClick={() => { setSidebarOpen(!sidebarOpen); loadConversations(); }}
              className="lg:hidden p-1.5 hover:bg-slate-100 rounded-lg transition">
              <MessageSquare size={16} className="text-slate-500" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Bot size={18} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Higoverse AI Advisor</p>
              <p className="text-[10px] font-medium flex items-center gap-1 text-green-500">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                {loading ? "Thinking…" : "Online · Ready to help"}
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-3 min-h-0">
            {messages.length === 0 && !loading && (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg">
                  <Sparkles size={28} className="text-white" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{t("advisor.welcome")}</h3>
                <p className="text-sm text-slate-500 mb-6 max-w-sm leading-relaxed">{t("advisor.welcome_sub")}</p>
                <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                  {QUICK_ACTIONS.slice(0, 4).map((a) => {
                    const Icon = a.icon;
                    return (
                      <button key={a.label} onClick={() => handleSend(a.message)}
                        className="flex flex-col items-center gap-1.5 p-3 bg-slate-50 hover:bg-[#EBF2FD]
                          border border-slate-200 hover:border-[#1372e6] rounded-xl transition
                          text-xs text-slate-600 hover:text-[#1372e6] font-medium">
                        <Icon size={18} />
                        {t(a.label)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-4">
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
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3">
            <div className="flex items-end gap-2">
              <textarea ref={inputRef} value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("advisor.placeholder")}
                rows={1} style={{ maxHeight: "120px" }}
                className="flex-1 resize-none text-sm text-slate-800 placeholder-slate-400 bg-transparent border-none outline-none py-1.5"
                disabled={loading} />
              <button onClick={() => handleSend()} disabled={!input.trim() || loading}
                className="flex-shrink-0 w-9 h-9 rounded-xl bg-[#1372e6] hover:bg-[#1060c9]
                  disabled:bg-slate-200 disabled:text-slate-400 text-white flex items-center justify-center transition">
                <Send size={15} />
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 px-1">
              Enter to send · Shift+Enter for newline
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
