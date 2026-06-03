"use client";

import { logout } from "@/lib/auth";

export default function LogoutButton() {
  return (
    <button
      onClick={logout}
      className="px-4 py-2 rounded-xl bg-red-500 text-white hover:bg-red-600"
    >
      Logout
    </button>
  );
}
