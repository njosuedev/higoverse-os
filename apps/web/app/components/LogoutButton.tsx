"use client";

import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function LogoutButton() {
  const { logout } = useAuth();

  // logout() clears this account from the browser and reloads to /login.
  const handleLogout = () => logout();

  return (
    <button
      onClick={handleLogout}
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
