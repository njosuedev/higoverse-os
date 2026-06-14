"use client";

import { useEffect, useState } from "react";
import { settingsRequest } from "@/lib/settings-api";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import { Settings, Save, RefreshCw, Store, Phone, MapPin, DollarSign, AlertCircle } from "lucide-react";

interface ShopSettings {
  shop_name?: string;
  phone?: string;
  address?: string;
  currency: string;
  language: string;
  low_stock_threshold: number;
  tax_rate: number;
}

const DEFAULTS: ShopSettings = {
  shop_name: "", phone: "", address: "",
  currency: "RWF", language: "rw", low_stock_threshold: 10, tax_rate: 0,
};

export default function SettingsPage() {
  const [form, setForm] = useState<ShopSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const res = await settingsRequest("/settings");
      if (res?.data) {
        setForm({
          shop_name: res.data.shop_name || "",
          phone: res.data.phone || "",
          address: res.data.address || "",
          currency: res.data.currency || "RWF",
          language: res.data.language || "rw",
          low_stock_threshold: res.data.low_stock_threshold ?? 10,
          tax_rate: res.data.tax_rate ?? 0,
        });
      }
    } catch (err) {
      setError("Ibingereka ntibyashobotse gupakurura. Gerageza nanone.");
      console.error(err);
    } finally { setLoading(false); }
  }

  async function saveSettings() {
    try {
      setSaving(true); setError(""); setSaved(false);
      await settingsRequest("/settings", { method: "PUT", body: JSON.stringify(form) });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError("Kubika ntibishobotse. Gerageza nanone.");
      console.error(err);
    } finally { setSaving(false); }
  }

  const inputCls = "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-3 py-2.5 w-full text-sm focus:outline-none focus:ring-2 focus:ring-slate-400/30 focus:border-slate-400 transition";

  if (loading) return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="rounded-2xl bg-linear-to-r from-slate-700 to-slate-900 p-5 mb-6 animate-pulse">
          <div className="h-4 w-40 bg-white/20 rounded-lg" />
          <div className="h-8 bg-white/10 rounded-lg mt-4" />
        </div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border p-5 mb-4 animate-pulse">
            <div className="h-3 w-32 bg-slate-200 rounded mb-4" />
            <div className="h-10 bg-slate-100 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <div className="max-w-3xl mx-auto px-6 py-6">

        {/* HEADER */}
        <div className="bg-linear-to-r from-slate-700 to-slate-900 text-white rounded-2xl p-5 mb-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              <Settings size={20} />
              <div>
                <h1 className="text-base font-semibold">Igenamiterere — Settings</h1>
                <p className="text-slate-300 text-xs mt-0.5">Hindura amakuru ya duka ryawe</p>
              </div>
            </div>
            <button onClick={loadSettings}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">
            <AlertCircle size={15} className="shrink-0" /> {error}
          </div>
        )}
        {saved && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4 text-sm text-green-700">
            ✓ Ibingereka byabitswe neza
          </div>
        )}

        {/* SHOP INFO */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Store size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700">Amakuru y&apos;Iduka</h2>
          </div>
          <div className="grid gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Izina ry&apos;Iduka</label>
              <input className={inputCls} placeholder="urugero: Duka rya Kalisa"
                value={form.shop_name || ""}
                onChange={(e) => setForm({ ...form, shop_name: e.target.value })} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  <Phone size={11} className="inline mr-1" />Telefoni
                </label>
                <input className={inputCls} placeholder="07XXXXXXXX"
                  value={form.phone || ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  <MapPin size={11} className="inline mr-1" />Aderesi
                </label>
                <input className={inputCls} placeholder="urugero: Kigali, Gasabo"
                  value={form.address || ""}
                  onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
            </div>
          </div>
        </div>

        {/* FINANCIAL */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700">Amafaranga</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Ifaranga Ryakoreshwa</label>
              <select className={inputCls} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                <option value="RWF">RWF — Amafaranga y&apos;u Rwanda</option>
                <option value="USD">USD — Dollar y&apos;Amerika</option>
                <option value="EUR">EUR — Euro</option>
                <option value="KES">KES — Kenyan Shilling</option>
                <option value="UGX">UGX — Ugandan Shilling</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Umubare w&apos;Ububiko Bugarije</label>
              <input type="number" min="0" className={inputCls} placeholder="10"
                value={form.low_stock_threshold}
                onChange={(e) => setForm({ ...form, low_stock_threshold: Number(e.target.value) })} />
              <p className="text-xs text-slate-400 mt-1">Igicuruzwa kiri munsi y&apos;uyu mubare gisa ko bugarije</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Umusoro (%)</label>
              <input type="number" min="0" max="100" step="0.1" className={inputCls} placeholder="0"
                value={form.tax_rate}
                onChange={(e) => setForm({ ...form, tax_rate: Number(e.target.value) })} />
              <p className="text-xs text-slate-400 mt-1">Shyira 0 niba nta musoro</p>
            </div>
          </div>
        </div>

        {/* LANGUAGE */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700">Ururimi</h2>
          </div>
          <div className="max-w-xs">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Ururimi rw&apos;Porogaramu</label>
            <select className={inputCls} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
              <option value="rw">Kinyarwanda</option>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        {/* SAVE BUTTON */}
        <div className="flex justify-end">
          <button onClick={saveSettings} disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 transition disabled:opacity-60">
            <Save size={15} />
            {saving ? "Kubika..." : "Bika Impinduka"}
          </button>
        </div>
      </div>
    </div>
  );
}
