"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getUser, isAuthenticated } from "@/lib/auth";
import { itemRequest } from "@/lib/product-api";
import { partnerRequest } from "@/lib/supplier-api";
import { saleRequest } from "@/lib/sale-api";
import { authRequest } from "@/lib/auth-api";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import LoadingSkeleton from "@/app/components/dashboard/LoadingSkeleton";

import {
  User, Mail, Store, ShieldCheck, Package, Truck, ArrowRight, BarChart3,
  ShoppingCart, Users, LayoutDashboard, Settings, RefreshCw, AlertTriangle,
  TrendingUp, Clock, Globe, CheckCircle, FileText, Wifi,
} from "lucide-react";

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

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 }).format(n);
}

function timeAgo(d: Date) {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

const REFRESH_INTERVAL = 30;

const SERVICES = [
  { title: "Items / Inventory", description: "Manage products, stock and pricing.", icon: Package, href: "/ItemManagement", color: "blue" },
  { title: "Partners", description: "Manage suppliers and customers.", icon: Users, href: "/PartnerManagement", color: "indigo" },
  { title: "Purchases", description: "Record restocks and new product purchases.", icon: Truck, href: "/PurchaseManagement", color: "teal" },
  { title: "Sales", description: "Track sales transactions and revenue.", icon: ShoppingCart, href: "/SaleManagement", color: "orange" },
  { title: "Reports", description: "Business insights and analytics.", icon: BarChart3, href: "/reports", color: "violet" },
  { title: "Proforma", description: "Generate proforma invoices.", icon: FileText, href: "/proforma", color: "pink" },
  { title: "Settings", description: "Configure your shop preferences.", icon: Settings, href: "/Settings", color: "slate" },
];

const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
  blue:   { bg: "bg-blue-50",   text: "text-blue-600",   ring: "hover:border-blue-300" },
  indigo: { bg: "bg-indigo-50", text: "text-indigo-600", ring: "hover:border-indigo-300" },
  teal:   { bg: "bg-teal-50",   text: "text-teal-600",   ring: "hover:border-teal-300" },
  orange: { bg: "bg-orange-50", text: "text-orange-600", ring: "hover:border-orange-300" },
  violet: { bg: "bg-violet-50", text: "text-violet-600", ring: "hover:border-violet-300" },
  pink:   { bg: "bg-pink-50",   text: "text-pink-600",   ring: "hover:border-pink-300" },
  slate:  { bg: "bg-slate-100", text: "text-slate-600",  ring: "hover:border-slate-300" },
};

