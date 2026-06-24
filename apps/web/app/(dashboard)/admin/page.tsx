"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import {
  getAdminStats, getAdminShops, getAdminUsers,
  toggleShop, deleteShop, toggleUser, updateUserRole, deleteUser,
  type AdminStats, type AdminShop, type AdminUser,
} from "@/lib/admin-api";
import { decodeShopHumanInfo } from "@/lib/product-meta";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  ShieldCheck, Users, Store, AlertTriangle, Trash2,
  ToggleLeft, ToggleRight, RefreshCw, ChevronDown,
  UserCog, Search, Mail, Phone, MapPin, Eye, EyeOff,
  CheckCircle, XCircle, ClipboardList, BadgeCheck,
  Building2, CreditCard, Clock, UserX, ShieldX,
} from "lucide-react";

type Tab = "overview" | "applications" | "shops" | "users";
type ShopSort = "newest" | "lastActive" | "name" | "users";

const LI_BLUE  = "#1372e6";
const LI_LIGHT = "#5B9DF3";
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

// ── Parse shop application fields ─────────────────────────────────────────────
// address stored as: "TIN:123456789|Kigali, Gasabo"  or just "Kigali, Gasabo"
// description stored as: "Retail|We sell electronics"  or just plain text
function parseApplication(shop: AdminShop) {
  let tin = "";
  let district = shop.address ?? "";
  if (shop.address?.startsWith("TIN:")) {
    const parts = shop.address.slice(4).split("|");
    tin = parts[0] ?? "";
    district = parts.slice(1).join("|") ?? "";
  }
  const { type: bizType = "", desc: bizDesc = "" } = decodeShopHumanInfo(shop.description);
  return { tin, district, bizType, bizDesc };
}

// ── Is this a submitted application? (pending shops with data filled in)
function isApplication(shop: AdminShop) {
  return !shop.is_active && (
    (shop.address && shop.address.length > 0) ||
    (shop.phone && shop.phone.length > 0) ||
    (shop.description && shop.description.length > 0)
  );
}

// ── Donut chart ───────────────────────────────────────────────────────────────
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

// ── Confirm dialog ────────────────────────────────────────────────────────────
interface ConfirmState {
  type: "delete-shop" | "delete-user" | "reject-application";
  id: string;
  label: string;
  extra?: string;
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
  const [confirm, setConfirm]             = useState<ConfirmState | null>(null);
  const [roleEdit, setRoleEdit]           = useState<{ id: string; role: string } | null>(null);
  const [shopSearch, setShopSearch]       = useState("");
  const [shopFilter, setShopFilter]       = useState<"all" | "active" | "inactive">("all");
  const [shopSort, setShopSort]           = useState<ShopSort>("newest");
  const [userSearch, setUserSearch]       = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | "admin" | "owner" | "staff">("all");
  const [expandedShop, setExpandedShop]   = useState<string | null>(null);
  const [appSearch, setAppSearch]         = useState("");
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

  const applications = useMemo(() => shops.filter(isApplication), [shops]);
  const activeShops  = useMemo(() => shops.filter((s) => s.is_active), [shops]);

  const onlineNow   = activeShops.filter((s) => isOnline(s.last_seen_at)).length;
  const onlineToday = activeShops.filter((s) => wasActiveToday(s.last_seen_at)).length;
  const neverOnline = activeShops.filter((s) => !s.last_seen_at).length;
  const newThisWeek = activeShops.filter((s) => joinedThisWeek(s.created_at)).length;

  // ── Chart data ────────────────────────────────────────────────────────────
  const shopStatusData = stats ? [
    { name: "Active",      value: stats.active_shops,    fill: LI_BLUE  },
    { name: "Inactive",    value: stats.inactive_shops,  fill: LI_GRAY  },
    { name: "Online now",  value: onlineNow,             fill: "#057642" },
  ] : [];

  const userRoleData = [
    { name: "Owners", value: users.filter((u) => u.role === "owner").length, fill: LI_BLUE  },
    { name: "Staff",  value: users.filter((u) => u.role === "staff").length, fill: LI_LIGHT },
    { name: "Admins", value: users.filter((u) => u.role === "admin").length, fill: "#0D4DB8" },
  ];

  const topShopsData = [...activeShops]
    .sort((a, b) => b.user_count - a.user_count)
    .slice(0, 8)
    .map((s) => ({
      name: (s.name ?? "—").length > 14 ? (s.name ?? "").slice(0, 13) + "…" : (s.name ?? "—"),
      users: s.user_count,
    }));

