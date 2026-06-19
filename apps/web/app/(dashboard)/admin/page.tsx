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
  ShieldCheck, Users, Store, AlertTriangle, Trash2,
  ToggleLeft, ToggleRight, RefreshCw, ChevronDown,
  UserCog, Search, Mail, Phone, MapPin, Eye, EyeOff,
  Activity, Wifi, CheckCircle, XCircle,
} from "lucide-react";

type Tab = "overview" | "shops" | "users";
type ShopSort = "newest" | "lastActive" | "name" | "users";

const POLL_INTERVAL = 30; // seconds

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
function isOnline(lastSeen: string | null) {
  if (!lastSeen) return false;
  return (Date.now() - parseUTC(lastSeen).getTime()) / 1000 < 300;
}
function wasActiveToday(lastSeen: string | null) {
  if (!lastSeen) return false;
  return (Date.now() - parseUTC(lastSeen).getTime()) < 86_400_000;
}
function joinedThisWeek(created: string | null) {
  if (!created) return false;
  return (Date.now() - parseUTC(created).getTime()) < 7 * 86_400_000;
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
  const [ticker, setTicker]               = useState(0); // drives "X ago" re-renders

  const countdownRef = useRef(POLL_INTERVAL);

  useEffect(() => {
    if (!ready) return;
    if (!user) { router.replace("/login"); return; }
    if (user.role !== "admin") { router.replace("/"); }
  }, [ready, user, router]);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [s, sh, u] = await Promise.all([getAdminStats(), getAdminShops(), getAdminUsers()]);
      setStats(s); setShops(sh); setUsers(u);
      setLastUpdated(new Date());
      countdownRef.current = POLL_INTERVAL;
      setCountdown(POLL_INTERVAL);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load admin data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "admin") loadAll();
  }, [user, loadAll]);

  // Auto-poll every POLL_INTERVAL seconds
  useEffect(() => {
    if (!user || user.role !== "admin") return;
    const timer = setInterval(() => {
      countdownRef.current -= 1;
      if (countdownRef.current <= 0) {
        loadAll(true);
      } else {
        setCountdown(countdownRef.current);
        setTicker((t) => t + 1); // force "X ago" text to re-render
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [user, loadAll]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const shopUsers = useMemo(() => {
    const map: Record<string, AdminUser[]> = {};
    users.forEach((u) => {
      if (u.shop_id) {
        if (!map[u.shop_id]) map[u.shop_id] = [];
        map[u.shop_id].push(u);
      }
    });
    return map;
  }, [users]);

  const onlineNow   = shops.filter((s) => isOnline(s.last_seen_at)).length;
  const onlineToday = shops.filter((s) => wasActiveToday(s.last_seen_at)).length;
  const neverOnline = shops.filter((s) => !s.last_seen_at).length;
  const newThisWeek = shops.filter((s) => joinedThisWeek(s.created_at)).length;
  const avgUsers    = shops.length ? (shops.reduce((s, sh) => s + sh.user_count, 0) / shops.length).toFixed(1) : "0";

  void ticker; // suppress unused warning — drives re-render for time-ago text

  // ── Actions ───────────────────────────────────────────────────────────────────
  const handleToggleShop = async (id: string) => {
    setActionId(id);
    try {
      const updated = await toggleShop(id);
      setShops((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setActionId(null); }
  };
  const handleDeleteShop = async (id: string) => {
    setActionId(id);
    try {
      await deleteShop(id);
      setShops((prev) => prev.filter((s) => s.id !== id));
      if (expandedShop === id) setExpandedShop(null);
      setDeleteConfirm(null);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setActionId(null); }
  };
  const handleToggleUser = async (id: string) => {
    setActionId(id);
    try {
      const updated = await toggleUser(id);
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setActionId(null); }
  };
  const handleRoleChange = async () => {
    if (!roleEdit) return;
    setActionId(roleEdit.id);
    try {
      const updated = await updateUserRole(roleEdit.id, roleEdit.role);
      setUsers((prev) => prev.map((u) => (u.id === roleEdit.id ? updated : u)));
      setRoleEdit(null);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setActionId(null); }
  };

  if (!ready || !user || user.role !== "admin") return null;

  // ── Filtered / sorted shops ───────────────────────────────────────────────────
  const filteredShops = shops
    .filter((s) => shopFilter === "all" || (shopFilter === "active" ? s.is_active : !s.is_active))
    .filter((s) => {
      if (!shopSearch) return true;
      const q = shopSearch.toLowerCase();
      return s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) ||
             s.owner_email?.toLowerCase().includes(q) || s.phone?.includes(q) ||
             s.address?.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (shopSort === "name")       return (a.name || "").localeCompare(b.name || "");
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

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white">
      <DashboardHeader title="Admin" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* ── Header bar ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-green-600" />
              <h1 className="text-lg font-semibold text-slate-900">Admin Panel</h1>
              {stats && (
                <span className="text-xs text-slate-400 ml-1">
                  {stats.total_shops} shops · {stats.total_users} users
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{user.email}</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Live indicator */}
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {refreshing ? "Updating…" : `Refresh in ${countdown}s`}
              {lastUpdated && !refreshing && (
                <span className="text-slate-300">· {timeAgo(lastUpdated.toISOString())}</span>
              )}
            </div>

            <button
              onClick={() => loadAll(true)}
              disabled={loading || refreshing}
              className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 px-3 py-1.5 rounded-lg transition hover:bg-slate-50 disabled:opacity-40"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Error ──────────────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">
            <AlertTriangle size={14} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-300 hover:text-red-500">✕</button>
          </div>
        )}

        {/* ── Tabs ───────────────────────────────────────────────────────────── */}
        <div className="flex gap-0 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? "border-green-700 text-green-700"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span className="ml-1.5 text-xs text-slate-400">{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ───────────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="space-y-6">
            {loading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-20 bg-slate-50 animate-pulse rounded-lg border border-slate-100" />
                ))}
              </div>
            ) : stats ? (
              <>
                {/* ── Platform snapshot ── */}
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Platform snapshot</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Stat label="Total shops"   value={stats.total_shops}  />
                    <Stat label="Active shops"  value={stats.active_shops} note={`${stats.total_shops ? Math.round(stats.active_shops / stats.total_shops * 100) : 0}%`} />
                    <Stat label="Total users"   value={stats.total_users}  />
                    <Stat label="Active users"  value={stats.active_users} note={`${stats.total_users ? Math.round(stats.active_users / stats.total_users * 100) : 0}%`} />
                  </div>
                </div>

                {/* ── Presence ── */}
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Presence (live)</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Stat label="Online now"    value={onlineNow}   dot="green" />
                    <Stat label="Active today"  value={onlineToday} />
                    <Stat label="Never online"  value={neverOnline} warn={neverOnline > 0} />
                    <Stat label="New this week" value={newThisWeek} />
                  </div>
                </div>

                {/* ── Two-column lower section ── */}
                <div className="grid md:grid-cols-2 gap-5">

                  {/* Currently online */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                        <Wifi size={12} className="text-green-600" />
                        Online now
                      </span>
                      <span className="text-xs text-slate-400">{onlineNow} shop{onlineNow !== 1 ? "s" : ""}</span>
                    </div>
                    {shops.filter((s) => isOnline(s.last_seen_at)).length === 0 ? (
                      <p className="text-slate-400 text-xs px-4 py-6 text-center">No shops currently online</p>
                    ) : (
                      <div className="divide-y divide-slate-50">
                        {shops.filter((s) => isOnline(s.last_seen_at)).map((s) => (
                          <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0 animate-pulse" />
                            <span className="text-sm text-slate-800 font-medium flex-1 truncate">{s.name}</span>
                            <span className="text-xs text-slate-400">{timeAgo(s.last_seen_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* User breakdown */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                      <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                        <Users size={12} className="text-green-600" />
                        Users by role
                      </span>
                    </div>
                    <div className="px-4 py-4 space-y-3">
                      {[
                        { role: "admin", label: "Admins" },
                        { role: "owner", label: "Owners" },
                        { role: "staff", label: "Staff" },
                      ].map(({ role, label }) => {
                        const count = users.filter((u) => u.role === role).length;
                        const pct = users.length ? Math.round((count / users.length) * 100) : 0;
                        return (
                          <div key={role}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-slate-600 font-medium">{label}</span>
                              <span className="text-slate-400">{count} · {pct}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full">
                              <div className="h-full bg-green-600 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}

                      <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-slate-400">Avg users / shop</p>
                          <p className="text-slate-900 font-semibold text-base mt-0.5">{avgUsers}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Inactive shops</p>
                          <p className="text-slate-900 font-semibold text-base mt-0.5">{stats.inactive_shops}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Platform health ── */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Activity size={12} className="text-green-600" />
                      Platform health
                    </span>
                  </div>
                  <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                    {[
                      {
                        label: "Shop activation",
                        pct: stats.total_shops ? Math.round(stats.active_shops / stats.total_shops * 100) : 0,
                        sub: `${stats.active_shops} of ${stats.total_shops} active`,
                      },
                      {
                        label: "User activation",
                        pct: stats.total_users ? Math.round(stats.active_users / stats.total_users * 100) : 0,
                        sub: `${stats.active_users} of ${stats.total_users} active`,
                      },
                      {
                        label: "Daily engagement",
                        pct: shops.length ? Math.round(onlineToday / shops.length * 100) : 0,
                        sub: `${onlineToday} shops seen today`,
                      },
                    ].map((m) => (
                      <div key={m.label} className="px-5 py-4">
                        <div className="flex items-end justify-between mb-2">
                          <p className="text-xs text-slate-500">{m.label}</p>
                          <p className="text-2xl font-bold text-slate-900">{m.pct}%</p>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full mb-1.5">
                          <div className="h-full bg-green-700 rounded-full" style={{ width: `${m.pct}%` }} />
                        </div>
                        <p className="text-xs text-slate-400">{m.sub}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Recently joined shops ── */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <span className="text-xs font-semibold text-slate-700">Newest shops</span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left text-slate-400 font-medium px-4 py-2">Shop</th>
                        <th className="text-left text-slate-400 font-medium px-4 py-2">Owner</th>
                        <th className="text-left text-slate-400 font-medium px-4 py-2">Users</th>
                        <th className="text-left text-slate-400 font-medium px-4 py-2">Joined</th>
                        <th className="text-left text-slate-400 font-medium px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {[...shops]
                        .sort((a, b) => parseUTC(b.created_at).getTime() - parseUTC(a.created_at).getTime())
                        .slice(0, 8)
                        .map((s) => (
                          <tr key={s.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-medium text-slate-800">
                              {s.name}
                              {joinedThisWeek(s.created_at) && (
                                <span className="ml-2 text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase">New</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-slate-500">{s.owner_email ?? "—"}</td>
                            <td className="px-4 py-2.5 text-slate-700">{s.user_count}</td>
                            <td className="px-4 py-2.5 text-slate-500">{fmtDate(s.created_at)}</td>
                            <td className="px-4 py-2.5">
                              {isOnline(s.last_seen_at) ? (
                                <span className="flex items-center gap-1 text-green-700 font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Online
                                </span>
                              ) : (
                                <span className="text-slate-400">{timeAgo(s.last_seen_at)}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ── SHOPS ──────────────────────────────────────────────────────────── */}
        {tab === "shops" && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={shopSort}
                  onChange={(e) => setShopSort(e.target.value as ShopSort)}
                  className="text-xs border border-slate-200 rounded px-2.5 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-green-200"
                >
                  <option value="newest">Newest first</option>
                  <option value="lastActive">Last active</option>
                  <option value="users">Most users</option>
                  <option value="name">Name A–Z</option>
                </select>
                <div className="flex text-xs border border-slate-200 rounded overflow-hidden">
                  {(["all", "active", "inactive"] as const).map((f) => (
                    <button key={f} onClick={() => setShopFilter(f)}
                      className={`px-2.5 py-1.5 capitalize border-r last:border-r-0 border-slate-200 transition ${
                        shopFilter === f ? "bg-green-700 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                      }`}>{f}</button>
                  ))}
                </div>
              </div>
              <div className="relative ml-auto">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={shopSearch}
                  onChange={(e) => setShopSearch(e.target.value)}
                  placeholder="Search shops…"
                  className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-200 w-44"
                />
              </div>
              <span className="text-xs text-slate-400 shrink-0">
                {filteredShops.length} / {shops.length}
              </span>
            </div>

            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-12 bg-slate-50 animate-pulse rounded" />
                ))}
              </div>
            ) : filteredShops.length === 0 ? (
              <p className="text-slate-400 text-sm py-10 text-center">No shops found</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredShops.map((shop) => {
                  const online   = isOnline(shop.last_seen_at);
                  const busy     = actionId === shop.id;
                  const expanded = expandedShop === shop.id;
                  const members  = shopUsers[shop.id] ?? [];

                  return (
                    <div key={shop.id}>
                      {/* Row */}
                      <div className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 ${!shop.is_active ? "opacity-50" : ""}`}>

                        {/* Online indicator */}
                        <span className={`w-2 h-2 rounded-full shrink-0 ${online ? "bg-green-500 animate-pulse" : "bg-slate-200"}`} />

                        {/* Name + contact */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-slate-900">{shop.name}</span>
                            {!shop.is_active && (
                              <span className="text-[10px] border border-red-200 text-red-500 px-1.5 py-0.5 rounded">Inactive</span>
                            )}
                            {joinedThisWeek(shop.created_at) && (
                              <span className="text-[10px] border border-slate-300 text-slate-500 px-1.5 py-0.5 rounded uppercase">New</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            {shop.owner_email && (
                              <span className="text-[11px] text-slate-400">{shop.owner_email}</span>
                            )}
                            {shop.phone && (
                              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                <Phone size={9} /> {shop.phone}
                              </span>
                            )}
                            {shop.address && (
                              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                <MapPin size={9} /> {shop.address}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="hidden md:flex items-center gap-5 text-xs text-slate-500 shrink-0">
                          <div className="text-center">
                            <p className="text-slate-400 text-[10px]">Users</p>
                            <p className="font-semibold text-slate-800">{shop.user_count}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-slate-400 text-[10px]">Last seen</p>
                            <p className="font-semibold text-slate-800">{online ? "Online now" : timeAgo(shop.last_seen_at)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-slate-400 text-[10px]">Joined</p>
                            <p className="font-semibold text-slate-800">{fmtDate(shop.created_at)}</p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setExpandedShop(expanded ? null : shop.id)}
                            className={`p-1.5 rounded transition text-slate-400 hover:text-slate-700 hover:bg-slate-100 ${expanded ? "bg-slate-100 text-slate-700" : ""}`}
                            title={expanded ? "Collapse" : "Expand details"}
                          >
                            {expanded ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>

                          <button
                            onClick={() => handleToggleShop(shop.id)}
                            disabled={busy}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700 transition disabled:opacity-40"
                          >
                            {shop.is_active
                              ? <><ToggleRight size={12} /> Disable</>
                              : <><ToggleLeft size={12} /> Enable</>}
                          </button>

                          {deleteConfirm === shop.id ? (
                            <>
                              <button
                                onClick={() => handleDeleteShop(shop.id)}
                                disabled={busy}
                                className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-40"
                              >
                                Confirm delete
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="text-xs px-2 py-1 rounded text-slate-500 hover:bg-slate-100 transition"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(shop.id)}
                              disabled={busy}
                              className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {expanded && (
                        <div className="px-4 pb-4 pt-1 bg-slate-50 border-t border-slate-100">
                          <div className="grid sm:grid-cols-3 gap-3 mt-2">

                            {/* Info */}
                            <div className="border border-slate-200 rounded-lg bg-white p-4">
                              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-3">Shop info</p>
                              <div className="space-y-2">
                                {[
                                  { icon: <Store size={11} />,  label: "Name",    value: shop.name },
                                  { icon: <Mail size={11} />,   label: "Email",   value: shop.email ?? "—" },
                                  { icon: <Phone size={11} />,  label: "Phone",   value: shop.phone ?? "—" },
                                  { icon: <MapPin size={11} />, label: "Address", value: shop.address ?? "—" },
                                ].map((d) => (
                                  <div key={d.label} className="flex items-start gap-2 text-xs">
                                    <span className="text-slate-300 mt-0.5 shrink-0">{d.icon}</span>
                                    <span className="text-slate-400 w-12 shrink-0">{d.label}</span>
                                    <span className="text-slate-700 font-medium break-all">{d.value}</span>
                                  </div>
                                ))}
                                {shop.description && (
                                  <p className="text-xs text-slate-400 italic border-t border-slate-100 pt-2 mt-2">
                                    {shop.description}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Presence */}
                            <div className="border border-slate-200 rounded-lg bg-white p-4">
                              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-3">Activity</p>
                              <div className="space-y-2.5 text-xs">
                                <Row label="Status">
                                  {online ? (
                                    <span className="flex items-center gap-1 text-green-700 font-semibold">
                                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                      Online
                                    </span>
                                  ) : (
                                    <span className="text-slate-500 font-medium">Offline</span>
                                  )}
                                </Row>
                                <Row label="Last seen">
                                  <span className="text-slate-700">{timeAgo(shop.last_seen_at)}</span>
                                </Row>
                                <Row label="Exact time">
                                  <span className="text-slate-500">
                                    {shop.last_seen_at ? parseUTC(shop.last_seen_at).toLocaleString() : "Never"}
                                  </span>
                                </Row>
                                <Row label="Active today">
                                  <span className={wasActiveToday(shop.last_seen_at) ? "text-slate-800 font-medium" : "text-slate-400"}>
                                    {wasActiveToday(shop.last_seen_at) ? "Yes" : "No"}
                                  </span>
                                </Row>
                                <Row label="Shop active">
                                  <span className={shop.is_active ? "text-slate-800 font-medium" : "text-red-500 font-medium"}>
                                    {shop.is_active ? "Yes" : "No"}
                                  </span>
                                </Row>
                                <Row label="Joined">
                                  <span className="text-slate-500">{fmtDate(shop.created_at)}</span>
                                </Row>
                                <Row label="Updated">
                                  <span className="text-slate-500">{fmtDate(shop.updated_at)}</span>
                                </Row>
                              </div>
                            </div>

                            {/* Users */}
                            <div className="border border-slate-200 rounded-lg bg-white p-4">
                              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-3 flex items-center gap-1.5">
                                Users
                                <span className="text-slate-500 normal-case font-bold">{members.length}</span>
                              </p>
                              {members.length === 0 ? (
                                <p className="text-slate-400 text-xs py-2">No users assigned</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {members.map((m) => (
                                    <div key={m.id} className="flex items-center gap-2 text-xs">
                                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.is_active ? "bg-green-500" : "bg-slate-200"}`} />
                                      <span className="flex-1 text-slate-700 truncate">{m.email}</span>
                                      <span className="text-slate-400 capitalize shrink-0">{m.role}</span>
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

        {/* ── USERS ──────────────────────────────────────────────────────────── */}
        {tab === "users" && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
              <div className="flex text-xs border border-slate-200 rounded overflow-hidden">
                {(["all", "admin", "owner", "staff"] as const).map((r) => (
                  <button key={r} onClick={() => setUserRoleFilter(r)}
                    className={`px-2.5 py-1.5 capitalize border-r last:border-r-0 border-slate-200 transition ${
                      userRoleFilter === r ? "bg-green-700 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                    }`}>{r}</button>
                ))}
              </div>
              <div className="relative ml-auto">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users…"
                  className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-200 w-44"
                />
              </div>
              <span className="text-xs text-slate-400 shrink-0">{filteredUsers.length} / {users.length}</span>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-4 py-2 border-b border-slate-100 bg-slate-50">
              {["User", "Shop", "Role", "Status", "Actions"].map((h) => (
                <span key={h} className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{h}</span>
              ))}
            </div>

            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 bg-slate-50 animate-pulse rounded" />
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <p className="text-slate-400 text-sm py-10 text-center">No users found</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {filteredUsers.map((u) => {
                  const isMe = u.id === user?.id;
                  const busy = actionId === u.id;
                  return (
                    <div key={u.id}
                      className={`grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 items-center px-4 py-2.5 hover:bg-slate-50 ${!u.is_active ? "opacity-50" : ""}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{u.email}</p>
                        <p className="text-[10px] text-slate-400">{fmtDate(u.created_at)}</p>
                      </div>
                      <div className="min-w-0">
                        {u.shop_name ? (
                          <p className="text-xs text-slate-600 truncate">{u.shop_name}</p>
                        ) : (
                          <p className="text-xs text-slate-300">—</p>
                        )}
                      </div>
                      <div className="shrink-0">
                        {roleEdit?.id === u.id ? (
                          <div className="flex items-center gap-1">
                            <div className="relative">
                              <select
                                value={roleEdit.role}
                                onChange={(e) => setRoleEdit({ id: u.id, role: e.target.value })}
                                className="text-xs border border-slate-300 rounded px-2 py-1 pr-5 appearance-none bg-white focus:outline-none"
                              >
                                <option value="admin">admin</option>
                                <option value="owner">owner</option>
                                <option value="staff">staff</option>
                              </select>
                              <ChevronDown size={9} className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                            <button onClick={handleRoleChange} disabled={busy}
                              className="text-xs px-2 py-1 rounded bg-green-700 text-white hover:bg-green-800 transition disabled:opacity-40">Save</button>
                            <button onClick={() => setRoleEdit(null)}
                              className="text-xs text-slate-400 hover:text-slate-600 px-1">✕</button>
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-slate-600 capitalize border border-slate-200 px-2 py-0.5 rounded">
                            {u.role}
                          </span>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-1">
                        {u.is_active
                          ? <CheckCircle size={13} className="text-green-500" />
                          : <XCircle size={13} className="text-slate-300" />}
                        <span className="text-xs text-slate-500">{u.is_active ? "Active" : "Inactive"}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!isMe ? (
                          <>
                            <button
                              onClick={() => handleToggleUser(u.id)}
                              disabled={busy}
                              className="flex items-center gap-0.5 text-xs px-2 py-1 rounded border border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700 transition disabled:opacity-40"
                            >
                              {u.is_active ? <><ToggleRight size={11} /> Disable</> : <><ToggleLeft size={11} /> Enable</>}
                            </button>
                            <button
                              onClick={() => setRoleEdit({ id: u.id, role: u.role })}
                              disabled={busy || roleEdit?.id === u.id}
                              className="p-1.5 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition disabled:opacity-40"
                              title="Change role"
                            >
                              <UserCog size={12} />
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-300">you</span>
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

// ── Small helpers ─────────────────────────────────────────────────────────────
function Stat({ label, value, note, dot, warn }: {
  label: string; value: number; note?: string; dot?: "green"; warn?: boolean;
}) {
  return (
    <div className={`bg-white border rounded-lg p-4 ${warn ? "border-slate-300" : "border-slate-200"}`}>
      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        {dot === "green" && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
        {label}
      </p>
      <div className="flex items-end gap-2 mt-1">
        <p className="text-2xl font-bold text-slate-900">{value.toLocaleString()}</p>
        {note && <p className="text-xs text-slate-400 mb-0.5">{note}</p>}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

