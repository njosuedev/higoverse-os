"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getUser, isAuthenticated } from "@/lib/auth";
import LogoutButton from "@/app/components/LogoutButton";
import {
  User,
  Mail,
  Store,
  ShieldCheck,
  Activity,
  LayoutDashboard,
  Package,
  Truck,
  ArrowRight,
  BarChart3,
  ShoppingCart,
  Users,
} from "lucide-react";

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      window.location.replace("/login");
      return;
    }

    setUser(getUser());
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">
            Loading Dashboard...
          </p>
        </div>
      </div>
    );
  }

  const services = [
    {
      title: "Product Service",
      description:
        "Manage products, categories, stock and inventory.",
      icon: Package,
      color: "blue",
      href: "/dashboard/products",
    },
    {
      title: "Supplier Service",
      description:
        "Manage suppliers and purchasing workflows.",
      icon: Truck,
      color: "indigo",
      href: "/dashboard/suppliers",
    },
    {
      title: "Sales",
      description:
        "Track sales transactions and revenue.",
      icon: ShoppingCart,
      color: "green",
      href: "#",
    },
    {
      title: "Customers",
      description:
        "Manage customer records and loyalty.",
      icon: Users,
      color: "orange",
      href: "#",
    },
    {
      title: "Reports",
      description:
        "Business insights and analytics.",
      icon: BarChart3,
      color: "purple",
      href: "#",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-center text-white">
              <LayoutDashboard size={22} />
            </div>

            <div>
              <h1 className="font-bold text-slate-900">
                Higoverse
              </h1>
              <p className="text-xs text-slate-500">
                Business Management Platform
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 text-sm text-green-600">
              <Activity size={16} />
              System Online
            </div>

            <LogoutButton />
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="max-w-7xl mx-auto px-6 pt-8">
        <div className="rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white p-8 shadow-xl">
          <h2 className="text-3xl font-bold">
            Welcome back 👋
          </h2>

          <p className="mt-2 text-blue-100">
            Manage your business services from one central dashboard.
          </p>

          <div className="mt-6 flex flex-wrap gap-4">
            <div className="bg-white/10 backdrop-blur rounded-xl px-4 py-3">
              <p className="text-xs text-blue-100">
                Active Account
              </p>
              <p className="font-semibold">
                {user.email}
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur rounded-xl px-4 py-3">
              <p className="text-xs text-blue-100">
                Shop ID
              </p>
              <p className="font-semibold">
                {user.shop_id || "N/A"}
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur rounded-xl px-4 py-3">
              <p className="text-xs text-blue-100">
                Status
              </p>
              <p className="font-semibold">
                Active
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PROFILE */}
      <section className="max-w-7xl mx-auto px-6 mt-8">
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-5">
            Account Information
          </h3>

          <div className="grid md:grid-cols-4 gap-5">
            <InfoCard
              icon={<Mail size={18} />}
              label="Email"
              value={user.email}
            />

            <InfoCard
              icon={<Store size={18} />}
              label="Shop ID"
              value={user.shop_id || "Not Assigned"}
            />

            <InfoCard
              icon={<User size={18} />}
              label="User"
              value={user.name || "Business Owner"}
            />

            <InfoCard
              icon={<ShieldCheck size={18} />}
              label="Security"
              value="Protected"
            />
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section className="max-w-7xl mx-auto px-6 py-8">
        <h3 className="text-xl font-bold text-slate-900 mb-5">
          Business Services
        </h3>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          {services.map((service) => {
            const Icon = service.icon;

            return (
              <Link
                key={service.title}
                href={service.href}
                className="bg-white border border-slate-200 rounded-3xl p-6 hover:shadow-lg transition-all hover:-translate-y-1"
              >
                <div className="flex justify-between items-start">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Icon className="text-blue-600" size={24} />
                  </div>

                  <ArrowRight
                    className="text-slate-400"
                    size={18}
                  />
                </div>

                <h4 className="mt-5 font-semibold text-lg text-slate-900">
                  {service.title}
                </h4>

                <p className="mt-2 text-sm text-slate-500">
                  {service.description}
                </p>

                <div className="mt-4 inline-flex items-center gap-2 text-green-600 text-sm">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Available
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="text-center py-10 text-sm text-slate-500">
        © {new Date().getFullYear()} Higoverse. All rights reserved.
      </footer>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-slate-50 rounded-2xl p-4">
      <div className="flex items-center gap-2 text-slate-500 text-sm">
        {icon}
        {label}
      </div>

      <p className="mt-2 font-semibold text-slate-900 break-all">
        {value}
      </p>
    </div>
  );
}