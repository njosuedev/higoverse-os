"use client";

import { Suspense, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { useRouter, useSearchParams } from "next/navigation";
import { toAdminTab } from "@/lib/admin-nav";
import {
  getAdminStats, getAdminShops, getAdminUsers, getAdminInsights,
  toggleShop, deleteShop, updateShop, verifyShopEmail, toggleUser, updateUserRole, setUserPassword, deleteUser, createShop, createShopUser,
  STAFF_ROLES, type AdminStats, type AdminShop, type AdminUser, type CreateShopPayload, type CreateShopUserPayload, type StaffRole,
  type AdminInsights, type CompanyHealth, COMPANY_HEALTH,
} from "@/lib/admin-api";
import { decodeShopHumanInfo, formatPublicAddress } from "@/lib/product-meta";
import { cleanTin, joinAddress, mergeDescription, normalizePhone, phoneError, prettyPhone, shopTin, splitAddress, tinError } from "@/lib/company";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  ShieldCheck, Store, AlertTriangle, Trash2,
  ToggleLeft, ToggleRight, RefreshCw, ChevronDown,
  UserCog, KeyRound, Search, Mail, Phone, MapPin, Eye, EyeOff,
  CheckCircle, XCircle,
  UserX,
  Pencil, X, Download,
  Plus, Loader2, Lock, User as UserIcon, UserPlus,
  Users, Activity, TrendingUp, Car, Hash,
} from "lucide-react";
import LayoutPicker from "@/app/components/admin/LayoutPicker";
import TwoStepCard from "@/app/components/admin/TwoStepCard";
import PasswordCard from "@/app/components/admin/PasswordCard";
import GrowthPanel from "@/app/components/admin/GrowthPanel";
import CompanyDetail from "@/app/components/admin/CompanyDetail";
import AuditLog from "@/app/components/admin/AuditLog";
import EditUserDialog from "@/app/components/admin/EditUserDialog";
import { HealthBadge, ago } from "@/app/components/admin/insight-ui";
import SetPasswordDialog from "@/app/components/ui/SetPasswordDialog";
import { normalizeLayout, type BusinessLayout } from "@/lib/business-layout";

type ShopSort = "newest" | "mostActive" | "lastActive" | "name" | "users";

const LI_BLUE  = "#0a66c2";
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
  if (!s) return "-";
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

// ── Form field: label, icon, the input, and its own error under it ──────────
const INPUT_CLS = "w-full pl-8 pr-3 py-2 text-xs border rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 transition";
const inputCls = (bad?: string | null) =>
  `${INPUT_CLS} ${bad ? "border-red-300 focus:ring-red-500/20 focus:border-red-400" : "border-slate-200 focus:ring-[#0a66c2]/20 focus:border-[#0a66c2]"}`;

function Field({ label, required, icon: Icon, error, hint, children }: {
  label: string; required?: boolean; icon?: typeof Store; error?: string | null; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-500 mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <div className="relative">
        {Icon && <Icon size={12} className={`absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${error ? "text-red-400" : "text-gray-400"}`} />}
        {children}
      </div>
      {error ? <p className="text-[11px] text-red-600 mt-0.5">{error}</p> : hint ? <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p> : null}
    </div>
  );
}

