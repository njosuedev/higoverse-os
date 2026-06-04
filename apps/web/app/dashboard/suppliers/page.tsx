"use client";

import { useEffect, useState } from "react";
import { API } from "@/lib/api";
import { getAuthHeaders, requireAuth } from "@/lib/auth";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);

  useEffect(() => {
    requireAuth();
    load();
  }, []);

  async function load() {
    const res = await fetch(API.suppliers.list, {
      headers: getAuthHeaders(),
    });

    const data = await res.json();
    setSuppliers(data.data || []);
  }

  return (
    <div className="space-y-6">

      <h1 className="text-2xl font-bold text-blue-900">
        Suppliers
      </h1>

      <div className="grid gap-4">

        {suppliers.map((s) => (
          <div
            key={s.id}
            className="bg-white border border-blue-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition"
          >
            <h2 className="font-bold text-blue-900">
              {s.name}
            </h2>

            <p className="text-blue-600 text-sm">
              {s.phone}
            </p>

            <p className="text-blue-500 text-sm">
              {s.email}
            </p>

            <p className="text-xs text-blue-400">
              {s.address}
            </p>
          </div>
        ))}

      </div>
    </div>
  );
}