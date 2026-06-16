"use client";

import { useEffect, useState } from "react";
import { settingsRequest } from "@/lib/settings-api";
import { getMyShop, updateMyShop } from "@/lib/shop-api";
import { useLanguage } from "@/lib/language-context";
import { type Lang } from "@/lib/i18n";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import { Settings, Save, RefreshCw, Store, Phone, MapPin, DollarSign, AlertCircle, FileText } from "lucide-react";

interface ShopSettings {
  shop_name?: string;
  phone?: string;
  address?: string;
  description?: string;
  currency: string;
  language: string;
  low_stock_threshold: number;
  tax_rate: number;
}

const DEFAULTS: ShopSettings = {
  shop_name: "", phone: "", address: "", description: "",
  currency: "RWF", language: "en", low_stock_threshold: 10, tax_rate: 0,
};

export default function SettingsPage() {
  const { t, setLang } = useLanguage();
  const [form, setForm] = useState<ShopSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      // Load from both sources in parallel
      const [settingsRes, shopRes] = await Promise.allSettled([
        settingsRequest("/settings"),
        getMyShop(),
      ]);

      const s = settingsRes.status === "fulfilled" ? settingsRes.value?.data : null;
      const shop = shopRes.status === "fulfilled" ? shopRes.value : null;

      setForm({
        // Shop identity from auth_db.shops (canonical source)
        shop_name:   shop?.name   || s?.shop_name || "",
        phone:       shop?.phone  || s?.phone     || "",
        address:     shop?.address || s?.address  || "",
        description: shop?.description || "",
        // Operational settings from settings-service
        currency:            s?.currency            || "RWF",
        language:            s?.language            || "en",
        low_stock_threshold: s?.low_stock_threshold ?? 10,
        tax_rate:            s?.tax_rate            ?? 0,
      });
    } catch (err) {
      setError(t("settings.error"));
      console.error(err);
    } finally { setLoading(false); }
  };

  const saveSettings = async () => {
    try {
      setSaving(true); setError(""); setSaved(false);

      // Run both in parallel; settings-service is authoritative — shop update is best-effort
      const [shopResult, settingsResult] = await Promise.allSettled([
        updateMyShop({
          name:        form.shop_name,
          phone:       form.phone,
          address:     form.address,
          description: form.description,
        }),
        settingsRequest("/settings", {
          method: "PUT",
          body: JSON.stringify({
            shop_name:           form.shop_name,
            phone:               form.phone,
            address:             form.address,
            currency:            form.currency,
            language:            form.language,
            low_stock_threshold: form.low_stock_threshold,
            tax_rate:            form.tax_rate,
          }),
        }),
      ]);

      if (settingsResult.status === "rejected") {
        console.error("Settings save failed:", settingsResult.reason);
        setError(t("settings.error"));
        return;
      }

      if (shopResult.status === "rejected") {
        // Settings saved but shop profile update failed — partial success
        console.warn("Shop profile update failed (settings still saved):", shopResult.reason);
      }

      setSaved(true);
      if (form.language) setLang(form.language as Lang);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(t("settings.error"));
      console.error(err);
    } finally { setSaving(false); }
  };

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
                <h1 className="text-base font-semibold">{t("settings.title")}</h1>
                <p className="text-slate-300 text-xs mt-0.5">
                  {t("common.updated")}: {new Date().toLocaleDateString()}
                </p>
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
            ✓ {t("settings.saved")}
          </div>
        )}

        {/* SHOP INFO */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Store size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700">{t("settings.shop_info")}</h2>
          </div>
          <div className="grid gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">{t("settings.shop_name")}</label>
              <input className={inputCls} placeholder="e.g. Duka rya Kalisa"
                value={form.shop_name || ""}
                onChange={(e) => setForm({ ...form, shop_name: e.target.value })} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  <Phone size={11} className="inline mr-1" />{t("common.phone")}
                </label>
                <input className={inputCls} placeholder="07XXXXXXXX"
                  value={form.phone || ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  <MapPin size={11} className="inline mr-1" />{t("common.address")}
                </label>
                <input className={inputCls} placeholder="e.g. Kigali, Gasabo"
                  value={form.address || ""}
                  onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                <FileText size={11} className="inline mr-1" />About your shop
              </label>
              <textarea rows={3} className={inputCls + " resize-none"} placeholder="Brief description of your business…"
                value={form.description || ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
        </div>

        {/* FINANCIAL */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700">{t("settings.financial")}</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">{t("settings.currency")}</label>
              <select className={inputCls} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                <option value="RWF">RWF — Rwandan Franc</option>
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="KES">KES — Kenyan Shilling</option>
                <option value="UGX">UGX — Ugandan Shilling</option>
                <option value="TZS">TZS — Tanzanian Shilling</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">{t("settings.low_threshold")}</label>
              <input type="number" min="0" className={inputCls} placeholder="10"
                value={form.low_stock_threshold}
                onChange={(e) => setForm({ ...form, low_stock_threshold: Number(e.target.value) })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">{t("settings.tax_rate")}</label>
              <input type="number" min="0" max="100" step="0.1" className={inputCls} placeholder="0"
                value={form.tax_rate}
                onChange={(e) => setForm({ ...form, tax_rate: Number(e.target.value) })} />
            </div>
          </div>
        </div>

        {/* LANGUAGE */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700">{t("settings.language_section")}</h2>
          </div>
          <div className="max-w-xs">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">{t("settings.language")}</label>
            <select className={inputCls} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
              <option value="en">🇬🇧 English</option>
              <option value="rw">🇷🇼 Kinyarwanda</option>
              <option value="fr">🇫🇷 Français</option>
              <option value="sw">🇹🇿 Kiswahili</option>
            </select>
          </div>
        </div>

        {/* SAVE BUTTON */}
        <div className="flex justify-end">
          <button onClick={saveSettings} disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 transition disabled:opacity-60">
            <Save size={15} />
            {saving ? t("common.saving") : t("settings.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
