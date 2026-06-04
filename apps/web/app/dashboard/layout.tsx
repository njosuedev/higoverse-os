"use client";

import { useEffect, useState } from "react";
import { getUser, logout, User } from "@/lib/auth";
import { SIDEBAR_LINKS } from "@/lib/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setUser(getUser());
  }, []);

  return (
    <div className="min-h-screen flex bg-gray-50">

      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r p-5">
        <h1 className="text-xl font-bold mb-6">Higoverse POS</h1>

        <nav className="space-y-2">
          {SIDEBAR_LINKS.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-3 py-2 rounded ${
                  active ? "bg-blue-600 text-white" : "hover:bg-gray-100"
                }`}
              >
                {item.title}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={logout}
          className="mt-10 w-full bg-red-500 text-white py-2 rounded"
        >
          Logout
        </button>
      </aside>

      {/* MAIN */}
      <main className="flex-1">
        <header className="p-4 border-b bg-white flex justify-between">
          <div>
            <p className="text-sm text-gray-500">Welcome</p>
            <p className="font-bold">{user?.email || "..."}</p>
          </div>

          <div className="text-sm">
            Shop: {user?.shop_id || "-"}
          </div>
        </header>

        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}