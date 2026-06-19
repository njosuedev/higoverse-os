"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import {
  getAdminStats, getAdminShops, getAdminUsers,
  toggleShop, deleteShop, toggleUser, updateUserRole,
  type AdminStats, type AdminShop, type AdminUser,
} from "@/lib/admin-api";
import {
  ShieldCheck, Users, Store, Activity, AlertTriangle, Trash2,
  ToggleLeft, ToggleRight, RefreshCw, ChevronDown, CheckCircle,
  XCircle, Wifi, UserCog, BarChart3, Search, Mail,
  Phone, MapPin, Eye, Clock, TrendingUp,
  Package, UserCheck, WifiOff, CalendarPlus, Star,
} from "lucide-react";

type Tab   = "overview" | "shops" | "users";
type ShopSort = "newest" | "lastActive" | "name" | "users";

// ── Helpers ──────────────────────────────────────────────────────────────────
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

  const [tab, setTab]                   = useState<Tab>("overview");
  const [stats, setStats]               = useState<AdminStats | null>(null);
  const [shops, setShops]               = useState<AdminShop[]>([]);
  const [users, setUsers]               = useState<AdminUser[]>([]);
  const [loading, setLoading]           = useState(true);
  const [actionId, setActionId]         = useState<string | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [roleEdit, setRoleEdit]         = useState<{ id: string; role: string } | null>(null);
  const [shopSearch, setShopSearch]     = useState("");
  const [shopFilter, setShopFilter]     = useState<"all" | "active" | "inactive">("all");
  const [shopSort, setShopSort]         = useState<ShopSort>("newest");
  const [userSearch, setUserSearch]     = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | "admin" | "owner" | "staff">("all");
  const [expandedShop, setExpandedShop] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) { router.replace("/login"); return; }
    if (user.role !== "admin") { router.replace("/"); }
  }, [ready, user, router]);

  const loadAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [s, sh, u] = await Promise.all([getAdminStats(), getAdminShops(), getAdminUsers()]);
      setStats(s); setShops(sh); setUsers(u);
      setLastUpdated(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load admin data");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user?.role === "admin") loadAll(); }, [user, loadAll]);

  // ── Derived data ───────────────────────────────────────────────────────────
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

  const onlineNow    = shops.filter((s) => isOnline(s.last_seen_at)).length;
  const onlineToday  = shops.filter((s) => wasActiveToday(s.last_seen_at)).length;
  const neverOnline  = shops.filter((s) => !s.last_seen_at).length;
  const newThisWeek  = shops.filter((s) => joinedThisWeek(s.created_at)).length;
  const largestShop  = shops.reduce((a, b) => (b.user_count > (a?.user_count ?? 0) ? b : a), shops[0]);
  const avgUsers     = shops.length ? (shops.reduce((s, sh) => s + sh.user_count, 0) / shops.length).toFixed(1) : "0";

  const recentShops  = [...shops]
    .filter((s) => s.created_at)
    .sort((a, b) => parseUTC(b.created_at).getTime() - parseUTC(a.created_at).getTime())
    .slice(0, 5);

  const recentlyActive = [...shops]
    .filter((s) => s.last_seen_at && !isOnline(s.last_seen_at))
    .sort((a, b) => parseUTC(b.last_seen_at).getTime() - parseUTC(a.last_seen_at).getTime())
    .slice(0, 5);

  // ── Actions ────────────────────────────────────────────────────────────────
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

  // ── Filtered + sorted shops ────────────────────────────────────────────────
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
      return parseUTC(b.created_at).getTime() - parseUTC(a.created_at).getTime(); // newest
    });

  const filteredUsers = users
    .filter((u) => userRoleFilter === "all" || u.role === userRoleFilter)
    .filter((u) => {
      if (!userSearch) return true;
      const q = userSearch.toLowerCase();
      return u.email?.toLowerCase().includes(q) || u.shop_name?.toLowerCase().includes(q);
    });

  const TABS: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "overview", label: "Overview", icon: <BarChart3 size={15} /> },
    { key: "shops",    label: "Shops",    icon: <Store size={15} />,  count: shops.length },
    { key: "users",    label: "Users",    icon: <Users size={15} />,  count: users.length },
  ];

  const roleColors: Record<string, string> = {
    admin: "bg-red-100 text-red-700",
    owner: "bg-blue-100 text-blue-700",
    staff: "bg-slate-100 text-slate-600",
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader title="Admin Panel" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── HERO ──────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-2xl bg-red-700 text-white shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-rose-500/40 via-transparent to-transparent pointer-events-none" />
          <div className="relative z-10 px-6 py-5 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-red-200 text-xs font-medium mb-1">
                <ShieldCheck size={13} /> Super Admin · {user.email}
              </div>
              <h1 className="text-2xl font-bold">Admin Control Panel</h1>
              <p className="text-red-200 text-sm mt-0.5">Full visibility across all shops and users on Higoverse</p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {[
                { label: "Shops",      value: stats?.total_shops   ?? "—", color: "text-white" },
                { label: "Online Now", value: onlineNow,                    color: "text-green-300" },
                { label: "Users",      value: stats?.total_users   ?? "—", color: "text-white" },
                { label: "New Week",   value: newThisWeek,                  color: "text-yellow-300" },
              ].map((s) => (
                <div key={s.label} className="bg-white/10 border border-white/10 px-3.5 py-2 rounded-xl text-center min-w-[70px]">
                  <p className="text-red-200 text-[10px] uppercase tracking-wider">{s.label}</p>
                  <p className={`text-xl font-bold ${s.color}`}>{String(s.value)}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col items-end gap-1 shrink-0">
              <button onClick={loadAll} disabled={loading}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3.5 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50">
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
              {lastUpdated && (
                <p className="text-red-300 text-[11px]">Updated {timeAgo(lastUpdated.toISOString())}</p>
              )}
            </div>
          </div>
        </section>

        {/* ── ERROR ─────────────────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-3 text-red-700 text-sm flex items-center gap-2">
            <AlertTriangle size={16} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* ── TABS ──────────────────────────────────────────────────────────── */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.key ? "bg-red-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
              }`}>
              {t.icon}
              {t.label}
              {t.count !== undefined && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  tab === t.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                }`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ──────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="space-y-6">
            {loading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse h-24" />
                ))}
              </div>
            ) : stats ? (
              <>
                {/* Shop stats */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Shops</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <ACard label="Total"      value={stats.total_shops}   icon={<Store size={17} />}       color="blue" />
                    <ACard label="Active"     value={stats.active_shops}  icon={<CheckCircle size={17} />} color="green" />
                    <ACard label="Inactive"   value={stats.inactive_shops}icon={<XCircle size={17} />}     color="orange" />
                    <ACard label="Online Now" value={onlineNow}           icon={<Wifi size={17} />}        color="teal" />
                    <ACard label="Active Today" value={onlineToday}       icon={<Activity size={17} />}    color="indigo" />
                    <ACard label="Never Online" value={neverOnline}       icon={<WifiOff size={17} />}     color="slate" warn={neverOnline > 0} />
                  </div>
                </div>

                {/* User stats */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Users</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <ACard label="Total"        value={stats.total_users}   icon={<Users size={17} />}       color="blue" />
                    <ACard label="Active"       value={stats.active_users}  icon={<UserCheck size={17} />}   color="green" />
                    <ACard label="Inactive"     value={stats.inactive_users}icon={<XCircle size={17} />}     color="red" />
                    <ACard label="Admins"       value={users.filter(u => u.role === "admin").length} icon={<ShieldCheck size={17} />} color="rose" />
                    <ACard label="Owners"       value={users.filter(u => u.role === "owner").length} icon={<Star size={17} />}        color="indigo" />
                    <ACard label="Staff"        value={users.filter(u => u.role === "staff").length} icon={<Package size={17} />}     color="slate" />
                  </div>
                </div>

                {/* Platform metrics */}
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs text-slate-400 font-medium">Avg Users / Shop</p>
                    <p className="text-3xl font-bold text-slate-900 mt-1">{avgUsers}</p>
                    <p className="text-xs text-slate-400 mt-1">across {shops.length} shops</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs text-slate-400 font-medium">Largest Shop</p>
                    <p className="text-lg font-bold text-slate-900 mt-1 truncate">{largestShop?.name ?? "—"}</p>
                    <p className="text-xs text-slate-400 mt-1">{largestShop?.user_count ?? 0} users</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs text-slate-400 font-medium flex items-center gap-1">
                      <CalendarPlus size={11} /> New Shops This Week
                    </p>
                    <p className="text-3xl font-bold text-slate-900 mt-1">{newThisWeek}</p>
                    <p className="text-xs text-slate-400 mt-1">registered in last 7 days</p>
                  </div>
                </div>

                {/* 3-col lower section */}
                <div className="grid md:grid-cols-3 gap-6">

                  {/* Currently online */}
                  <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2 mb-3">
                      <Wifi size={14} className="text-green-500" />
                      Online Right Now
                      <span className="text-xs bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">{onlineNow}</span>
                    </h2>
                    {shops.filter(s => isOnline(s.last_seen_at)).length === 0 ? (
                      <p className="text-slate-400 text-xs py-4 text-center">No shops online</p>
                    ) : (
                      <div className="space-y-2">
                        {shops.filter(s => isOnline(s.last_seen_at)).map(s => (
                          <div key={s.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-green-50 border border-green-100">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-slate-800 truncate">{s.name}</p>
                              <p className="text-[10px] text-slate-400 truncate">{s.owner_email || s.email || "—"}</p>
                            </div>
                            <span className="text-[10px] text-green-600 shrink-0 font-medium">{timeAgo(s.last_seen_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Recently active (offline but seen today) */}
                  <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2 mb-3">
                      <Clock size={14} className="text-amber-500" />
                      Recently Active
                    </h2>
                    {recentlyActive.length === 0 ? (
                      <p className="text-slate-400 text-xs py-4 text-center">No recent activity</p>
                    ) : (
                      <div className="space-y-2">
                        {recentlyActive.map(s => (
                          <div key={s.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                            <div className="w-7 h-7 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0">
                              {(s.name || "?")[0].toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-slate-800 truncate">{s.name}</p>
                              <p className="text-[10px] text-slate-400">{timeAgo(s.last_seen_at)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Newest shops */}
                  <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2 mb-3">
                      <CalendarPlus size={14} className="text-indigo-500" />
                      Newest Shops
                    </h2>
                    {recentShops.length === 0 ? (
                      <p className="text-slate-400 text-xs py-4 text-center">No shops yet</p>
                    ) : (
                      <div className="space-y-2">
                        {recentShops.map(s => (
                          <div key={s.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                            <div className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${
                              joinedThisWeek(s.created_at) ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-600"
                            }`}>
                              {(s.name || "?")[0].toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-slate-800 truncate">{s.name}</p>
                              <p className="text-[10px] text-slate-400">{fmtDate(s.created_at)}</p>
                            </div>
                            {joinedThisWeek(s.created_at) && (
                              <span className="text-[9px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full shrink-0">NEW</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>

                {/* Role breakdown */}
                <div className="grid md:grid-cols-2 gap-6">
                  <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2 mb-4">
                      <UserCog size={14} className="text-indigo-500" />
                      Users by Role
                    </h2>
                    <div className="space-y-3">
                      {(["admin", "owner", "staff"] as const).map((role) => {
                        const count = users.filter(u => u.role === role).length;
                        const pct   = users.length ? Math.round((count / users.length) * 100) : 0;
                        const bar: Record<string, string> = { admin: "bg-red-500", owner: "bg-blue-500", staff: "bg-slate-400" };
                        return (
                          <div key={role}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="capitalize font-semibold text-slate-700">{role}</span>
                              <span className="text-slate-400">{count} ({pct}%)</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${bar[role]}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2 mb-4">
                      <TrendingUp size={14} className="text-teal-500" />
                      Platform Health
                    </h2>
                    <div className="space-y-3">
                      {[
                        { label: "Shop activation rate", value: stats.total_shops ? Math.round((stats.active_shops / stats.total_shops) * 100) : 0, color: "bg-green-500" },
                        { label: "User activation rate", value: stats.total_users ? Math.round((stats.active_users / stats.total_users) * 100) : 0, color: "bg-blue-500" },
                        { label: "Shops online today",   value: shops.length ? Math.round((onlineToday / shops.length) * 100) : 0,               color: "bg-teal-500" },
                      ].map((m) => (
                        <div key={m.label}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-600">{m.label}</span>
                            <span className="font-bold text-slate-800">{m.value}%</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${m.color}`} style={{ width: `${m.value}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ── SHOPS TAB ─────────────────────────────────────────────────────── */}
        {tab === "shops" && (
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            {/* Toolbar */}
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
              <h2 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                <Store size={15} className="text-blue-500" />
                All Shops
                <span className="text-xs bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">
                  {filteredShops.length} / {shops.length}
                </span>
              </h2>
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                {/* Sort */}
                <select
                  value={shopSort}
                  onChange={(e) => setShopSort(e.target.value as ShopSort)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-600 focus:outline-none"
                >
                  <option value="newest">Newest first</option>
                  <option value="lastActive">Last active</option>
                  <option value="users">Most users</option>
                  <option value="name">Name A–Z</option>
                </select>
                {/* Status filter */}
                <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs font-medium">
                  {(["all", "active", "inactive"] as const).map((f) => (
                    <button key={f} onClick={() => setShopFilter(f)}
                      className={`px-2.5 py-1 rounded-md capitalize transition-all ${
                        shopFilter === f ? "bg-white shadow text-slate-800" : "text-slate-500"
                      }`}>{f}</button>
                  ))}
                </div>
                {/* Search */}
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={shopSearch} onChange={(e) => setShopSearch(e.target.value)}
                    placeholder="Search shops…"
                    className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 w-40" />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="p-5 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 bg-slate-50 animate-pulse rounded-xl" />
                ))}
              </div>
            ) : filteredShops.length === 0 ? (
              <p className="text-slate-400 text-sm py-10 text-center">No shops found</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {filteredShops.map((shop) => {
                  const online   = isOnline(shop.last_seen_at);
                  const busy     = actionId === shop.id;
                  const expanded = expandedShop === shop.id;
                  const members  = shopUsers[shop.id] ?? [];

                  return (
                    <div key={shop.id} className={!shop.is_active ? "opacity-60" : ""}>
                      {/* Main row */}
                      <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                        {/* Avatar + online dot */}
                        <div className="relative shrink-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                            shop.is_active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400"
                          }`}>
                            {(shop.name || "?")[0].toUpperCase()}
                          </div>
                          {online && (
                            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-white" />
                          )}
                        </div>

                        {/* Name + contact */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-slate-800 text-sm truncate">{shop.name}</p>
                            {joinedThisWeek(shop.created_at) && (
                              <span className="text-[9px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">NEW</span>
                            )}
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              shop.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                            }`}>{shop.is_active ? "Active" : "Inactive"}</span>
                            {online && (
                              <span className="flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse" /> ONLINE
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            {shop.owner_email && (
                              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                <Mail size={10} /> {shop.owner_email}
                              </span>
                            )}
                            {shop.phone && (
                              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                <Phone size={10} /> {shop.phone}
                              </span>
                            )}
                            {shop.address && (
                              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                <MapPin size={10} /> {shop.address}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Stats pills */}
                        <div className="hidden md:flex items-center gap-2 shrink-0">
                          <div className="text-center px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                            <p className="text-[10px] text-slate-400">Users</p>
                            <p className="text-sm font-bold text-slate-700">{shop.user_count}</p>
                          </div>
                          <div className="text-center px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                            <p className="text-[10px] text-slate-400">Last seen</p>
                            <p className="text-xs font-semibold text-slate-600">{timeAgo(shop.last_seen_at)}</p>
                          </div>
                          <div className="text-center px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                            <p className="text-[10px] text-slate-400">Joined</p>
                            <p className="text-xs font-semibold text-slate-600">{fmtDate(shop.created_at)}</p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Expand */}
                          <button
                            onClick={() => setExpandedShop(expanded ? null : shop.id)}
                            className={`p-1.5 rounded-lg transition text-slate-400 hover:text-blue-600 hover:bg-blue-50 ${expanded ? "bg-blue-50 text-blue-600" : ""}`}
                            title="View details"
                          >
                            <Eye size={14} />
                          </button>

                          <button onClick={() => handleToggleShop(shop.id)} disabled={busy}
                            className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition disabled:opacity-40 ${
                              shop.is_active
                                ? "border-red-200 text-red-600 hover:bg-red-50"
                                : "border-green-200 text-green-600 hover:bg-green-50"
                            }`}>
                            {shop.is_active ? <><ToggleRight size={13} /> Disable</> : <><ToggleLeft size={13} /> Enable</>}
                          </button>

                          {deleteConfirm === shop.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleDeleteShop(shop.id)} disabled={busy}
                                className="text-xs px-2.5 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-40">
                                Confirm
                              </button>
                              <button onClick={() => setDeleteConfirm(null)}
                                className="text-xs px-2 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteConfirm(shop.id)} disabled={busy}
                              className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-40">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded detail panel */}
                      {expanded && (
                        <div className="px-5 pb-5 bg-slate-50/60 border-t border-slate-100">
                          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">

                            {/* Shop info */}
                            <div className="bg-white border border-slate-100 rounded-xl p-4 space-y-2">
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Shop Details</p>
                              {[
                                { icon: <Store size={12} />,   label: "Name",     value: shop.name },
                                { icon: <Mail size={12} />,    label: "Email",    value: shop.email || "—" },
                                { icon: <Phone size={12} />,   label: "Phone",    value: shop.phone || "—" },
                                { icon: <MapPin size={12} />,  label: "Address",  value: shop.address || "—" },
                                { icon: <Eye size={12} />,     label: "ID",       value: shop.id.slice(0, 16) + "…" },
                                { icon: <Clock size={12} />,   label: "Updated",  value: fmtDate(shop.updated_at) },
                              ].map((d) => (
                                <div key={d.label} className="flex items-start gap-2">
                                  <span className="text-slate-300 mt-0.5 shrink-0">{d.icon}</span>
                                  <span className="text-[11px] text-slate-400 w-14 shrink-0">{d.label}</span>
                                  <span className="text-[11px] text-slate-700 font-medium break-all">{d.value}</span>
                                </div>
                              ))}
                              {shop.description && (
                                <div className="pt-1 border-t border-slate-50">
                                  <p className="text-[11px] text-slate-500 italic">{shop.description}</p>
                                </div>
                              )}
                            </div>

                            {/* Presence */}
                            <div className="bg-white border border-slate-100 rounded-xl p-4">
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Presence & Activity</p>
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-slate-500">Current status</span>
                                  {online ? (
                                    <span className="flex items-center gap-1.5 text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded-lg">
                                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> ONLINE
                                    </span>
                                  ) : (
                                    <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">OFFLINE</span>
                                  )}
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-slate-500">Last seen</span>
                                  <span className="text-xs font-semibold text-slate-700">{timeAgo(shop.last_seen_at)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-slate-500">Exact time</span>
                                  <span className="text-xs text-slate-500">{shop.last_seen_at ? parseUTC(shop.last_seen_at).toLocaleString() : "Never"}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-slate-500">Active today</span>
                                  <span className={`text-xs font-semibold ${wasActiveToday(shop.last_seen_at) ? "text-green-600" : "text-slate-400"}`}>
                                    {wasActiveToday(shop.last_seen_at) ? "Yes" : "No"}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-slate-500">Joined</span>
                                  <span className="text-xs font-semibold text-slate-700">{fmtDate(shop.created_at)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-slate-500">Shop active</span>
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${shop.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                                    {shop.is_active ? "Yes" : "No"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Users in this shop */}
                            <div className="bg-white border border-slate-100 rounded-xl p-4">
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                Users in this Shop
                                <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full text-[10px] font-bold">{members.length}</span>
                              </p>
                              {members.length === 0 ? (
                                <p className="text-slate-400 text-xs py-3 text-center">No users assigned</p>
                              ) : (
                                <div className="space-y-2">
                                  {members.map((m) => (
                                    <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
                                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                        m.role === "admin" ? "bg-red-100 text-red-700" : "bg-indigo-100 text-indigo-700"
                                      }`}>
                                        {(m.email || "?")[0].toUpperCase()}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-semibold text-slate-800 truncate">{m.email}</p>
                                      </div>
                                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${roleColors[m.role] ?? roleColors.staff}`}>
                                        {m.role}
                                      </span>
                                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.is_active ? "bg-green-500" : "bg-slate-300"}`} />
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
          </section>
        )}

        {/* ── USERS TAB ─────────────────────────────────────────────────────── */}
        {tab === "users" && (
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
              <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Users size={15} className="text-indigo-500" />
                All Users
                <span className="text-xs bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">
                  {filteredUsers.length} / {users.length}
                </span>
              </h2>
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs font-medium">
                  {(["all", "admin", "owner", "staff"] as const).map((r) => (
                    <button key={r} onClick={() => setUserRoleFilter(r)}
                      className={`px-2.5 py-1 rounded-md capitalize transition-all ${
                        userRoleFilter === r ? "bg-white shadow text-slate-800" : "text-slate-500"
                      }`}>{r}</button>
                  ))}
                </div>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search users…"
                    className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 w-40" />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="p-5 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 bg-slate-50 animate-pulse rounded-xl" />
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
                      className={`flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors ${!u.is_active ? "opacity-60" : ""}`}>

                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                        u.role === "admin" ? "bg-red-100 text-red-700" : "bg-indigo-100 text-indigo-700"
                      }`}>
                        {(u.email || "?")[0].toUpperCase()}
                      </div>

                      {/* Email + shop */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-800 truncate">{u.email}</p>
                          {isMe && <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">You</span>}
                        </div>
                        {u.shop_name ? (
                          <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Store size={10} /> {u.shop_name}
                          </p>
                        ) : (
                          <p className="text-[11px] text-slate-300 mt-0.5">No shop assigned</p>
                        )}
                      </div>

                      {/* Joined */}
                      <div className="hidden sm:block text-center shrink-0">
                        <p className="text-[10px] text-slate-400">Joined</p>
                        <p className="text-xs font-semibold text-slate-600">{fmtDate(u.created_at)}</p>
                      </div>

                      {/* Role */}
                      <div className="shrink-0">
                        {roleEdit?.id === u.id ? (
                          <div className="flex items-center gap-1.5">
                            <div className="relative">
                              <select value={roleEdit.role}
                                onChange={(e) => setRoleEdit({ id: u.id, role: e.target.value })}
                                className="text-xs border border-slate-300 rounded-lg px-2 py-1 pr-6 appearance-none bg-white">
                                <option value="admin">admin</option>
                                <option value="owner">owner</option>
                                <option value="staff">staff</option>
                              </select>
                              <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                            <button onClick={handleRoleChange} disabled={busy}
                              className="text-xs px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-40">Save</button>
                            <button onClick={() => setRoleEdit(null)}
                              className="text-xs px-2 py-1 rounded-lg text-slate-500 hover:bg-slate-100 transition">✕</button>
                          </div>
                        ) : (
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${roleColors[u.role] ?? roleColors.staff}`}>
                            {u.role}
                          </span>
                        )}
                      </div>

                      {/* Status */}
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                        u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                      }`}>
                        {u.is_active ? "Active" : "Inactive"}
                      </span>

                      {/* Actions */}
                      {!isMe ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => handleToggleUser(u.id)} disabled={busy}
                            className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition disabled:opacity-40 ${
                              u.is_active
                                ? "border-red-200 text-red-600 hover:bg-red-50"
                                : "border-green-200 text-green-600 hover:bg-green-50"
                            }`}>
                            {u.is_active ? <><ToggleRight size={13} /> Disable</> : <><ToggleLeft size={13} /> Enable</>}
                          </button>
                          <button onClick={() => setRoleEdit({ id: u.id, role: u.role })}
                            disabled={busy || roleEdit?.id === u.id}
                            className="p-1.5 rounded-lg text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition disabled:opacity-40">
                            <UserCog size={14} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300 shrink-0">Your account</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
const AC: Record<string, { bg: string; text: string }> = {
  blue:   { bg: "bg-blue-50",   text: "text-blue-600" },
  green:  { bg: "bg-green-50",  text: "text-green-600" },
  orange: { bg: "bg-orange-50", text: "text-orange-600" },
  teal:   { bg: "bg-teal-50",   text: "text-teal-600" },
  indigo: { bg: "bg-indigo-50", text: "text-indigo-600" },
  red:    { bg: "bg-red-50",    text: "text-red-600" },
  rose:   { bg: "bg-rose-50",   text: "text-rose-600" },
  slate:  { bg: "bg-slate-100", text: "text-slate-500" },
};

function ACard({ label, value, icon, color, warn }: {
  label: string; value: number; icon: React.ReactNode; color: string; warn?: boolean;
}) {
  const c = AC[color] ?? AC.slate;
  return (
    <div className={`bg-white rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all ${warn ? "border-red-200" : "border-slate-200"}`}>
      <div className={`w-9 h-9 rounded-xl ${c.bg} ${c.text} flex items-center justify-center mb-2`}>{icon}</div>
      <p className="text-[11px] text-slate-400 font-medium">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-0.5">{value.toLocaleString()}</p>
    </div>
  );
}
