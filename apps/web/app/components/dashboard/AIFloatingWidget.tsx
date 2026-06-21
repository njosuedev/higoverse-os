"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/language-context";
import { useShop } from "@/lib/shop-context";
import { sendChat, type ChatMessage } from "@/lib/advisor-api";
import { playAIResponse } from "@/lib/sound";
import { Bot, Send, X, Sparkles, User, AlertCircle } from "lucide-react";

function TypingDots() {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white flex-shrink-0">
        <Sparkles size={13} className="animate-pulse" />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-3 py-2.5 flex items-center gap-1 shadow-sm">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </div>
    </div>
  );
}

function Bubble({ msg, shopLogo, shopName }: { msg: ChatMessage; shopLogo?: string; shopName?: string }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className="flex-shrink-0 w-7 h-7 rounded-xl overflow-hidden">
        {isUser ? (
          shopLogo ? (
            <img src={shopLogo} alt={shopName ?? "Shop"} className="w-full h-full object-cover"
              onError={(e) => {
                const el = e.currentTarget as HTMLImageElement;
                el.style.display = "none";
                el.parentElement!.classList.add("bg-[#1372e6]", "flex", "items-center", "justify-center");
              }} />
          ) : (
            <div className="w-full h-full bg-[#1372e6] flex items-center justify-center">
              <User size={12} className="text-white" />
            </div>
          )
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Sparkles size={12} className="text-white" />
          </div>
        )}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm
        ${isUser ? "bg-[#1372e6] text-white rounded-tr-sm" : "bg-white border border-slate-200 text-slate-700 rounded-tl-sm"}`}>
        <pre className="whitespace-pre-wrap font-sans text-[11.5px] leading-relaxed">{msg.content}</pre>
      </div>
    </div>
  );
}

export default function AIFloatingWidget() {
  const pathname  = usePathname();
  const { lang }  = useLanguage();
  const { shop }  = useShop();

  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [convId,   setConvId]   = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [pulsing,  setPulsing]  = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  const scroll = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  useEffect(() => {
    if (open) {
      scroll();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, scroll]);

  // Pulse the button when first rendered to draw attention
  useEffect(() => {
    const t = setTimeout(() => setPulsing(true), 3000);
    const t2 = setTimeout(() => setPulsing(false), 6000);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, []);

  // Don't render on the full advisor page — all hooks are already called above
  if (pathname === "/advisor") return null;

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    setError(null);

    const opt: ChatMessage = {
      id: `tmp-${Date.now()}`, role: "user", content: msg,
      language: lang, created_at: new Date().toISOString(),
    };
    setMessages((p) => [...p, opt]);
    setLoading(true);
    scroll();

    try {
      const res = await sendChat(msg, convId, lang);
      const ai: ChatMessage = {
        id: res.message_id || `ai-${Date.now()}`, role: "assistant",
        content: res.reply, language: res.language,
        created_at: new Date().toISOString(),
      };
      setMessages((p) => [...p, ai]);
      setConvId(res.conversation_id);
      playAIResponse();
      scroll();
    } catch (err: any) {
      setMessages((p) => p.filter((m) => m.id !== opt.id));
      setError(err?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const QUICK = [
    { label: "📊 Today's performance", msg: "How is my business performing today?" },
    { label: "📦 Low stock items",      msg: "Which products are running low on stock?" },
    { label: "💰 Financial snapshot",   msg: "Give me a quick financial overview." },
  ];

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">

      {/* Chat panel */}
      {open && (
        <div className="w-[360px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          style={{ height: "480px" }}>

          {/* Header */}
          <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-4 py-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <Bot size={16} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">Higoverse AI</p>
              <p className="text-[10px] text-purple-200 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${loading ? "bg-amber-300 animate-pulse" : "bg-green-400"}`} />
                {loading ? "Thinking…" : "Ready to help"}
              </p>
            </div>
            <button onClick={() => setOpen(false)}
              className="p-1 hover:bg-white/20 rounded-lg transition text-white">
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4 pb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-3 shadow-lg">
                  <Sparkles size={22} className="text-white" />
                </div>
                <p className="text-xs font-semibold text-slate-700 mb-1">Ask me anything about your shop!</p>
                <p className="text-[10px] text-slate-400 mb-4">Performance · Inventory · Finances · Growth</p>
                <div className="space-y-1.5 w-full">
                  {QUICK.map((q) => (
                    <button key={q.label} onClick={() => send(q.msg)}
                      className="w-full text-left text-[11px] font-medium px-3 py-2 bg-white hover:bg-violet-50
                        border border-slate-200 hover:border-violet-300 rounded-xl text-slate-600
                        hover:text-violet-700 transition">
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <Bubble key={m.id} msg={m}
                shopLogo={shop?.logo_url ?? undefined}
                shopName={shop?.name ?? undefined} />
            ))}
            {loading && <TypingDots />}
            {error && (
              <div className="flex items-center gap-1.5 text-red-600 text-[11px] bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <AlertCircle size={12} />
                <span className="flex-1">{error}</span>
                <button onClick={() => setError(null)}><X size={11} /></button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-200 bg-white px-3 py-2.5 flex items-center gap-2">
            <input ref={inputRef} value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Ask your AI advisor…"
              disabled={loading}
              className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2
                outline-none focus:border-violet-400 focus:bg-white transition placeholder-slate-400 text-slate-800" />
            <button onClick={() => send()} disabled={!input.trim() || loading}
              className="w-8 h-8 rounded-xl bg-[#1372e6] hover:bg-[#1060c9]
                disabled:bg-slate-200 disabled:text-slate-400 text-white
                flex items-center justify-center transition flex-shrink-0">
              <Send size={13} />
            </button>
          </div>
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`relative w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700
          text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center
          ${pulsing ? "ring-4 ring-violet-400 ring-opacity-60" : ""}`}>
        {open ? <X size={22} /> : <Sparkles size={22} />}
        {!open && messages.length === 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full
            border-2 border-white flex items-center justify-center text-[8px] font-bold text-white">
            AI
          </span>
        )}
        {!open && messages.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full
            border-2 border-white flex items-center justify-center text-[9px] font-bold text-white">
            {messages.filter(m => m.role === "assistant").length}
          </span>
        )}
      </button>
    </div>
  );
}
