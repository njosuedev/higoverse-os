"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import {
  getAdminStats, getAdminShops, getAdminUsers,
  toggleShop, deleteShop, toggleUser, updateUserRole,
  type AdminStats, type AdminShop, type AdminUser,
} from "@/lib/admin-api";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  ShieldCheck, Users, Store, AlertTriangle, Trash2,
  ToggleLeft, ToggleRight, RefreshCw, ChevronDown,
  UserCog, Search, Mail, Phone, MapPin, Eye, EyeOff,
  CheckCircle, XCircle,
} from "lucide-react";

type Tab = "overview" | "shops" | "users";
type ShopSort = "newest" | "lastActive" | "name" | "users";

const LI_BLUE  = "#1372e6";
const LI_LIGHT = "#5B9DF3";
const LI_MUTED = "#A8C8F8";
const LI_GRAY  = "#C9CDD2";
const POLL_INTERVAL = 30;

// ── UTC helpers ───────────────────────────────────────────────────────────────
function parseUTC(ts: string | null | undefined): Date {
  if (!ts) return new Date(0);
  const s = ts.endsWith("Z") || ts.includes("+") ? ts : ts + "Z";
  return new Date(s);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return parseUTC(s).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}
function timeAgo(s: string | null) {
  if (!s) return "Never";
  const secs = Math.floor((Date.now() - parseUTC(s).getTime()) / 1000);
  if (secs < 5)     return "Just now";
  if (secs < 60)    return `${secs}s ago`;
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}
function isOnline(s: string | null) {
  return !!s && (Date.now() - parseUTC(s).getTime()) / 1000 < 300;
}
function wasActiveToday(s: string | null) {
  return !!s && (Date.now() - parseUTC(s).getTime()) < 86_400_000;
}
function joinedThisWeek(s: string | null) {
  return !!s && (Date.now() - parseUTC(s).getTime()) < 7 * 86_400_000;
}

