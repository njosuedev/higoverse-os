"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getUser, isAuthenticated } from "@/lib/auth";
import { itemRequest } from "@/lib/product-api";
import { partnerRequest } from "@/lib/supplier-api";
import { saleRequest } from "@/lib/sale-api";
import { listShops, type Shop as ShopInfo } from "@/lib/shop-api";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import LoadingSkeleton from "@/app/components/dashboard/LoadingSkeleton";
import {
  User, Mail, Store, ShieldCheck, Package, Truck, ArrowRight, BarChart3,
  ShoppingCart, Users, Settings, RefreshCw, AlertTriangle,
  TrendingUp, Clock, Globe, CheckCircle, FileText, Wifi,
} from "lucide-react";

/* ── Types ───────────────────────────── */
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

/* ── Helpers ─────────────────────────── */
const REFRESH_SEC = 30;

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
  return new Intl.NumberFormat("en-RW", {
    style: "currency",
    currency: "RWF",
    maximumFractionDigits: 0,
  }).format(n);
}

function timeAgo(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/* ── Main Page ───────────────────────── */
export default function HomePage() {
  const [mounted, setMounted] = useState(false);

  const [user, setUser] = useState<any>(null);

  const [stats, setStats] = useState<Stats>({
    products: 0,
    partners: 0,
    sales: 0,
    revenue: 0,
    lowStock: 0,
    outOfStock: 0,
  });

  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [shops, setShops] = useState<ShopInfo[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_SEC);
  const [now, setNow] = useState(new Date());

  const tickRef = useRef<any>(null);
  const autoRef = useRef<any>(null);
  const clockRef = useRef<any>(null);

  /* ── FIX 1: safe auth check after mount ── */
  useEffect(() => {
    setMounted(true);

    if (isAuthenticated()) {
      setUser(getUser());
    } else {
      window.location.replace("/login");
    }
  }, []);

  /* ── LOAD DATA ── */
  const loadAll = async (soft = false) => {
    if (soft) setRefreshing(true);

    try {
      const today = toDateStr(new Date());

      const [prodRes, partRes, saleRes, stockRes, shopsRes] = await Promise.allSettled([
        itemRequest("/products?page=1&limit=1"),
        partnerRequest("/suppliers"),
        saleRequest(`/sales/summary?from_date=${today}&to_date=${today}`),
        itemRequest("/products/stock-alerts?threshold=10"),
        listShops({ limit: 100 }),
      ]);

      const products = prodRes.status === "fulfilled" ? prodRes.value?.data?.total ?? 0 : 0;
      const partners = partRes.status === "fulfilled" ? partRes.value?.data?.length ?? 0 : 0;
      const sales = saleRes.status === "fulfilled" ? saleRes.value?.data?.sales_count ?? 0 : 0;
      const revenue = saleRes.status === "fulfilled" ? saleRes.value?.data?.revenue ?? 0 : 0;

      const alerts = stockRes.status === "fulfilled" ? stockRes.value?.data ?? [] : [];

      setStats({
        products,
        partners,
        sales,
        revenue,
        lowStock: alerts.filter((a: any) => a.quantity > 0).length,
        outOfStock: alerts.filter((a: any) => a.quantity === 0).length,
      });

      setStockAlerts(alerts.slice(0, 5));
      if (shopsRes.status === "fulfilled") setShops(shopsRes.value.items ?? []);

      setLastUpdated(new Date());
    } finally {
      setRefreshing(false);
    }
  };

  /* ── INTERVALS ── */
  useEffect(() => {
    if (!user) return;

    loadAll();

    clockRef.current = setInterval(() => setNow(new Date()), 1000);
    tickRef.current = setInterval(() => setCountdown((c) => (c <= 1 ? REFRESH_SEC : c - 1)), 1000);
    autoRef.current = setInterval(() => {
      loadAll(true);
      setCountdown(REFRESH_SEC);
    }, REFRESH_SEC * 1000);

    return () => {
      clearInterval(clockRef.current);
      clearInterval(tickRef.current);
      clearInterval(autoRef.current);
    };
  }, [user]);

  /* ── UI GUARD ── */
  if (!mounted || !user) return <LoadingSkeleton />;

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* HERO */}
        <section className="bg-blue-600 text-white p-8 rounded-3xl">
          <h1 className="text-3xl font-bold">
            Welcome, {user.name || "User"}
          </h1>
          <p className="text-blue-100 mt-2">
            Manage your business dashboard
          </p>
        </section>

        {/* STATUS */}
        <div className="text-sm text-slate-500 flex justify-between">
          <span>Live system active</span>
          <span>Refresh in {countdown}s</span>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border">Products: {stats.products}</div>
          <div className="bg-white p-4 rounded-xl border">Partners: {stats.partners}</div>
          <div className="bg-white p-4 rounded-xl border">Sales: {stats.sales}</div>
          <div className="bg-white p-4 rounded-xl border">Revenue: {fmtRWF(stats.revenue)}</div>
        </div>

      </main>
    </div>
  );
}