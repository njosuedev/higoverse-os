"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import {
  sendChat,
  getSubscription,
  getConversations,
  getMessages,
  deleteConversation,
  getPlans,
  upgradePlan,
  type ChatMessage,
  type Conversation,
  type Subscription,
  type Plan,
} from "@/lib/advisor-api";
import {
  Bot, Send, Sparkles, BarChart3, Package, DollarSign, TrendingUp,
  MessageSquare, Trash2, Plus, ChevronRight, AlertCircle, Crown,
  Zap, Star, Infinity, RefreshCw, X, Check,
} from "lucide-react";

const QUICK_ACTIONS = [
  { icon: BarChart3,   label: "advisor.quick.performance",  message: "Give me a complete summary of my shop's performance today and this week." },
  { icon: Package,     label: "advisor.quick.inventory",    message: "Which products are running low on stock? What should I restock urgently?" },
  { icon: DollarSign,  label: "advisor.quick.financial",    message: "Analyze my finances: revenue, expenses, and net profit. Where am I spending the most?" },
  { icon: TrendingUp,  label: "advisor.quick.growth",       message: "What are my top-performing products and what should I focus on to grow revenue this month?" },
  { icon: AlertCircle, label: "advisor.quick.attention",    message: "What issues need my immediate attention? Any red flags in my business data?" },
  { icon: Star,        label: "advisor.quick.report",       message: "Generate a full business report: sales trends, inventory health, financial overview, and top recommendations." },
];

const PLAN_ICONS: Record<string, React.ReactNode> = {
  trial:      <Zap size={12} />,
  basic:      <Star size={12} />,
  pro:        <Crown size={12} />,
  enterprise: <Infinity size={12} />,
};

const PLAN_COLORS: Record<string, string> = {
  trial:      "bg-slate-100 text-slate-600",
  basic:      "bg-blue-100 text-blue-700",
  pro:        "bg-purple-100 text-purple-700",
  enterprise: "bg-amber-100 text-amber-700",
};

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold
        ${isUser ? "bg-[#1372e6]" : "bg-gradient-to-br from-violet-500 to-purple-600"}`}>
        {isUser ? "You" : <Bot size={15} />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm
        ${isUser
          ? "bg-[#1372e6] text-white rounded-tr-sm"
          : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm"}`}
      >
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
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white">
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

