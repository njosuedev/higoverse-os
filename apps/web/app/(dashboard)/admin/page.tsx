"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { useRouter } from "next/navigation";
import {
  getAdminStats, getAdminShops, getAdminUsers,
  toggleShop, deleteShop, updateShop, verifyShopEmail, toggleUser, updateUserRole, deleteUser, createShop, createShopUser,
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
  LayoutDashboard, Users, Activity, Sparkles, TrendingUp,
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
function timeAgo(s: string | null, t: (key: string) => string) {
  if (!s) return t("admin.never");
  const secs = Math.floor((Date.now() - parseUTC(s).getTime()) / 1000);
  if (secs < 5)     return t("admin.just_now");
  if (secs < 60)    return `${secs}${t("admin.ago_suffix_s")}`;
  if (secs < 3600)  return `${Math.floor(secs / 60)}${t("admin.ago_suffix_m")}`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}${t("admin.ago_suffix_h")}`;
  return `${Math.floor(secs / 86400)}${t("admin.ago_suffix_d")}`;
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
    <div className="relative shrink-0" style={{ width: 132, height: 132 }}>
      <ResponsiveContainer width={132} height={132} debounce={50}>
        <PieChart width={132} height={132}>
          <Pie data={data} cx="50%" cy="50%" innerRadius={38} outerRadius={53}
            dataKey="value" paddingAngle={2} startAngle={90} endAngle={-270}>
            {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <p className="text-xl font-bold text-gray-900 leading-none">{total}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
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
  const { t } = useLanguage();
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
  const [showShopPassword, setShowShopPassword] = useState(false);
  const [shopNeedsAccount, setShopNeedsAccount] = useState(true);

  // Edit-shop modal state
  const [editingShop, setEditingShop]       = useState<AdminShop | null>(null);
  const [editShopForm, setEditShopForm]     = useState({ name: "", phone: "", address: "", description: "" });
  const [editShopSaving, setEditShopSaving] = useState(false);

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
      setError(e instanceof Error ? e.message : t("admin.err_load"));
    } finally { setLoading(false); setRefreshing(false); }
  }, [t]);

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
    { name: t("admin.status_active"),      value: stats.active_shops,    fill: LI_BLUE  },
    { name: t("admin.status_inactive"),    value: stats.inactive_shops,  fill: LI_GRAY  },
    { name: t("admin.status_online_now"),  value: onlineNow,             fill: "#057642" },
  ] : [];

  const userRoleData = [
    { name: t("admin.role_owners"), value: users.filter((u) => u.role === "owner").length, fill: LI_BLUE  },
    { name: t("admin.role_staff"),  value: users.filter((u) => u.role !== "owner" && u.role !== "admin").length, fill: LI_LIGHT },
    { name: t("admin.role_admins"), value: users.filter((u) => u.role === "admin").length, fill: "#0D4DB8" },
  ];

  const topShopsData = [...activeShops]
    .sort((a, b) => b.user_count - a.user_count)
    .slice(0, 8)
    .map((s) => ({
      name: (s.name ?? "—").length > 14 ? (s.name ?? "").slice(0, 13) + "…" : (s.name ?? "—"),
      users: s.user_count,
    }));

  const presenceData = [
    { name: t("admin.status_online_now"),   value: onlineNow,   fill: "#057642" },
    { name: t("admin.status_active_today"), value: onlineToday, fill: LI_BLUE   },
    { name: t("dash.never_seen"),           value: neverOnline, fill: LI_GRAY   },
  ];

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleToggleShop = async (id: string) => {
    setActionId(id);
    try {
      setShops((p) => p.map((s) => s.id === id ? { ...s, is_active: !s.is_active } : s));
      const updated = await toggleShop(id);
      setShops((p) => p.map((s) => s.id === id ? updated : s));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : t("admin.err_generic")); }
    finally { setActionId(null); }
  };

  const handleVerifyEmail = async (id: string) => {
    setActionId(id);
    try {
      const updated = await verifyShopEmail(id);
      setShops((p) => p.map((s) => s.id === id ? updated : s));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : t("admin.err_verify_email")); }
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
      setError(e instanceof Error ? e.message : t("admin.err_delete_shop"));
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
      setError(e instanceof Error ? e.message : t("admin.err_delete_account"));
      await loadAll(true);
    } finally {
      setActionId(null);
      setConfirm(null);
    }
  };

  const handleToggleUser = async (id: string) => {
    setActionId(id);
    try { const updated = await toggleUser(id); setUsers((p) => p.map((u) => u.id === id ? updated : u)); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : t("admin.err_generic")); }
    finally { setActionId(null); }
  };

  const openCreateShop = () => {
    setCreateForm({ shop_name: "", owner_email: "", owner_password: "", owner_name: "", phone: "", address: "", description: "" });
    setCreateError(null);
    setShowShopPassword(false);
    setShopNeedsAccount(true);
    setShowCreateShop(true);
  };

  const handleCreateShop = async () => {
    if (!createForm.shop_name.trim()) { setCreateError(t("admin.err_shop_name_required")); return; }
    if (!createForm.phone?.trim()) { setCreateError(t("admin.err_phone_required")); return; }
    if (shopNeedsAccount) {
      if (!createForm.owner_email?.trim()) { setCreateError(t("admin.err_owner_email_required")); return; }
      if (!createForm.owner_password || createForm.owner_password.length < 8) { setCreateError(t("admin.err_password_min")); return; }
    }
    setCreatingShop(true);
    setCreateError(null);
    try {
      await createShop({
        ...createForm,
        shop_name: createForm.shop_name.trim(),
        phone: createForm.phone.trim(),
        owner_email: shopNeedsAccount ? createForm.owner_email?.trim() : undefined,
        owner_password: shopNeedsAccount ? createForm.owner_password : undefined,
        owner_name: shopNeedsAccount ? (createForm.owner_name?.trim() || undefined) : undefined,
        address: createForm.address?.trim() || undefined,
        description: createForm.description?.trim() || undefined,
      });
      setShowCreateShop(false);
      await loadAll(true);
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : t("admin.err_create_shop"));
    } finally {
      setCreatingShop(false);
    }
  };

  const openEditShop = (shop: AdminShop) => {
    setEditShopForm({
      name: shop.name ?? "", phone: shop.phone ?? "",
      address: shop.address ?? "", description: shop.description ?? "",
    });
    setEditingShop(shop);
  };

  const handleUpdateShop = async () => {
    if (!editingShop) return;
    if (!editShopForm.name.trim()) return;
    setEditShopSaving(true);
    try {
      const updated = await updateShop(editingShop.id, {
        name: editShopForm.name.trim(),
        phone: editShopForm.phone.trim() || undefined,
        address: editShopForm.address.trim() || undefined,
        description: editShopForm.description.trim() || undefined,
      });
      setShops((p) => p.map((s) => s.id === editingShop.id ? { ...s, ...updated } : s));
      setEditingShop(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("admin.err_update_shop"));
    } finally {
      setEditShopSaving(false);
    }
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
    if (!createUserForm.shop_id) { setCreateUserError(t("admin.err_select_shop")); return; }
    if (!createUserForm.email.trim()) { setCreateUserError(t("admin.err_email_required")); return; }
    if (createUserForm.password.length < 8) { setCreateUserError(t("admin.err_password_min")); return; }
    setCreatingUser(true);
    setCreateUserError(null);
    try {
      await createShopUser({ ...createUserForm, email: createUserForm.email.trim(), name: createUserForm.name?.trim() || undefined });
      setShowCreateUser(false);
      await loadAll(true);
    } catch (e: unknown) {
      setCreateUserError(e instanceof Error ? e.message : t("admin.err_register_user"));
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
    } catch (e: unknown) { setError(e instanceof Error ? e.message : t("admin.err_generic")); }
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

  const TABS: { key: Tab; label: string; count?: number; urgent?: boolean; icon: typeof LayoutDashboard }[] = [
    { key: "overview",      label: t("admin.tab_overview"),  icon: LayoutDashboard },
    { key: "shops",         label: t("admin.tab_shops"),     count: activeShops.length, icon: Store },
    { key: "users",         label: t("admin.tab_users"),     count: users.length,      icon: Users },
    { key: "expenses",      label: t("admin.tab_expenses"),  icon: Receipt },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50">
      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 space-y-3">

        {/* ── Hero header ─────────────────────────────────────────────────── */}
        <div className="hgv-header-in relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 text-white px-4 sm:px-5 py-3.5 shadow-lg">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "18px 18px" }}
          />
          <div className="hgv-header-glow pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full blur-3xl" style={{ background: LI_BLUE, opacity: 0.25 }} />

          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/10 backdrop-blur-sm border border-white/10 shrink-0">
                <ShieldCheck size={16} className="text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-white text-sm leading-tight tracking-tight">{t("admin.panel_title")}</h1>
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-white/80">
                    <Sparkles size={9} /> {t("admin.platform_badge")}
                  </span>
                </div>
                <p className="text-[11px] text-white/50 mt-0.5">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="text-[11px] text-white/60 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {refreshing ? t("admin.updating") : `${t("admin.refreshes_in")} ${countdown}s`}
                {lastUpdated && !refreshing && <span className="text-white/30">· {timeAgo(lastUpdated.toISOString(), t)}</span>}
              </div>
              <button onClick={() => loadAll(true)} disabled={loading || refreshing}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1 rounded-full bg-white/10 border border-white/15 text-white hover:bg-white/20 transition disabled:opacity-40 font-medium backdrop-blur-sm">
                <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
                {t("common.refresh")}
              </button>
            </div>
          </div>
        </div>

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-white border border-red-200 rounded-2xl px-4 py-3 shadow-sm">
            <AlertTriangle size={14} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-300 hover:text-red-500">✕</button>
          </div>
        )}

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-1 py-1 flex gap-1 w-fit overflow-x-auto max-w-full">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  active ? "text-white shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                }`}
                style={active ? { background: `linear-gradient(135deg, ${LI_BLUE}, #0d4db8)` } : undefined}>
                <t.icon size={12} className={active ? "text-white" : "text-gray-400"} />
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className="ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: active ? "rgba(255,255,255,0.2)" : "#eef2f6",
                      color: active ? "#fff" : "#8a94a6",
                    }}>
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ══ OVERVIEW ════════════════════════════════════════════════════════ */}
        {tab === "overview" && (
          <div className="space-y-3">
            {loading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-20 hgv-shimmer rounded-xl border border-gray-200" />
                ))}
              </div>
            ) : stats ? (
              <>
                {/* Pending applications callout */}
                {/* KPI row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { label: t("admin.tab_shops"),      value: stats.active_shops,   sub: `${stats.inactive_shops} ${t("admin.inactive_suffix")}`, color: LI_BLUE,    bg: "#EBF2FD", icon: Store    },
                    { label: t("admin.total_users"),    value: stats.total_users,    sub: `${stats.active_users} ${t("common.active")}`,            color: LI_BLUE,    bg: "#EBF2FD", icon: Users    },
                    { label: t("admin.online_now"),     value: onlineNow,            sub: t("admin.shops_live_sub"),                                color: "#057642",  bg: "#E7F7EF", icon: Activity },
                    { label: t("admin.new_this_week"),  value: newThisWeek,          sub: t("admin.new_shops_joined_sub"),                          color: "#a35b00",  bg: "#FEF3E2", icon: Sparkles },
                  ].map((k) => (
                    <div key={k.label} className="hgv-card-hover bg-white rounded-xl shadow-sm border border-gray-200 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[11px] text-gray-400 font-medium">{k.label}</p>
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: k.bg }}>
                          <k.icon size={12} style={{ color: k.color }} />
                        </div>
                      </div>
                      <p className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Charts row 1 */}
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="hgv-card-hover bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <h3 className="font-semibold text-gray-800 text-xs mb-3 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-lg flex items-center justify-center" style={{ background: "#EBF2FD" }}>
                        <Store size={10} style={{ color: LI_BLUE }} />
                      </span>
                      {t("admin.chart_shop_status")}
                    </h3>
                    <div className="flex items-center gap-4">
                      <DonutChart data={shopStatusData} total={stats.total_shops} label={t("admin.donut_total")} />
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
                          {stats.total_shops ? Math.round(stats.active_shops / stats.total_shops * 100) : 0}% {t("admin.activation_rate_suffix")}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="hgv-card-hover bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <h3 className="font-semibold text-gray-800 text-xs mb-3 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-lg flex items-center justify-center" style={{ background: "#EBF2FD" }}>
                        <Users size={10} style={{ color: LI_BLUE }} />
                      </span>
                      {t("admin.chart_users_by_role")}
                    </h3>
                    <div className="flex items-center gap-4">
                      <DonutChart data={userRoleData} total={stats.total_users} label={t("admin.donut_users")} />
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
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="hgv-card-hover bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <h3 className="font-semibold text-gray-800 text-xs mb-3 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-lg flex items-center justify-center" style={{ background: "#EBF2FD" }}>
                        <UserCog size={10} style={{ color: LI_BLUE }} />
                      </span>
                      {t("admin.chart_top_shops")}
                    </h3>
                    {topShopsData.length === 0 ? (
                      <p className="text-gray-400 text-xs py-8 text-center">{t("admin.no_active_shops")}</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={170}>
                        <BarChart data={topShopsData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                          <XAxis type="number" tick={{ fontSize: 10, fill: "#999" }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#444" }} axisLine={false} tickLine={false} width={90} />
                          <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 8 }} formatter={(v: unknown) => [String(v), t("admin.users_label")]} />
                          <Bar dataKey="users" radius={[0, 4, 4, 0]} fill={LI_BLUE} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  <div className="hgv-card-hover bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <h3 className="font-semibold text-gray-800 text-xs mb-3 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-lg flex items-center justify-center" style={{ background: "#E7F7EF" }}>
                        <Activity size={10} style={{ color: "#057642" }} />
                      </span>
                      {t("admin.chart_shop_presence")}
                    </h3>
                    <ResponsiveContainer width="100%" height={170}>
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
                <div className="hgv-card-hover bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <h3 className="font-semibold text-gray-800 text-xs mb-3 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg flex items-center justify-center" style={{ background: "#FEF3E2" }}>
                      <TrendingUp size={10} style={{ color: "#a35b00" }} />
                    </span>
                    {t("admin.platform_health")}
                  </h3>
                  <div className="grid sm:grid-cols-3 gap-4">
                    {[
                      { label: t("admin.shop_activation"),  pct: stats.total_shops ? Math.round(stats.active_shops  / stats.total_shops  * 100) : 0, sub: `${stats.active_shops} ${t("common.of")} ${stats.total_shops}` },
                      { label: t("admin.user_activation"),  pct: stats.total_users ? Math.round(stats.active_users  / stats.total_users  * 100) : 0, sub: `${stats.active_users} ${t("common.of")} ${stats.total_users}` },
                      { label: t("admin.daily_engagement"), pct: activeShops.length ? Math.round(onlineToday / activeShops.length * 100) : 0, sub: `${onlineToday} ${t("admin.shops_active_today_suffix")}` },
                    ].map((m) => (
                      <div key={m.label}>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-gray-500 font-medium">{m.label}</span>
                          <span className="font-bold text-gray-900">{m.pct}%</span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: "#F1F0EC" }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${m.pct}%`, background: `linear-gradient(90deg, ${LI_BLUE}, #0d4db8)` }} />
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gradient-to-r from-slate-50/60 to-transparent">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <select value={shopSort} onChange={(e) => setShopSort(e.target.value as ShopSort)}
                    className="text-xs border border-gray-200 rounded-lg pl-2.5 pr-6 py-1.5 bg-white text-gray-600 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer">
                    <option value="newest">{t("admin.sort_newest")}</option>
                    <option value="lastActive">{t("admin.sort_last_active")}</option>
                    <option value="users">{t("admin.sort_most_users")}</option>
                    <option value="name">{t("admin.sort_name_az")}</option>
                  </select>
                  <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                <div className="flex text-xs rounded-lg overflow-hidden border border-gray-200">
                  {(["all", "active", "inactive"] as const).map((f) => (
                    <button key={f} onClick={() => setShopFilter(f)}
                      className="px-2.5 py-1.5 capitalize border-r last:border-r-0 border-gray-200 transition font-medium"
                      style={shopFilter === f ? { background: LI_BLUE, color: "#fff" } : { background: "#fff", color: "#666" }}>
                      {f === "all" ? t("common.all") : f === "active" ? t("admin.status_active") : t("admin.status_inactive")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative ml-auto">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={shopSearch} onChange={(e) => setShopSearch(e.target.value)}
                  placeholder={t("admin.search_shops_placeholder")}
                  className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 w-44" />
              </div>
              <span className="text-xs text-gray-400 shrink-0 font-medium">{filteredShops.length} / {activeShops.length}</span>
              <button onClick={openCreateShop}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-white font-semibold transition shrink-0 shadow-sm hover:opacity-90"
                style={{ background: `linear-gradient(135deg, ${LI_BLUE}, #0d4db8)` }}>
                <Plus size={12} /> {t("admin.add_shop")}
              </button>
            </div>

            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-xl hgv-shimmer" />
                ))}
              </div>
            ) : filteredShops.length === 0 ? (
              <div className="py-16 text-center">
                <Store size={32} className="mx-auto mb-3 text-gray-200" />
                <p className="text-sm font-semibold text-gray-400">{t("admin.no_shops_found")}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filteredShops.map((shop) => {
                  const online   = isOnline(shop.last_seen_at);
                  const busy     = actionId === shop.id;
                  const expanded = expandedShop === shop.id;
                  const members  = shopUsers[shop.id] ?? [];
                  return (
                    <div key={shop.id}>
                      <div className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50/70 transition-colors">
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold text-white ring-2 ring-white shadow-sm"
                            style={{ background: shop.logo_url ? "transparent" : online ? "linear-gradient(135deg,#0ea672,#057642)" : `linear-gradient(135deg, ${LI_BLUE}, #0d4db8)` }}>
                            {shop.logo_url
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={shop.logo_url} alt={shop.name} className="w-8 h-8 object-cover" />
                              : (shop.name ?? "?")[0].toUpperCase()}
                          </div>
                          {online && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-semibold text-gray-900">{shop.name}</span>
                            {online && (
                              <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: "#057642" }}>
                                <span className="w-1 h-1 rounded-full bg-white animate-pulse" /> {t("admin.live")}
                              </span>
                            )}
                            {joinedThisWeek(shop.created_at) && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: LI_BLUE }}>{t("admin.new_badge")}</span>
                            )}
                            {shop.owner_email ? (
                              shop.email_verified ? (
                                <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                                  <CheckCircle size={9} /> {t("admin.verified")}
                                </span>
                              ) : (
                                <button onClick={() => handleVerifyEmail(shop.id)} disabled={busy}
                                  title={t("admin.confirm_email_title")}
                                  className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 transition disabled:opacity-40">
                                  <AlertTriangle size={9} /> {t("admin.unverified_verify")}
                                </button>
                              )
                            ) : (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-400 border border-gray-200">{t("admin.no_account")}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            {shop.owner_email && <span className="text-[11px] text-gray-400">{shop.owner_email}</span>}
                            {shop.phone && <span className="flex items-center gap-1 text-[11px] text-gray-400"><Phone size={9} />{shop.phone}</span>}
                            {shop.address && <span className="flex items-center gap-1 text-[11px] text-gray-400"><MapPin size={9} />{shop.address}</span>}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="hidden md:flex items-center gap-4 shrink-0 text-xs text-gray-500">
                          <div className="text-center">
                            <p className="text-gray-400 text-[10px]">{t("admin.users_label")}</p>
                            <p className="font-bold text-gray-800 text-xs">{shop.user_count}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-gray-400 text-[10px]">{t("dash.last_seen")}</p>
                            <p className="font-semibold text-gray-800">{online ? t("common.online") : timeAgo(shop.last_seen_at, t)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-gray-400 text-[10px]">{t("admin.joined")}</p>
                            <p className="font-semibold text-gray-800">{fmtDate(shop.created_at)}</p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setExpandedShop(expanded ? null : shop.id)}
                            className="p-1.5 rounded-lg transition text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                            {expanded ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button onClick={() => openEditShop(shop)}
                            title={t("admin.edit_shop_title")}
                            className="p-1.5 rounded-lg transition text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleToggleShop(shop.id)} disabled={busy}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition disabled:opacity-40 font-medium">
                            {shop.is_active ? <><ToggleRight size={12} />{t("admin.disable")}</> : <><ToggleLeft size={12} />{t("admin.enable")}</>}
                          </button>
                          <button
                            onClick={() => setConfirm({ type: "delete-shop", id: shop.id, label: shop.name ?? t("admin.this_shop"), extra: shop.owner_email ?? undefined })}
                            disabled={busy}
                            title={t("admin.delete_shop_title")}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Expanded */}
                      {expanded && (
                        <div className="px-4 pb-3 pt-1 border-t border-gray-100" style={{ background: "#F9F8F6" }}>
                          <div className="grid sm:grid-cols-3 gap-2.5 mt-2">
                            {/* Info */}
                            <div className="bg-white rounded-lg border border-gray-200 p-3">
                              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2.5">{t("admin.shop_info")}</p>
                              {shop.logo_url && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={shop.logo_url} alt={shop.name} className="w-16 h-16 rounded-xl object-cover mb-3 border border-gray-100" />
                              )}
                              <div className="space-y-2">
                                {[
                                  { icon: <Store size={11} />,  label: t("common.name"),    value: shop.name },
                                  { icon: <Mail size={11} />,   label: t("common.email"),   value: shop.email ?? "—" },
                                  { icon: <Phone size={11} />,  label: t("common.phone"),   value: shop.phone ?? "—" },
                                  { icon: <MapPin size={11} />, label: t("common.address"), value: shop.address ?? "—" },
                                ].map((d) => (
                                  <div key={d.label} className="flex items-start gap-2 text-xs">
                                    <span className="text-gray-300 mt-0.5 shrink-0">{d.icon}</span>
                                    <span className="text-gray-400 w-12 shrink-0">{d.label}</span>
                                    <span className="text-gray-700 font-medium break-all">{d.value}</span>
                                  </div>
                                ))}
                                {shop.owner_email && (
                                  <div className="flex items-center gap-2 text-xs pt-1">
                                    <span className="text-gray-300 mt-0.5 shrink-0"><ShieldCheck size={11} /></span>
                                    <span className="text-gray-400 w-12 shrink-0">{t("common.email")}</span>
                                    {shop.email_verified ? (
                                      <span className="text-emerald-600 font-medium flex items-center gap-1"><CheckCircle size={11} /> {t("admin.verified")}</span>
                                    ) : (
                                      <button onClick={() => handleVerifyEmail(shop.id)} disabled={actionId === shop.id}
                                        className="text-amber-600 font-medium flex items-center gap-1 hover:underline disabled:opacity-40">
                                        <AlertTriangle size={11} /> {t("admin.unverified_click_verify")}
                                      </button>
                                    )}
                                  </div>
                                )}
                                {(() => { const { desc } = decodeShopHumanInfo(shop.description); return desc ? <p className="text-xs text-gray-400 italic border-t border-gray-100 pt-2 mt-1">{desc}</p> : null; })()}
                              </div>
                            </div>

                            {/* Activity */}
                            <div className="bg-white rounded-lg border border-gray-200 p-3">
                              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2.5">{t("admin.activity")}</p>
                              <div className="space-y-2 text-xs">
                                {[
                                  { label: t("common.status"),      value: isOnline(shop.last_seen_at) ? t("common.online") : t("admin.offline"), highlight: isOnline(shop.last_seen_at) },
                                  { label: t("dash.last_seen"),     value: timeAgo(shop.last_seen_at, t) },
                                  { label: t("admin.exact_time"),   value: shop.last_seen_at ? parseUTC(shop.last_seen_at).toLocaleString() : t("admin.never") },
                                  { label: t("admin.active_today"), value: wasActiveToday(shop.last_seen_at) ? t("common.yes") : t("common.no"), highlight: wasActiveToday(shop.last_seen_at) },
                                  { label: t("admin.joined"),       value: fmtDate(shop.created_at) },
                                  { label: t("common.updated"),     value: fmtDate(shop.updated_at) },
                                ].map((r) => (
                                  <div key={r.label} className="flex justify-between gap-2">
                                    <span className="text-gray-400">{r.label}</span>
                                    <span className={`font-medium ${r.highlight ? "text-green-700" : "text-gray-700"}`}>{r.value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Users */}
                            <div className="bg-white rounded-lg border border-gray-200 p-3">
                              <div className="flex items-center justify-between mb-2.5">
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold flex items-center gap-1.5">
                                  {t("admin.team_members")} <span className="font-bold text-gray-600 normal-case">{members.length}</span>
                                </p>
                                <button onClick={() => openCreateUser(shop.id)}
                                  title={t("admin.register_user_for_shop_title")}
                                  className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg hover:opacity-90 transition text-white shadow-sm"
                                  style={{ background: `linear-gradient(135deg, ${LI_BLUE}, #0d4db8)` }}>
                                  <UserPlus size={10} /> {t("common.add")}
                                </button>
                              </div>
                              {members.length === 0 ? (
                                <p className="text-gray-400 text-xs py-3 text-center">{t("admin.no_users_assigned")}</p>
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
                                        title={t("admin.delete_user_title")}
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gradient-to-r from-slate-50/60 to-transparent">
              <div className="flex text-xs rounded-lg overflow-hidden border border-gray-200">
                {(["all", "admin", "owner", "staff"] as const).map((r) => (
                  <button key={r} onClick={() => setUserRoleFilter(r)}
                    className="px-2.5 py-1.5 capitalize border-r last:border-r-0 border-gray-200 transition font-medium"
                    style={userRoleFilter === r ? { background: LI_BLUE, color: "#fff" } : { background: "#fff", color: "#666" }}>
                    {r === "all" ? t("common.all") : r === "admin" ? t("nav.admin") : r === "owner" ? t("admin.role_owner") : t("admin.role_staff")}
                  </button>
                ))}
              </div>
              <div className="relative ml-auto">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                  placeholder={t("admin.search_users_placeholder")}
                  className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 w-44" />
              </div>
              <span className="text-xs text-gray-400 shrink-0 font-medium">{filteredUsers.length} / {users.length}</span>
              <button onClick={() => openCreateUser()} disabled={activeShops.length === 0}
                title={activeShops.length === 0 ? t("admin.no_shops_available_title") : t("admin.register_new_shop_user_title")}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-white font-semibold transition disabled:opacity-40 shrink-0 shadow-sm hover:opacity-90"
                style={{ background: `linear-gradient(135deg, ${LI_BLUE}, #0d4db8)` }}>
                <UserPlus size={12} /> {t("admin.register_user")}
              </button>
            </div>

            {/* Header */}
            <div className="hidden sm:grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-4 py-1.5 border-b border-gray-100" style={{ background: "#F9F8F6" }}>
              {[t("common.user"), t("admin.shop_label"), t("admin.role_label"), t("common.status"), t("common.actions")].map((h) => (
                <span key={h} className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</span>
              ))}
            </div>

            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-xl hgv-shimmer" />
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-16 text-center">
                <Users size={32} className="mx-auto mb-3 text-gray-200" />
                <p className="text-sm font-semibold text-gray-400">{t("admin.no_users_found")}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filteredUsers.map((u) => {
                  const isMe = u.id === user?.id;
                  const busy = actionId === u.id;
                  return (
                    <div key={u.id}
                      className={`grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 items-center px-4 py-2 hover:bg-slate-50/70 transition ${!u.is_active ? "opacity-50" : ""}`}>
                      <div className="min-w-0 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ring-2 ring-white shadow-sm"
                          style={{ background: `linear-gradient(135deg, ${LI_BLUE}, #0d4db8)` }}>
                          {u.email[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">{u.email}</p>
                          <p className="text-[10px] text-gray-400">{fmtDate(u.created_at)}</p>
                        </div>
                      </div>
                      <div className="min-w-0">
                        {u.shop_name
                          ? <p className="text-xs text-gray-600 truncate">{u.shop_name}</p>
                          : <p className="text-xs text-gray-300 italic">{t("admin.no_shop")}</p>}
                      </div>
                      <div className="shrink-0">
                        {roleEdit?.id === u.id ? (
                          <div className="flex items-center gap-1">
                            <div className="relative">
                              <select value={roleEdit.role} onChange={(e) => setRoleEdit({ id: u.id, role: e.target.value })}
                                className="text-xs border border-gray-300 rounded-lg px-2 py-1 pr-5 appearance-none focus:outline-none bg-white">
                                <option value="admin">{t("nav.admin")}</option>
                                <option value="owner">{t("admin.role_owner")}</option>
                                <option value="staff">{t("admin.role_staff")}</option>
                              </select>
                              <ChevronDown size={9} className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            </div>
                            <button onClick={handleRoleChange} disabled={busy}
                              className="text-xs px-2 py-1 rounded-lg text-white font-medium transition disabled:opacity-40"
                              style={{ background: LI_BLUE }}>{t("admin.save")}</button>
                            <button onClick={() => setRoleEdit(null)} className="text-xs text-gray-400 hover:text-gray-600 px-1">✕</button>
                          </div>
                        ) : (
                          <span className="text-xs font-semibold capitalize px-2 py-0.5 rounded-full"
                            style={{ background: "#EBF2FD", color: LI_BLUE }}>
                            {u.role === "admin" ? t("nav.admin") : u.role === "owner" ? t("admin.role_owner") : t("admin.role_staff")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {u.is_active
                          ? <CheckCircle size={13} className="text-green-500" />
                          : <XCircle size={13} className="text-gray-300" />}
                        <span className="text-xs text-gray-500">{u.is_active ? t("admin.status_active") : t("admin.status_inactive")}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!isMe ? (
                          <>
                            <button onClick={() => handleToggleUser(u.id)} disabled={busy}
                              className="flex items-center gap-0.5 text-xs px-2.5 py-1 rounded-full border border-gray-300 text-gray-600 hover:border-gray-400 font-medium transition disabled:opacity-40">
                              {u.is_active ? <><ToggleRight size={11} />{t("admin.disable")}</> : <><ToggleLeft size={11} />{t("admin.enable")}</>}
                            </button>
                            <button onClick={() => setRoleEdit({ id: u.id, role: u.role })} disabled={busy || roleEdit?.id === u.id}
                              className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition disabled:opacity-40"
                              title={t("admin.change_role_title")}>
                              <UserCog size={12} />
                            </button>
                            <button
                              onClick={() => setConfirm({ type: "delete-user", id: u.id, label: u.email, extra: u.shop_name ?? undefined, shopId: u.shop_id ?? undefined })}
                              disabled={busy}
                              title={t("admin.delete_user_shop_title")}
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-500 hover:text-white font-medium border border-red-200 hover:border-red-500 transition disabled:opacity-40">
                              <UserX size={11} /> {t("common.delete")}
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-gray-300 italic">{t("admin.you")}</span>
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
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gradient-to-r from-slate-50/60 to-transparent">
                  <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg flex items-center justify-center" style={{ background: "#EBF2FD" }}>
                      <Receipt size={10} style={{ color: LI_BLUE }} />
                    </span>
                    {t("admin.select_shop_expenses")}
                  </h2>
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={expShopSearch} onChange={(e) => setExpShopSearch(e.target.value)}
                      placeholder={t("admin.search_shops_placeholder")}
                      className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 w-44" />
                  </div>
                </div>
                {loading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-12 rounded-xl hgv-shimmer" />
                    ))}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {activeShops
                      .filter((s) => !expShopSearch || s.name?.toLowerCase().includes(expShopSearch.toLowerCase()) || s.owner_email?.toLowerCase().includes(expShopSearch.toLowerCase()))
                      .map((shop) => (
                        <button key={shop.id} onClick={() => selectExpShop(shop)}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-[#EBF2FD] transition-colors text-left group">
                          <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold text-white shrink-0"
                            style={{ background: shop.logo_url ? "transparent" : LI_BLUE }}>
                            {shop.logo_url
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={shop.logo_url} alt={shop.name} className="w-8 h-8 object-cover" />
                              : (shop.name ?? "?")[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-gray-900 group-hover:text-[#1372e6] transition-colors">{shop.name}</p>
                            {shop.owner_email && <p className="text-[11px] text-gray-400 truncate">{shop.owner_email}</p>}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-400 shrink-0">
                            <span>{shop.user_count} {t("admin.users_suffix")}</span>
                            {isOnline(shop.last_seen_at) && (
                              <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: "#057642" }}>
                                <span className="w-1 h-1 rounded-full bg-white animate-pulse" />{t("admin.live")}
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
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-3.5 py-2.5 flex items-center gap-2.5">
                  <button onClick={() => { setExpShopId(null); setExpenseRows([]); }}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 font-medium transition border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 shrink-0">
                    <ChevronLeft size={12} /> {t("admin.all_shops")}
                  </button>
                  <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#EBF2FD" }}>
                    <Receipt size={12} style={{ color: LI_BLUE }} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900">{expShopName}</p>
                    <p className="text-[11px] text-gray-400">{expTotal.toLocaleString()} {t("admin.expenses_total")}</p>
                  </div>
                  <button onClick={() => loadShopExpenses(expShopId, expPage)} disabled={expLoading}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition disabled:opacity-40 shrink-0">
                    <RefreshCw size={11} className={expLoading ? "animate-spin" : ""} /> {t("common.refresh")}
                  </button>
                </div>

                {/* Expenses table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  {expLoading ? (
                    <div className="p-4 space-y-2">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-10 rounded-lg hgv-shimmer" />
                      ))}
                    </div>
                  ) : expenseRows.length === 0 ? (
                    <div className="py-16 text-center">
                      <Receipt size={32} className="mx-auto mb-3 text-gray-200" />
                      <p className="text-sm font-semibold text-gray-400">{t("expenses.no_expenses")}</p>
                      <p className="text-xs text-gray-300 mt-0.5">{t("admin.shop_no_expenses_sub")}</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            {[t("common.date"),t("expenses.title_field"),t("expenses.category"),t("expenses.amount"),t("admin.col_payment"),t("admin.col_bank_name"),t("admin.col_account_ref"),t("admin.col_receiver_phone"),t("common.notes"),""].map((h) => (
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
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 capitalize">{t(`expenses.cat.${e.category}`)}</span>
                                </td>
                                {/* Amount */}
                                <td className="px-3 py-1.5 text-xs font-bold tabular-nums" style={{ color: LI_BLUE }}>
                                  {Number(e.amount).toLocaleString()}
                                </td>
                                {/* Payment Method */}
                                <td className="px-3 py-1.5 whitespace-nowrap">
                                  {e.payment_method === "mtn" && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-100 text-yellow-700">{t("admin.payment_mtn")}</span>
                                  )}
                                  {e.payment_method === "bank" && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">{t("admin.payment_bank")}</span>
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
                                  <button onClick={() => openEditExp(e)} title={t("admin.edit_expense_title")}
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
                        {t("admin.page")} <span className="font-semibold">{expPage}</span> · {expTotal.toLocaleString()} {t("common.total")}
                      </p>
                      <div className="flex gap-1">
                        <button disabled={expPage <= 1 || expLoading} onClick={() => loadShopExpenses(expShopId, expPage - 1)}
                          className="px-2.5 py-1 rounded-md text-[11px] border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition">
                          ← {t("admin.prev")}
                        </button>
                        <button disabled={expPage * 50 >= expTotal || expLoading} onClick={() => loadShopExpenses(expShopId, expPage + 1)}
                          className="px-2.5 py-1 rounded-md text-[11px] border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition">
                          {t("admin.next")} →
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 shrink-0 bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg, ${LI_BLUE}, #0d4db8)` }}>
                  <Pencil size={13} className="text-white" />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-800">{t("admin.edit_expense")}</p>
                  <p className="text-[10px] text-slate-400">{expShopName} · {editingExp.id.slice(0,8)}</p>
                </div>
              </div>
              <button onClick={() => setEditingExp(null)} className="p-1 rounded-md hover:bg-slate-100 text-slate-400 transition">
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="px-4 py-3 grid gap-2 overflow-y-auto flex-1">
              {/* Title */}
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">{t("expenses.title_field")} <span className="text-red-400">*</span></label>
                <input className="border border-slate-200 rounded-md px-2 py-1 w-full text-[11px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition"
                  value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
              </div>

              {/* Category + Amount */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">{t("expenses.category")}</label>
                  <select className="border border-slate-200 rounded-md px-2 py-1 w-full text-[11px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition"
                    value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}>
                    {EXP_CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{t(`expenses.cat.${c}`)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">{t("expenses.amount")} <span className="text-red-400">*</span></label>
                  <input type="number" min="0" className="border border-slate-200 rounded-md px-2 py-1 w-full text-[11px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition"
                    value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} />
                </div>
              </div>

              {/* Date + Notes */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">{t("common.date")}</label>
                  <input type="date" className="border border-slate-200 rounded-md px-2 py-1 w-full text-[11px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition"
                    value={editForm.expense_date} onChange={(e) => setEditForm({ ...editForm, expense_date: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">{t("common.notes")}</label>
                  <input className="border border-slate-200 rounded-md px-2 py-1 w-full text-[11px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition"
                    placeholder={`${t("common.optional")}…`} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                </div>
              </div>

              {/* Payment method */}
              <div className="border border-slate-100 rounded-lg p-2 bg-slate-50/50">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{t("admin.payment_method")}</p>
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
                      {m === "" ? t("admin.payment_none") : m === "mtn" ? t("admin.payment_mtn") : t("admin.payment_bank")}
                    </button>
                  ))}
                </div>
                {editForm.payment_method === "bank" && (
                  <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 mb-0.5">{t("admin.col_bank_name")}</label>
                      <select className="border border-slate-200 rounded-md px-2 py-1 w-full text-[11px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition"
                        value={editForm.bank_name} onChange={(e) => setEditForm({ ...editForm, bank_name: e.target.value })}>
                        <option value="">{t("admin.select_bank_placeholder")}</option>
                        {BANK_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 mb-0.5">{t("admin.col_account_ref")}</label>
                      <input className="border border-slate-200 rounded-md px-2 py-1 w-full text-[11px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition"
                        placeholder={t("admin.account_ref_placeholder")} value={editForm.bank_account} onChange={(e) => setEditForm({ ...editForm, bank_account: e.target.value })} />
                    </div>
                  </div>
                )}
                {editForm.payment_method !== "" && (
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">{t("admin.col_receiver_phone")}</label>
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
                {t("common.cancel")}
              </button>
              <button onClick={saveEditExp} disabled={editSaving || !editForm.title.trim() || !editForm.amount}
                className="px-3 py-1 rounded-md text-[11px] font-semibold text-white transition disabled:opacity-60 hover:opacity-90 shadow-sm"
                style={{ background: `linear-gradient(135deg, ${LI_BLUE}, #0d4db8)` }}>
                {editSaving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE SHOP MODAL (admin) ──────────────────────────────────────────── */}
      {showCreateShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 shrink-0 bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg, ${LI_BLUE}, #0d4db8)` }}>
                  <Store size={14} className="text-white" />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-800">{t("admin.register_new_shop")}</p>
                  <p className="text-[10px] text-slate-400">{t("admin.register_shop_sub")}</p>
                </div>
              </div>
              <button onClick={() => setShowCreateShop(false)} className="p-1 rounded-md hover:bg-slate-100 text-slate-400 transition">
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="px-3.5 py-2.5 grid gap-2 overflow-y-auto flex-1">
              {createError && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <AlertTriangle size={12} /> {createError}
                </div>
              )}

              {/* Shop name */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("settings.shop_name")} <span className="text-red-400">*</span></label>
                <div className="relative">
                  <Store size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={createForm.shop_name} onChange={(e) => setCreateForm({ ...createForm, shop_name: e.target.value })}
                    placeholder={t("admin.shop_name_placeholder")}
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition" />
                </div>
              </div>

              {/* Phone + Address */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("common.phone")} <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <Phone size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                      placeholder="07XX XXX XXX"
                      className="w-full pl-8 pr-2 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("common.address")}</label>
                  <div className="relative">
                    <MapPin size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={createForm.address} onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                      placeholder={t("common.optional")}
                      className="w-full pl-8 pr-2 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition" />
                  </div>
                </div>
              </div>

              {/* Needs platform account toggle */}
              <label className="flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-2.5 py-2 cursor-pointer bg-slate-50/50">
                <span className="text-[11px] font-medium text-gray-600">{t("admin.needs_account_toggle")}</span>
                <button type="button" role="switch" aria-checked={shopNeedsAccount}
                  onClick={() => setShopNeedsAccount((v) => !v)}
                  className="relative w-8 h-[18px] rounded-full transition-colors shrink-0"
                  style={{ background: shopNeedsAccount ? LI_BLUE : "#d1d5db" }}>
                  <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${shopNeedsAccount ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
              </label>

              {shopNeedsAccount && (
                <>
                  {/* Owner name */}
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("admin.owner_full_name")}</label>
                    <div className="relative">
                      <UserIcon size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input value={createForm.owner_name} onChange={(e) => setCreateForm({ ...createForm, owner_name: e.target.value })}
                        placeholder={t("common.optional")}
                        className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition" />
                    </div>
                  </div>

                  {/* Owner email */}
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("admin.owner_email")} <span className="text-red-400">*</span></label>
                    <div className="relative">
                      <Mail size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="email" value={createForm.owner_email} onChange={(e) => setCreateForm({ ...createForm, owner_email: e.target.value })}
                        placeholder="owner@example.com"
                        className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition" />
                    </div>
                    <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                      <AlertTriangle size={9} /> {t("admin.new_shop_email_warning")}
                    </p>
                  </div>

                  {/* Owner password */}
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("admin.owner_password")} <span className="text-red-400">*</span></label>
                    <div className="relative">
                      <Lock size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type={showShopPassword ? "text" : "password"} value={createForm.owner_password}
                        onChange={(e) => setCreateForm({ ...createForm, owner_password: e.target.value })}
                        placeholder={t("admin.min_8_chars")}
                        className="w-full pl-8 pr-8 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition" />
                      <button type="button" onClick={() => setShowShopPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showShopPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Description */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("items.description")}</label>
                <textarea value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder={t("admin.shop_desc_placeholder")}
                  rows={2}
                  className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition resize-none" />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-3.5 py-2.5 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowCreateShop(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
                {t("common.cancel")}
              </button>
              <button onClick={handleCreateShop} disabled={creatingShop}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white transition disabled:opacity-60 hover:opacity-90 shadow-sm"
                style={{ background: `linear-gradient(135deg, ${LI_BLUE}, #0d4db8)` }}>
                {creatingShop ? <><Loader2 size={12} className="animate-spin" /> {t("admin.creating")}</> : <><Plus size={12} /> {t("admin.create_shop")}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT SHOP MODAL (admin) ────────────────────────────────────────────── */}
      {editingShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 shrink-0 bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg, ${LI_BLUE}, #0d4db8)` }}>
                  <Pencil size={13} className="text-white" />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-800">{t("admin.edit_shop")}</p>
                  <p className="text-[10px] text-slate-400">{editingShop.owner_email ?? editingShop.id.slice(0, 8)}</p>
                </div>
              </div>
              <button onClick={() => setEditingShop(null)} className="p-1 rounded-md hover:bg-slate-100 text-slate-400 transition">
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="px-3.5 py-2.5 grid gap-2 overflow-y-auto flex-1">
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("settings.shop_name")} <span className="text-red-400">*</span></label>
                <div className="relative">
                  <Store size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={editShopForm.name} onChange={(e) => setEditShopForm({ ...editShopForm, name: e.target.value })}
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("common.phone")}</label>
                  <div className="relative">
                    <Phone size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={editShopForm.phone} onChange={(e) => setEditShopForm({ ...editShopForm, phone: e.target.value })}
                      placeholder={t("common.optional")}
                      className="w-full pl-8 pr-2 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("common.address")}</label>
                  <div className="relative">
                    <MapPin size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={editShopForm.address} onChange={(e) => setEditShopForm({ ...editShopForm, address: e.target.value })}
                      placeholder={t("common.optional")}
                      className="w-full pl-8 pr-2 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("items.description")}</label>
                <textarea value={editShopForm.description} onChange={(e) => setEditShopForm({ ...editShopForm, description: e.target.value })}
                  rows={2}
                  className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition resize-none" />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-3.5 py-2.5 border-t border-slate-100 shrink-0">
              <button onClick={() => setEditingShop(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
                {t("common.cancel")}
              </button>
              <button onClick={handleUpdateShop} disabled={editShopSaving || !editShopForm.name.trim()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white transition disabled:opacity-60 hover:opacity-90 shadow-sm"
                style={{ background: `linear-gradient(135deg, ${LI_BLUE}, #0d4db8)` }}>
                {editShopSaving ? <><Loader2 size={12} className="animate-spin" /> {t("common.saving")}</> : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── REGISTER SHOP USER MODAL (admin) ──────────────────────────────────── */}
      {showCreateUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 shrink-0 bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg, ${LI_BLUE}, #0d4db8)` }}>
                  <UserPlus size={14} className="text-white" />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-800">{t("admin.register_shop_user")}</p>
                  <p className="text-[10px] text-slate-400">{t("admin.add_staff_sub")}</p>
                </div>
              </div>
              <button onClick={() => setShowCreateUser(false)} className="p-1 rounded-md hover:bg-slate-100 text-slate-400 transition">
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="px-3.5 py-2.5 grid gap-2 overflow-y-auto flex-1">
              {createUserError && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <AlertTriangle size={12} /> {createUserError}
                </div>
              )}

              {/* Shop */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("admin.shop_label")} <span className="text-red-400">*</span></label>
                <div className="relative">
                  <Store size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <select
                    value={createUserForm.shop_id}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, shop_id: e.target.value })}
                    className="w-full pl-8 pr-6 py-2 text-xs border border-slate-200 rounded-lg appearance-none bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition">
                    <option value="">{t("admin.select_shop_placeholder")}</option>
                    {activeShops.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("admin.full_name")}</label>
                <div className="relative">
                  <UserIcon size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={createUserForm.name} onChange={(e) => setCreateUserForm({ ...createUserForm, name: e.target.value })}
                    placeholder={t("common.optional")}
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition" />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("common.email")} <span className="text-red-400">*</span></label>
                <div className="relative">
                  <Mail size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="email" value={createUserForm.email} onChange={(e) => setCreateUserForm({ ...createUserForm, email: e.target.value })}
                    placeholder="user@example.com"
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition" />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("admin.password_label")} <span className="text-red-400">*</span></label>
                <div className="relative">
                  <Lock size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type={showUserPassword ? "text" : "password"} value={createUserForm.password}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, password: e.target.value })}
                    placeholder={t("admin.min_8_chars")}
                    className="w-full pl-8 pr-8 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition" />
                  <button type="button" onClick={() => setShowUserPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showUserPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("admin.role_label")} <span className="text-red-400">*</span></label>
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
            <div className="flex justify-end gap-2 px-3.5 py-2.5 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowCreateUser(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
                {t("common.cancel")}
              </button>
              <button onClick={handleCreateUser} disabled={creatingUser}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white transition disabled:opacity-60 hover:opacity-90 shadow-sm"
                style={{ background: `linear-gradient(135deg, ${LI_BLUE}, #0d4db8)` }}>
                {creatingUser ? <><Loader2 size={12} className="animate-spin" /> {t("admin.registering")}</> : <><UserPlus size={12} /> {t("admin.register_user")}</>}
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
                  {confirm.type === "delete-shop" && t("admin.delete_shop_permanently")}
                  {confirm.type === "delete-user" && t("admin.delete_user_permanently")}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">{t("admin.cannot_undo")}</p>
              </div>
            </div>

            {/* Body */}
            <div className="px-5 pb-4 space-y-3">
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700 space-y-1.5">
                <p><strong className="text-red-800">&ldquo;{confirm.label}&rdquo;</strong> {t("admin.will_be_permanently_deleted")}</p>
                {confirm.type === "delete-shop" && (
                  <>
                    <p>• {t("admin.delete_shop_bullet1")}</p>
                    <p>• {t("admin.delete_shop_bullet2")}</p>
                    <p>• {t("admin.delete_shop_bullet3")}</p>
                    {confirm.extra && <p>• {t("admin.owner_label")} <strong>{confirm.extra}</strong></p>}
                  </>
                )}
                {confirm.type === "delete-user" && (
                  <>
                    <p>• {t("admin.delete_user_bullet1")}</p>
                    <p>• {t("admin.delete_user_bullet2")}</p>
                    {confirm.extra && confirm.shopId && (
                      <p>• {t("admin.their_shop_prefix")} <strong>&ldquo;{confirm.extra}&rdquo;</strong> {t("admin.and_data_deleted")}</p>
                    )}
                    {confirm.extra && !confirm.shopId && (
                      <p>• {t("admin.previously_linked")} <strong>{confirm.extra}</strong>.</p>
                    )}
                    <p>• {t("admin.cannot_undo")}</p>
                  </>
                )}
              </div>
              <p className="text-xs text-gray-500 text-center">{t("admin.confirm_proceed")}</p>
            </div>

            {/* Footer */}
            <div className="flex gap-2.5 px-5 pb-5">
              <button onClick={() => setConfirm(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                {t("common.cancel")}
              </button>
              <button onClick={execConfirm} disabled={!!actionId}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition disabled:opacity-50"
                style={{ background: "#dc2626" }}>
                {actionId ? t("common.deleting") : <><Trash2 size={13} /> {t("admin.yes_delete_permanently")}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
