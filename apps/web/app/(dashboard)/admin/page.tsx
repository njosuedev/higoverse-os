"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import {
  getAdminStats, getAdminShops, getAdminUsers,
  toggleShop, deleteShop, toggleUser, updateUserRole, deleteUser, createShop, createShopUser,
  STAFF_ROLES, type AdminStats, type AdminShop, type AdminUser, type CreateShopPayload, type CreateShopUserPayload, type StaffRole,
} from "@/lib/admin-api";
import { decodeShopHumanInfo } from "@/lib/product-meta";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  ShieldCheck, Store, AlertTriangle, Trash2,
  ToggleLeft, ToggleRight, RefreshCw, ChevronDown,
  UserCog, Search, Mail, Phone, MapPin, Eye, EyeOff,
  CheckCircle, XCircle,
  UserX,
  Receipt, Pencil, X, ChevronLeft,
  Plus, Loader2, Lock, User as UserIcon, UserPlus,
} from "lucide-react";
import { expenseRequest } from "@/lib/expense-api";

type Tab = "overview" | "shops" | "users" | "expenses";
type ShopSort = "newest" | "lastActive" | "name" | "users";

const LI_BLUE  = "#1372e6";
const LI_LIGHT = "#5B9DF3";
const LI_GRAY  = "#C9CDD2";
const POLL_INTERVAL = 30;

const EXP_CATEGORIES = [
  "rent","utilities","salaries","supplies",
  "maintenance","marketing","transport","taxes","other",
] as const;
const BANK_NAMES = ["Equity Bank","BK Bank","GT Bank","Access Bank","I&M Bank"];

interface AdminExpense {
  id: string; shop_id: string; title: string; category: string;
  amount: number; notes?: string; expense_date: string; created_at: string;
  has_proof?: boolean; payment_method?: string;
  bank_name?: string; bank_account?: string; receiver_phone?: string;
}
interface EditExpForm {
  title: string; category: string; amount: string; notes: string;
  expense_date: string; payment_method: string;
  bank_name: string; bank_account: string; receiver_phone: string;
}
const EMPTY_EDIT: EditExpForm = {
  title: "", category: "other", amount: "", notes: "", expense_date: "",
  payment_method: "", bank_name: "", bank_account: "", receiver_phone: "",
};

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

