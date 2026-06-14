"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getUser, isAuthenticated } from "@/lib/auth";
import { itemRequest } from "@/lib/product-api";
import { partnerRequest } from "@/lib/supplier-api";
import { saleRequest } from "@/lib/sale-api";
import { authRequest } from "@/lib/auth-api";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import LoadingSkeleton from "@/app/components/dashboard/LoadingSkeleton";
import {
  User, Mail, Store, ShieldCheck, Package, Truck, ArrowRight, BarChart3,
  ShoppingCart, Users, LayoutDashboard, Settings, RefreshCw, AlertTriangle,
  TrendingUp, Clock, Globe, CheckCircle, FileText, Wifi,
} from "lucide-react";

/* ── Types ───────────────────────────────────────────────── */
interface ShopInfo {
  id: string;
  name: string;
  email: string;
  phone?: string;
  is_active: boolean;
  created_at: string | null;
}
interface StockAlert {
  id: string;
  name: string;
  quantity: number;
  selling_price: number;
}
interface Stats {
  products: number;
  partners: number;
  sales: number;
  revenue: number;
  lowStock: number;
  outOfStock: number;
}

/* ── Helpers ─────────────────────────────────────────────── */
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function fmtDate(d: Date) {
  return d.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function fmtRWF(n: number) {
  return new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 }).format(n);
}
function timeAgo(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/* ── Constants ───────────────────────────────────────────── */
const REFRESH_SEC = 30;

const SERVICES = [
  { title: "Items / Inventory", desc: "Manage products, stock and pricing.",       icon: Package,     href: "/ItemManagement",    color: "blue" },
  { title: "Partners",          desc: "Manage suppliers and customers.",            icon: Users,       href: "/PartnerManagement", color: "indigo" },
  { title: "Purchases",         desc: "Record restocks and new product purchases.", icon: Truck,       href: "/PurchaseManagement",color: "teal" },
  { title: "Sales",             desc: "Track sales transactions and revenue.",      icon: ShoppingCart,href: "/SaleManagement",    color: "orange" },
  { title: "Reports",           desc: "Business insights and analytics.",           icon: BarChart3,   href: "/reports",           color: "violet" },
  { title: "Proforma",          desc: "Generate proforma invoices.",                icon: FileText,    href: "/proforma",          color: "pink" },
  { title: "Settings",          desc: "Configure your shop preferences.",           icon: Settings,    href: "/Settings",          color: "slate" },
];

const COLORS: Record<string, { bg: string; text: string; border: string }> = {
  blue:   { bg: "bg-blue-50",   text: "text-blue-600",   border: "hover:border-blue-300" },
  indigo: { bg: "bg-indigo-50", text: "text-indigo-600", border: "hover:border-indigo-300" },
  teal:   { bg: "bg-teal-50",   text: "text-teal-600",   border: "hover:border-teal-300" },
  orange: { bg: "bg-orange-50", text: "text-orange-600", border: "hover:border-orange-300" },
  violet: { bg: "bg-violet-50", text: "text-violet-600", border: "hover:border-violet-300" },
  pink:   { bg: "bg-pink-50",   text: "text-pink-600",   border: "hover:border-pink-300" },
  slate:  { bg: "bg-slate-100", text: "text-slate-500",  border: "hover:border-slate-300" },
};

const KPI_COLORS: Record<string, { bg: string; text: string }> = {
  blue:   { bg: "bg-blue-50",   text: "text-blue-600" },
  indigo: { bg: "bg-indigo-50", text: "text-indigo-600" },
  teal:   { bg: "bg-teal-50",   text: "text-teal-600" },
  green:  { bg: "bg-green-50",  text: "text-green-600" },
  orange: { bg: "bg-orange-50", text: "text-orange-600" },
  red:    { bg: "bg-red-50",    text: "text-red-600" },
  slate:  { bg: "bg-slate-100", text: "text-slate-400" },
};

/* ── KPI Card ────────────────────────────────────────────── */
function KpiCard({ label, value, icon, color, small }: { label: string; value: string; icon: React.ReactNode; color: string; small?: boolean }) {
  const c = KPI_COLORS[color] ?? KPI_COLORS.slate;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-all">
      <div className={`w-10 h-10 rounded-xl ${c.bg} ${c.text} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className={`font-bold mt-0.5 truncate text-slate-900 ${small ? "text-base" : "text-2xl"}`}>{value}</p>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────── */
export default function HomePage() {
  // Lazy initializer runs once on the client — avoids setState inside effect
  const [user] = useState<{ name?: string; email: string; shop_id: string; role?: string } | null>(
    () => (typeof window !== "undefined" && isAuthenticated() ? getUser() : null)
  );
  const [stats, setStats]             = useState<Stats>({ products: 0, partners: 0, sales: 0, revenue: 0, lowStock: 0, outOfStock: 0 });
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [shops, setShops]             = useState<ShopInfo[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing]   = useState(false);
  const [countdown, setCountdown]     = useState(REFRESH_SEC);
  const [now, setNow]                 = useState(new Date());

  const tickRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Declared before effects so the linter can see them at call sites
  const loadAll = async (soft = false) => {
    if (soft) setRefreshing(true);
    try {
      const today = toDateStr(new Date());
      const [prodRes, partRes, saleRes, stockRes, shopsRes] = await Promise.allSettled([
        itemRequest("/products?page=1&limit=1"),
        partnerRequest("/suppliers"),
        saleRequest(`/sales/summary?from_date=${today}&to_date=${today}`),
        itemRequest("/products/stock-alerts?threshold=10"),
        authRequest("/api/v1/shops"),
      ]);

      const products = prodRes.status  === "fulfilled" ? (prodRes.value?.data?.total ?? 0) : 0;
      const partners = partRes.status  === "fulfilled" ? (Array.isArray(partRes.value?.data) ? partRes.value.data.length : 0) : 0;
      const sales    = saleRes.status  === "fulfilled" ? (saleRes.value?.data?.sales_count ?? 0) : 0;
      const revenue  = saleRes.status  === "fulfilled" ? (saleRes.value?.data?.revenue ?? 0) : 0;
      const alerts: StockAlert[] = stockRes.status === "fulfilled" ? (stockRes.value?.data ?? []) : [];

      setStats({
        products, partners, sales, revenue,
        lowStock:   alerts.filter((a) => a.quantity > 0).length,
        outOfStock: alerts.filter((a) => a.quantity === 0).length,
      });
      setStockAlerts(alerts.slice(0, 5));
      if (shopsRes.status === "fulfilled") setShops(shopsRes.value?.data ?? []);
      setLastUpdated(new Date());
    } catch { /* informational */ } finally {
      setRefreshing(false);
    }
  };

  const manualRefresh = () => {
    loadAll(true);
    setCountdown(REFRESH_SEC);
    [tickRef, autoRef].forEach((r) => { if (r.current) clearInterval(r.current); });
    tickRef.current = setInterval(() => setCountdown((c) => (c <= 1 ? REFRESH_SEC : c - 1)), 1000);
    autoRef.current = setInterval(() => { loadAll(true); setCountdown(REFRESH_SEC); }, REFRESH_SEC * 1000);
  };

  // Auth redirect — no setState needed here
  useEffect(() => {
    if (!isAuthenticated()) window.location.replace("/login");
  }, []);

  // Intervals and initial data load — runs only after user is confirmed
  useEffect(() => {
    if (!user) return;

    loadAll();

    clockRef.current = setInterval(() => setNow(new Date()), 1000);
    tickRef.current  = setInterval(() => setCountdown((c) => (c <= 1 ? REFRESH_SEC : c - 1)), 1000);
    autoRef.current  = setInterval(() => { loadAll(true); setCountdown(REFRESH_SEC); }, REFRESH_SEC * 1000);

    return () => {
      [clockRef, tickRef, autoRef].forEach((r) => { if (r.current) clearInterval(r.current); });
    };
  }, [user?.shop_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return <LoadingSkeleton />;

  const myShop    = shops.find((s) => s.id === user.shop_id);
  const otherShops = shops.filter((s) => s.id !== user.shop_id);

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── HERO ──────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-blue-600 via-indigo-600 to-blue-800 p-8 text-white shadow-xl">
          <div className="absolute inset-0 opacity-5 pointer-events-none flex items-center justify-end pr-8">
            <LayoutDashboard size={320} />
          </div>

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            {/* Left */}
            <div>
              <p className="text-blue-200 text-xs font-semibold uppercase tracking-widest">Welcome back</p>
              <h1 className="text-3xl md:text-4xl font-bold mt-1 leading-tight">
                {myShop?.name || user.name || "Business Owner"}
              </h1>
              <p className="mt-2 text-blue-100 text-sm max-w-lg">
                Manage inventory, suppliers, customers and business operations from one centralized dashboard.
              </p>

              <div className="flex flex-wrap gap-3 mt-5">
                {[
                  { label: "Email",  val: user.email },
                  { label: "Role",   val: user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : "Owner" },
                  { label: "Status", val: "● Active", extra: "text-green-300" },
                  ...(myShop?.phone ? [{ label: "Phone", val: myShop.phone }] : []),
                ].map((b) => (
                  <div key={b.label} className="bg-white/10 backdrop-blur px-4 py-2.5 rounded-xl">
                    <p className="text-[10px] text-blue-200 uppercase tracking-wider">{b.label}</p>
                    <p className={`font-medium text-sm mt-0.5 ${b.extra ?? ""}`}>{b.val}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Clock */}
            <div className="shrink-0 bg-white/10 backdrop-blur rounded-2xl px-6 py-5 text-center min-w-[190px]">
              <div className="flex items-center justify-center gap-1.5 text-blue-200 text-[10px] uppercase tracking-wider mb-2">
                <Clock size={11} /> Live Clock
              </div>
              <p className="text-3xl font-mono font-bold tracking-tight tabular-nums">{fmtTime(now)}</p>
              <p className="text-blue-200 text-[11px] mt-1 leading-snug">{fmtDate(now)}</p>
            </div>
          </div>
        </section>

        {/* ── REALTIME BAR ──────────────────────────────────── */}
        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl px-5 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-green-600 text-sm font-semibold">
              <Wifi size={14} className="animate-pulse" /> Live Data
            </span>
            {lastUpdated && (
              <span className="text-slate-400 text-xs hidden sm:block">
                Updated {timeAgo(lastUpdated)} &bull; next refresh in {countdown}s
              </span>
            )}
          </div>
          <button
            onClick={manualRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* ── KPI CARDS ─────────────────────────────────────── */}
        <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard label="Total Products"  value={stats.products.toLocaleString()} icon={<Package size={19} />}      color="blue" />
          <KpiCard label="Partners"        value={stats.partners.toLocaleString()} icon={<Users size={19} />}        color="indigo" />
          <KpiCard label="Sales Today"     value={stats.sales.toLocaleString()}    icon={<ShoppingCart size={19} />} color="teal" />
          <KpiCard label="Revenue Today"   value={fmtRWF(stats.revenue)}           icon={<TrendingUp size={19} />}   color="green" small />
          <KpiCard label="Low Stock"       value={stats.lowStock.toLocaleString()} icon={<AlertTriangle size={19}/>} color={stats.lowStock  > 0 ? "orange" : "slate"} />
          <KpiCard label="Out of Stock"    value={stats.outOfStock.toLocaleString()}icon={<Package size={19} />}     color={stats.outOfStock> 0 ? "red"    : "slate"} />
        </section>

        {/* ── ALERTS + QUICK ACTIONS ────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-6">

          {/* Stock Alerts */}
          <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
                <AlertTriangle size={15} className="text-orange-500" /> Stock Alerts
              </h2>
              <Link href="/ItemManagement" className="text-xs text-blue-600 hover:underline">Manage inventory</Link>
            </div>
            {stockAlerts.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600 text-sm py-6">
                <CheckCircle size={16} /> All products are well-stocked
              </div>
            ) : (
              <ul className="space-y-2">
                {stockAlerts.map((item) => (
                  <li key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div>
                      <p className="text-sm font-medium text-slate-800 truncate max-w-[170px]">{item.name}</p>
                      <p className="text-xs text-slate-400">{fmtRWF(item.selling_price)}</p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${item.quantity === 0 ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
                      {item.quantity === 0 ? "Out" : `${item.quantity} left`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Quick Actions */}
          <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
            <h2 className="font-semibold text-slate-900 mb-4 text-sm">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { href: "/ItemManagement",    icon: Package,     label: "Manage Items",  cls: "bg-blue-50 text-blue-600" },
                { href: "/SaleManagement",    icon: ShoppingCart,label: "Record Sale",   cls: "bg-orange-50 text-orange-600" },
                { href: "/PurchaseManagement",icon: Truck,       label: "New Purchase",  cls: "bg-teal-50 text-teal-600" },
                { href: "/reports",           icon: BarChart3,   label: "View Reports",  cls: "bg-violet-50 text-violet-600" },
              ].map((a) => (
                <Link key={a.href} href={a.href}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all text-center group"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${a.cls} group-hover:scale-110 transition-transform`}>
                    <a.icon size={18} />
                  </div>
                  <span className="text-xs font-medium text-slate-700">{a.label}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* ── EXPLORE SHOPS ─────────────────────────────────── */}
        <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
              <Globe size={15} className="text-blue-500" />
              Shops on Higoverse
              {shops.length > 0 && (
                <span className="text-[11px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">{shops.length}</span>
              )}
            </h2>
            <span className="text-xs text-slate-400 hidden sm:block">Registered businesses on this platform</span>
          </div>

          {shops.length === 0 ? (
            <p className="text-slate-400 text-sm py-4 text-center">No other shops found</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Your shop first */}
              {myShop && <ShopCard shop={myShop} isMine />}
              {otherShops.map((s) => <ShopCard key={s.id} shop={s} />)}
            </div>
          )}
        </section>

        {/* ── BUSINESS SERVICES ─────────────────────────────── */}
        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-4">Business Services</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {SERVICES.map((s) => {
              const Icon = s.icon;
              const c = COLORS[s.color] ?? COLORS.slate;
              return (
                <Link key={s.href} href={s.href}
                  className={`group bg-white rounded-2xl border border-slate-200 p-5 ${c.border} hover:shadow-lg transition-all`}
                >
                  <div className="flex justify-between items-start">
                    <div className={`w-11 h-11 rounded-xl ${c.bg} ${c.text} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                      <Icon size={20} />
                    </div>
                    <ArrowRight size={15} className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                  </div>
                  <h3 className="font-semibold text-slate-900 mt-4 text-sm">{s.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">{s.desc}</p>
                  <div className="mt-3 flex items-center gap-1.5 text-green-600 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Available
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── ACCOUNT ───────────────────────────────────────── */}
        <section className="pb-10">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center">
                <User className="text-blue-700" size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">{myShop?.name || user.name || "Business Owner"}</h3>
                <p className="text-slate-400 text-sm">{user.email}</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: <Mail size={15} />,      label: "Email",    val: user.email },
                { icon: <Store size={15} />,     label: "Shop",     val: myShop?.name || user.shop_id.slice(0, 8) + "…" },
                { icon: <User size={15} />,      label: "Role",     val: user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : "Owner" },
                { icon: <ShieldCheck size={15}/>, label: "Security", val: "Protected" },
              ].map((info) => (
                <div key={info.label} className="bg-slate-50 rounded-2xl p-4 border border-slate-100 hover:border-blue-200 transition-all">
                  <div className="flex items-center gap-2 text-blue-600 mb-2">
                    {info.icon}
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{info.label}</span>
                  </div>
                  <p className="font-semibold text-slate-800 text-sm truncate">{info.val}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}

/* ── Shop Card sub-component ─────────────────────────────── */
function ShopCard({ shop, isMine = false }: { shop: ShopInfo; isMine?: boolean }) {
  return (
    <div className={`relative rounded-2xl border p-4 transition-all ${isMine ? "border-blue-300 bg-blue-50 shadow-sm" : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:shadow-sm"}`}>
      {isMine && (
        <span className="absolute top-3 right-3 text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full">
          Your Shop
        </span>
      )}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isMine ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-400"}`}>
          <Store size={17} />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 text-sm truncate">{shop.name}</p>
          <p className="text-xs text-slate-400 truncate">{shop.email}</p>
          {shop.phone && <p className="text-xs text-slate-400">{shop.phone}</p>}
          <div className="flex items-center gap-1.5 mt-2">
            <span className={`w-1.5 h-1.5 rounded-full ${shop.is_active ? "bg-green-500" : "bg-slate-300"}`} />
            <span className="text-[11px] text-slate-400">
              {shop.is_active ? "Active" : "Inactive"}
              {shop.created_at && ` · Joined ${new Date(shop.created_at).toLocaleDateString([], { month: "short", year: "numeric" })}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