// ── Donut chart with centered label overlay ───────────────────────────────────
function DonutChart({ data, total, label }: { data: { name: string; value: number; fill: string }[]; total: number; label: string }) {
  return (
    <div className="relative w-40 h-40 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={46} outerRadius={64}
            dataKey="value" paddingAngle={2} startAngle={90} endAngle={-270}>
            {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <p className="text-2xl font-bold text-gray-900 leading-none">{total}</p>
        <p className="text-xs text-gray-400 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  const [tab, setTab]                     = useState<Tab>("overview");
  const [stats, setStats]                 = useState<AdminStats | null>(null);
  const [shops, setShops]                 = useState<AdminShop[]>([]);
  const [users, setUsers]                 = useState<AdminUser[]>([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [actionId, setActionId]           = useState<string | null>(null);
  const [error, setError]                 = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [roleEdit, setRoleEdit]           = useState<{ id: string; role: string } | null>(null);
  const [shopSearch, setShopSearch]       = useState("");
  const [shopFilter, setShopFilter]       = useState<"all" | "active" | "inactive">("all");
  const [shopSort, setShopSort]           = useState<ShopSort>("newest");
  const [userSearch, setUserSearch]       = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | "admin" | "owner" | "staff">("all");
  const [expandedShop, setExpandedShop]   = useState<string | null>(null);
  const [lastUpdated, setLastUpdated]     = useState<Date | null>(null);
  const [countdown, setCountdown]         = useState(POLL_INTERVAL);
  const [ticker, setTicker]               = useState(0);
  const countdownRef                      = useRef(POLL_INTERVAL);

  useEffect(() => {
    if (!ready) return;
    if (!user) { router.replace("/login"); return; }
    if (user.role !== "admin") router.replace("/");
  }, [ready, user, router]);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const [s, sh, u] = await Promise.all([getAdminStats(), getAdminShops(), getAdminUsers()]);
      setStats(s); setShops(sh); setUsers(u);
      setLastUpdated(new Date());
      countdownRef.current = POLL_INTERVAL;
      setCountdown(POLL_INTERVAL);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load admin data");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { if (user?.role === "admin") loadAll(); }, [user, loadAll]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    const t = setInterval(() => {
      countdownRef.current -= 1;
      if (countdownRef.current <= 0) loadAll(true);
      else { setCountdown(countdownRef.current); setTicker((n) => n + 1); }
    }, 1000);
    return () => clearInterval(t);
  }, [user, loadAll]);

  void ticker;

  // ── Derived ───────────────────────────────────────────────────────────────
  const shopUsers = useMemo(() => {
    const map: Record<string, AdminUser[]> = {};
    users.forEach((u) => { if (u.shop_id) { (map[u.shop_id] ??= []).push(u); } });
    return map;
  }, [users]);

  const onlineNow   = shops.filter((s) => isOnline(s.last_seen_at)).length;
  const onlineToday = shops.filter((s) => wasActiveToday(s.last_seen_at)).length;
  const neverOnline = shops.filter((s) => !s.last_seen_at).length;
  const newThisWeek = shops.filter((s) => joinedThisWeek(s.created_at)).length;

  // ── Chart data ────────────────────────────────────────────────────────────
  const shopStatusData = stats ? [
    { name: "Active",   value: stats.active_shops,   fill: LI_BLUE  },
    { name: "Inactive", value: stats.inactive_shops, fill: LI_GRAY  },
    { name: "Online",   value: onlineNow,            fill: "#057642" },
  ] : [];

  const userRoleData = [
    { name: "Owners", value: users.filter((u) => u.role === "owner").length, fill: LI_BLUE  },
    { name: "Staff",  value: users.filter((u) => u.role === "staff").length, fill: LI_LIGHT },
    { name: "Admins", value: users.filter((u) => u.role === "admin").length, fill: "#0D4DB8" },
  ];

  const topShopsData = [...shops]
    .sort((a, b) => b.user_count - a.user_count)
    .slice(0, 8)
    .map((s) => ({
      name: (s.name ?? "—").length > 14 ? (s.name ?? "").slice(0, 13) + "…" : (s.name ?? "—"),
      users: s.user_count,
    }));

  const presenceData = [
    { name: "Online now",   value: onlineNow,   fill: "#057642" },
    { name: "Active today", value: onlineToday, fill: LI_BLUE  },
    { name: "Never seen",   value: neverOnline, fill: LI_GRAY  },
  ];

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleToggleShop = async (id: string) => {
    setActionId(id);
    try { setShops((p) => p.map((s) => s.id === id ? { ...s, is_active: !s.is_active } : s));
      const updated = await toggleShop(id);
      setShops((p) => p.map((s) => s.id === id ? updated : s));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setActionId(null); }
  };
  const handleDeleteShop = async (id: string) => {
    setActionId(id);
    try { await deleteShop(id); setShops((p) => p.filter((s) => s.id !== id)); if (expandedShop === id) setExpandedShop(null); setDeleteConfirm(null); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setActionId(null); }
  };
  const handleToggleUser = async (id: string) => {
    setActionId(id);
    try { const updated = await toggleUser(id); setUsers((p) => p.map((u) => u.id === id ? updated : u)); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setActionId(null); }
  };
  const handleRoleChange = async () => {
    if (!roleEdit) return;
    setActionId(roleEdit.id);
    try { const updated = await updateUserRole(roleEdit.id, roleEdit.role); setUsers((p) => p.map((u) => u.id === roleEdit.id ? updated : u)); setRoleEdit(null); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setActionId(null); }
  };

  if (!ready || !user || user.role !== "admin") return null;

  // ── Filtered shops / users ────────────────────────────────────────────────
  const filteredShops = shops
    .filter((s) => shopFilter === "all" || (shopFilter === "active" ? s.is_active : !s.is_active))
    .filter((s) => {
      if (!shopSearch) return true;
      const q = shopSearch.toLowerCase();
      return s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) ||
             s.owner_email?.toLowerCase().includes(q) || s.phone?.includes(q);
    })
    .sort((a, b) => {
      if (shopSort === "name")       return (a.name ?? "").localeCompare(b.name ?? "");
      if (shopSort === "users")      return b.user_count - a.user_count;
      if (shopSort === "lastActive") return parseUTC(b.last_seen_at).getTime() - parseUTC(a.last_seen_at).getTime();
      return parseUTC(b.created_at).getTime() - parseUTC(a.created_at).getTime();
    });

  const filteredUsers = users
    .filter((u) => userRoleFilter === "all" || u.role === userRoleFilter)
    .filter((u) => {
      if (!userSearch) return true;
      const q = userSearch.toLowerCase();
      return u.email?.toLowerCase().includes(q) || u.shop_name?.toLowerCase().includes(q);
    });

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "shops",    label: "Shops",   count: shops.length },
    { key: "users",    label: "Users",   count: users.length },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: "#F3F2EE" }}>
      <DashboardHeader title="Admin" />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4">

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#EBF2FD" }}>
              <ShieldCheck size={18} style={{ color: LI_BLUE }} />
            </div>
            <div>
              <h1 className="font-semibold text-gray-900 text-base leading-tight">Admin Panel</h1>
              <p className="text-xs text-gray-400">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {refreshing ? "Updating…" : `Refreshes in ${countdown}s`}
              {lastUpdated && !refreshing && <span className="text-gray-300">· {timeAgo(lastUpdated.toISOString())}</span>}
            </div>
            <button onClick={() => loadAll(true)} disabled={loading || refreshing}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 transition disabled:opacity-40 font-medium">
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-white border border-red-200 rounded-xl px-4 py-3 shadow-sm">
            <AlertTriangle size={14} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-300 hover:text-red-500">✕</button>
          </div>
        )}

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-1 py-1 flex gap-1 w-fit">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={tab === t.key
                ? { background: "#EBF2FD", color: LI_BLUE }
                : { color: "#666666" }}>
              {t.label}
              {t.count !== undefined && (
                <span className="ml-1.5 text-xs" style={{ color: tab === t.key ? LI_BLUE : "#999" }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ══ OVERVIEW ════════════════════════════════════════════════════════ */}
        {tab === "overview" && (
          <div className="space-y-4">
            {loading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-24 bg-white animate-pulse rounded-xl border border-gray-200" />
                ))}
              </div>
            ) : stats ? (
              <>
                {/* KPI row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Total Shops",   value: stats.total_shops,   sub: `${stats.active_shops} active`,  color: LI_BLUE  },
                    { label: "Total Users",   value: stats.total_users,   sub: `${stats.active_users} active`,  color: LI_BLUE  },
                    { label: "Online Now",    value: onlineNow,           sub: "shops live",                    color: "#057642" },
                    { label: "New This Week", value: newThisWeek,         sub: "new shops joined",              color: LI_BLUE  },
                  ].map((k) => (
                    <div key={k.label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                      <p className="text-xs text-gray-400 font-medium">{k.label}</p>
                      <p className="text-3xl font-bold mt-1" style={{ color: k.color }}>{k.value}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Charts row 1 */}
                <div className="grid md:grid-cols-2 gap-4">

                  {/* Donut — shops */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-800 text-sm mb-4">Shop Status</h3>
                    <div className="flex items-center gap-6">
                      <DonutChart data={shopStatusData} total={stats.total_shops} label="shops" />
                      <div className="space-y-3 flex-1">
                        {shopStatusData.map((d) => (
                          <div key={d.name}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="flex items-center gap-1.5 text-gray-600 font-medium">
                                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: d.fill }} />
                                {d.name}
                              </span>
                              <span className="font-bold text-gray-900">{d.value}</span>
                            </div>
                            <div className="h-1.5 rounded-full" style={{ background: "#F3F2EE" }}>
                              <div className="h-full rounded-full transition-all"
                                style={{ width: `${stats.total_shops ? (d.value / stats.total_shops) * 100 : 0}%`, background: d.fill }} />
                            </div>
                          </div>
                        ))}
                        <p className="text-xs text-gray-400 pt-1">
                          {stats.total_shops ? Math.round(stats.active_shops / stats.total_shops * 100) : 0}% activation rate
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Donut — users */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-800 text-sm mb-4">Users by Role</h3>
                    <div className="flex items-center gap-6">
                      <DonutChart data={userRoleData} total={stats.total_users} label="users" />
                      <div className="space-y-3 flex-1">
                        {userRoleData.map((d) => (
                          <div key={d.name}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="flex items-center gap-1.5 text-gray-600 font-medium">
                                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: d.fill }} />
                                {d.name}
                              </span>
                              <span className="font-bold text-gray-900">{d.value}</span>
                            </div>
                            <div className="h-1.5 rounded-full" style={{ background: "#F3F2EE" }}>
                              <div className="h-full rounded-full transition-all"
                                style={{ width: `${stats.total_users ? (d.value / stats.total_users) * 100 : 0}%`, background: d.fill }} />
                            </div>
                          </div>
                        ))}
                        <p className="text-xs text-gray-400 pt-1">
                          {stats.total_users ? Math.round(stats.active_users / stats.total_users * 100) : 0}% activation rate
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Charts row 2 */}
                <div className="grid md:grid-cols-2 gap-4">

                  {/* Bar — top shops by users */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-800 text-sm mb-4">Top Shops by Team Size</h3>
                    {topShopsData.length === 0 ? (
                      <p className="text-gray-400 text-xs py-8 text-center">No shops yet</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={topShopsData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                          <XAxis type="number" tick={{ fontSize: 10, fill: "#999" }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#444" }} axisLine={false} tickLine={false} width={90} />
                          <Tooltip
                            contentStyle={{ fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                            formatter={(v: unknown) => [String(v), "Users"]}
                          />
                          <Bar dataKey="users" radius={[0, 4, 4, 0]} fill={LI_BLUE} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {/* Bar — presence overview */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-800 text-sm mb-4">Shop Presence Overview</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={presenceData} margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#999" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "#999" }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                          formatter={(v: unknown, name: unknown) => [String(v), String(name)]}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {presenceData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-3 mt-2">
                      {presenceData.map((d) => (
                        <span key={d.name} className="flex items-center gap-1 text-[11px] text-gray-500">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.fill }} />
                          {d.name} ({d.value})
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Platform health */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-800 text-sm mb-4">Platform Health</h3>
                  <div className="grid sm:grid-cols-3 gap-5">
                    {[
                      { label: "Shop activation",  pct: stats.total_shops ? Math.round(stats.active_shops  / stats.total_shops  * 100) : 0, sub: `${stats.active_shops} of ${stats.total_shops}` },
                      { label: "User activation",  pct: stats.total_users ? Math.round(stats.active_users  / stats.total_users  * 100) : 0, sub: `${stats.active_users} of ${stats.total_users}` },
                      { label: "Daily engagement", pct: shops.length ? Math.round(onlineToday / shops.length * 100) : 0,                    sub: `${onlineToday} shops seen today` },
                    ].map((m) => (
                      <div key={m.label}>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-gray-500 font-medium">{m.label}</span>
                          <span className="font-bold text-gray-900">{m.pct}%</span>
                        </div>
                        <div className="h-2 rounded-full" style={{ background: "#F3F2EE" }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${m.pct}%`, background: LI_BLUE }} />
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{m.sub}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Online now + newest */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-800 text-sm mb-3 flex items-center gap-2">
                      Currently Online
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "#057642" }}>{onlineNow}</span>
                    </h3>
                    {shops.filter((s) => isOnline(s.last_seen_at)).length === 0 ? (
                      <p className="text-gray-400 text-sm py-4 text-center">No shops online right now</p>
                    ) : (
                      <div className="space-y-2">
                        {shops.filter((s) => isOnline(s.last_seen_at)).map((s) => (
                          <div key={s.id} className="flex items-center gap-2.5 p-2 rounded-lg" style={{ background: "#F3F2EE" }}>
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                            <span className="flex-1 text-sm font-medium text-gray-800 truncate">{s.name}</span>
                            <span className="text-xs text-gray-400">{timeAgo(s.last_seen_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-800 text-sm mb-3">Newest Shops</h3>
                    <div className="space-y-2">
                      {[...shops]
                        .sort((a, b) => parseUTC(b.created_at).getTime() - parseUTC(a.created_at).getTime())
                        .slice(0, 5)
                        .map((s) => (
                          <div key={s.id} className="flex items-center gap-2.5 p-2 rounded-lg" style={{ background: "#F3F2EE" }}>
                            <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold text-white shrink-0"
                              style={{ background: s.logo_url ? "transparent" : LI_BLUE }}>
                              {s.logo_url
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={s.logo_url} alt={s.name} className="w-7 h-7 object-cover" />
                                : (s.name ?? "?")[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                              <p className="text-xs text-gray-400">{fmtDate(s.created_at)}</p>
                            </div>
                            {joinedThisWeek(s.created_at) && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0"
                                style={{ background: LI_BLUE }}>NEW</span>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ══ SHOPS ═══════════════════════════════════════════════════════════ */}
        {tab === "shops" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-5 py-3.5 border-b border-gray-100">
              <div className="flex items-center gap-2 flex-wrap">
                <select value={shopSort} onChange={(e) => setShopSort(e.target.value as ShopSort)}
                  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-100">
                  <option value="newest">Newest first</option>
                  <option value="lastActive">Last active</option>
                  <option value="users">Most users</option>
                  <option value="name">Name A–Z</option>
                </select>
                <div className="flex text-xs rounded-lg overflow-hidden border border-gray-200">
                  {(["all", "active", "inactive"] as const).map((f) => (
                    <button key={f} onClick={() => setShopFilter(f)}
                      className="px-2.5 py-1.5 capitalize border-r last:border-r-0 border-gray-200 transition"
                      style={shopFilter === f ? { background: LI_BLUE, color: "#fff" } : { background: "#fff", color: "#666" }}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative ml-auto">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={shopSearch} onChange={(e) => setShopSearch(e.target.value)}
                  placeholder="Search shops…"
                  className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 w-44" />
              </div>
              <span className="text-xs text-gray-400 shrink-0">{filteredShops.length} / {shops.length}</span>
            </div>

            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-lg animate-pulse" style={{ background: "#F3F2EE" }} />
                ))}
              </div>
            ) : filteredShops.length === 0 ? (
              <p className="text-gray-400 text-sm py-12 text-center">No shops found</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {filteredShops.map((shop) => {
                  const online   = isOnline(shop.last_seen_at);
                  const busy     = actionId === shop.id;
                  const expanded = expandedShop === shop.id;
                  const members  = shopUsers[shop.id] ?? [];
                  return (
                    <div key={shop.id}>
                      <div className={`flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors ${!shop.is_active ? "opacity-55" : ""}`}>
                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-sm font-bold text-white shrink-0"
                          style={{ background: shop.logo_url ? "transparent" : online ? "#057642" : LI_BLUE }}>
                          {shop.logo_url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={shop.logo_url} alt={shop.name} className="w-10 h-10 object-cover" />
                            : (shop.name ?? "?")[0].toUpperCase()}
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900">{shop.name}</span>
                            {online && (
                              <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                                style={{ background: "#057642" }}>
                                <span className="w-1 h-1 rounded-full bg-white animate-pulse" /> LIVE
                              </span>
                            )}
                            {!shop.is_active && (
                              <span className="text-[10px] border border-red-200 text-red-500 px-1.5 py-0.5 rounded-full">Inactive</span>
                            )}
                            {joinedThisWeek(shop.created_at) && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: LI_BLUE }}>NEW</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            {shop.owner_email && <span className="text-[11px] text-gray-400">{shop.owner_email}</span>}
                            {shop.phone && <span className="flex items-center gap-1 text-[11px] text-gray-400"><Phone size={9} />{shop.phone}</span>}
                            {shop.address && <span className="flex items-center gap-1 text-[11px] text-gray-400"><MapPin size={9} />{shop.address}</span>}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="hidden md:flex items-center gap-5 shrink-0 text-xs text-gray-500">
                          <div className="text-center">
                            <p className="text-gray-400 text-[10px]">Users</p>
                            <p className="font-bold text-gray-800 text-sm">{shop.user_count}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-gray-400 text-[10px]">Last seen</p>
                            <p className="font-semibold text-gray-800">{online ? "Online" : timeAgo(shop.last_seen_at)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-gray-400 text-[10px]">Joined</p>
                            <p className="font-semibold text-gray-800">{fmtDate(shop.created_at)}</p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setExpandedShop(expanded ? null : shop.id)}
                            className="p-1.5 rounded-lg transition text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                            {expanded ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button onClick={() => handleToggleShop(shop.id)} disabled={busy}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition disabled:opacity-40 font-medium">
                            {shop.is_active ? <><ToggleRight size={12} />Disable</> : <><ToggleLeft size={12} />Enable</>}
                          </button>
                          {deleteConfirm === shop.id ? (
                            <>
                              <button onClick={() => handleDeleteShop(shop.id)} disabled={busy}
                                className="text-xs px-2.5 py-1 rounded-full bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-40 font-medium">
                                Confirm
                              </button>
                              <button onClick={() => setDeleteConfirm(null)}
                                className="text-xs px-2 py-1 rounded-full text-gray-400 hover:bg-gray-100 transition">
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button onClick={() => setDeleteConfirm(shop.id)} disabled={busy}
                              className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded */}
                      {expanded && (
                        <div className="px-5 pb-4 pt-1 border-t border-gray-100" style={{ background: "#F9F8F6" }}>
                          <div className="grid sm:grid-cols-3 gap-3 mt-2">
                            {/* Info */}
                            <div className="bg-white rounded-xl border border-gray-200 p-4">
                              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-3">Shop Info</p>
                              {shop.logo_url && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={shop.logo_url} alt={shop.name} className="w-16 h-16 rounded-xl object-cover mb-3 border border-gray-100" />
                              )}
                              <div className="space-y-2">
                                {[
                                  { icon: <Store size={11} />,  label: "Name",    value: shop.name },
                                  { icon: <Mail size={11} />,   label: "Email",   value: shop.email ?? "—" },
                                  { icon: <Phone size={11} />,  label: "Phone",   value: shop.phone ?? "—" },
                                  { icon: <MapPin size={11} />, label: "Address", value: shop.address ?? "—" },
                                ].map((d) => (
                                  <div key={d.label} className="flex items-start gap-2 text-xs">
                                    <span className="text-gray-300 mt-0.5 shrink-0">{d.icon}</span>
                                    <span className="text-gray-400 w-12 shrink-0">{d.label}</span>
                                    <span className="text-gray-700 font-medium break-all">{d.value}</span>
                                  </div>
                                ))}
                                {shop.description && (
                                  <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-2 mt-1">{shop.description}</p>
                                )}
                              </div>
                            </div>

                            {/* Activity */}
                            <div className="bg-white rounded-xl border border-gray-200 p-4">
                              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-3">Activity</p>
                              <div className="space-y-2 text-xs">
                                {[
                                  { label: "Status",      value: online ? "Online" : "Offline",   highlight: online },
                                  { label: "Last seen",   value: timeAgo(shop.last_seen_at) },
                                  { label: "Exact time",  value: shop.last_seen_at ? parseUTC(shop.last_seen_at).toLocaleString() : "Never" },
                                  { label: "Active today",value: wasActiveToday(shop.last_seen_at) ? "Yes" : "No", highlight: wasActiveToday(shop.last_seen_at) },
                                  { label: "Joined",      value: fmtDate(shop.created_at) },
                                  { label: "Updated",     value: fmtDate(shop.updated_at) },
                                ].map((r) => (
                                  <div key={r.label} className="flex justify-between gap-2">
                                    <span className="text-gray-400">{r.label}</span>
                                    <span className={`font-medium ${r.highlight ? "text-green-700" : "text-gray-700"}`}>{r.value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Users */}
                            <div className="bg-white rounded-xl border border-gray-200 p-4">
                              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-3 flex items-center gap-1.5">
                                Team Members <span className="font-bold text-gray-600 normal-case">{members.length}</span>
                              </p>
                              {members.length === 0 ? (
                                <p className="text-gray-400 text-xs py-3 text-center">No users assigned</p>
                              ) : (
                                <div className="space-y-2">
                                  {members.map((m) => (
                                    <div key={m.id} className="flex items-center gap-2 text-xs">
                                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                        style={{ background: LI_BLUE }}>
                                        {m.email[0].toUpperCase()}
                                      </div>
                                      <span className="flex-1 text-gray-700 truncate">{m.email}</span>
                                      <span className="text-gray-400 capitalize shrink-0">{m.role}</span>
                                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.is_active ? "bg-green-500" : "bg-gray-200"}`} />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ USERS ═══════════════════════════════════════════════════════════ */}
        {tab === "users" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-5 py-3.5 border-b border-gray-100">
              <div className="flex text-xs rounded-lg overflow-hidden border border-gray-200">
                {(["all", "admin", "owner", "staff"] as const).map((r) => (
                  <button key={r} onClick={() => setUserRoleFilter(r)}
                    className="px-2.5 py-1.5 capitalize border-r last:border-r-0 border-gray-200 transition"
                    style={userRoleFilter === r ? { background: LI_BLUE, color: "#fff" } : { background: "#fff", color: "#666" }}>
                    {r}
                  </button>
                ))}
              </div>
              <div className="relative ml-auto">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users…"
                  className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 w-44" />
              </div>
              <span className="text-xs text-gray-400 shrink-0">{filteredUsers.length} / {users.length}</span>
            </div>

            {/* Header */}
            <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-5 py-2 border-b border-gray-100" style={{ background: "#F9F8F6" }}>
              {["User", "Shop", "Role", "Status", "Actions"].map((h) => (
                <span key={h} className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</span>
              ))}
            </div>

            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: "#F3F2EE" }} />
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <p className="text-gray-400 text-sm py-12 text-center">No users found</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {filteredUsers.map((u) => {
                  const isMe = u.id === user?.id;
                  const busy = actionId === u.id;
                  return (
                    <div key={u.id}
                      className={`grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 items-center px-5 py-3 hover:bg-gray-50 transition ${!u.is_active ? "opacity-50" : ""}`}>
                      <div className="min-w-0 flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ background: LI_BLUE }}>
                          {u.email[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{u.email}</p>
                          <p className="text-[10px] text-gray-400">{fmtDate(u.created_at)}</p>
                        </div>
                      </div>
                      <div className="min-w-0">
                        {u.shop_name
                          ? <p className="text-xs text-gray-600 truncate">{u.shop_name}</p>
                          : <p className="text-xs text-gray-300">—</p>}
                      </div>
                      <div className="shrink-0">
                        {roleEdit?.id === u.id ? (
                          <div className="flex items-center gap-1">
                            <div className="relative">
                              <select value={roleEdit.role} onChange={(e) => setRoleEdit({ id: u.id, role: e.target.value })}
                                className="text-xs border border-gray-300 rounded-lg px-2 py-1 pr-5 appearance-none focus:outline-none bg-white">
                                <option value="admin">admin</option>
                                <option value="owner">owner</option>
                                <option value="staff">staff</option>
                              </select>
                              <ChevronDown size={9} className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            </div>
                            <button onClick={handleRoleChange} disabled={busy}
                              className="text-xs px-2 py-1 rounded-lg text-white font-medium transition disabled:opacity-40"
                              style={{ background: LI_BLUE }}>Save</button>
                            <button onClick={() => setRoleEdit(null)} className="text-xs text-gray-400 hover:text-gray-600 px-1">✕</button>
                          </div>
                        ) : (
                          <span className="text-xs font-medium capitalize text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">{u.role}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {u.is_active
                          ? <CheckCircle size={13} className="text-green-500" />
                          : <XCircle size={13} className="text-gray-300" />}
                        <span className="text-xs text-gray-500">{u.is_active ? "Active" : "Inactive"}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!isMe ? (
                          <>
                            <button onClick={() => handleToggleUser(u.id)} disabled={busy}
                              className="flex items-center gap-0.5 text-xs px-2.5 py-1 rounded-full border border-gray-300 text-gray-600 hover:border-gray-400 font-medium transition disabled:opacity-40">
                              {u.is_active ? <><ToggleRight size={11} />Disable</> : <><ToggleLeft size={11} />Enable</>}
                            </button>
                            <button onClick={() => setRoleEdit({ id: u.id, role: u.role })} disabled={busy || roleEdit?.id === u.id}
                              className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition disabled:opacity-40"
                              title="Change role">
                              <UserCog size={12} />
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-gray-300">you</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

