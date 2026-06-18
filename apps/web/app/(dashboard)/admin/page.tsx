"use client";

import { useEffect, useState, useCallback } from "react";
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
  XCircle, Wifi, Globe, UserCog, BarChart3, Search, Mail,
} from "lucide-react";

type Tab = "overview" | "shops" | "users";

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function timeAgo(s: string | null) {
  if (!s) return "Never";
  const secs = Math.floor((Date.now() - new Date(s).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function isOnline(lastSeen: string | null) {
  if (!lastSeen) return false;
  return (Date.now() - new Date(lastSeen).getTime()) / 1000 < 300;
}

export default function AdminPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [shops, setShops] = useState<AdminShop[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [roleEdit, setRoleEdit] = useState<{ id: string; role: string } | null>(null);
  const [shopSearch, setShopSearch] = useState("");
  const [shopFilter, setShopFilter] = useState<"all" | "active" | "inactive">("all");
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | "admin" | "owner" | "staff">("all");

  // Access control
  useEffect(() => {
    if (!ready) return;
    if (!user) { router.replace("/login"); return; }
    if (user.role !== "admin") { router.replace("/"); }
  }, [ready, user, router]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, sh, u] = await Promise.all([getAdminStats(), getAdminShops(), getAdminUsers()]);
      setStats(s);
      setShops(sh);
      setUsers(u);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "admin") loadAll();
  }, [user, loadAll]);

  const handleToggleShop = async (id: string) => {
    setActionId(id);
    try {
      const updated = await toggleShop(id);
      setShops((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update shop");
    } finally {
      setActionId(null);
    }
  };

  const handleDeleteShop = async (id: string) => {
    setActionId(id);
    try {
      await deleteShop(id);
      setShops((prev) => prev.filter((s) => s.id !== id));
      setDeleteConfirm(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete shop");
    } finally {
      setActionId(null);
    }
  };

  const handleToggleUser = async (id: string) => {
    setActionId(id);
    try {
      const updated = await toggleUser(id);
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update user");
    } finally {
      setActionId(null);
    }
  };

  const handleRoleChange = async () => {
    if (!roleEdit) return;
    setActionId(roleEdit.id);
    try {
      const updated = await updateUserRole(roleEdit.id, roleEdit.role);
      setUsers((prev) => prev.map((u) => (u.id === roleEdit.id ? updated : u)));
      setRoleEdit(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update role");
    } finally {
      setActionId(null);
    }
  };

  if (!ready || !user || user.role !== "admin") return null;

  const TABS: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "overview", label: "Overview",  icon: <BarChart3 size={15} /> },
    { key: "shops",    label: "Shops",     icon: <Store size={15} />,  count: shops.length },
    { key: "users",    label: "Users",     icon: <Users size={15} />,  count: users.length },
  ];

  const filteredShops = shops
    .filter((s) => shopFilter === "all" || (shopFilter === "active" ? s.is_active : !s.is_active))
    .filter((s) => {
      if (!shopSearch) return true;
      const q = shopSearch.toLowerCase();
      return (
        s.name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.owner_email?.toLowerCase().includes(q) ||
        s.phone?.includes(q)
      );
    });

  const filteredUsers = users
    .filter((u) => userRoleFilter === "all" || u.role === userRoleFilter)
    .filter((u) => {
      if (!userSearch) return true;
      const q = userSearch.toLowerCase();
      return (
        u.email?.toLowerCase().includes(q) ||
        u.shop_name?.toLowerCase().includes(q)
      );
    });

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader title="Admin Panel" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* HEADER HERO */}
        <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-red-600 via-rose-600 to-red-800 p-8 text-white shadow-xl">
          <div className="absolute right-0 top-0 opacity-5 pointer-events-none">
            <ShieldCheck size={300} />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-red-200 text-sm font-medium mb-1">
                <ShieldCheck size={16} />
                Super Admin — {user.email}
              </div>
              <h1 className="text-3xl md:text-4xl font-bold">Admin Control Panel</h1>
              <p className="mt-2 text-red-100 max-w-xl text-sm">
                Manage all shops, users, and system activities across the entire Higoverse platform.
              </p>
              <div className="flex flex-wrap gap-3 mt-4">
                <div className="bg-white/10 backdrop-blur px-3 py-2 rounded-xl text-sm">
                  <p className="text-red-200 text-xs">Total Shops</p>
                  <p className="font-bold">{stats?.total_shops ?? "—"}</p>
                </div>
                <div className="bg-white/10 backdrop-blur px-3 py-2 rounded-xl text-sm">
                  <p className="text-red-200 text-xs">Online Now</p>
                  <p className="font-bold text-green-300">{stats?.online_shops ?? "—"}</p>
                </div>
                <div className="bg-white/10 backdrop-blur px-3 py-2 rounded-xl text-sm">
                  <p className="text-red-200 text-xs">Total Users</p>
                  <p className="font-bold">{stats?.total_users ?? "—"}</p>
                </div>
              </div>
            </div>
            <button
              onClick={loadAll}
              disabled={loading}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur px-4 py-2.5 rounded-xl text-sm font-medium transition self-start md:self-auto"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </section>

        {/* ERROR BANNER */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-3 text-red-700 text-sm flex items-center gap-2">
            <AlertTriangle size={16} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* TABS */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-2xl p-1.5 w-fit shadow-sm">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                tab === t.key
                  ? "bg-red-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.icon}
              {t.label}
              {t.count !== undefined && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  tab === t.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
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
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard label="Total Shops"    value={stats.total_shops}    icon={<Store size={20} />}       color="blue" />
                  <StatCard label="Active Shops"   value={stats.active_shops}   icon={<CheckCircle size={20} />} color="green" />
                  <StatCard label="Inactive Shops" value={stats.inactive_shops} icon={<XCircle size={20} />}     color="orange" />
                  <StatCard label="Online Now"      value={stats.online_shops}   icon={<Wifi size={20} />}        color="teal" />
                  <StatCard label="Total Users"    value={stats.total_users}    icon={<Users size={20} />}       color="indigo" />
                  <StatCard label="Active Users"   value={stats.active_users}   icon={<Activity size={20} />}   color="green" />
                  <StatCard label="Inactive Users" value={stats.inactive_users} icon={<XCircle size={20} />}    color="red" />
                  <StatCard label="Admins"         value={users.filter(u => u.role === "admin").length} icon={<ShieldCheck size={20} />} color="rose" />
                </div>

                {/* Role breakdown */}
                <div className="grid md:grid-cols-2 gap-6">
                  <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                    <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
                      <UserCog size={16} className="text-indigo-500" />
                      Users by Role
                    </h2>
                    <div className="space-y-3">
                      {(["admin", "owner", "staff"] as const).map((role) => {
                        const count = users.filter(u => u.role === role).length;
                        const pct = users.length ? Math.round((count / users.length) * 100) : 0;
                        const colors: Record<string, string> = { admin: "bg-red-500", owner: "bg-blue-500", staff: "bg-slate-400" };
                        return (
                          <div key={role}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="capitalize font-medium text-slate-700">{role}</span>
                              <span className="text-slate-500">{count} ({pct}%)</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${colors[role]}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {/* Online shops right now */}
                  <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                    <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
                      <Globe size={16} className="text-teal-500" />
                      Currently Online
                      <span className="text-xs bg-teal-100 text-teal-700 font-semibold px-2 py-0.5 rounded-full">
                        {shops.filter(s => isOnline(s.last_seen_at)).length}
                      </span>
                    </h2>
                    {shops.filter(s => isOnline(s.last_seen_at)).length === 0 ? (
                      <p className="text-slate-400 text-sm py-4 text-center">No shops online right now</p>
                    ) : (
                      <div className="space-y-2">
                        {shops.filter(s => isOnline(s.last_seen_at)).map(shop => (
                          <div key={shop.id} className="flex items-center gap-3 p-3 rounded-xl border border-green-100 bg-green-50">
                            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm text-slate-800 truncate">{shop.name}</p>
                              <p className="text-xs text-slate-400 truncate">{shop.owner_email || shop.email}</p>
                            </div>
                            <span className="text-xs text-slate-400 shrink-0">{timeAgo(shop.last_seen_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* SHOPS TAB */}
        {tab === "shops" && (
          <section className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Store size={16} className="text-blue-500" />
                  All Shops
                  <span className="text-xs bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">
                    {filteredShops.length} / {shops.length}
                  </span>
                </h2>
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  {/* Status filter */}
                  <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs font-medium">
                    {(["all", "active", "inactive"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setShopFilter(f)}
                        className={`px-2.5 py-1 rounded-md capitalize transition-all ${
                          shopFilter === f ? "bg-white shadow text-slate-800" : "text-slate-500"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  {/* Search */}
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={shopSearch}
                      onChange={e => setShopSearch(e.target.value)}
                      placeholder="Search shops..."
                      className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 w-40"
                    />
                  </div>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 bg-slate-50 animate-pulse rounded-2xl" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-400 font-medium border-b border-slate-100 bg-slate-50/50">
                      <th className="text-left px-6 py-3">Shop</th>
                      <th className="text-left px-4 py-3">Owner Account</th>
                      <th className="text-left px-4 py-3">Users</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">Online</th>
                      <th className="text-left px-4 py-3">Last Seen</th>
                      <th className="text-left px-4 py-3">Joined</th>
                      <th className="text-left px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredShops.map((shop) => {
                      const online = isOnline(shop.last_seen_at);
                      const busy = actionId === shop.id;
                      return (
                        <tr key={shop.id} className={`hover:bg-slate-50 transition-colors ${!shop.is_active ? "opacity-60" : ""}`}>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                                shop.is_active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400"
                              }`}>
                                {(shop.name || "?")[0].toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-slate-800 truncate max-w-[160px]">{shop.name}</p>
                                {shop.phone && <p className="text-xs text-slate-400">{shop.phone}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {shop.owner_email ? (
                              <div className="flex items-center gap-1.5 text-xs">
                                <Mail size={11} className="text-slate-400 shrink-0" />
                                <span className="text-slate-600 truncate max-w-[160px]">{shop.owner_email}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-300">No owner</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">
                                {shop.user_count}
                              </div>
                              <span className="text-xs text-slate-400">user{shop.user_count !== 1 ? "s" : ""}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                              shop.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                            }`}>
                              {shop.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {online ? (
                              <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                Online
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">Offline</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">{timeAgo(shop.last_seen_at)}</td>
                          <td className="px-4 py-3 text-xs text-slate-400">{fmtDate(shop.created_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleToggleShop(shop.id)}
                                disabled={busy}
                                title={shop.is_active ? "Deactivate shop" : "Activate shop"}
                                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition disabled:opacity-40 ${
                                  shop.is_active
                                    ? "border-red-200 text-red-600 hover:bg-red-50"
                                    : "border-green-200 text-green-600 hover:bg-green-50"
                                }`}
                              >
                                {shop.is_active ? (
                                  <><ToggleRight size={14} /> Disable</>
                                ) : (
                                  <><ToggleLeft size={14} /> Enable</>
                                )}
                              </button>

                              {deleteConfirm === shop.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleDeleteShop(shop.id)}
                                    disabled={busy}
                                    className="text-xs px-2.5 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-40"
                                  >
                                    Confirm Delete
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="text-xs px-2 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeleteConfirm(shop.id)}
                                  disabled={busy}
                                  title="Delete shop"
                                  className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-40"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredShops.length === 0 && (
                  <p className="text-slate-400 text-sm py-8 text-center">No shops found</p>
                )}
              </div>
            )}
          </section>
        )}

        {/* USERS TAB */}
        {tab === "users" && (
          <section className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Users size={16} className="text-indigo-500" />
                  All Users
                  <span className="text-xs bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">
                    {filteredUsers.length} / {users.length}
                  </span>
                </h2>
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  {/* Role filter */}
                  <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs font-medium">
                    {(["all", "admin", "owner", "staff"] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => setUserRoleFilter(r)}
                        className={`px-2.5 py-1 rounded-md capitalize transition-all ${
                          userRoleFilter === r ? "bg-white shadow text-slate-800" : "text-slate-500"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  {/* Search */}
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                      placeholder="Search users..."
                      className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 w-40"
                    />
                  </div>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 bg-slate-50 animate-pulse rounded-2xl" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-400 font-medium border-b border-slate-100 bg-slate-50/50">
                      <th className="text-left px-6 py-3">User</th>
                      <th className="text-left px-4 py-3">Shop</th>
                      <th className="text-left px-4 py-3">Role</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">Joined</th>
                      <th className="text-left px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredUsers.map((u) => {
                      const isMe = u.id === user?.id;
                      const busy = actionId === u.id;
                      const roleColors: Record<string, string> = {
                        admin: "bg-red-100 text-red-700",
                        owner: "bg-blue-100 text-blue-700",
                        staff: "bg-slate-100 text-slate-600",
                      };
                      return (
                        <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${!u.is_active ? "opacity-60" : ""}`}>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                                u.role === "admin" ? "bg-red-100 text-red-700" : "bg-indigo-100 text-indigo-700"
                              }`}>
                                {(u.email || "?")[0].toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-slate-800 truncate max-w-[200px]">{u.email}</p>
                                {isMe && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">You</span>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {u.shop_name ? (
                              <div className="flex items-center gap-1.5">
                                <Store size={11} className="text-slate-400 shrink-0" />
                                <span className="text-xs text-slate-600 truncate max-w-[140px]">{u.shop_name}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {roleEdit?.id === u.id ? (
                              <div className="flex items-center gap-1.5">
                                <div className="relative">
                                  <select
                                    value={roleEdit.role}
                                    onChange={(e) => setRoleEdit({ id: u.id, role: e.target.value })}
                                    className="text-xs border border-slate-300 rounded-lg px-2 py-1 pr-6 appearance-none bg-white"
                                  >
                                    <option value="admin">admin</option>
                                    <option value="owner">owner</option>
                                    <option value="staff">staff</option>
                                  </select>
                                  <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                </div>
                                <button onClick={handleRoleChange} disabled={busy} className="text-xs px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-40">Save</button>
                                <button onClick={() => setRoleEdit(null)} className="text-xs px-2 py-1 rounded-lg text-slate-500 hover:bg-slate-100 transition">✕</button>
                              </div>
                            ) : (
                              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${roleColors[u.role] ?? roleColors.staff}`}>
                                {u.role}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                              u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                            }`}>
                              {u.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">{fmtDate(u.created_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {!isMe ? (
                                <>
                                  <button
                                    onClick={() => handleToggleUser(u.id)}
                                    disabled={busy}
                                    className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition disabled:opacity-40 ${
                                      u.is_active
                                        ? "border-red-200 text-red-600 hover:bg-red-50"
                                        : "border-green-200 text-green-600 hover:bg-green-50"
                                    }`}
                                  >
                                    {u.is_active ? (
                                      <><ToggleRight size={14} /> Disable</>
                                    ) : (
                                      <><ToggleLeft size={14} /> Enable</>
                                    )}
                                  </button>
                                  <button
                                    onClick={() => setRoleEdit({ id: u.id, role: u.role })}
                                    disabled={busy || roleEdit?.id === u.id}
                                    title="Change role"
                                    className="p-1.5 rounded-lg text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition disabled:opacity-40"
                                  >
                                    <UserCog size={14} />
                                  </button>
                                </>
                              ) : (
                                <span className="text-xs text-slate-300">Your account</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredUsers.length === 0 && (
                  <p className="text-slate-400 text-sm py-8 text-center">No users found</p>
                )}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}

const statColors: Record<string, { bg: string; text: string }> = {
  blue:   { bg: "bg-blue-50",   text: "text-blue-600" },
  green:  { bg: "bg-green-50",  text: "text-green-600" },
  orange: { bg: "bg-orange-50", text: "text-orange-600" },
  teal:   { bg: "bg-teal-50",   text: "text-teal-600" },
  indigo: { bg: "bg-indigo-50", text: "text-indigo-600" },
  red:    { bg: "bg-red-50",    text: "text-red-600" },
  rose:   { bg: "bg-rose-50",   text: "text-rose-600" },
  slate:  { bg: "bg-slate-100", text: "text-slate-500" },
};

function StatCard({ label, value, icon, color }: StatCardProps) {
  const c = statColors[color] ?? statColors.slate;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-all">
      <div className={`w-10 h-10 rounded-xl ${c.bg} ${c.text} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="text-2xl font-bold mt-0.5 text-slate-900">{value.toLocaleString()}</p>
    </div>
  );
}
