"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { partnerRequest } from "@/lib/supplier-api";
import { itemRequest } from "@/lib/product-api";
import { useDebounce } from "@/lib/hooks";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import Pagination from "@/app/components/ui/Pagination";
import {
  Users, Search, Filter, Plus, Trash2, Pencil, X,
  UserCheck, UserCog, Activity, Package, ShoppingCart,
  Building2, Phone, Mail, MapPin, RefreshCw,
} from "lucide-react";

interface RawPartner { id: string; name: string; phone?: string; email?: string; address?: string; }
interface Partner extends RawPartner { tin: string; realAddress: string; partnerType: "supplier" | "customer"; }
interface Product { id: string; supplier_id?: string | null; }
interface FormErrors { name?: string; contact?: string; phone?: string; tin?: string; email?: string; }
type ModalMode = "create" | "edit";

function encodeAddress(tin: string, address: string): string {
  const t = tin.trim(), a = address.trim();
  if (t && a) return `TIN:${t}|${a}`;
  if (t) return `TIN:${t}`;
  return a;
}

function decodePartner(raw: RawPartner): Partner {
  const addr = raw.address ?? "";
  let tin = "", realAddress = "";
  if (addr.startsWith("TIN:")) {
    const pipe = addr.indexOf("|");
    if (pipe !== -1) { tin = addr.slice(4, pipe); realAddress = addr.slice(pipe + 1); }
    else tin = addr.slice(4);
  } else { realAddress = addr; }
  return { ...raw, tin, realAddress, partnerType: tin ? "supplier" : "customer" };
}

const EMPTY_FORM = { name: "", phone: "", tin: "", email: "", address: "" };
const PAGE_SIZES = [25, 50, 100, 250];

const inputCls =
  "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400 transition";

