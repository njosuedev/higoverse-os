"use client";

import { getUser, logout, requireAuth } from "@/lib/auth";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    requireAuth();
    setUser(getUser());
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">
        Settings
      </h1>

      <div className="bg-white border rounded-xl p-5 space-y-3">
        <p>Email: {user?.email}</p>
        <p>Shop: {user?.shop_id}</p>
        <p>Role: {user?.role || "owner"}</p>

        <button
          onClick={logout}
          className="bg-red-500 text-white px-4 py-2 rounded-lg"
        >
          Logout
        </button>
      </div>
    </div>
  );
}