function UsageMeter({ sub }: { sub: Subscription | null }) {
  if (!sub) return null;
  const pct = sub.messages_limit === -1 ? 0 : Math.min(100, (sub.messages_used / sub.messages_limit) * 100);
  const barColor = pct > 85 ? "bg-red-500" : pct > 60 ? "bg-amber-500" : "bg-[#1372e6]";

  return (
    <div className="px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-200">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Messages</span>
        <span className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${PLAN_COLORS[sub.plan] || PLAN_COLORS.trial}`}>
          {PLAN_ICONS[sub.plan]}
          {sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)}
        </span>
      </div>
      {sub.messages_limit === -1 ? (
        <p className="text-xs text-slate-600 font-medium">Unlimited messages</p>
      ) : (
        <>
          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-slate-500">{sub.messages_used} used</span>
            <span className="text-[10px] text-slate-500">{sub.messages_remaining} left</span>
          </div>
        </>
      )}
      {sub.trial_ends_at && sub.status === "trial" && (
        <p className="text-[10px] text-amber-600 font-medium mt-1.5">
          Trial ends {new Date(sub.trial_ends_at).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

function UpgradeModal({
  plans,
  onClose,
  onUpgrade,
  upgrading,
}: {
  plans: Plan[];
  onClose: () => void;
  onUpgrade: (plan: string) => void;
  upgrading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-900 text-lg">Upgrade AI Advisor</h2>
            <p className="text-xs text-slate-500 mt-0.5">Choose a plan to continue</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {plans.filter(p => p.id !== "trial").map((plan) => (
            <div key={plan.id}
              className="border border-slate-200 rounded-xl p-4 hover:border-[#1372e6] hover:bg-[#EBF2FD] transition cursor-pointer group"
              onClick={() => !upgrading && onUpgrade(plan.id)}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${PLAN_COLORS[plan.id]}`}>
                      {PLAN_ICONS[plan.id]}
                      {plan.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">
                    {plan.messages === -1 ? "Unlimited messages" : `${plan.messages} messages/month`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900 text-sm">{plan.price_monthly}</p>
                  <ChevronRight size={14} className="text-slate-400 ml-auto mt-1 group-hover:text-[#1372e6] transition" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-center text-[10px] text-slate-400 pb-4">
          Contact support to activate a plan: payments processed manually.
        </p>
      </div>
    </div>
  );
}

export default function AdvisorPage() {
  const { t, lang } = useLanguage();
  const { user }    = useAuth();

  const [messages,       setMessages]       = useState<ChatMessage[]>([]);
  const [input,          setInput]          = useState("");
  const [loading,        setLoading]        = useState(false);
  const [convId,         setConvId]         = useState<string | null>(null);
  const [conversations,  setConversations]  = useState<Conversation[]>([]);
  const [subscription,   setSubscription]   = useState<Subscription | null>(null);
  const [plans,          setPlans]          = useState<Plan[]>([]);
  const [error,          setError]          = useState<string | null>(null);
  const [showUpgrade,    setShowUpgrade]    = useState(false);
  const [upgrading,      setUpgrading]      = useState(false);
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [loadingConvs,   setLoadingConvs]   = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  useEffect(() => {
    getSubscription()
      .then(setSubscription)
      .catch(() => {});
    getPlans().then(setPlans).catch(() => {});
  }, []);

  async function loadConversations() {
    setLoadingConvs(true);
    try {
      const list = await getConversations();
      setConversations(list);
    } catch {}
    setLoadingConvs(false);
  }

  async function loadConversation(id: string) {
    try {
      const msgs = await getMessages(id);
      setMessages(msgs);
      setConvId(id);
      setSidebarOpen(false);
    } catch {
      setError("Failed to load conversation.");
    }
  }

  async function handleDeleteConv(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (convId === id) { setMessages([]); setConvId(null); }
    } catch {}
  }

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    setInput("");
    setError(null);

    const optimisticUser: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: msg,
      language: lang,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setLoading(true);

    try {
      const res = await sendChat(msg, convId, lang);

      const aiMsg: ChatMessage = {
        id: res.message_id,
        role: "assistant",
        content: res.reply,
        language: res.language,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, aiMsg]);
      setConvId(res.conversation_id);

      // Update usage counters
      setSubscription((prev) =>
        prev
          ? { ...prev, messages_used: res.messages_used, messages_remaining: res.messages_remaining }
          : prev
      );
    } catch (err: any) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
      if (err?.status === 402) {
        setShowUpgrade(true);
      } else {
        setError(err?.message || "Failed to get a response. Please try again.");
      }
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  async function handleUpgrade(plan: string) {
    setUpgrading(true);
    try {
      await upgradePlan(plan);
      const sub = await getSubscription();
      setSubscription(sub);
      setShowUpgrade(false);
    } catch (err: any) {
      setError(err?.message || "Upgrade failed. Please contact support.");
    } finally {
      setUpgrading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const isBlocked = subscription && !subscription.is_active;

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader title="AI Advisor" />

      {showUpgrade && plans.length > 0 && (
        <UpgradeModal plans={plans} onClose={() => setShowUpgrade(false)}
          onUpgrade={handleUpgrade} upgrading={upgrading} />
      )}

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-4 h-[calc(100vh-78px)]">

        {/* ── SIDEBAR ───────────────────────────────────────────────── */}
        <aside className={`
          flex-shrink-0 w-64 flex flex-col gap-3
          ${sidebarOpen ? "flex" : "hidden lg:flex"}
          absolute lg:relative inset-0 lg:inset-auto z-40 bg-slate-50 p-4 lg:p-0
        `}>
          {/* Subscription card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Sparkles size={16} className="text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">AI Business Advisor</p>
                <p className="text-[10px] text-slate-500">Powered by Claude</p>
              </div>
            </div>
            <UsageMeter sub={subscription} />
            {(isBlocked || (subscription && subscription.messages_remaining <= 5 && subscription.messages_remaining >= 0)) && (
              <button
                onClick={() => setShowUpgrade(true)}
                className="w-full mt-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white text-xs font-semibold py-2 rounded-xl transition"
              >
                {isBlocked ? "Upgrade to Continue" : "Upgrade Plan"}
              </button>
            )}
          </div>

          {/* Quick actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2 px-1">
              Quick Questions
            </p>
            <div className="space-y-1">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={() => handleSend(action.message)}
                    disabled={loading || !!isBlocked}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-slate-600 hover:bg-[#EBF2FD] hover:text-[#1372e6] transition text-left disabled:opacity-40"
                  >
                    <Icon size={13} className="flex-shrink-0" />
                    {t(action.label)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conversations */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">History</p>
              <div className="flex items-center gap-1">
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
            <div className="overflow-y-auto flex-1 space-y-1">
              {conversations.length === 0 && (
                <p className="text-[10px] text-slate-400 px-1 py-2">
                  {loadingConvs ? "Loading…" : "Click ↻ to load history"}
                </p>
              )}
              {conversations.map((c) => (
                <div key={c.id}
                  onClick={() => loadConversation(c.id)}
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

        {/* ── MAIN CHAT ─────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0">

          {/* Chat header */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => { setSidebarOpen(!sidebarOpen); loadConversations(); }}
                className="lg:hidden p-1.5 hover:bg-slate-100 rounded-lg transition">
                <MessageSquare size={16} className="text-slate-500" />
              </button>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Bot size={18} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Higoverse AI Advisor</p>
                <p className="text-[10px] text-green-500 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  {loading ? "Thinking…" : "Online · Ready to help"}
                </p>
              </div>
            </div>
            {subscription && (
              <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${PLAN_COLORS[subscription.plan]}`}>
                {PLAN_ICONS[subscription.plan]}
                {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)}
              </div>
            )}
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-3 min-h-0">

            {/* Welcome state */}
            {messages.length === 0 && !loading && (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg">
                  <Sparkles size={28} className="text-white" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{t("advisor.welcome")}</h3>
                <p className="text-sm text-slate-500 mb-6 max-w-sm leading-relaxed">
                  {t("advisor.welcome_sub")}
                </p>
                {isBlocked ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 max-w-sm">
                    <p className="text-sm text-amber-800 font-medium">{t("advisor.trial_ended")}</p>
                    <button onClick={() => setShowUpgrade(true)}
                      className="mt-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold px-4 py-2 rounded-lg w-full transition hover:opacity-90">
                      {t("advisor.upgrade_now")}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                    {QUICK_ACTIONS.slice(0, 4).map((action) => {
                      const Icon = action.icon;
                      return (
                        <button key={action.label}
                          onClick={() => handleSend(action.message)}
                          className="flex flex-col items-center gap-1.5 p-3 bg-slate-50 hover:bg-[#EBF2FD] border border-slate-200 hover:border-[#1372e6] rounded-xl transition text-xs text-slate-600 hover:text-[#1372e6] font-medium">
                          <Icon size={18} />
                          {t(action.label)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Messages */}
            <div className="space-y-4">
              {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
              {loading && <TypingIndicator />}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-3 text-sm text-red-700">
              <AlertCircle size={14} className="flex-shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="hover:text-red-900">
                <X size={13} />
              </button>
            </div>
          )}

          {/* Input area */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3">
            {isBlocked ? (
              <div className="flex items-center gap-3 text-center justify-center py-2">
                <p className="text-sm text-slate-500">{t("advisor.subscription_required")}</p>
                <button onClick={() => setShowUpgrade(true)}
                  className="bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition hover:opacity-90">
                  Upgrade
                </button>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t("advisor.placeholder")}
                  rows={1}
                  style={{ maxHeight: "120px" }}
                  className="flex-1 resize-none text-sm text-slate-800 placeholder-slate-400 bg-transparent border-none outline-none py-1.5"
                  disabled={loading}
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || loading}
                  className="flex-shrink-0 w-9 h-9 rounded-xl bg-[#1372e6] hover:bg-[#1060c9] disabled:bg-slate-200 disabled:text-slate-400 text-white flex items-center justify-center transition"
                >
                  <Send size={15} />
                </button>
              </div>
            )}
            <div className="flex items-center justify-between mt-2 px-1">
              <p className="text-[10px] text-slate-400">
                {t("advisor.powered_by")} · Enter to send · Shift+Enter for newline
              </p>
              {subscription && subscription.messages_limit !== -1 && (
                <p className="text-[10px] text-slate-400">
                  {subscription.messages_remaining} {t("advisor.messages_left")}
                </p>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
