"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/app/components/LogoutButton";

import {
  Activity,
  LayoutDashboard,
  Package,
  Truck,
  ShoppingCart,
  BarChart3,
  Users,
} from "lucide-react";

interface DashboardHeaderProps {
  title?: string;
}

export default function DashboardHeader({
  title = "Higoverse",
}: DashboardHeaderProps) {
  const pathname = usePathname();

  const menus = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      label: "Products",
      href: "/dashboard/products",
      icon: Package,
    },
    {
      label: "Suppliers",
      href: "/dashboard/suppliers",
      icon: Truck,
    },
    {
      label: "Sales",
      href: "/dashboard/sales",
      icon: ShoppingCart,
    },
    {
      label: "Customers",
      href: "/dashboard/customers",
      icon: Users,
    },
    {
      label: "Reports",
      href: "/dashboard/reports",
      icon: BarChart3,
    },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4">
        {/* Top Bar */}
        <div className="h-12 flex items-center justify-between">
          {/* Logo */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2"
          >
            <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-white">
              <LayoutDashboard size={16} />
            </div>

            <span className="font-semibold text-sm text-slate-900">
              {title}
            </span>
          </Link>

          {/* Right Side */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-1.5 text-green-600 text-xs font-medium">
              <Activity size={13} />
              Online
            </div>

            <LogoutButton />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-hide">
          {menus.map((menu) => {
            const Icon = menu.icon;

            const active =
              pathname === menu.href ||
              pathname.startsWith(
                `${menu.href}/`
              );

            return (
              <Link
                key={menu.href}
                href={menu.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all
                ${
                  active
                    ? "bg-green-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon size={14} />
                {menu.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}