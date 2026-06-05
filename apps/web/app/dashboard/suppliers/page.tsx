"use client";

import { useEffect, useMemo, useState } from "react";
import { supplierRequest } from "@/lib/supplier-api";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader"

import {
  Users,
  Search,
  Filter,
  Plus,
  Trash2,
  X,
  Phone,
  Mail,
  MapPin,
} from "lucide-react";


export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  /* MODAL */
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);

  /* DELETE */
  const [deletingId, setDeletingId] = useState("");

  /* FORM */
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    status: "active",
  });

  const [errors, setErrors] = useState<any>({});

  /* ---------------- LOAD ---------------- */
  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(false), 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadData(showLoading = true) {
    try {
      if (showLoading) setLoading(true);

      const res = await supplierRequest("/suppliers");
      setSuppliers(res?.data?.items || res?.data || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  /* ---------------- VALIDATION ---------------- */
  function validate(data = form) {
    const err: any = {};

    if (!data.name.trim()) err.name = "Name required";

    const phoneRegex = /^(\+?[0-9]{7,15})$/;
    if (!data.phone.trim()) {
      err.phone = "Phone required";
    } else if (!phoneRegex.test(data.phone.replace(/\s/g, ""))) {
      err.phone = "Invalid phone (+250..., 07...)";
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!data.email.trim()) {
      err.email = "Email required";
    } else if (!emailRegex.test(data.email)) {
      err.email = "Invalid email";
    }

    setErrors(err);
    return Object.keys(err).length === 0;
  }

  function handleChange(e: any) {
    const { name, value } = e.target;

    const updated = { ...form, [name]: value };
    setForm(updated);

    validate(updated);
  }

  /* ---------------- CREATE ---------------- */
  async function createSupplier() {
    if (!validate()) return;

    try {
      setCreating(true);

      await supplierRequest("/suppliers", {
        method: "POST",
        body: JSON.stringify(form),
      });

      setForm({
        name: "",
        phone: "",
        email: "",
        address: "",
        status: "active",
      });

      setShowModal(false);
      await loadData(false);
    } catch (err) {
      alert("Failed to create supplier");
    } finally {
      setCreating(false);
    }
  }

  /* ---------------- DELETE ---------------- */
  async function deleteSupplier(id: string) {
    if (!confirm("Delete supplier?")) return;

    try {
      setDeletingId(id);

      await supplierRequest(`/suppliers/${id}`, {
        method: "DELETE",
      });

      await loadData(false);
    } catch (err) {
      alert("Delete failed");
    } finally {
      setDeletingId("");
    }
  }

  /* ---------------- FILTER ---------------- */
  const filtered = useMemo(() => {
    return suppliers
      .filter((s) =>
        s.name?.toLowerCase().includes(search.toLowerCase())
      )
      .filter((s) => {
        if (filter === "all") return true;
        if (filter === "active") return s.status === "active";
        if (filter === "inactive") return s.status !== "active";
        return true;
      });
  }, [suppliers, search, filter]);

  /* ---------------- STATS ---------------- */
  const stats = useMemo(() => {
    return {
      total: suppliers.length,
      active: suppliers.filter((s) => s.status === "active").length,
      inactive: suppliers.filter((s) => s.status !== "active").length,
      noPhone: suppliers.filter((s) => !s.phone).length,
    };
  }, [suppliers]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">

      <DashboardHeader title="suppliers" />

      {/* HEADER */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-3xl p-6 mb-6">

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Users />
            <h1 className="text-xl font-bold">Suppliers</h1>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="bg-white text-green-700 px-4 py-2 rounded-xl flex items-center gap-2 font-semibold"
          >
            <Plus size={18} />
            Add Supplier
          </button>
        </div>

        <p className="text-green-100 text-sm mt-2">
          Last update: {lastUpdated?.toLocaleTimeString() || "—"}
        </p>

        {/* SEARCH */}
        <div className="mt-4 flex gap-3 flex-col md:flex-row">

          <div className="flex-1 flex items-center bg-white/10 rounded-xl px-3 py-2">
            <Search size={18} />
            <input
              className="bg-transparent outline-none ml-2 w-full text-white placeholder-white/70"
              placeholder="Search supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center bg-white/10 rounded-xl px-3 py-2">
            <Filter size={18} />
            <select
              className="bg-transparent text-white"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

        </div>
      </div>

      {/* CARDS */}
      <div className="grid md:grid-cols-4 gap-4 mb-6">

        <div className="bg-white p-5 rounded-2xl border">
          <p className="text-gray-600 font-bold">Total</p>
          <h2 className="text-2xl text-gray-800 font-bold">{stats.total}</h2>
        </div>

        <div className="bg-white p-5 rounded-2xl border">
          <p className="text-gray-600 font-bold">Active</p>
          <h2 className="text-2xl font-bold text-green-600">{stats.active}</h2>
        </div>

        <div className="bg-white p-5 rounded-2xl border">
          <p className="text-gray-600 font-bold">Inactive</p>
          <h2 className="text-2xl font-bold text-red-600">{stats.inactive}</h2>
        </div>

        <div className="bg-white p-5 rounded-2xl border">
          <p className="text-gray-600 font-bold">No Phone</p>
          <h2 className="text-2xl font-bold text-amber-500">{stats.noPhone}</h2>
        </div>

      </div>

      {/* TABLE */}
      <div className="bg-white rounded-2xl border overflow-x-auto">

        <table className="w-full text-black">

          <thead className="bg-slate-100">
            <tr>
              <th className="p-4 text-left">Name</th>
              <th className="p-4 text-left">Phone</th>
              <th className="p-4 text-left">Email</th>
              <th className="p-4 text-left">Address</th>
              <th className="p-4 text-left">Status</th>
              <th className="p-4 text-left">Actions</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">

                <td className="p-4 font-semibold">{s.name}</td>
                <td className="p-4">{s.phone || "—"}</td>
                <td className="p-4">{s.email || "—"}</td>
                <td className="p-4">{s.address || "—"}</td>

                <td className="p-4">
                  <span className={s.status === "active"
                    ? "text-green-600 font-semibold"
                    : "text-red-600 font-semibold"}>
                    {s.status}
                  </span>
                </td>

                <td className="p-4">
                  <button
                    onClick={() => deleteSupplier(s.id)}
                    className="bg-red-50 text-red-600 px-3 py-2 rounded-lg flex items-center gap-2"
                  >
                    {deletingId === s.id ? (
                      <span className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                    {deletingId === s.id ? "Deleting..." : "Delete"}
                  </button>
                </td>

              </tr>
            ))}
          </tbody>

        </table>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">

          <div className="bg-white rounded-3xl w-full max-w-xl p-6">

            <div className="flex justify-between mb-4">
              <h2 className="text-xl font-bold">Add Supplier</h2>
              <button onClick={() => setShowModal(false)}>
                <X />
              </button>
            </div>

            <div className="grid gap-3">

              <input
                name="name"
                placeholder="Supplier name"
                className="border p-3 rounded-xl"
                onChange={handleChange}
              />
              {errors.name && <p className="text-red-500 text-sm">{errors.name}</p>}

              <input
                name="phone"
                placeholder="Phone (+250...)"
                className="border p-3 rounded-xl"
                onChange={handleChange}
              />
              {errors.phone && <p className="text-red-500 text-sm">{errors.phone}</p>}

              <input
                name="email"
                placeholder="Email"
                className="border p-3 rounded-xl"
                onChange={handleChange}
              />
              {errors.email && <p className="text-red-500 text-sm">{errors.email}</p>}

              <input
                name="address"
                placeholder="Address"
                className="border p-3 rounded-xl"
                onChange={handleChange}
              />

            </div>

            <button
              onClick={createSupplier}
              disabled={creating}
              className="mt-5 bg-green-600 text-white w-full py-2 rounded-xl"
            >
              {creating ? "Creating..." : "Create Supplier"}
            </button>

          </div>

        </div>
      )}

    </div>
  );
}