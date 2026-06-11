"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getUser, isAuthenticated } from "@/lib/auth";
import { itemRequest } from "@/lib/product-api";

import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
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
} from "lucide-react";

/* ================= TYPES ================= */
type Product = {
  id: string;
  quantity: number;
};

/* ================= COMPONENT ================= */
export default function DashboardPage() {
  /* ---------- STATE ---------- */
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);

  const [user, setUser] = useState<any>(null);
  const [items, setItems] = useState<Product[]>([]);

  /* ================= AUTH ================= */
  useEffect(() => {
    const initAuth = () => {
      if (!isAuthenticated()) {
        window.location.replace("/login");
        return;
      }

      setUser(getUser());
      setAuthLoading(false);
    };

    initAuth();
  }, []);

  /* ================= LOAD DATA ================= */
  useEffect(() => {
    if (!user) return;

    const loadProducts = async () => {
      try {
        setDataLoading(true);

        const res = await itemRequest("/products");

        setItems(res?.data?.items || []);
      } catch (error) {
        console.error("Failed to load items:", error);
      } finally {
        setDataLoading(false);
      }
    };

    loadProducts();
  }, [user]);

  /* ================= COMBINED LOADING ================= */
  const loading = authLoading || dataLoading;

  if (loading || !user) {
    return <LoadingSkeleton />;
  }

  /* ================= COMPUTED VALUES ================= */
  const totalItems = items.length;

  /* ================= MENU DATA ================= */
  const services = [
    {
      title: "Item Service",
      description: "Manage items, categories, stock and inventory.",
      icon: Package,
      href: "/ItemManagement",
    },
    {
      title: "Partner Service",
      description: "Manage partners and purchasing workflows.",
      icon: Truck,
      href: "/PartnerManagement",
    },
    {
      title: "Sales",
      description: "Track sales transactions and revenue.",
      icon: ShoppingCart,
      href: "#",
    },
    {
      title: "Reports",
      description: "Business insights and analytics.",
      icon: BarChart3,
      href: "#",
    },
  ];

  /* ================= UI ================= */
  return (
    <div className="min-h-screen bg-slate-50">
      {/* HEADER */}
      <DashboardHeader loading={loading} />

      <main className="max-w-7xl mx-auto px-6 py-6">

        {/* HERO */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 p-8 text-white shadow-lg">
          <div className="absolute right-0 top-0 opacity-10">
            <LayoutDashboard size={260} />
          </div>

          <div className="relative z-10">
            <p className="text-green-100 text-sm">Welcome back</p>

            <h1 className="text-3xl md:text-4xl font-bold mt-1">
              {user.name || "Business Owner"}
            </h1>

            <p className="mt-3 text-green-100 max-w-2xl">
              Manage inventory, Partners( suppliers, Customers ) and business operations from one dashboard.
            </p>

            <div className="flex flex-wrap gap-3 mt-6">
              <div className="bg-white/10 backdrop-blur px-4 py-3 rounded-xl">
                <p className="text-xs text-green-100">Email</p>
                <p className="font-medium">{user.email}</p>
              </div>

              <div className="bg-white/10 backdrop-blur px-4 py-3 rounded-xl">
                <p className="text-xs text-green-100">Shop ID</p>
                <p className="font-medium">{user.shop_id || "N/A"}</p>
              </div>

              <div className="bg-white/10 backdrop-blur px-4 py-3 rounded-xl">
                <p className="text-xs text-green-100">Status</p>
                <p className="font-medium">Active</p>
              </div>
            </div>
          </div>
        </section>

        {/* KPI CARDS */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6 font-bold text-gray-700">
          <StatCard
            title="Total Items"
            value={totalItems}
            icon={<Package size={22} />}
          />
          <StatCard title="Total Partners" value="0" icon={<Users size={22} />} />
          <StatCard title="Sales" value="0" icon={<ShoppingCart size={22} />} />
          <StatCard title="Total Purchases" value="0" icon={<Truck size={22} />} />
        </section>

        {/* QUICK ACTIONS */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Quick Actions
          </h2>

          <div className="grid md:grid-cols-3 gap-4 text-gray-700">
            {services.slice(0, 3).map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.title}
                  href={item.href}
                  className="bg-white border border-gray-300 rounded-2xl p-5 hover:shadow-md transition-all"
                >
                  <Icon className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center" />
                  <h3 className="font-semibold mt-3">{item.title}</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    {item.description}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>

        {/* SERVICES */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Business Services
          </h2>

          <div className="grid md:grid-cols-2 xl:grid-cols-3 text-gray-700 gap-5">
            {services.map((service) => {
              const Icon = service.icon;

              return (
                <Link
                  key={service.title}
                  href={service.href}
                  className="group bg-white rounded-3xl border border-gray-300 p-6 hover:shadow-xl transition-all"
                >
                  <div className="flex justify-between">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Icon size={24} />
                    </div>

                    <ArrowRight className="text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                  </div>

                  <h3 className="font-semibold text-lg mt-5">
                    {service.title}
                  </h3>

                  <p className="text-sm text-slate-500 mt-2">
                    {service.description}
                  </p>

                  <div className="mt-4 flex items-center gap-2 text-green-600 text-sm">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    Available
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ACCOUNT */}
        <section className="mt-8">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center">
                <User className="text-green-700" size={24} />
              </div>

              <div>
                <h3 className="font-semibold text-lg">
                  {user.name || "Business Owner"}
                </h3>
                <p className="text-slate-500">{user.email}</p>
              </div>
            </div>

            <div className="grid md:grid-cols-4 gap-4 text-gray-700">
              <InfoCard icon={<Mail size={18} />} label="Email" value={user.email} />
              <InfoCard icon={<Store size={18} />} label="Shop ID" value={user.shop_id || "N/A"} />
              <InfoCard icon={<User size={18} />} label="Role" value={user.role || "Owner"} />
              <InfoCard icon={<ShieldCheck size={18} />} label="Security" value="Protected" />
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
