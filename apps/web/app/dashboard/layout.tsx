"use client";

import { useEffect } from "react";
import { requireAuth, logout, getUser } from "@/lib/auth";
import { SIDEBAR_LINKS } from "@/lib/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const user = getUser();

  useEffect(() => {
    requireAuth();
  }, []);

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-blue-50 via-white to-slate-50">

      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r border-blue-100 shadow-sm p-5">
        <h1 className="text-xl font-bold text-blue-700 mb-6">
          Higoverse POS
        </h1>

        <nav className="space-y-2">
          {SIDEBAR_LINKS.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-3 py-2 rounded-lg text-sm transition ${
                  active
                    ? "bg-blue-600 text-white shadow"
                    : "text-blue-900 hover:bg-blue-50"
                }`}
              >
                {item.title}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={logout}
          className="mt-10 w-full bg-gradient-to-r from-red-500 to-red-600 text-white py-2 rounded-lg hover:opacity-90 transition"
        >
          Logout
        </button>
      </aside>

      {/* MAIN */}
      <main className="flex-1">

        {/* TOP BAR */}
        <header className="bg-white border-b border-blue-100 p-4 flex justify-between items-center shadow-sm">
          <div>
            <p className="text-xs text-blue-500">Welcome back</p>
            <p className="font-semibold text-blue-900">
              {user?.email}
            </p>
          </div>

          <div className="text-xs text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
            Shop: {user?.shop_id}
          </div>
        </header>

        {/* CONTENT */}
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}