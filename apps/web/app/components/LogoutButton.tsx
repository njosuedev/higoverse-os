"use client";

import { LogOut } from "lucide-react";
import { logout } from "@/lib/auth";

export default function LogoutButton() {
  return (
    <button
      onClick={logout}
      className="
        inline-flex items-center gap-2
        px-3 py-2
        rounded-lg
        border border-slate-200
        bg-white
        text-slate-700
        text-sm font-medium
        shadow-sm
        hover:shadow-md
        hover:border-red-200
        hover:text-red-600
        active:scale-[0.98]
        transition-all
      "
    >
      <LogOut size={15} />
      <span>Logout</span>
    </button>
  );
}