// ── Live refresh countdown: re-renders itself each second, not the page ──────
function Countdown({ deadline, label }: { deadline: number; label: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  return <>{label} {Math.max(0, Math.ceil((deadline - now) / 1000))}s</>;
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
interface ConfirmState {
  type: "delete-shop" | "delete-user";
  id: string;
  label: string;
  extra?: string;     // display label (shop name or linked shop name)
}

// ── Component ─────────────────────────────────────────────────────────────────
// The tab lives in the URL (/admin?tab=shops) so the sidebar and the phone's
// tab bar can open it; useSearchParams needs a Suspense boundary.
export default function AdminPage() {
  return <Suspense fallback={null}><AdminPanel /></Suspense>;
}

function AdminPanel() {
  const { user, ready } = useAuth();
  const [pwFor, setPwFor] = useState<{ id: string; name: string } | null>(null);
  const { t, lang } = useLanguage();
  const router = useRouter();

  const params = useSearchParams();
  const tab = toAdminTab(params.get("tab"));
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
  const [shopFilter, setShopFilter]       = useState<"all" | CompanyHealth>("all");
  const [shopSort, setShopSort]           = useState<ShopSort>("newest");
  const [userSearch, setUserSearch]       = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | "admin" | "owner" | "staff">("all");
  const [insights, setInsights]           = useState<AdminInsights | null>(null);
  const [detailId, setDetailId]           = useState<string | null>(null);
  const [editingUser, setEditingUser]     = useState<AdminUser | null>(null);
  const [lastUpdated, setLastUpdated]     = useState<Date | null>(null);

  // Create-shop modal state
  const [showCreateShop, setShowCreateShop] = useState(false);
  const [createForm, setCreateForm]         = useState<CreateShopPayload>({
    shop_name: "", owner_email: "", owner_password: "", owner_name: "", phone: "", tin: "", address: "", layout: "retail",
  });
  const [createError, setCreateError]       = useState<string | null>(null);
  const [creatingShop, setCreatingShop]     = useState(false);
  const [showShopPassword, setShowShopPassword] = useState(false);
  const [shopNeedsAccount, setShopNeedsAccount] = useState(true);

  // Edit-shop modal state
  const [editingShop, setEditingShop]       = useState<AdminShop | null>(null);
  const [editShopForm, setEditShopForm]     = useState({ name: "", phone: "", tin: "", address: "", description: "", layout: "retail" as BusinessLayout });
  // Errors show after the first Save, then follow the typing.
  const [editTried, setEditTried]           = useState(false);
  const [createTried, setCreateTried]       = useState(false);
  const [editShopSaving, setEditShopSaving] = useState(false);

  // Create-shop-user (register staff) modal state
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [createUserForm, setCreateUserForm] = useState<CreateShopUserPayload>({
    shop_id: "", email: "", password: "", name: "", role: "cashier",
  });
  const [createUserError, setCreateUserError] = useState<string | null>(null);
  const [creatingUser, setCreatingUser]       = useState(false);
  const [showUserPassword, setShowUserPassword] = useState(false);

  // When the next silent refresh is due (shown by <Countdown>).
  const [nextAt, setNextAt]               = useState(() => Date.now() + POLL_INTERVAL * 1000);
  const nextAtRef                         = useRef(nextAt);

  useEffect(() => {
    if (!ready) return;
    if (!user) { router.replace("/login"); return; }
    if (user.role !== "admin") router.replace("/");
  }, [ready, user, router]);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const [s, sh, u, ins] = await Promise.all([
        getAdminStats(), getAdminShops(), getAdminUsers(), getAdminInsights().catch(() => null),
      ]);
      setStats(s); setShops(sh); setUsers(u);
      if (ins) setInsights(ins);
      setLastUpdated(new Date());
      nextAtRef.current = Date.now() + POLL_INTERVAL * 1000;
      setNextAt(nextAtRef.current);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("admin.err_load"));
    } finally { setLoading(false); setRefreshing(false); }
  }, [t]);

  useEffect(() => { if (user?.role === "admin") loadAll(); }, [user, loadAll]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    // Checks once a second; only refreshes when due and the tab is visible.
    const id = setInterval(() => {
      if (!document.hidden && Date.now() >= nextAtRef.current) {
        nextAtRef.current = Date.now() + POLL_INTERVAL * 1000;
        loadAll(true);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [user, loadAll]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const shopUsers = useMemo(() => {
    const map: Record<string, AdminUser[]> = {};
    users.forEach((u) => { if (u.shop_id) { (map[u.shop_id] ??= []).push(u); } });
    return map;
  }, [users]);

  // Every company, including one whose owner account was removed.
  const visibleShops = shops;
  const insightOf = useMemo(() => new Map((insights?.companies ?? []).map((c) => [c.shop_id, c])), [insights]);

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
    { name: t("admin.role_admins"), value: users.filter((u) => u.role === "admin").length, fill: "#004182" },
  ];

  const topShopsData = [...activeShops]
    .sort((a, b) => b.user_count - a.user_count)
    .slice(0, 8)
    .map((s) => ({
      name: (s.name ?? "-").length > 14 ? (s.name ?? "").slice(0, 13) + "…" : (s.name ?? "-"),
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
    const before = shops.find((s) => s.id === id);
    try {
      setShops((p) => p.map((s) => s.id === id ? { ...s, is_active: !s.is_active } : s));
      const updated = await toggleShop(id);
      setShops((p) => p.map((s) => s.id === id ? updated : s));
    } catch (e: unknown) {
      // Put it back as it was: the server didn't change it.
      if (before) setShops((p) => p.map((s) => s.id === id ? before : s));
      setError(e instanceof Error ? e.message : t("admin.err_generic"));
    }
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
      await deleteShop(id);
      if (detailId === id) setDetailId(null);
      await loadAll(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("admin.err_delete_shop"));
    } finally {
      setActionId(null);
      setConfirm(null);
    }
  };

  const handleDeleteUser = async (id: string) => {
    setActionId(id);
    setError(null);
    try {
      await deleteUser(id);
      await loadAll(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("admin.err_delete_account"));
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
    setCreateForm({ shop_name: "", owner_email: "", owner_password: "", owner_name: "", phone: "", tin: "", address: "", description: "", layout: "retail" });
    setCreateError(null);
    setCreateTried(false);
    setShowShopPassword(false);
    setShopNeedsAccount(true);
    setShowCreateShop(true);
  };

  const createErrors = {
    shop_name: createForm.shop_name.trim() ? null : t("admin.err_shop_name_required"),
    phone: (() => { const k = phoneError(createForm.phone ?? ""); return k ? t(k) : null; })(),
    tin: (() => { const k = tinError(createForm.tin ?? ""); return k ? t(k) : null; })(),
    owner_email: shopNeedsAccount && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(createForm.owner_email?.trim() ?? "") ? t("admin.err_owner_email_required") : null,
    owner_password: shopNeedsAccount && (createForm.owner_password ?? "").length < 8 ? t("admin.err_password_min") : null,
  };
  const createBad = (k: keyof typeof createErrors) => (createTried ? createErrors[k] : null);

  const handleCreateShop = async () => {
    setCreateTried(true);
    if (Object.values(createErrors).some(Boolean)) { setCreateError(t("company.fix_errors")); return; }
    setCreatingShop(true);
    setCreateError(null);
    try {
      await createShop({
        ...createForm,
        shop_name: createForm.shop_name.trim(),
        phone: normalizePhone(createForm.phone) ?? createForm.phone.trim(),
        tin: cleanTin(createForm.tin),
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

  // The form shows what people read: the address without its map pin, the
  // description text without the JSON around it, the TIN in its own field.
  const openEditShop = (shop: AdminShop) => {
    setEditShopForm({
      name: shop.name ?? "", phone: prettyPhone(shop.phone), tin: shopTin(shop),
      address: splitAddress(shop.address).text,
      description: decodeShopHumanInfo(shop.description).desc ?? "",
      layout: normalizeLayout(shop.layout),
    });
    setEditTried(false);
    setEditError(null);
    setEditingShop(shop);
  };

  const editErrors = {
    name: editShopForm.name.trim() ? null : t("admin.err_shop_name_required"),
    phone: (() => { const k = phoneError(editShopForm.phone); return k ? t(k) : null; })(),
    tin: (() => { const k = tinError(editShopForm.tin); return k ? t(k) : null; })(),
  };
  const editBad = (k: keyof typeof editErrors) => (editTried ? editErrors[k] : null);
  const [editError, setEditError] = useState<string | null>(null);

  const handleUpdateShop = async () => {
    if (!editingShop) return;
    setEditTried(true);
    if (Object.values(editErrors).some(Boolean)) { setEditError(t("company.fix_errors")); return; }
    const before = {
      address: splitAddress(editingShop.address),
      description: decodeShopHumanInfo(editingShop.description).desc ?? "",
    };
    setEditShopSaving(true);
    setEditError(null);
    try {
      const updated = await updateShop(editingShop.id, {
        name: editShopForm.name.trim(),
        phone: normalizePhone(editShopForm.phone) ?? editShopForm.phone.trim(),
        tin: cleanTin(editShopForm.tin),
        // Only rewritten when changed, keeping the map pin either way.
        ...(editShopForm.address.trim() !== before.address.text
          ? { address: joinAddress(editShopForm.address, before.address.lat, before.address.lng) } : {}),
        ...(editShopForm.description.trim() !== before.description.trim()
          ? { description: mergeDescription(editingShop.description, editShopForm.description.trim()) } : {}),
        layout: editShopForm.layout,
      });
      setShops((p) => p.map((s) => s.id === editingShop.id ? { ...s, ...updated } : s));
      setEditingShop(null);
    } catch (e: unknown) {
      // Shown in the form, next to what needs fixing — not behind the modal.
      setEditError(e instanceof Error ? e.message : t("admin.err_update_shop"));
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

  // Confirm dialog execution
  const execConfirm = async () => {
    if (!confirm) return;
    if (confirm.type === "delete-shop") {
      await handleDeleteShop(confirm.id);
    } else if (confirm.type === "delete-user") {
      await handleDeleteUser(confirm.id);
    }
  };

  const detailShop = detailId ? visibleShops.find((s) => s.id === detailId) ?? null : null;

  /** The listed companies and how each is doing, as a spreadsheet file. */
  const exportCompaniesCsv = (list: AdminShop[]) => {
    const head = ["Company", "Status", "Health", "Type", "Owner", "Phone", "TIN", "People", "Products",
      "Sales (30 days)", "Sales (previous 30)", "Sales (all time)", "Purchases", "Expenses", "Proformas",
      "Setup done", "Joined", "Last activity"];
    const cell = (v: unknown) => {
      const x = v == null ? "" : String(v);
      // Quote everything; neutralise formulas so a spreadsheet never runs one.
      return `"${(/^[=+\-@]/.test(x) ? "'" + x : x).replace(/"/g, '""')}"`;
    };
    const lines = list.map((s) => {
      const c = insightOf.get(s.id);
      const setup = c ? Object.values(c.setup).filter(Boolean).length : 0;
      return [s.name, s.is_active ? "on" : "off", c?.health ?? "", normalizeLayout(s.layout), s.owner_email ?? "",
        s.phone ?? "", shopTin(s), s.user_count, c?.products ?? "", c?.sales_30d ?? "", c?.sales_prev_30d ?? "",
        c?.sales_total ?? "", c?.purchases ?? "", c?.expenses ?? "", c?.proformas ?? "", c ? `${setup}/6` : "",
        s.created_at?.slice(0, 10) ?? "", c?.last_activity_at?.slice(0, 16).replace("T", " ") ?? ""].map(cell).join(",");
    });
    const blob = new Blob(["﻿" + [head.map(cell).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `higoverse-companies-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  if (!ready || !user || user.role !== "admin") return null;

  // ── Filtered shops / users / applications ─────────────────────────────────
  // From every visible shop (not just active ones), so "Inactive" and "All" work.
  const filteredShops = visibleShops
    .filter((s) => shopFilter === "all" || (insightOf.get(s.id)?.health ?? (s.is_active ? "new" : "inactive")) === shopFilter)
    .filter((s) => {
      if (!shopSearch) return true;
      const q = shopSearch.toLowerCase();
      const digits = q.replace(/\D/g, "");
      return s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) ||
             s.owner_email?.toLowerCase().includes(q) || formatPublicAddress(s.address).toLowerCase().includes(q) ||
             (!!digits && ((s.phone ?? "").replace(/\D/g, "").includes(digits) || shopTin(s).includes(digits)));
    })
    .sort((a, b) => {
      if (shopSort === "name")       return (a.name ?? "").localeCompare(b.name ?? "");
      if (shopSort === "users")      return b.user_count - a.user_count;
      if (shopSort === "mostActive") return (insightOf.get(b.id)?.sales_30d ?? 0) - (insightOf.get(a.id)?.sales_30d ?? 0)
                                        || (insightOf.get(b.id)?.records_30d ?? 0) - (insightOf.get(a.id)?.records_30d ?? 0);
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
      return u.email?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q) || u.shop_name?.toLowerCase().includes(q);
    });


  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 space-y-3">
        {editingUser && (
          <EditUserDialog user={editingUser} t={t} onClose={() => setEditingUser(null)}
            onSaved={(u) => { setUsers((p) => p.map((x) => x.id === u.id ? u : x)); setEditingUser(null); }} />
        )}
        {detailShop && (
          <CompanyDetail shop={detailShop} insight={insightOf.get(detailShop.id)} months={insights?.months ?? []}
            members={shopUsers[detailShop.id] ?? []} busy={actionId === detailShop.id} t={t} lang={lang}
            onClose={() => setDetailId(null)}
            onEdit={() => openEditShop(detailShop)}
            onToggle={() => handleToggleShop(detailShop.id)}
            onVerify={() => handleVerifyEmail(detailShop.id)}
            onDelete={() => setConfirm({ type: "delete-shop", id: detailShop.id, label: detailShop.name ?? t("admin.this_shop"), extra: detailShop.owner_email ?? undefined })}
            onAddUser={() => openCreateUser(detailShop.id)} />
        )}
        {pwFor && <SetPasswordDialog name={pwFor.name} onClose={() => setPwFor(null)} onSave={(pw) => setUserPassword(pwFor.id, pw)} />}

        {/* ── Hero header ─────────────────────────────────────────────────── */}
        <div className="hgv-header-in relative overflow-hidden rounded-2xl hgv-surface px-4 sm:px-5 py-3.5">

          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/10 backdrop-blur-sm border border-white/10 shrink-0">
                <ShieldCheck size={16} className="text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-white text-sm leading-tight tracking-tight">{t("admin.panel_title")}</h1>
                  <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-white/80">
                    {t("admin.platform_badge")}
                  </span>
                </div>
                <p className="text-[11px] text-white/50 mt-0.5">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="text-[11px] text-white/60 flex items-center gap-1.5">
                {refreshing ? t("admin.updating") : <Countdown deadline={nextAt} label={t("admin.refreshes_in")} />}
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
            <button onClick={() => setError(null)} aria-label={t("common.close")} className="ml-auto text-red-300 hover:text-red-500"><X size={14} /></button>
          </div>
        )}

        {/* ══ OVERVIEW ════════════════════════════════════════════════════════ */}
        {tab === "overview" && (
          <div className="space-y-3">
            <GrowthPanel insights={insights} shops={visibleShops} loading={loading} t={t} lang={lang}
              onOpenCompany={setDetailId}
              onFilterHealth={(h) => { setShopFilter(h); router.replace("/admin?tab=shops", { scroll: false }); }} />
            <h2 className="pt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t("admin.platform_section")}</h2>
            {loading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-20 hgv-shimmer rounded-xl border border-gray-200" />
                ))}
              </div>
            ) : stats ? (
              <>
                {/* KPI row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { label: t("admin.series_companies"), value: stats.total_shops, sub: `${stats.inactive_shops} ${t("admin.inactive_suffix")}`, icon: Store    },
                    { label: t("admin.total_users"),    value: stats.total_users,    sub: `${stats.active_users} ${t("common.active")}`, icon: Users    },
                    { label: t("admin.online_now"),     value: onlineNow,            sub: t("admin.shops_live_sub"), icon: Activity },
                    { label: t("admin.new_this_week"),  value: newThisWeek,          sub: t("admin.new_shops_joined_sub"), icon: UserPlus },
                  ].map((k) => (
                    <div key={k.label} className="hgv-card-hover bg-white rounded-xl shadow-sm border border-gray-200 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[11px] text-gray-500 font-medium">{k.label}</p>
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-slate-100 text-slate-500">
                          <k.icon size={12} />
                        </div>
                      </div>
                      <p className="text-2xl font-bold tabular-nums text-slate-900">{k.value}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{k.sub}</p>
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
                          <XAxis type="number" tick={{ fontSize: 11, fill: "#767676" }} axisLine={false} tickLine={false} />
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
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#767676" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "#767676" }} axisLine={false} tickLine={false} />
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
                      <TrendingUp size={10} style={{ color: "#915907" }} />
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-slate-50/60">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <select value={shopSort} onChange={(e) => setShopSort(e.target.value as ShopSort)}
                    className="text-xs border border-gray-200 rounded-lg pl-2.5 pr-6 py-1.5 bg-white text-gray-600 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer">
                    <option value="newest">{t("admin.sort_newest")}</option>
                    <option value="mostActive">{t("admin.sort_most_active")}</option>
                    <option value="lastActive">{t("admin.sort_last_active")}</option>
                    <option value="users">{t("admin.sort_most_users")}</option>
                    <option value="name">{t("admin.sort_name_az")}</option>
                  </select>
                  <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                <div className="flex text-xs rounded-lg overflow-x-auto border border-gray-200 max-w-full">
                  {(["all", ...COMPANY_HEALTH] as const).map((f) => (
                    <button key={f} onClick={() => setShopFilter(f)} aria-pressed={shopFilter === f}
                      className="px-2.5 py-1.5 whitespace-nowrap border-r last:border-r-0 border-gray-200 transition font-medium"
                      style={shopFilter === f ? { background: LI_BLUE, color: "#fff" } : { background: "#fff", color: "#666" }}>
                      {f === "all" ? t("common.all") : t(`admin.health_${f}`)}
                      <span className="ml-1 opacity-70 tabular-nums">{f === "all" ? visibleShops.length : (insights?.health[f] ?? 0)}</span>
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
              <span className="text-xs text-gray-400 shrink-0 font-medium">{filteredShops.length} / {visibleShops.length}</span>
              <button onClick={() => exportCompaniesCsv(filteredShops)} disabled={filteredShops.length === 0}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 font-semibold transition shrink-0 hover:bg-gray-50 disabled:opacity-40">
                <Download size={12} /> {t("admin.export_csv")}
              </button>
              <button onClick={openCreateShop}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-white font-semibold transition shrink-0 shadow-sm hover:opacity-90"
                style={{ background: LI_BLUE }}>
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
                  const info     = insightOf.get(shop.id);
                  return (
                    <div key={shop.id}>
                      <div className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50/70 transition-colors">
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold text-white ring-2 ring-white shadow-sm"
                            style={{ background: shop.logo_url ? "transparent" : online ? "#057642" : LI_BLUE }}>
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
                            <button onClick={() => setDetailId(shop.id)} className="text-[13px] font-semibold text-gray-900 hover:text-[#0a66c2] hover:underline text-left">{shop.name}</button>
                            {info && <HealthBadge health={info.health} t={t} />}
                            {online && (
                              <span className="flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: "#057642" }}>
                                <span className="w-1 h-1 rounded-full bg-white animate-pulse" /> {t("admin.live")}
                              </span>
                            )}
                            {joinedThisWeek(shop.created_at) && (
                              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: LI_BLUE }}>{t("admin.new_badge")}</span>
                            )}
                            {normalizeLayout(shop.layout) === "car" && (
                              <span className="flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                <Car size={9} /> {t("layout.car")}
                              </span>
                            )}
                            {shop.owner_email ? (
                              shop.email_verified ? (
                                <span className="flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
                                  <CheckCircle size={9} /> {t("admin.verified")}
                                </span>
                              ) : (
                                <button onClick={() => handleVerifyEmail(shop.id)} disabled={busy}
                                  title={t("admin.confirm_email_title")}
                                  className="flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 transition disabled:opacity-40">
                                  <AlertTriangle size={9} /> {t("admin.unverified_verify")}
                                </button>
                              )
                            ) : (
                              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-400 border border-gray-200">{t("admin.no_account")}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            {shop.owner_email && <span className="text-[11px] text-gray-400">{shop.owner_email}</span>}
                            {shop.phone && <span className="flex items-center gap-1 text-[11px] text-gray-400"><Phone size={9} />{prettyPhone(shop.phone)}</span>}
                            {shopTin(shop)
                              ? <span className="flex items-center gap-1 text-[11px] text-gray-500 tabular-nums"><Hash size={9} />TIN {shopTin(shop)}</span>
                              : <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600"><AlertTriangle size={9} />{t("company.no_tin")}</span>}
                            {formatPublicAddress(shop.address) && <span className="flex items-center gap-1 text-[11px] text-gray-400 truncate max-w-[260px]"><MapPin size={9} />{formatPublicAddress(shop.address)}</span>}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="hidden md:flex items-center gap-4 shrink-0 text-xs text-gray-500">
                          <div className="text-center">
                            <p className="text-gray-400 text-[11px]">{t("admin.sales_30d_short")}</p>
                            <p className="font-bold text-gray-800 text-xs tabular-nums">{info?.sales_30d ?? "-"}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-gray-400 text-[11px]">{t("admin.products_short")}</p>
                            <p className="font-bold text-gray-800 text-xs tabular-nums">{info?.products ?? "-"}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-gray-400 text-[11px]">{t("admin.users_label")}</p>
                            <p className="font-bold text-gray-800 text-xs">{shop.user_count}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-gray-400 text-[11px]">{t("admin.last_activity")}</p>
                            <p className="font-semibold text-gray-800">{online ? t("common.online") : ago(info?.last_activity_at ?? shop.last_seen_at, t)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-gray-400 text-[11px]">{t("admin.joined")}</p>
                            <p className="font-semibold text-gray-800">{fmtDate(shop.created_at)}</p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setDetailId(shop.id)} title={t("admin.open_company")} aria-label={t("admin.open_company")}
                            className="p-1.5 rounded-lg transition text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                            <Eye size={14} />
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
                            disabled={busy || shop.is_active}
                            title={shop.is_active ? t("admin.delete_needs_off") : t("admin.delete_shop_title")}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-slate-50/60">
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
                style={{ background: LI_BLUE }}>
                <UserPlus size={12} /> {t("admin.register_user")}
              </button>
            </div>

            {/* Header */}
            <div className="hidden sm:grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_6.5rem_7.5rem_15rem] gap-4 px-4 py-1.5 border-b border-gray-100" style={{ background: "#F9F8F6" }}>
              {[t("common.user"), t("admin.shop_label"), t("admin.role_label"), t("admin.last_activity"), t("common.actions")].map((h) => (
                <span key={h} className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{h}</span>
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
                      className={`grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_6.5rem_7.5rem_15rem] gap-4 items-center px-4 py-2 hover:bg-slate-50/70 transition ${!u.is_active ? "opacity-50" : ""}`}>
                      <div className="min-w-0 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ring-2 ring-white shadow-sm"
                          style={{ background: LI_BLUE }}>
                          {u.email[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">{u.name || u.email}</p>
                          <p className="text-[11px] text-gray-400 truncate">{u.name ? u.email : fmtDate(u.created_at)}</p>
                        </div>
                      </div>
                      <div className="min-w-0">
                        {u.shop_name
                          ? <button onClick={() => u.shop_id && setDetailId(u.shop_id)} className="text-xs text-gray-600 truncate hover:text-[#0a66c2] hover:underline text-left max-w-full">{u.shop_name}</button>
                          : <p className="text-xs text-gray-300 italic">{t("admin.no_shop")}</p>}
                      </div>
                      <div className="shrink-0">
                        {roleEdit?.id === u.id ? (
                          <div className="flex items-center gap-1">
                            <div className="relative">
                              <select value={roleEdit.role} onChange={(e) => setRoleEdit({ id: u.id, role: e.target.value })}
                                className="text-xs border border-gray-300 rounded-lg px-2 py-1 pr-5 appearance-none focus:outline-none bg-white">
                                {STAFF_ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
                              </select>
                              <ChevronDown size={9} className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            </div>
                            <button onClick={handleRoleChange} disabled={busy}
                              className="text-xs px-2 py-1 rounded-lg text-white font-medium transition disabled:opacity-40"
                              style={{ background: LI_BLUE }}>{t("admin.save")}</button>
                            <button onClick={() => setRoleEdit(null)} aria-label={t("common.close")} className="text-gray-400 hover:text-gray-600 px-1"><X size={14} /></button>
                          </div>
                        ) : (
                          <span className="text-xs font-semibold capitalize px-2 py-0.5 rounded-full"
                            style={{ background: "#EBF2FD", color: LI_BLUE }}>
                            {u.role === "admin" ? t("nav.admin") : t(`role.${u.role}`)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 w-28">
                        {u.is_active
                          ? <CheckCircle size={13} className="text-slate-700" aria-label={t("admin.status_active")} />
                          : <XCircle size={13} className="text-gray-300" aria-label={t("admin.status_inactive")} />}
                        <span className="text-xs text-gray-500 truncate">{u.is_active ? ago(u.last_active_at, t) : t("admin.status_inactive")}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!isMe ? (
                          <>
                            <button onClick={() => handleToggleUser(u.id)} disabled={busy}
                              className="flex items-center gap-0.5 text-xs px-2.5 py-1 rounded-full border border-gray-300 text-gray-600 hover:border-gray-400 font-medium transition disabled:opacity-40">
                              {u.is_active ? <><ToggleRight size={11} />{t("admin.disable")}</> : <><ToggleLeft size={11} />{t("admin.enable")}</>}
                            </button>
                            <button onClick={() => setPwFor({ id: u.id, name: u.name || u.email })} disabled={busy}
                              className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition disabled:opacity-40"
                              title={t("setpw.title")} aria-label={t("setpw.title")}>
                              <KeyRound size={12} />
                            </button>
                            <button onClick={() => setEditingUser(u)} disabled={busy}
                              className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition disabled:opacity-40"
                              title={t("admin.edit_user")} aria-label={t("admin.edit_user")}>
                              <Pencil size={12} />
                            </button>
                            {u.shop_id && u.role !== "admin" && (
                              <button onClick={() => setRoleEdit({ id: u.id, role: u.role })} disabled={busy || roleEdit?.id === u.id}
                                className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition disabled:opacity-40"
                                title={t("admin.change_role_title")} aria-label={t("admin.change_role_title")}>
                                <UserCog size={12} />
                              </button>
                            )}
                            <button
                              onClick={() => setConfirm({ type: "delete-user", id: u.id, label: u.email, extra: u.shop_name ?? undefined })}
                              disabled={busy}
                              title={t("admin.delete_user_title")}
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-600 font-medium border border-slate-200 hover:border-red-200 transition disabled:opacity-40">
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

        {/* ══ ACTIVITY: what the admins did ═════════════════════════════════ */}
        {tab === "activity" && <AuditLog t={t} lang={lang} />}

        {/* ══ ACCOUNT: the admin's own sign-in ═══════════════════════════════ */}
        {tab === "account" && (
          <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
            <PasswordCard />
            <TwoStepCard />
          </div>
        )}

      </main>

      {/* ── CREATE SHOP MODAL (admin) ──────────────────────────────────────────── */}
      {showCreateShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90dvh]">
            {/* Header */}
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 shrink-0 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: LI_BLUE }}>
                  <Store size={14} className="text-white" />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-800">{t("admin.register_new_shop")}</p>
                  <p className="text-[11px] text-slate-400">{t("admin.register_shop_sub")}</p>
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

              <Field label={t("settings.shop_name")} required icon={Store} error={createBad("shop_name")}>
                <input value={createForm.shop_name} onChange={(e) => setCreateForm({ ...createForm, shop_name: e.target.value })}
                  placeholder={t("admin.shop_name_placeholder")} aria-invalid={!!createBad("shop_name")} className={inputCls(createBad("shop_name"))} />
              </Field>

              {/* Phone + TIN: printed on every proforma and receipt */}
              <div className="grid grid-cols-2 gap-2">
                <Field label={t("common.phone")} required icon={Phone} error={createBad("phone")} hint={t("company.phone_hint")}>
                  <input value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                    onBlur={() => { const n = normalizePhone(createForm.phone); if (n) setCreateForm((f) => ({ ...f, phone: prettyPhone(n) })); }}
                    inputMode="tel" autoComplete="tel" placeholder="0788 123 456" aria-invalid={!!createBad("phone")} className={inputCls(createBad("phone"))} />
                </Field>
                <Field label={t("company.tin")} required icon={Hash} error={createBad("tin")} hint={t("company.tin_hint")}>
                  <input value={createForm.tin} onChange={(e) => setCreateForm({ ...createForm, tin: e.target.value.replace(/[^\d ]/g, "").slice(0, 11) })}
                    inputMode="numeric" placeholder="123456789" aria-invalid={!!createBad("tin")} className={`${inputCls(createBad("tin"))} tabular-nums tracking-wider`} />
                </Field>
              </div>
              <Field label={t("common.address")} icon={MapPin}>
                <input value={createForm.address} onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                  placeholder={t("company.address_ph")} className={inputCls()} />
              </Field>

              {/* Needs platform account toggle */}
              <label className="flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-2.5 py-2 cursor-pointer bg-slate-50/50">
                <span className="text-[11px] font-medium text-gray-600">{t("admin.needs_account_toggle")}</span>
                <button type="button" role="switch" aria-checked={shopNeedsAccount}
                  onClick={() => setShopNeedsAccount((v) => !v)}
                  className="relative w-8 h-[18px] rounded-full transition-colors shrink-0"
                  style={{ background: shopNeedsAccount ? LI_BLUE : "#d1d5db" }}>
                  <span style={{ backgroundColor: "#fff" }} className={`absolute top-0.5 w-3.5 h-3.5 rounded-full shadow transition-transform ${shopNeedsAccount ? "translate-x-4" : "translate-x-0.5"}`} />
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
                        className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2] transition" />
                    </div>
                  </div>

                  {/* Owner email */}
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("admin.owner_email")} <span className="text-red-400">*</span></label>
                    <div className="relative">
                      <Mail size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="email" value={createForm.owner_email} onChange={(e) => setCreateForm({ ...createForm, owner_email: e.target.value })}
                        placeholder="owner@example.com" aria-invalid={!!createBad("owner_email")} className={inputCls(createBad("owner_email"))} />
                    </div>
                    {createBad("owner_email") && <p className="text-[11px] text-red-600 mt-0.5">{createBad("owner_email")}</p>}
                    <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
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
                        placeholder={t("admin.min_8_chars")} aria-invalid={!!createBad("owner_password")} className={`${inputCls(createBad("owner_password"))} pr-8`} />
                      <button type="button" onClick={() => setShowShopPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showShopPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                    {createBad("owner_password") && <p className="text-[11px] text-red-600 mt-0.5">{createBad("owner_password")}</p>}
                  </div>
                </>
              )}

              <LayoutPicker value={normalizeLayout(createForm.layout)} onChange={(l) => setCreateForm({ ...createForm, layout: l })} />

              {/* Description */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("items.description")}</label>
                <textarea value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder={t("admin.shop_desc_placeholder")}
                  rows={2}
                  className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2] transition resize-none" />
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
                style={{ background: LI_BLUE }}>
                {creatingShop ? <><Loader2 size={12} className="animate-spin" /> {t("admin.creating")}</> : <><Plus size={12} /> {t("admin.create_shop")}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT SHOP MODAL (admin) ────────────────────────────────────────────── */}
      {editingShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90dvh]">
            {/* Header */}
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 shrink-0 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: LI_BLUE }}>
                  <Pencil size={13} className="text-white" />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-800">{t("admin.edit_shop")}</p>
                  <p className="text-[11px] text-slate-400">{editingShop.owner_email ?? editingShop.id.slice(0, 8)}</p>
                </div>
              </div>
              <button onClick={() => setEditingShop(null)} className="p-1 rounded-md hover:bg-slate-100 text-slate-400 transition">
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="px-3.5 py-2.5 grid gap-2 overflow-y-auto flex-1">
              {editError && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <AlertTriangle size={12} /> {editError}
                </div>
              )}
              <Field label={t("settings.shop_name")} required icon={Store} error={editBad("name")}>
                <input value={editShopForm.name} onChange={(e) => setEditShopForm({ ...editShopForm, name: e.target.value })}
                  aria-invalid={!!editBad("name")} className={inputCls(editBad("name"))} />
              </Field>

              {/* Phone + TIN: printed on every proforma and receipt */}
              <div className="grid grid-cols-2 gap-2">
                <Field label={t("common.phone")} required icon={Phone} error={editBad("phone")} hint={t("company.phone_hint")}>
                  <input value={editShopForm.phone} onChange={(e) => setEditShopForm({ ...editShopForm, phone: e.target.value })}
                    onBlur={() => { const n = normalizePhone(editShopForm.phone); if (n) setEditShopForm((f) => ({ ...f, phone: prettyPhone(n) })); }}
                    inputMode="tel" autoComplete="tel" placeholder="0788 123 456" aria-invalid={!!editBad("phone")} className={inputCls(editBad("phone"))} />
                </Field>
                <Field label={t("company.tin")} required icon={Hash} error={editBad("tin")} hint={t("company.tin_hint")}>
                  <input value={editShopForm.tin} onChange={(e) => setEditShopForm({ ...editShopForm, tin: e.target.value.replace(/[^\d ]/g, "").slice(0, 11) })}
                    inputMode="numeric" placeholder="123456789" aria-invalid={!!editBad("tin")} className={`${inputCls(editBad("tin"))} tabular-nums tracking-wider`} />
                </Field>
              </div>
              <Field label={t("common.address")} icon={MapPin}
                hint={splitAddress(editingShop.address).lat != null ? t("company.pin_kept") : undefined}>
                <input value={editShopForm.address} onChange={(e) => setEditShopForm({ ...editShopForm, address: e.target.value })}
                  placeholder={t("company.address_ph")} className={inputCls()} />
              </Field>

              <LayoutPicker value={editShopForm.layout} onChange={(l) => setEditShopForm({ ...editShopForm, layout: l })} />

              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("items.description")}</label>
                <textarea value={editShopForm.description} onChange={(e) => setEditShopForm({ ...editShopForm, description: e.target.value })}
                  rows={2}
                  className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2] transition resize-none" />
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
                style={{ background: LI_BLUE }}>
                {editShopSaving ? <><Loader2 size={12} className="animate-spin" /> {t("common.saving")}</> : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── REGISTER SHOP USER MODAL (admin) ──────────────────────────────────── */}
      {showCreateUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90dvh]">
            {/* Header */}
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 shrink-0 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: LI_BLUE }}>
                  <UserPlus size={14} className="text-white" />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-800">{t("admin.register_shop_user")}</p>
                  <p className="text-[11px] text-slate-400">{t("admin.add_staff_sub")}</p>
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
                    className="w-full pl-8 pr-6 py-2 text-xs border border-slate-200 rounded-lg appearance-none bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2] transition">
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
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2] transition" />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("common.email")} <span className="text-red-400">*</span></label>
                <div className="relative">
                  <Mail size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="email" value={createUserForm.email} onChange={(e) => setCreateUserForm({ ...createUserForm, email: e.target.value })}
                    placeholder="user@example.com"
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2] transition" />
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
                    className="w-full pl-8 pr-8 py-2 text-xs border border-slate-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2] transition" />
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
                    className="w-full pl-8 pr-6 py-2 text-xs border border-slate-200 rounded-lg appearance-none bg-white text-gray-800 capitalize focus:outline-none focus:ring-1 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2] transition">
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
                style={{ background: LI_BLUE }}>
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
                    <p>• {t("admin.delete_shop_only_empty")}</p>
                    {confirm.extra && <p>• {t("admin.owner_label")} <strong>{confirm.extra}</strong></p>}
                  </>
                )}
                {confirm.type === "delete-user" && (
                  <>
                    <p>• {t("admin.delete_user_bullet1")}</p>
                    <p>• {t("admin.delete_user_bullet2")}</p>
                    {confirm.extra && (
                      <p>• {t("admin.company_stays").replace("{company}", confirm.extra)}</p>
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