  const presenceData = [
    { name: "Online now",   value: onlineNow,   fill: "#057642" },
    { name: "Active today", value: onlineToday, fill: LI_BLUE   },
    { name: "Never seen",   value: neverOnline, fill: LI_GRAY   },
  ];

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleToggleShop = async (id: string) => {
    setActionId(id);
    try {
      setShops((p) => p.map((s) => s.id === id ? { ...s, is_active: !s.is_active } : s));
      const updated = await toggleShop(id);
      setShops((p) => p.map((s) => s.id === id ? updated : s));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setActionId(null); }
  };

  const handleApproveShop = async (id: string) => {
    setActionId(id);
    try {
      const updated = await toggleShop(id);
      setShops((p) => p.map((s) => s.id === id ? updated : s));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed to approve"); }
    finally { setActionId(null); }
  };

  const handleDeleteShop = async (id: string) => {
    setActionId(id);
    try {
      // Step 1 — delete every user that belongs to this shop.
      // This scrambles their email first so the address becomes immediately reusable.
      const members = shopUsers[id] ?? [];
      const deletedUserIds = new Set<string>();
      for (const member of members) {
        try { await deleteUser(member.id); deletedUserIds.add(member.id); } catch { /* keep going */ }
      }

      // Step 2 — also delete the shop owner if they aren't already in the members list.
      // (Can happen when the backend didn't link shop_id on the user record yet.)
      const targetShop = shops.find((s) => s.id === id);
      if (targetShop?.owner_email) {
        const ownerUser = users.find(
          (u) => u.email === targetShop.owner_email && !deletedUserIds.has(u.id)
        );
        if (ownerUser) {
          try { await deleteUser(ownerUser.id); deletedUserIds.add(ownerUser.id); } catch { /* keep going */ }
        }
      }

      // Step 3 — now delete the shop itself.
      await deleteShop(id);

      // Update local state
      setShops((p) => p.filter((s) => s.id !== id));
      setUsers((p) => p.filter((u) => !deletedUserIds.has(u.id)));
      if (expandedShop === id) setExpandedShop(null);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Delete failed"); }
    finally { setActionId(null); setConfirm(null); }
  };

  const handleDeleteUser = async (id: string) => {
    setActionId(id);
    try {
      await deleteUser(id);
    } catch { /* deleteUser already swallows errors internally */ }
    // Always remove from local state — even if the backend DELETE endpoint
    // is unavailable, the email has been scrambled so the account is dead.
    setUsers((p) => p.filter((u) => u.id !== id));
    setActionId(null); setConfirm(null);
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
    try {
      const updated = await updateUserRole(roleEdit.id, roleEdit.role);
      setUsers((p) => p.map((u) => u.id === roleEdit.id ? updated : u));
      setRoleEdit(null);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setActionId(null); }
  };

  // Confirm dialog execution
  const execConfirm = async () => {
    if (!confirm) return;
    if (confirm.type === "delete-shop" || confirm.type === "reject-application") {
      await handleDeleteShop(confirm.id);
    } else if (confirm.type === "delete-user") {
      await handleDeleteUser(confirm.id);
    }
  };

  if (!ready || !user || user.role !== "admin") return null;

  // ── Filtered shops / users / applications ─────────────────────────────────
  const filteredShops = activeShops
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

  const filteredApplications = applications.filter((s) => {
    if (!appSearch) return true;
    const q = appSearch.toLowerCase();
    return s.name?.toLowerCase().includes(q) || s.owner_email?.toLowerCase().includes(q) ||
           s.phone?.includes(q) || s.address?.toLowerCase().includes(q);
  }).sort((a, b) => parseUTC(b.created_at).getTime() - parseUTC(a.created_at).getTime());

  const TABS: { key: Tab; label: string; count?: number; urgent?: boolean }[] = [
    { key: "overview",      label: "Overview" },
    { key: "applications",  label: "Applications", count: applications.length, urgent: applications.length > 0 },
    { key: "shops",         label: "Active Shops",  count: activeShops.length },
    { key: "users",         label: "Users",         count: users.length },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: "#F3F2EE" }}>
      <main className="max-w-6xl mx-auto px-3 sm:px-5 py-3 sm:py-4 space-y-4">

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#EBF2FD" }}>
              <ShieldCheck size={18} style={{ color: LI_BLUE }} />
            </div>
            <div>
              <h1 className="font-semibold text-gray-900 text-base leading-tight">Admin Control Panel</h1>
              <p className="text-xs text-gray-400">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {applications.length > 0 && (
              <button onClick={() => setTab("applications")}
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full font-semibold text-white animate-pulse"
                style={{ background: "#fa8c16" }}>
                <ClipboardList size={12} />
                {applications.length} pending review{applications.length !== 1 ? "s" : ""}
              </button>
            )}
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
              className="relative px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={tab === t.key
                ? { background: t.urgent ? "#fff7e6" : "#EBF2FD", color: t.urgent ? "#fa8c16" : LI_BLUE }
                : { color: "#666666" }}>
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full"
                  style={{
                    background: t.urgent ? "#fa8c16" : tab === t.key ? LI_BLUE : "#e8e8e8",
                    color: t.urgent || tab === t.key ? "#fff" : "#888",
                  }}>
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
                {/* Pending applications callout */}
                {applications.length > 0 && (
                  <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <ClipboardList size={18} className="text-amber-600 shrink-0" />
                    <div className="flex-1">
                      <p className="font-semibold text-amber-800 text-sm">
                        {applications.length} shop application{applications.length !== 1 ? "s" : ""} waiting for your review
                      </p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Review each submission&apos;s TIN, business type, and details before approving shop dashboard access.
                      </p>
                    </div>
                    <button onClick={() => setTab("applications")}
                      className="px-4 py-2 rounded-lg text-sm font-bold text-white shrink-0 transition hover:opacity-90"
                      style={{ background: "#fa8c16" }}>
                      Review Now
                    </button>
                  </div>
                )}

