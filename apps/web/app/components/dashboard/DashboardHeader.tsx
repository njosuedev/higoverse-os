"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/app/components/LogoutButton";
import { Activity, LayoutDashboard, Package, Truck, ShoppingCart, BarChart3, Users } from "lucide-react";

interface DashboardHeaderProps {
  title?: string;
  loading?: boolean;
}

export default function DashboardHeader({
  title = "Higoverse",
  loading = false,
}: DashboardHeaderProps) {
  const pathname = usePathname();

  const menus = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Products", href: "/products", icon: Package },
    { label: "Suppliers", href: "/suppliers", icon: Truck },
    { label: "Sales", href: "/sales", icon: ShoppingCart },
    { label: "Customers", href: "/customers", icon: Users },
    { label: "Reports", href: "/reports", icon: BarChart3 },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4">

        {/* TOP BAR */}
        <div className="h-12 flex items-center justify-between">

          {/* LOGO */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-white">
              <LayoutDashboard size={16} />
            </div>

            {loading ? (
              <div className="h-4 w-24 bg-slate-200 animate-pulse rounded" />
            ) : (
              <span className="font-semibold text-sm text-slate-900">
                {title}
              </span>
            )}
          </Link>

          {/* RIGHT SIDE */}
          <div className="flex items-center gap-3">

            {/* ONLINE STATUS */}
            <div className="hidden md:flex items-center gap-1.5 text-green-600 text-xs font-medium">
              <Activity size={13} />
              {loading ? (
                <div className="h-3 w-10 bg-slate-200 animate-pulse rounded" />
              ) : (
                "Online"
              )}
            </div>

            {/* LOGOUT */}
            {loading ? (
              <div className="h-8 w-20 bg-slate-200 animate-pulse rounded-lg" />
            ) : (
              <LogoutButton />
            )}
          </div>
        </div>

        {/* NAVIGATION */}
        <nav className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-hide">
          {menus.map((menu) => {
            const Icon = menu.icon;

            const active =
              menu.href === "/"
                ? pathname === "/"
                : pathname.startsWith(menu.href);

            if (loading) {
              return (
                <div
                  key={menu.href}
                  className="h-7 w-24 bg-slate-200 animate-pulse rounded-lg mx-1"
                />
              );
            }

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
