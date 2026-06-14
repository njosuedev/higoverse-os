"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getUser, isAuthenticated } from "@/lib/auth";
import { itemRequest } from "@/lib/product-api";
import { partnerRequest } from "@/lib/supplier-api";
import { saleRequest } from "@/lib/sale-api";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import InfoCard from "@/app/components/dashboard/InfoCard";
import StatCard from "@/app/components/dashboard/StatCard";
import LoadingSkeleton from "@/app/components/dashboard/LoadingSkeleton";

import {
  User,
  Mail,
  Store,
  ShieldCheck,
  Package,
  Truck,
  ArrowRight,
  BarChart3,
  ShoppingCart,
  Users,
  LayoutDashboard,
  Settings,
} from "lucide-react";

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<{ name?: string; email: string; shop_id: string; role?: string } | null>(null);
  const [stats, setStats] = useState({ products: 0, partners: 0, sales: 0, revenue: 0 });

  useEffect(() => {
    setMounted(true);

    if (!isAuthenticated()) {
      window.location.replace("/login");
      return;
    }

    setUser(getUser());
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const today = toDateStr(new Date());
      const [productsRes, partnersRes, salesRes] = await Promise.allSettled([
        itemRequest("/products?page=1&limit=1"),
        partnerRequest("/suppliers"),
        saleRequest(`/sales/summary?from_date=${today}&to_date=${today}`),
      ]);

      const productCount =
        productsRes.status === "fulfilled" ? (productsRes.value?.data?.total ?? 0) : 0;
      const partnerCount =
        partnersRes.status === "fulfilled"
          ? Array.isArray(partnersRes.value?.data)
            ? partnersRes.value.data.length
            : 0
          : 0;
      const saleCount =
        salesRes.status === "fulfilled" ? (salesRes.value?.data?.sales_count ?? 0) : 0;
      const revenue =
        salesRes.status === "fulfilled" ? (salesRes.value?.data?.revenue ?? 0) : 0;

      setStats({ products: productCount, partners: partnerCount, sales: saleCount, revenue });
    } catch {
      // silently fail — stats are informational
    }
  }

  if (!mounted) return null;
  if (!user) return <LoadingSkeleton />;

  const services = [
    {
      title: "Items / Inventory",
      description: "Manage products, stock and pricing.",
      icon: Package,
      href: "/ItemManagement",
    },
    {
      title: "Partners",
      description: "Manage suppliers and customers.",
      icon: Users,
      href: "/PartnerManagement",
    },
    {
      title: "Purchases",
      description: "Record restocks and new product purchases.",
      icon: Truck,
      href: "/PurchaseManagement",
    },
    {
      title: "Sales",
      description: "Track sales transactions and revenue.",
      icon: ShoppingCart,
      href: "/SaleManagement",
    },
    {
      title: "Reports",
      description: "Business insights and analytics.",
      icon: BarChart3,
      href: "/reports",
    },
    {
      title: "Settings",
      description: "Configure your shop preferences.",
      icon: Settings,
      href: "/Settings",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* HERO */}
        <section className="relative overflow-hidden rounded-3xl bg-linear-to-r from-blue-600 via-indigo-600 to-blue-700 p-8 text-white shadow-lg">
          <div className="absolute right-0 top-0 opacity-10">
            <LayoutDashboard size={260} />
          </div>

          <div className="relative z-10">
            <p className="text-blue-100 text-sm">Welcome back</p>

            <h1 className="text-3xl md:text-4xl font-bold mt-1">
              {user.name || "Business Owner"}
            </h1>

            <p className="mt-3 text-blue-100 max-w-2xl">
              Manage inventory, suppliers, customers and business operations from one centralized dashboard.
            </p>

            <div className="flex flex-wrap gap-3 mt-6">
              <div className="bg-white/10 backdrop-blur px-4 py-3 rounded-xl">
                <p className="text-xs text-blue-100">Email</p>
                <p className="font-medium">{user.email}</p>
              </div>
              <div className="bg-white/10 backdrop-blur px-4 py-3 rounded-xl">
                <p className="text-xs text-blue-100">Shop ID</p>
                <p className="font-medium text-xs font-mono">{user.shop_id}</p>
              </div>
              <div className="bg-white/10 backdrop-blur px-4 py-3 rounded-xl">
                <p className="text-xs text-blue-100">Status</p>
                <p className="font-medium text-green-300">● Active</p>
              </div>
            </div>
          </div>
        </section>

        {/* KPI CARDS */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <StatCard title="Products" value={stats.products.toLocaleString()} icon={<Package size={22} />} />
          <StatCard title="Partners" value={stats.partners.toLocaleString()} icon={<Users size={22} />} />
          <StatCard title="Sales Today" value={stats.sales.toLocaleString()} icon={<ShoppingCart size={22} />} />
          <StatCard title="Revenue Today" value={stats.revenue.toLocaleString()} icon={<BarChart3 size={22} />} />
        </section>

        {/* QUICK ACTIONS */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <Link href="/ItemManagement" className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-blue-400 hover:shadow-md transition-all">
              <Package className="text-blue-600" />
              <h3 className="font-semibold mt-3">Manage Items</h3>
              <p className="text-sm text-slate-500 mt-1">Add, update and monitor inventory.</p>
            </Link>
            <Link href="/SaleManagement" className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-orange-400 hover:shadow-md transition-all">
              <ShoppingCart className="text-orange-600" />
              <h3 className="font-semibold mt-3">Record Sale</h3>
              <p className="text-sm text-slate-500 mt-1">Enter a new sale transaction.</p>
            </Link>
            <Link href="/reports" className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-violet-400 hover:shadow-md transition-all">
              <BarChart3 className="text-violet-600" />
              <h3 className="font-semibold mt-3">View Reports</h3>
              <p className="text-sm text-slate-500 mt-1">Analyze business performance.</p>
            </Link>
          </div>
        </section>

        {/* ACCOUNT */}
        <section className="mt-8">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">
                <User className="text-blue-700" size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-lg">{user.name || "Business Owner"}</h3>
                <p className="text-slate-500">{user.email}</p>
              </div>
            </div>
            <div className="grid md:grid-cols-4 gap-4">
              <InfoCard icon={<Mail size={18} />} label="Email" value={user.email} />
              <InfoCard icon={<Store size={18} />} label="Shop ID" value={user.shop_id} />
              <InfoCard icon={<User size={18} />} label="Role" value={user.role || "Owner"} />
              <InfoCard icon={<ShieldCheck size={18} />} label="Security" value="Protected" />
            </div>
          </div>
        </section>

        {/* SERVICES */}
        <section className="mt-8 pb-10">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Business Services</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
            {services.map((service) => {
              const Icon = service.icon;
              return (
                <Link
                  key={service.title}
                  href={service.href}
                  className="group bg-white rounded-3xl border border-slate-200 p-6 hover:border-blue-300 hover:shadow-xl transition-all"
                >
                  <div className="flex justify-between">
                    <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Icon size={24} />
                    </div>
                    <ArrowRight className="text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                  </div>
                  <h3 className="font-semibold text-lg mt-5">{service.title}</h3>
                  <p className="text-sm text-slate-500 mt-2">{service.description}</p>
                  <div className="mt-4 flex items-center gap-2 text-green-600 text-sm">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    Available
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