                {/* KPI row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Active Shops",  value: stats.active_shops,   sub: `${applications.length} pending review`, color: LI_BLUE  },
                    { label: "Total Users",   value: stats.total_users,    sub: `${stats.active_users} active`,           color: LI_BLUE  },
                    { label: "Online Now",    value: onlineNow,            sub: "shops live",                             color: "#057642" },
                    { label: "New This Week", value: newThisWeek,          sub: "new shops joined",                       color: LI_BLUE  },
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
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-800 text-sm mb-4">Shop Status</h3>
                    <div className="flex items-center gap-6">
                      <DonutChart data={shopStatusData} total={stats.total_shops} label="total" />
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
                      </div>
                    </div>
                  </div>
                </div>

                {/* Charts row 2 */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-800 text-sm mb-4">Top Shops by Team Size</h3>
                    {topShopsData.length === 0 ? (
                      <p className="text-gray-400 text-xs py-8 text-center">No active shops yet</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={topShopsData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                          <XAxis type="number" tick={{ fontSize: 10, fill: "#999" }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#444" }} axisLine={false} tickLine={false} width={90} />
                          <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 8 }} formatter={(v: unknown) => [String(v), "Users"]} />
                          <Bar dataKey="users" radius={[0, 4, 4, 0]} fill={LI_BLUE} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-800 text-sm mb-4">Shop Presence</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={presenceData} margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#999" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "#999" }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 8 }} formatter={(v: unknown, name: unknown) => [String(v), String(name)]} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {presenceData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Platform health */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-800 text-sm mb-4">Platform Health</h3>
                  <div className="grid sm:grid-cols-3 gap-5">
                    {[
                      { label: "Shop activation",  pct: stats.total_shops ? Math.round(stats.active_shops  / stats.total_shops  * 100) : 0, sub: `${stats.active_shops} of ${stats.total_shops}` },
                      { label: "User activation",  pct: stats.total_users ? Math.round(stats.active_users  / stats.total_users  * 100) : 0, sub: `${stats.active_users} of ${stats.total_users}` },
                      { label: "Daily engagement", pct: activeShops.length ? Math.round(onlineToday / activeShops.length * 100) : 0, sub: `${onlineToday} shops active today` },
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
              </>
            ) : null}
          </div>
        )}

        {/* ══ APPLICATIONS ════════════════════════════════════════════════════ */}
        {tab === "applications" && (
          <div className="space-y-4">

            {/* Header */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                    <ClipboardList size={15} style={{ color: "#fa8c16" }} />
                    Shop Applications — Pending Review
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Each applicant has submitted their TIN and business details. Review carefully before granting shop dashboard access.
                  </p>
                </div>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={appSearch} onChange={(e) => setAppSearch(e.target.value)}
                    placeholder="Search applications…"
                    className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-100 w-48" />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-40 bg-white rounded-xl animate-pulse border border-gray-200" />
                ))}
              </div>
            ) : filteredApplications.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <CheckCircle size={36} className="text-green-400 mx-auto mb-3" />
                <p className="font-semibold text-gray-600 text-sm">No pending applications</p>
                <p className="text-gray-400 text-xs mt-1">All submissions have been reviewed. New applications will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredApplications.map((shop) => {
                  const { tin, district, bizType, bizDesc } = parseApplication(shop);
                  const busy = actionId === shop.id;
                  const ownerUser = users.find((u) => u.shop_id === shop.id || u.email === shop.owner_email);
                  return (
                    <div key={shop.id} className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
                      {/* Status bar */}
                      <div className="flex items-center gap-2 px-5 py-2 text-xs font-semibold" style={{ background: "#fff7e6", color: "#fa8c16", borderBottom: "1px solid #fde8bd" }}>
                        <Clock size={11} />
                        Submitted {timeAgo(shop.created_at)} · Waiting for admin review
                      </div>

                      <div className="p-5">
                        <div className="flex gap-4 flex-wrap">
                          {/* Logo */}
                          <div className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center font-bold text-2xl text-white shrink-0"
                            style={{ background: shop.logo_url ? "transparent" : LI_BLUE }}>
                            {shop.logo_url
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={shop.logo_url} alt={shop.name} className="w-16 h-16 object-cover" />
                              : (shop.name ?? "?")[0].toUpperCase()}
                          </div>

                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div>
                                <h3 className="font-bold text-gray-900 text-base">{shop.name}</h3>
                                {shop.owner_email && (
                                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                    <Mail size={10} /> {shop.owner_email}
                                  </p>
                                )}
                              </div>
                              {/* Actions */}
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => handleApproveShop(shop.id)}
                                  disabled={busy}
                                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white transition disabled:opacity-40 hover:opacity-90"
                                  style={{ background: "#389e0d" }}>
                                  {busy ? "Approving…" : <><BadgeCheck size={14} /> Approve Shop</>}
                                </button>
                                <button
                                  onClick={() => setConfirm({ type: "reject-application", id: shop.id, label: shop.name ?? "this application", extra: shop.owner_email ?? undefined })}
                                  disabled={busy}
                                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-red-200 text-red-500 hover:bg-red-50 transition disabled:opacity-40">
                                  <ShieldX size={13} /> Reject & Delete
                                </button>
                              </div>
                            </div>

                            {/* Application fields */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold flex items-center gap-1 mb-1">
                                  <CreditCard size={9} /> TIN / Tax ID
                                </p>
                                <p className="text-sm font-bold text-gray-900">{tin || <span className="text-gray-300 font-normal">Not provided</span>}</p>
                              </div>
                              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold flex items-center gap-1 mb-1">
                                  <Building2 size={9} /> Business Type
                                </p>
                                <p className="text-sm font-bold text-gray-900 capitalize">{bizType || <span className="text-gray-300 font-normal">—</span>}</p>
                              </div>
                              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold flex items-center gap-1 mb-1">
                                  <MapPin size={9} /> District / Location
                                </p>
                                <p className="text-sm font-bold text-gray-900">{district || <span className="text-gray-300 font-normal">—</span>}</p>
                              </div>
                              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                <p className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold flex items-center gap-1 mb-1">
                                  <Phone size={9} /> Phone
                                </p>
                                <p className="text-sm font-bold text-gray-900">{shop.phone || <span className="text-gray-300 font-normal">—</span>}</p>
                              </div>
                            </div>

                            {bizDesc && (
                              <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                                <p className="text-[9px] uppercase tracking-wider text-blue-400 font-semibold mb-1">Business Description</p>
                                <p className="text-xs text-gray-700 leading-relaxed">{bizDesc}</p>
                              </div>
                            )}

                            {/* Owner account info */}
                            {ownerUser && (
                              <div className="mt-3 flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: LI_BLUE }}>
                                  {ownerUser.email[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-gray-700 font-medium truncate">{ownerUser.email}</p>
                                  <p className="text-[9px] text-gray-400">Account registered {fmtDate(ownerUser.created_at)}</p>
                                </div>
                                <span className="text-[9px] text-gray-400 capitalize shrink-0">{ownerUser.role}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
              <span className="text-xs text-gray-400 shrink-0">{filteredShops.length} / {activeShops.length}</span>
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
                      <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
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
                              <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: "#057642" }}>
                                <span className="w-1 h-1 rounded-full bg-white animate-pulse" /> LIVE
                              </span>
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
                          <button
                            onClick={() => setConfirm({ type: "delete-shop", id: shop.id, label: shop.name ?? "this shop", extra: shop.owner_email ?? undefined })}
                            disabled={busy}
                            title="Permanently delete shop and all its data"
                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40">
                            <Trash2 size={13} />
                          </button>
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
                                {(() => { const { desc } = decodeShopHumanInfo(shop.description); return desc ? <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-2 mt-1">{desc}</p> : null; })()}
                              </div>
                            </div>

                            {/* Activity */}
                            <div className="bg-white rounded-xl border border-gray-200 p-4">
                              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-3">Activity</p>
                              <div className="space-y-2 text-xs">
                                {[
                                  { label: "Status",       value: isOnline(shop.last_seen_at) ? "Online" : "Offline", highlight: isOnline(shop.last_seen_at) },
                                  { label: "Last seen",    value: timeAgo(shop.last_seen_at) },
                                  { label: "Exact time",   value: shop.last_seen_at ? parseUTC(shop.last_seen_at).toLocaleString() : "Never" },
                                  { label: "Active today", value: wasActiveToday(shop.last_seen_at) ? "Yes" : "No", highlight: wasActiveToday(shop.last_seen_at) },
                                  { label: "Joined",       value: fmtDate(shop.created_at) },
                                  { label: "Updated",      value: fmtDate(shop.updated_at) },
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
                                      <button
                                        onClick={() => setConfirm({ type: "delete-user", id: m.id, label: m.email })}
                                        title="Delete this user permanently"
                                        className="p-0.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition">
                                        <UserX size={11} />
                                      </button>
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
                          : <p className="text-xs text-gray-300 italic">No shop</p>}
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
                            <button
                              onClick={() => setConfirm({ type: "delete-user", id: u.id, label: u.email, extra: u.shop_name ?? undefined })}
                              disabled={busy}
                              title="Permanently delete this user and all their data"
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-500 hover:text-white font-medium border border-red-200 hover:border-red-500 transition disabled:opacity-40">
                              <UserX size={11} /> Delete
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-gray-300 italic">you</span>
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

      {/* ── CONFIRM DIALOG ────────────────────────────────────────────────────── */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                {confirm.type === "delete-user" ? <UserX size={18} className="text-red-600" /> : <Trash2 size={18} className="text-red-600" />}
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm">
                  {confirm.type === "delete-shop" && "Delete Shop Permanently"}
                  {confirm.type === "delete-user" && "Delete User Permanently"}
                  {confirm.type === "reject-application" && "Reject & Delete Application"}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">This action cannot be undone.</p>
              </div>
            </div>

            {/* Body */}
            <div className="px-5 pb-4 space-y-3">
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700 space-y-1.5">
                <p><strong className="text-red-800">&ldquo;{confirm.label}&rdquo;</strong> will be permanently deleted.</p>
                {confirm.type === "delete-shop" && (
                  <>
                    <p>• All user accounts linked to this shop will be <strong>permanently deleted</strong> and their emails freed.</p>
                    <p>• The shop owner account will also be deleted so the email can be re-registered.</p>
                    <p>• All shop data, products, and settings will be removed from the server.</p>
                    {confirm.extra && <p>• Owner: <strong>{confirm.extra}</strong></p>}
                  </>
                )}
                {confirm.type === "reject-application" && (
                  <>
                    <p>• The applicant&apos;s user account will be <strong>permanently deleted</strong> and the email freed.</p>
                    <p>• The shop application and all submitted data will be removed from the server.</p>
                    <p>• The applicant can register a new account and re-apply.</p>
                    {confirm.extra && <p>• Applicant: <strong>{confirm.extra}</strong></p>}
                  </>
                )}
                {confirm.type === "delete-user" && (
                  <>
                    <p>• The email address will be scrambled first, making it available for re-registration immediately.</p>
                    <p>• The user account will then be permanently deleted from the server.</p>
                    {confirm.extra && <p>• Linked shop: <strong>{confirm.extra}</strong> (shop itself is not deleted).</p>}
                  </>
                )}
              </div>
              <p className="text-xs text-gray-500 text-center">Are you absolutely sure you want to proceed?</p>
            </div>

            {/* Footer */}
            <div className="flex gap-2.5 px-5 pb-5">
              <button onClick={() => setConfirm(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                Cancel
              </button>
              <button onClick={execConfirm} disabled={!!actionId}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition disabled:opacity-50"
                style={{ background: "#dc2626" }}>
                {actionId ? "Deleting…" : (
                  <>
                    <Trash2 size={13} />
                    {confirm.type === "reject-application" ? "Reject & Delete" : "Yes, Delete Permanently"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
