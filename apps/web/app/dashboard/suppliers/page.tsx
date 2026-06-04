"use client";

import { useEffect, useState } from "react";
import { API } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  async function fetchSuppliers() {
    try {
      const res = await fetch(API.suppliers.list, {
        headers: getAuthHeaders(),
      });

      const data = await res.json();
      setSuppliers(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="p-6">Loading suppliers...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Suppliers</h1>

      <div className="grid gap-4">
        {suppliers.map((s) => (
          <div
            key={s.id}
            className="bg-white border rounded-xl p-5"
          >
            <h2 className="font-semibold text-lg">
              {s.name}
            </h2>

            <p className="text-sm">{s.phone}</p>
            <p className="text-sm">{s.email}</p>
            <p className="text-sm text-gray-500">
              {s.address}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}