export default function PartnerManagementPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});

  const debouncedSearch = useDebounce(search, 350);

  useEffect(() => { loadData(); }, []);

  async function loadData(soft = false) {
    try {
      if (!soft) setLoading(true); else setRefreshing(true);
      const [partnersRes, productsRes] = await Promise.all([
        partnerRequest("/suppliers"),
        itemRequest("/products").catch(() => null),
      ]);
      const raw: RawPartner[] = partnersRes?.data?.items ?? partnersRes?.data ?? [];
      setPartners(raw.map(decodePartner));
      setProducts(productsRes?.data?.items || []);
      setLastUpdated(new Date());
    } catch (err) { console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  }

  function validate(data = form): boolean {
    const err: FormErrors = {};
    const tin = data.tin.trim(), phone = data.phone.trim();
    if (!data.name.trim()) err.name = "Name required";
    if (!tin && !phone) { err.contact = "Enter a phone (customer) or TIN (supplier)"; }
    else {
      if (tin && !/^\d{9}$/.test(tin)) err.tin = "TIN must be exactly 9 digits";
      else if (tin) {
        const dup = partners.find((p) => p.tin === tin && p.id !== editingId);
        if (dup) err.tin = `TIN already registered to "${dup.name}"`;
      }
      if (phone && !/^\d{10}$/.test(phone.replace(/\s/g, ""))) err.phone = "Phone must be exactly 10 digits";
      else if (phone) {
        const norm = phone.replace(/\s/g, "");
        const dup = partners.find((p) => p.phone?.replace(/\s/g, "") === norm && p.id !== editingId);
        if (dup) err.phone = `Phone already registered to "${dup.name}"`;
      }
    }
    if (data.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) err.email = "Invalid email";
    setErrors(err);
    return Object.keys(err).length === 0;
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const updated = { ...form, [e.target.name]: e.target.value };
    setForm(updated); validate(updated);
  }

  function openCreateModal() { setForm(EMPTY_FORM); setErrors({}); setEditingId(null); setModalMode("create"); setShowModal(true); }
  function openEditModal(p: Partner) {
    setForm({ name: p.name, phone: p.phone ?? "", tin: p.tin ?? "", email: p.email ?? "", address: p.realAddress ?? "" });
    setErrors({}); setEditingId(p.id); setModalMode("edit"); setShowModal(true);
  }
  function closeModal() { setShowModal(false); setForm(EMPTY_FORM); setErrors({}); setEditingId(null); }

  const buildPayload = () => ({
    name: form.name.trim(), phone: form.phone.trim() || null,
    email: form.email.trim() || null, address: encodeAddress(form.tin, form.address) || null,
  });

  async function createPartner() {
    if (!validate()) return;
    try { setSubmitting(true); await partnerRequest("/suppliers", { method: "POST", body: JSON.stringify(buildPayload()) }); closeModal(); await loadData(true); }
    catch (err) { alert(`Failed to create: ${err instanceof Error ? err.message : "Unknown error"}`); }
    finally { setSubmitting(false); }
  }

  async function updatePartner() {
    if (!validate() || !editingId) return;
    try { setSubmitting(true); await partnerRequest(`/suppliers/${editingId}`, { method: "PUT", body: JSON.stringify(buildPayload()) }); closeModal(); await loadData(true); }
    catch (err) { alert(`Failed to update: ${err instanceof Error ? err.message : "Unknown error"}`); }
    finally { setSubmitting(false); }
  }

  async function deletePartner(id: string) {
    if (!confirm("Delete this partner?")) return;
    try { setDeletingId(id); await partnerRequest(`/suppliers/${id}`, { method: "DELETE" }); await loadData(true); }
    catch (err) { alert(`Delete failed: ${err instanceof Error ? err.message : "Unknown error"}`); }
    finally { setDeletingId(""); }
  }

  const supplierItemCount = useMemo(() => {
    const c: Record<string, number> = {};
    products.forEach((p) => { if (p.supplier_id) c[p.supplier_id] = (c[p.supplier_id] || 0) + 1; });
    return c;
  }, [products]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return partners
      .filter((p) => p.name?.toLowerCase().includes(q) || p.phone?.includes(q) || p.tin?.includes(q) || p.email?.toLowerCase().includes(q))
      .filter((p) => typeFilter === "all" || p.partnerType === typeFilter);
  }, [partners, debouncedSearch, typeFilter]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);


  const stats = useMemo(() => {
    const suppliers = partners.filter((p) => p.partnerType === "supplier");
    const customers = partners.filter((p) => p.partnerType === "customer");
    return {
      total: partners.length, suppliers: suppliers.length, customers: customers.length,
      itemsSupplied: products.filter((p) => p.supplier_id).length,
      activeSuppliers: suppliers.filter((s) => (supplierItemCount[s.id] || 0) > 0).length,
    };
  }, [partners, products, supplierItemCount]);

  const previewType = form.tin.trim() ? "supplier" : form.phone.trim() ? "customer" : null;

  if (loading) return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="rounded-2xl bg-linear-to-r from-green-600 to-emerald-600 p-5 mb-6 animate-pulse">
          <div className="flex justify-between"><div className="h-4 w-44 bg-white/20 rounded-lg" /><div className="h-8 w-28 bg-white/20 rounded-lg" /></div>
          <div className="h-9 bg-white/10 rounded-lg mt-4" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[...Array(5)].map((_, i) => <div key={i} className="bg-white rounded-xl border p-4 animate-pulse"><div className="h-2.5 w-16 bg-slate-200 rounded mb-3" /><div className="h-5 w-10 bg-slate-200 rounded" /></div>)}
        </div>
        <div className="bg-white rounded-xl border overflow-hidden">
          {[...Array(6)].map((_, i) => <div key={i} className="border-b grid grid-cols-7 px-4 py-3 gap-4 animate-pulse"><div className="h-2.5 bg-slate-100 rounded" /><div className="h-5 w-14 bg-slate-100 rounded-full" /><div className="h-2.5 bg-slate-100 rounded" /><div className="h-2.5 bg-slate-100 rounded" /><div className="h-2.5 bg-slate-100 rounded" /><div className="h-5 w-14 bg-slate-100 rounded-full" /><div className="flex gap-1.5"><div className="h-7 w-7 bg-slate-100 rounded-lg" /><div className="h-7 w-7 bg-slate-100 rounded-lg" /></div></div>)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <div className="max-w-7xl mx-auto px-6 py-6">

        <div className="bg-linear-to-r from-green-600 to-emerald-600 text-white rounded-2xl p-5 mb-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              <Users size={20} />
              <div>
                <h1 className="text-base font-semibold">Partner Management</h1>
                <p className="text-green-200 text-xs mt-0.5">
                  {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "—"} · {partners.length.toLocaleString()} partners total
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => loadData(true)} disabled={refreshing}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition disabled:opacity-50"><RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /></button>
              <button onClick={openCreateModal}
                className="bg-white text-green-700 px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-semibold hover:bg-green-50 transition">
                <Plus size={15} /> Add Partner
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-col md:flex-row gap-2.5">
            <div className="flex-1 flex items-center bg-white/10 rounded-lg px-3 py-2 gap-2">
              <Search size={15} className="shrink-0 text-green-200" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name, phone, TIN or email..."
                className="bg-transparent outline-none w-full text-sm placeholder:text-green-200" />
              {search && <button onClick={() => setSearch("")} className="text-green-200 hover:text-white"><X size={13} /></button>}
            </div>
            <div className="flex items-center bg-white/10 rounded-lg px-3 py-2 gap-2">
              <Filter size={15} className="shrink-0 text-green-200" />
              <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="bg-transparent outline-none text-sm">
                <option value="all" className="text-gray-700">All Partners</option>
                <option value="supplier" className="text-gray-700">Suppliers</option>
                <option value="customer" className="text-gray-700">Customers</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Total Partners",   value: stats.total,           color: "text-green-600",   bg: "bg-green-50",   icon: <Users size={17} /> },
            { label: "Suppliers",        value: stats.suppliers,       color: "text-[#1372e6]",    bg: "bg-[#EBF2FD]",    icon: <Building2 size={17} /> },
            { label: "Customers",        value: stats.customers,       color: "text-purple-600",  bg: "bg-purple-50",  icon: <UserCheck size={17} /> },
            { label: "Active Suppliers", value: stats.activeSuppliers, color: "text-emerald-600", bg: "bg-emerald-50", icon: <UserCog size={17} /> },
            { label: "Items Supplied",   value: stats.itemsSupplied,   color: "text-indigo-600",  bg: "bg-indigo-50",  icon: <Package size={17} /> },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide leading-none">{card.label}</p>
                  <p className={`text-xl font-bold mt-1.5 ${card.color}`}>{card.value}</p>
                </div>
                <div className={`${card.bg} ${card.color} p-1.5 rounded-lg`}>{card.icon}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          {(debouncedSearch || typeFilter !== "all") && (
            <div className="px-4 py-2.5 border-b border-slate-100 text-xs text-slate-500 bg-slate-50">
              <span className="font-semibold text-slate-700">{filtered.length.toLocaleString()}</span> results
              {debouncedSearch && <> matching &ldquo;<span className="font-medium">{debouncedSearch}</span>&rdquo;</>}
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Name", "Type", "Phone", "TIN", "Email", "Items", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.map((p) => {
                const isSupplier = p.partnerType === "supplier";
                const itemCount = isSupplier ? (supplierItemCount[p.id] || 0) : null;
                return (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{p.id?.slice(0, 8)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${isSupplier ? "bg-[#D5E8FB] text-[#1372e6]" : "bg-purple-100 text-purple-700"}`}>
                        {isSupplier ? <Building2 size={10} /> : <UserCheck size={10} />}
                        {isSupplier ? "Supplier" : "Customer"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.phone ? <div className="flex items-center gap-1.5 text-slate-600"><Phone size={12} className="text-slate-400 shrink-0" />{p.phone}</div>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {p.tin ? <span className="font-mono text-xs bg-[#EBF2FD] text-[#1372e6] px-2 py-0.5 rounded-md">{p.tin}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {p.email ? <div className="flex items-center gap-1.5 text-slate-600"><Mail size={12} className="text-slate-400 shrink-0" /><span className="truncate max-w-32">{p.email}</span></div>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {isSupplier ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${itemCount && itemCount > 0 ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"}`}>
                            <Package size={10} />{itemCount} item{itemCount !== 1 ? "s" : ""}
                          </span>
                          {itemCount === 0 && (
                            <Link href="/PurchaseManagement" className="text-xs text-violet-500 hover:underline flex items-center gap-0.5"><ShoppingCart size={11} /> Buy</Link>
                          )}
                        </div>
                      ) : <span className="text-xs text-slate-400 italic">Customer</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => openEditModal(p)} title="Edit" className="p-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-600 transition"><Pencil size={14} /></button>
                        <button onClick={() => deletePartner(p.id)} disabled={deletingId === p.id} title="Delete" className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition disabled:opacity-40"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {paginated.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <div className="p-4 bg-slate-100 rounded-2xl mb-3"><Activity size={32} className="opacity-40" /></div>
              <p className="font-medium text-slate-500 text-sm">No partners found</p>
              <p className="text-xs mt-1 text-slate-400">{search || typeFilter !== "all" ? "Try adjusting your filters." : "Add your first partner to get started."}</p>
              {!search && typeFilter === "all" && (
                <button onClick={openCreateModal} className="mt-4 flex items-center gap-1.5 bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 transition">
                  <Plus size={14} /> Add Partner
                </button>
              )}
            </div>
          )}

          <Pagination page={page} totalPages={totalPages} total={filtered.length}
            pageSize={pageSize} pageSizes={PAGE_SIZES} onPage={setPage} onPageSize={setPageSize} />
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl">
              <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{modalMode === "edit" ? "Edit Partner" : "Add Partner"}</h2>
                  {previewType && <p className="text-xs text-slate-400 mt-0.5">Will be saved as a <span className={`font-semibold ${previewType === "supplier" ? "text-[#1372e6]" : "text-purple-600"}`}>{previewType === "supplier" ? "Supplier" : "Customer"}</span></p>}
                </div>
                <button onClick={closeModal} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={17} /></button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs text-slate-500">
                  Fill <span className="font-semibold text-[#1372e6]">TIN</span> → Supplier &nbsp;·&nbsp; Fill <span className="font-semibold text-purple-600">Phone only</span> → Customer
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Full Name <span className="text-red-400">*</span></label>
                  <input name="name" placeholder="e.g. INYANGE Industries" value={form.name} className={inputCls} onChange={handleChange} />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1"><span className="flex items-center gap-1"><Phone size={12} /> Phone</span></label>
                    <input name="phone" placeholder="07XXXXXXXX" value={form.phone} maxLength={10} className={inputCls} onChange={handleChange} />
                    {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1"><span className="flex items-center gap-1"><Building2 size={12} /> TIN <span className="text-[#1372e6]">(Supplier)</span></span></label>
                    <input name="tin" placeholder="9-digit TIN" value={form.tin} maxLength={9} className={`${inputCls} font-mono`} onChange={handleChange} />
                    {errors.tin && <p className="text-red-500 text-xs mt-1">{errors.tin}</p>}
                  </div>
                </div>
                {errors.contact && <p className="text-red-500 text-xs">{errors.contact}</p>}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1"><span className="flex items-center gap-1"><Mail size={12} /> Email</span></label>
                    <input name="email" placeholder="email@example.com" value={form.email} className={inputCls} onChange={handleChange} />
                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1"><span className="flex items-center gap-1"><MapPin size={12} /> Address</span></label>
                    <input name="address" placeholder="Optional address" value={form.address} className={inputCls} onChange={handleChange} />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-slate-100">
                <button onClick={closeModal} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">Cancel</button>
                <button onClick={modalMode === "edit" ? updatePartner : createPartner} disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition disabled:opacity-60">
                  {submitting ? (modalMode === "edit" ? "Saving..." : "Creating...") : (modalMode === "edit" ? "Save Changes" : "Add Partner")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