export default function DashboardPage() {
  // Lazy initializer — reads localStorage once on mount, avoids setState inside effect
  const [user] = useState<{ name?: string; email: string; shop_id: string; role?: string } | null>(
    () => (typeof window !== "undefined" && isAuthenticated() ? getUser() : null)
  );
  const [stats, setStats] = useState<Stats>({ products: 0, partners: 0, sales: 0, revenue: 0, lowStock: 0, outOfStock: 0 });
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [shops, setShops] = useState<ShopInfo[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [now, setNow] = useState(new Date());
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  // Declared before effects so the linter sees them at their call sites
  const loadAll = async (soft = false) => {
    if (soft) setRefreshing(true);
    try {
      const today = toDateStr(new Date());
      const [productsRes, partnersRes, salesRes, stockRes, shopsRes] = await Promise.allSettled([
        itemRequest("/products?page=1&limit=1"),
        partnerRequest("/suppliers"),
        saleRequest(`/sales/summary?from_date=${today}&to_date=${today}`),
        itemRequest("/products/stock-alerts?threshold=10"),
        authRequest("/api/v1/shops"),
      ]);

      const productCount = productsRes.status === "fulfilled" ? (productsRes.value?.data?.total ?? 0) : 0;
      const partnerCount = partnersRes.status === "fulfilled"
        ? (Array.isArray(partnersRes.value?.data) ? partnersRes.value.data.length : 0) : 0;
      const saleCount = salesRes.status === "fulfilled" ? (salesRes.value?.data?.sales_count ?? 0) : 0;
      const revenue   = salesRes.status === "fulfilled" ? (salesRes.value?.data?.revenue ?? 0) : 0;
      const alertItems: StockAlert[] = stockRes.status === "fulfilled" ? (stockRes.value?.data ?? []) : [];

      setStats({
        products: productCount, partners: partnerCount, sales: saleCount, revenue,
        lowStock:   alertItems.filter((a) => a.quantity > 0).length,
        outOfStock: alertItems.filter((a) => a.quantity === 0).length,
      });
      setStockAlerts(alertItems.slice(0, 5));
      if (shopsRes.status === "fulfilled") setShops(shopsRes.value?.data ?? []);
      setLastUpdated(new Date());
    } catch { /* stats are informational */ } finally {
      setRefreshing(false);
    }
  };

  const manualRefresh = () => {
    loadAll(true);
    setCountdown(REFRESH_INTERVAL);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (refreshRef.current) clearInterval(refreshRef.current);
    countdownRef.current = setInterval(() => setCountdown((c) => (c <= 1 ? REFRESH_INTERVAL : c - 1)), 1000);
    refreshRef.current   = setInterval(() => { loadAll(true); setCountdown(REFRESH_INTERVAL); }, REFRESH_INTERVAL * 1000);
  };

  // Auth redirect — no setState, just a side-effect
  useEffect(() => {
    if (!isAuthenticated()) window.location.replace("/login");
  }, []);

  // Intervals + initial data load — gated on user presence
  useEffect(() => {
    if (!user) return;

    loadAll();

    clockRef.current     = setInterval(() => setNow(new Date()), 1000);
    countdownRef.current = setInterval(() => setCountdown((c) => (c <= 1 ? REFRESH_INTERVAL : c - 1)), 1000);
    refreshRef.current   = setInterval(() => { loadAll(true); setCountdown(REFRESH_INTERVAL); }, REFRESH_INTERVAL * 1000);

    return () => {
      [clockRef, countdownRef, refreshRef].forEach((r) => { if (r.current) clearInterval(r.current); });
    };
  }, [user?.shop_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return <LoadingSkeleton />;

  const currentShop = shops.find((s) => s.id === user.shop_id);
  const otherShops = shops.filter((s) => s.id !== user.shop_id);

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* HERO */}
        <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-blue-600 via-indigo-600 to-blue-800 p-8 text-white shadow-xl">
          <div className="absolute right-0 top-0 opacity-5 pointer-events-none">
            <LayoutDashboard size={300} />
          </div>

          <div className="relative z-10 flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div>
              <p className="text-blue-200 text-sm font-medium uppercase tracking-wide">Welcome back</p>
              <h1 className="text-3xl md:text-4xl font-bold mt-1">{user.name || "Business Owner"}</h1>
              <p className="mt-2 text-blue-100 max-w-xl">
                Manage inventory, suppliers, customers and business operations from one centralized dashboard.
              </p>

              <div className="flex flex-wrap gap-3 mt-5">
                <div className="bg-white/10 backdrop-blur px-4 py-2.5 rounded-xl">
                  <p className="text-xs text-blue-200">Email</p>
                  <p className="font-medium text-sm">{user.email}</p>
                </div>
                {currentShop && (
                  <div className="bg-white/10 backdrop-blur px-4 py-2.5 rounded-xl">
                    <p className="text-xs text-blue-200">Shop Name</p>
                    <p className="font-medium text-sm">{currentShop.name}</p>
                  </div>
                )}
                <div className="bg-white/10 backdrop-blur px-4 py-2.5 rounded-xl">
                  <p className="text-xs text-blue-200">Role</p>
                  <p className="font-medium text-sm capitalize">{user.role || "Owner"}</p>
                </div>
                <div className="bg-white/10 backdrop-blur px-4 py-2.5 rounded-xl">
                  <p className="text-xs text-blue-200">Status</p>
                  <p className="font-medium text-green-300 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
                    Active
                  </p>
                </div>
              </div>
            </div>

            {/* LIVE CLOCK */}
            <div className="bg-white/10 backdrop-blur rounded-2xl px-6 py-4 text-center min-w-[200px] shrink-0">
              <div className="flex items-center gap-1.5 justify-center text-blue-200 text-xs mb-2">
                <Clock size={12} />
                Live Clock
              </div>
              <p className="text-3xl font-mono font-bold tracking-tight">{fmtTime(now)}</p>
              <p className="text-blue-200 text-xs mt-1">{fmtDate(now)}</p>
            </div>
          </div>
        </section>

        {/* REAL-TIME STATUS BAR */}
        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl px-5 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
              <Wifi size={14} className="animate-pulse" />
              Live Data
            </span>
            {lastUpdated && (
              <span className="text-slate-400 text-xs">
                Updated {timeAgo(lastUpdated)} &bull; Next refresh in {countdown}s
              </span>
            )}
          </div>
          <button
            onClick={manualRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* KPI CARDS */}
        <section className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard label="Total Products" value={stats.products.toLocaleString()} icon={<Package size={20} />} color="blue" />
          <KpiCard label="Partners" value={stats.partners.toLocaleString()} icon={<Users size={20} />} color="indigo" />
          <KpiCard label="Sales Today" value={stats.sales.toLocaleString()} icon={<ShoppingCart size={20} />} color="teal" />
          <KpiCard label="Revenue Today" value={fmtCurrency(stats.revenue)} icon={<TrendingUp size={20} />} color="green" small />
          <KpiCard label="Low Stock" value={stats.lowStock.toLocaleString()} icon={<AlertTriangle size={20} />} color={stats.lowStock > 0 ? "orange" : "slate"} />
          <KpiCard label="Out of Stock" value={stats.outOfStock.toLocaleString()} icon={<Package size={20} />} color={stats.outOfStock > 0 ? "red" : "slate"} />
        </section>

        {/* STOCK ALERTS + QUICK ACTIONS */}
        <div className="grid md:grid-cols-2 gap-6">

          {/* STOCK ALERTS */}
          <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <AlertTriangle size={16} className="text-orange-500" />
                Stock Alerts
              </h2>
              <Link href="/ItemManagement" className="text-xs text-blue-600 hover:underline">View all</Link>
            </div>

            {stockAlerts.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600 text-sm py-4">
                <CheckCircle size={16} />
                All products are well-stocked
              </div>
            ) : (
              <div className="space-y-2">
                {stockAlerts.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div>
                      <p className="text-sm font-medium text-slate-800 truncate max-w-[180px]">{item.name}</p>
                      <p className="text-xs text-slate-400">{fmtCurrency(item.selling_price)}</p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${item.quantity === 0 ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
                      {item.quantity === 0 ? "Out" : `${item.quantity} left`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* QUICK ACTIONS */}
          <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
            <h2 className="font-semibold text-slate-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { href: "/ItemManagement", icon: Package, label: "Manage Items", color: "bg-blue-50 text-blue-600" },
                { href: "/SaleManagement", icon: ShoppingCart, label: "Record Sale", color: "bg-orange-50 text-orange-600" },
                { href: "/PurchaseManagement", icon: Truck, label: "New Purchase", color: "bg-teal-50 text-teal-600" },
                { href: "/reports", icon: BarChart3, label: "View Reports", color: "bg-violet-50 text-violet-600" },
              ].map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all text-center group"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${a.color} group-hover:scale-110 transition-transform`}>
                    <a.icon size={18} />
                  </div>
                  <span className="text-xs font-medium text-slate-700">{a.label}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* EXPLORE OTHER SHOPS */}
        <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Globe size={16} className="text-blue-500" />
              Shops on Higoverse
              {shops.length > 0 && (
                <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">
                  {shops.length}
                </span>
              )}
            </h2>
            <span className="text-xs text-slate-400">Registered businesses on this platform</span>
          </div>

          {shops.length === 0 ? (
            <div className="text-slate-400 text-sm py-6 text-center">No shops found</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {shops.map((shop) => {
                const isMine = shop.id === user.shop_id;
                return (
                  <div
                    key={shop.id}
                    className={`relative rounded-2xl border p-4 transition-all ${isMine ? "border-blue-300 bg-blue-50 shadow-sm" : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:shadow-sm"}`}
                  >
                    {isMine && (
                      <span className="absolute top-3 right-3 text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full">
                        Your Shop
                      </span>
                    )}
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isMine ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
                        <Store size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{shop.name}</p>
                        <p className="text-xs text-slate-400 truncate">{shop.email}</p>
                        {shop.phone && <p className="text-xs text-slate-400">{shop.phone}</p>}
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${shop.is_active ? "bg-green-500" : "bg-slate-300"}`} />
                          <span className="text-xs text-slate-400">
                            {shop.is_active ? "Active" : "Inactive"}
                            {shop.created_at && ` · Joined ${new Date(shop.created_at).toLocaleDateString([], { month: "short", year: "numeric" })}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* BUSINESS SERVICES */}
        <section className="pb-10">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Business Services</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            {SERVICES.map((service) => {
              const Icon = service.icon;
              const c = colorMap[service.color] ?? colorMap.slate;
              return (
                <Link
                  key={service.title}
                  href={service.href}
                  className={`group bg-white rounded-2xl border border-slate-200 p-5 ${c.ring} hover:shadow-lg transition-all`}
                >
                  <div className="flex justify-between items-start">
                    <div className={`w-11 h-11 rounded-xl ${c.bg} ${c.text} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                      <Icon size={20} />
                    </div>
                    <ArrowRight className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" size={16} />
                  </div>
                  <h3 className="font-semibold mt-4 text-slate-900">{service.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">{service.description}</p>
                  <div className="mt-3 flex items-center gap-1.5 text-green-600 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Available
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ACCOUNT INFO */}
        <section className="pb-10">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center">
                <User className="text-blue-700" size={22} />
              </div>
              <div>
                <h3 className="font-semibold">{user.name || "Business Owner"}</h3>
                <p className="text-slate-400 text-sm">{user.email}</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: <Mail size={16} />, label: "Email", value: user.email },
                { icon: <Store size={16} />, label: "Shop ID", value: user.shop_id.slice(0, 8) + "…" },
                { icon: <User size={16} />, label: "Role", value: user.role || "Owner" },
                { icon: <ShieldCheck size={16} />, label: "Security", value: "Protected" },
              ].map((info) => (
                <div key={info.label} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <div className="flex items-center gap-2 text-blue-600 mb-2">
                    {info.icon}
                    <span className="text-xs font-medium text-slate-500">{info.label}</span>
                  </div>
                  <p className="font-semibold text-slate-800 text-sm truncate">{info.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  small?: boolean;
}

const kpiColors: Record<string, { bg: string; text: string }> = {
  blue:   { bg: "bg-blue-50",   text: "text-blue-600" },
  indigo: { bg: "bg-indigo-50", text: "text-indigo-600" },
  teal:   { bg: "bg-teal-50",   text: "text-teal-600" },
  green:  { bg: "bg-green-50",  text: "text-green-600" },
  orange: { bg: "bg-orange-50", text: "text-orange-600" },
  red:    { bg: "bg-red-50",    text: "text-red-600" },
  slate:  { bg: "bg-slate-100", text: "text-slate-500" },
};

function KpiCard({ label, value, icon, color, small }: KpiCardProps) {
  const c = kpiColors[color] ?? kpiColors.slate;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-all">
      <div className={`w-10 h-10 rounded-xl ${c.bg} ${c.text} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className={`font-bold mt-0.5 ${small ? "text-base" : "text-2xl"} text-slate-900 truncate`}>{value}</p>
    </div>
  );
}