// ── Donut chart ───────────────────────────────────────────────────────────────
function DonutChart({ data, total, label }: { data: { name: string; value: number; fill: string }[]; total: number; label: string }) {
  return (
    <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
      <ResponsiveContainer width={160} height={160} debounce={50}>
        <PieChart width={160} height={160}>
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
  type: "delete-shop" | "delete-user";
  id: string;
  label: string;
  extra?: string;     // display label (shop name or linked shop name)
  shopId?: string;    // shop to co-delete when removing a user
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
  const [lastUpdated, setLastUpdated]     = useState<Date | null>(null);

  // Create-shop modal state
  const [showCreateShop, setShowCreateShop] = useState(false);
  const [createForm, setCreateForm]         = useState<CreateShopPayload>({
    shop_name: "", owner_email: "", owner_password: "", owner_name: "", phone: "", address: "",
  });
  const [createError, setCreateError]       = useState<string | null>(null);
  const [creatingShop, setCreatingShop]     = useState(false);

  // Create-shop-user (register staff) modal state
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [createUserForm, setCreateUserForm] = useState<CreateShopUserPayload>({
    shop_id: "", email: "", password: "", name: "", role: "cashier",
  });
  const [createUserError, setCreateUserError] = useState<string | null>(null);
  const [creatingUser, setCreatingUser]       = useState(false);
  const [showUserPassword, setShowUserPassword] = useState(false);

  // Expenses tab state
  const [expShopId, setExpShopId]           = useState<string | null>(null);
  const [expShopName, setExpShopName]       = useState("");
  const [expShopSearch, setExpShopSearch]   = useState("");
  const [expenseRows, setExpenseRows]       = useState<AdminExpense[]>([]);
  const [expTotal, setExpTotal]             = useState(0);
  const [expPage, setExpPage]               = useState(1);
  const [expLoading, setExpLoading]         = useState(false);
  const [editingExp, setEditingExp]         = useState<AdminExpense | null>(null);
  const [editForm, setEditForm]             = useState<EditExpForm>(EMPTY_EDIT);
  const [editSaving, setEditSaving]         = useState(false);
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

  // Cross-reference: hide shops whose owner user was soft-deleted (role="_deleted_" → filtered from users)
  const visibleShops = useMemo(() => {
    const userEmails = new Set(users.map((u) => u.email));
    return shops.filter((s) => s.owner_email === null || userEmails.has(s.owner_email));
  }, [shops, users]);

  const activeShops  = useMemo(() => visibleShops.filter((s) => s.is_active), [visibleShops]);

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
    { name: "Staff",  value: users.filter((u) => u.role !== "owner" && u.role !== "admin").length, fill: LI_LIGHT },
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

  const handleDeleteShop = async (id: string) => {
    setActionId(id);
    setError(null);
    try {
      // Delete every user that belongs to this shop
      const members = shopUsers[id] ?? [];
      for (const member of members) {
        try { await deleteUser(member.id); } catch { /* continue deleting others */ }
      }

      // Also delete the shop owner if not already in members list
      const targetShop = shops.find((s) => s.id === id);
      if (targetShop?.owner_email) {
        const memberIds = new Set(members.map((m) => m.id));
        const ownerUser = users.find(
          (u) => u.email === targetShop.owner_email && !memberIds.has(u.id)
        );
        if (ownerUser) {
          try { await deleteUser(ownerUser.id); } catch { /* continue */ }
        }
      }

      // Delete the shop itself
      await deleteShop(id);
      if (expandedShop === id) setExpandedShop(null);

      // Reload from backend so UI reflects true server state
      await loadAll(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete shop. Please try again.");
      await loadAll(true);
    } finally {
      setActionId(null);
      setConfirm(null);
    }
  };

  const handleDeleteUser = async (id: string, shopId?: string) => {
    setActionId(id);
    setError(null);
    try {
      // Scramble the user email first — this is the guaranteed step that permanently
      // hides the user AND their shop from all admin lists (shop filtered by owner_email).
      await deleteUser(id);
      // Also attempt to hard-delete the shop (best effort — no throw if it fails)
      if (shopId) await deleteShop(shopId);
      // Reload from backend — scrambled records are now filtered out
      await loadAll(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete account. Please try again.");
      await loadAll(true);
    } finally {
      setActionId(null);
      setConfirm(null);
    }
  };

  const handleToggleUser = async (id: string) => {
    setActionId(id);
    try { const updated = await toggleUser(id); setUsers((p) => p.map((u) => u.id === id ? updated : u)); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setActionId(null); }
  };

  const openCreateUser = (shopId?: string) => {
    setCreateUserForm({
      shop_id: shopId ?? activeShops[0]?.id ?? "",
      email: "", password: "", name: "", role: "cashier",
    });
    setCreateUserError(null);
    setShowUserPassword(false);
    setShowCreateUser(true);
  };

  const handleCreateUser = async () => {
    if (!createUserForm.shop_id) { setCreateUserError("Select a shop."); return; }
    if (!createUserForm.email.trim()) { setCreateUserError("Email is required."); return; }
    if (createUserForm.password.length < 8) { setCreateUserError("Password must be at least 8 characters."); return; }
    setCreatingUser(true);
    setCreateUserError(null);
    try {
      await createShopUser({ ...createUserForm, email: createUserForm.email.trim(), name: createUserForm.name?.trim() || undefined });
      setShowCreateUser(false);
      await loadAll(true);
    } catch (e: unknown) {
      setCreateUserError(e instanceof Error ? e.message : "Failed to register user");
    } finally {
      setCreatingUser(false);
    }
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

  // ── Admin expense helpers ─────────────────────────────────────────────────
  const loadShopExpenses = useCallback(async (shopId: string, page = 1) => {
    setExpLoading(true);
    try {
      const res = await expenseRequest(`/expenses/admin/list?shop_id=${shopId}&page=${page}&limit=50`);
      setExpenseRows(res?.data?.items || []);
      setExpTotal(res?.data?.total || 0);
      setExpPage(page);
    } catch { /* ignore */ }
    finally { setExpLoading(false); }
  }, []);

  const selectExpShop = (shop: AdminShop) => {
    setExpShopId(shop.id);
    setExpShopName(shop.name ?? shop.id);
    setExpenseRows([]);
    setExpTotal(0);
    setExpPage(1);
    loadShopExpenses(shop.id, 1);
  };

  const openEditExp = (e: AdminExpense) => {
    const d = e.expense_date ? new Date(e.expense_date) : new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    setEditForm({
      title: e.title, category: e.category, amount: String(e.amount),
      notes: e.notes || "", expense_date: dateStr,
      payment_method: e.payment_method || "",
      bank_name: e.bank_name || "", bank_account: e.bank_account || "",
      receiver_phone: e.receiver_phone || "",
    });
    setEditingExp(e);
  };

  const saveEditExp = async () => {
    if (!editingExp) return;
    setEditSaving(true);
    try {
      const res = await expenseRequest(`/expenses/admin/${editingExp.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: editForm.title.trim(),
          category: editForm.category,
          amount: Number(editForm.amount),
          notes: editForm.notes.trim() || undefined,
          expense_date: editForm.expense_date + "T00:00:00",
          payment_method: editForm.payment_method || undefined,
          bank_name: editForm.payment_method === "bank" ? editForm.bank_name || undefined : undefined,
          bank_account: editForm.payment_method === "bank" ? editForm.bank_account || undefined : undefined,
          receiver_phone: editForm.receiver_phone || undefined,
        }),
      });
      if (res?.data) {
        setExpenseRows((prev) => prev.map((r) => r.id === editingExp.id ? res.data : r));
      }
      setEditingExp(null);
    } catch { /* ignore */ }
    finally { setEditSaving(false); }
  };

  // Confirm dialog execution
  const execConfirm = async () => {
    if (!confirm) return;
    if (confirm.type === "delete-shop") {
      await handleDeleteShop(confirm.id);
    } else if (confirm.type === "delete-user") {
      await handleDeleteUser(confirm.id, confirm.shopId);
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
    .filter((u) => {
      if (userRoleFilter === "all") return true;
      if (userRoleFilter === "staff") return u.role !== "admin" && u.role !== "owner";
      return u.role === userRoleFilter;
    })
    .filter((u) => {
      if (!userSearch) return true;
      const q = userSearch.toLowerCase();
      return u.email?.toLowerCase().includes(q) || u.shop_name?.toLowerCase().includes(q);
    });

  const TABS: { key: Tab; label: string; count?: number; urgent?: boolean }[] = [
    { key: "overview",      label: "Overview" },
    { key: "shops",         label: "Active Shops",  count: activeShops.length },
    { key: "users",         label: "Users",         count: users.length },
    { key: "expenses",      label: "Shop Expenses" },
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
                {/* KPI row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Active Shops",  value: stats.active_shops,   sub: `${stats.inactive_shops} inactive`,        color: LI_BLUE  },
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
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold flex items-center gap-1.5">
                                  Team Members <span className="font-bold text-gray-600 normal-case">{members.length}</span>
                                </p>
                                <button onClick={() => openCreateUser(shop.id)}
                                  title="Register a user for this shop"
                                  className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg hover:opacity-80 transition text-white"
                                  style={{ background: LI_BLUE }}>
                                  <UserPlus size={10} /> Add
                                </button>
                              </div>
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
              <button onClick={() => openCreateUser()} disabled={activeShops.length === 0}
                title={activeShops.length === 0 ? "No shops available yet" : "Register a new shop user"}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-white font-semibold transition disabled:opacity-40 shrink-0"
                style={{ background: LI_BLUE }}>
                <UserPlus size={12} /> Register User
              </button>
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
                              onClick={() => setConfirm({ type: "delete-user", id: u.id, label: u.email, extra: u.shop_name ?? undefined, shopId: u.shop_id ?? undefined })}
                              disabled={busy}
                              title="Permanently delete this user and their shop"
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
        {/* ══ SHOP EXPENSES ══════════════════════════════════════════════════ */}
        {tab === "expenses" && (
          <div className="space-y-3">

            {/* Shop selector / back bar */}
            {!expShopId ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                    <Receipt size={14} style={{ color: LI_BLUE }} />
                    Select a Shop to View Expenses
                  </h2>
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={expShopSearch} onChange={(e) => setExpShopSearch(e.target.value)}
                      placeholder="Search shops…"
                      className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 w-44" />
                  </div>
                </div>
                {loading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: "#F3F2EE" }} />
                    ))}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {activeShops
                      .filter((s) => !expShopSearch || s.name?.toLowerCase().includes(expShopSearch.toLowerCase()) || s.owner_email?.toLowerCase().includes(expShopSearch.toLowerCase()))
                      .map((shop) => (
                        <button key={shop.id} onClick={() => selectExpShop(shop)}
                          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[#EBF2FD] transition-colors text-left group">
                          <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-sm font-bold text-white shrink-0"
                            style={{ background: shop.logo_url ? "transparent" : LI_BLUE }}>
                            {shop.logo_url
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={shop.logo_url} alt={shop.name} className="w-9 h-9 object-cover" />
                              : (shop.name ?? "?")[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 group-hover:text-[#1372e6] transition-colors">{shop.name}</p>
                            {shop.owner_email && <p className="text-[11px] text-gray-400 truncate">{shop.owner_email}</p>}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-400 shrink-0">
                            <span>{shop.user_count} users</span>
                            {isOnline(shop.last_seen_at) && (
                              <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: "#057642" }}>
                                <span className="w-1 h-1 rounded-full bg-white animate-pulse" />LIVE
                              </span>
                            )}
                            <Receipt size={13} style={{ color: LI_BLUE }} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Back + shop header */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-4 py-3 flex items-center gap-3">
                  <button onClick={() => { setExpShopId(null); setExpenseRows([]); }}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 font-medium transition border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 shrink-0">
                    <ChevronLeft size={12} /> All Shops
                  </button>
                  <Receipt size={14} style={{ color: LI_BLUE }} className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{expShopName}</p>
                    <p className="text-[11px] text-gray-400">{expTotal.toLocaleString()} expense{expTotal !== 1 ? "s" : ""} total</p>
                  </div>
                  <button onClick={() => loadShopExpenses(expShopId, expPage)} disabled={expLoading}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition disabled:opacity-40 shrink-0">
                    <RefreshCw size={11} className={expLoading ? "animate-spin" : ""} /> Refresh
                  </button>
                </div>

                {/* Expenses table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  {expLoading ? (
                    <div className="p-4 space-y-2">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: "#F3F2EE" }} />
                      ))}
                    </div>
                  ) : expenseRows.length === 0 ? (
                    <div className="py-16 text-center">
                      <Receipt size={32} className="mx-auto mb-3 text-gray-200" />
                      <p className="text-sm font-semibold text-gray-400">No expenses recorded</p>
                      <p className="text-xs text-gray-300 mt-0.5">This shop has not added any expenses yet.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            {["Date","Title","Category","Amount","Payment","Bank Name","Account / Ref","Receiver Phone","Notes",""].map((h) => (
                              <th key={h} className="px-3 py-2 text-left text-[9px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {expenseRows.map((e) => {
                            const d = e.expense_date ? new Date(e.expense_date) : null;
                            return (
                              <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                                {/* Date */}
                                <td className="px-3 py-1.5 whitespace-nowrap">
                                  {d ? (
                                    <div>
                                      <p className="text-xs font-medium text-slate-700">{d.toLocaleDateString()}</p>
                                      <p className="text-[10px] text-slate-400">{d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</p>
                                    </div>
                                  ) : <span className="text-slate-300 text-xs">—</span>}
                                </td>
                                {/* Title */}
                                <td className="px-3 py-1.5">
                                  <p className="text-xs font-semibold text-slate-800">{e.title}</p>
                                  <p className="text-[10px] text-slate-400 font-mono">{e.id.slice(0,8)}</p>
                                </td>
                                {/* Category */}
                                <td className="px-3 py-1.5">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 capitalize">{e.category}</span>
                                </td>
                                {/* Amount */}
                                <td className="px-3 py-1.5 text-xs font-bold tabular-nums" style={{ color: LI_BLUE }}>
                                  {Number(e.amount).toLocaleString()}
                                </td>
                                {/* Payment Method */}
                                <td className="px-3 py-1.5 whitespace-nowrap">
                                  {e.payment_method === "mtn" && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-100 text-yellow-700">MTN MoMo</span>
                                  )}
                                  {e.payment_method === "bank" && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">Bank</span>
                                  )}
                                  {!e.payment_method && <span className="text-slate-300 text-[10px]">—</span>}
                                </td>
                                {/* Bank Name */}
                                <td className="px-3 py-1.5 text-[10px] text-slate-600 whitespace-nowrap">
                                  {e.bank_name || <span className="text-slate-300">—</span>}
                                </td>
                                {/* Account / Ref */}
                                <td className="px-3 py-1.5 text-[10px] text-slate-600 font-mono whitespace-nowrap">
                                  {e.bank_account || <span className="text-slate-300 font-sans">—</span>}
                                </td>
                                {/* Receiver Phone */}
                                <td className="px-3 py-1.5 text-[10px] text-slate-600 whitespace-nowrap">
                                  {e.receiver_phone || <span className="text-slate-300">—</span>}
                                </td>
                                {/* Notes */}
                                <td className="px-3 py-1.5 text-[10px] text-slate-500 max-w-[140px] truncate">
                                  {e.notes || <span className="text-slate-300 italic">—</span>}
                                </td>
                                {/* Edit */}
                                <td className="px-3 py-1.5">
                                  <button onClick={() => openEditExp(e)} title="Edit expense"
                                    className="p-1.5 rounded-md hover:bg-[#EBF2FD] text-gray-300 hover:text-[#1372e6] transition">
                                    <Pencil size={12} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Pagination */}
                  {expTotal > 50 && (
                    <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-slate-50/50">
                      <p className="text-[11px] text-slate-500">
                        Page <span className="font-semibold">{expPage}</span> · {expTotal.toLocaleString()} total
                      </p>
                      <div className="flex gap-1">
                        <button disabled={expPage <= 1 || expLoading} onClick={() => loadShopExpenses(expShopId, expPage - 1)}
                          className="px-2.5 py-1 rounded-md text-[11px] border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition">
                          ← Prev
                        </button>
                        <button disabled={expPage * 50 >= expTotal || expLoading} onClick={() => loadShopExpenses(expShopId, expPage + 1)}
                          className="px-2.5 py-1 rounded-md text-[11px] border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition">
                          Next →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

      </main>

      {/* ── EDIT EXPENSE MODAL (admin) ─────────────────────────────────────────── */}
      {editingExp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 shrink-0">
              <div>
                <p className="text-xs font-bold text-slate-800">Edit Expense</p>
                <p className="text-[10px] text-slate-400">{expShopName} · {editingExp.id.slice(0,8)}</p>
              </div>
              <button onClick={() => setEditingExp(null)} className="p-1 rounded-md hover:bg-slate-100 text-slate-400 transition">
                <X size={13} />
              </button>
            </div>

            {/* Body */}
            <div className="px-4 py-3 grid gap-2 overflow-y-auto flex-1">
              {/* Title */}
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Title <span className="text-red-400">*</span></label>
                <input className="border border-slate-200 rounded-md px-2 py-1 w-full text-[11px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition"
                  value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
              </div>

              {/* Category + Amount */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Category</label>
                  <select className="border border-slate-200 rounded-md px-2 py-1 w-full text-[11px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition"
                    value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}>
                    {EXP_CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Amount <span className="text-red-400">*</span></label>
                  <input type="number" min="0" className="border border-slate-200 rounded-md px-2 py-1 w-full text-[11px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition"
                    value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} />
                </div>
              </div>

              {/* Date + Notes */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Date</label>
                  <input type="date" className="border border-slate-200 rounded-md px-2 py-1 w-full text-[11px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition"
                    value={editForm.expense_date} onChange={(e) => setEditForm({ ...editForm, expense_date: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Notes</label>
                  <input className="border border-slate-200 rounded-md px-2 py-1 w-full text-[11px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition"
                    placeholder="Optional…" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                </div>
              </div>

              {/* Payment method */}
              <div className="border border-slate-100 rounded-lg p-2 bg-slate-50/50">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Payment Method</p>
                <div className="flex gap-1.5 mb-1.5">
                  {(["","mtn","bank"] as const).map((m) => (
                    <button key={m} type="button"
                      onClick={() => setEditForm({ ...editForm, payment_method: m, bank_name: "", bank_account: "", receiver_phone: "" })}
                      className={`flex-1 py-1 rounded-md text-[10px] font-semibold border transition-all ${
                        editForm.payment_method === m
                          ? m === "mtn"  ? "bg-yellow-400 border-yellow-400 text-white"
                          : m === "bank" ? "border-[#1372e6] text-white"
                          : "bg-slate-200 border-slate-200 text-slate-700"
                          : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                      }`}
                      style={editForm.payment_method === m && m === "bank" ? { background: LI_BLUE } : {}}>
                      {m === "" ? "None" : m === "mtn" ? "MTN MoMo" : "Bank"}
                    </button>
                  ))}
                </div>
                {editForm.payment_method === "bank" && (
                  <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Bank Name</label>
                      <select className="border border-slate-200 rounded-md px-2 py-1 w-full text-[11px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition"
                        value={editForm.bank_name} onChange={(e) => setEditForm({ ...editForm, bank_name: e.target.value })}>
                        <option value="">Select bank…</option>
                        {BANK_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Account / Ref.</label>
                      <input className="border border-slate-200 rounded-md px-2 py-1 w-full text-[11px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition"
                        placeholder="Account no. or ref." value={editForm.bank_account} onChange={(e) => setEditForm({ ...editForm, bank_account: e.target.value })} />
                    </div>
                  </div>
                )}
                {editForm.payment_method !== "" && (
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Receiver Phone</label>
                    <input className="border border-slate-200 rounded-md px-2 py-1 w-full text-[11px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition"
                      placeholder="+250 7XX XXX XXX" value={editForm.receiver_phone} onChange={(e) => setEditForm({ ...editForm, receiver_phone: e.target.value })} />
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-1.5 px-4 py-2.5 border-t border-slate-100 shrink-0">
              <button onClick={() => setEditingExp(null)}
                className="px-3 py-1 rounded-md border border-slate-200 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition">
                Cancel
              </button>
              <button onClick={saveEditExp} disabled={editSaving || !editForm.title.trim() || !editForm.amount}
                className="px-3 py-1 rounded-md text-[11px] font-semibold text-white transition disabled:opacity-60 hover:opacity-90"
                style={{ background: LI_BLUE }}>
                {editSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── REGISTER SHOP USER MODAL (admin) ──────────────────────────────────── */}
      {showCreateUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <UserPlus size={14} style={{ color: LI_BLUE }} />
                <p className="text-sm font-bold text-slate-800">Register Shop User</p>
              </div>
              <button onClick={() => setShowCreateUser(false)} className="p-1 rounded-md hover:bg-slate-100 text-slate-400 transition">
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="px-4 py-3 grid gap-2.5 overflow-y-auto flex-1">
              {createUserError && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <AlertTriangle size={12} /> {createUserError}
                </div>
              )}

              {/* Shop */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Shop <span className="text-red-400">*</span></label>
                <div className="relative">
                  <Store size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <select
                    value={createUserForm.shop_id}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, shop_id: e.target.value })}
                    className="w-full pl-8 pr-6 py-2 text-xs border border-slate-200 rounded-lg appearance-none bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition">
                    <option value="">Select a shop…</option>
                    {activeShops.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Full Name</label>
                <div className="relative">
                  <UserIcon size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={createUserForm.name} onChange={(e) => setCreateUserForm({ ...createUserForm, name: e.target.value })}
                    placeholder="Optional"
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition" />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Email <span className="text-red-400">*</span></label>
                <div className="relative">
                  <Mail size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="email" value={createUserForm.email} onChange={(e) => setCreateUserForm({ ...createUserForm, email: e.target.value })}
                    placeholder="user@example.com"
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition" />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Password <span className="text-red-400">*</span></label>
                <div className="relative">
                  <Lock size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type={showUserPassword ? "text" : "password"} value={createUserForm.password}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, password: e.target.value })}
                    placeholder="At least 8 characters"
                    className="w-full pl-8 pr-8 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition" />
                  <button type="button" onClick={() => setShowUserPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showUserPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Role <span className="text-red-400">*</span></label>
                <div className="relative">
                  <UserCog size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <select
                    value={createUserForm.role}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, role: e.target.value as StaffRole })}
                    className="w-full pl-8 pr-6 py-2 text-xs border border-slate-200 rounded-lg appearance-none bg-white text-gray-800 capitalize focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition">
                    {STAFF_ROLES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
                  </select>
                  <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowCreateUser(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
                Cancel
              </button>
              <button onClick={handleCreateUser} disabled={creatingUser}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white transition disabled:opacity-60 hover:opacity-90"
                style={{ background: LI_BLUE }}>
                {creatingUser ? <><Loader2 size={12} className="animate-spin" /> Registering…</> : <><UserPlus size={12} /> Register User</>}
              </button>
            </div>
          </div>
        </div>
      )}

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
                {confirm.type === "delete-user" && (
                  <>
                    <p>• The user account will be <strong>permanently deleted</strong> from the server and database.</p>
                    <p>• Their email will be freed immediately for re-registration.</p>
                    {confirm.extra && confirm.shopId && (
                      <p>• Their shop <strong>&ldquo;{confirm.extra}&rdquo;</strong> and all its data will also be <strong>permanently deleted</strong>.</p>
                    )}
                    {confirm.extra && !confirm.shopId && (
                      <p>• Previously linked to shop: <strong>{confirm.extra}</strong>.</p>
                    )}
                    <p>• This cannot be undone.</p>
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
                {actionId ? "Deleting…" : <><Trash2 size={13} /> Yes, Delete Permanently</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
