"use client";

import { logout } from "@/lib/auth";

export default function LogoutButton() {
  return (
    <button
      onClick={logout}
      className="px-5 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 transition"
    >
      Logout
    </button>
  );
}
