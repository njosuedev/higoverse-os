"use client";

import { useEffect, useRef, useState } from "react";
import { settingsRequest } from "@/lib/settings-api";
import { getMyShop, updateMyShop } from "@/lib/shop-api";
import { changePassword } from "@/lib/auth-api";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { useShop } from "@/lib/shop-context";
import { getEffectiveRole } from "@/lib/auth";
import { type Lang } from "@/lib/i18n";
import PageSkeleton from "@/app/components/dashboard/PageSkeleton";
import {
  Settings, Save, RefreshCw, Store, Phone, MapPin, DollarSign,
  AlertCircle, FileText, Lock, Eye, EyeOff, CheckCircle2, ChevronDown,
  Globe, BarChart, ShieldCheck, Pencil, ImagePlus, X, Loader2,
} from "lucide-react";

interface ShopForm {
  shop_name: string;
  phone: string;
  address: string;
  description: string;
}

interface OperationalForm {
  currency: string;
  language: string;
  low_stock_threshold: number;
  tax_rate: number;
}

interface PwForm {
  current: string;
  next: string;
  confirm: string;
}

const SHOP_DEFAULTS: ShopForm = { shop_name: "", phone: "", address: "", description: "" };
const OPS_DEFAULTS: OperationalForm = { currency: "RWF", language: "en", low_stock_threshold: 10, tax_rate: 0 };
const PW_DEFAULTS: PwForm = { current: "", next: "", confirm: "" };

function deepEq<T>(a: T, b: T) { return JSON.stringify(a) === JSON.stringify(b); }

function compressImage(file: File, maxPx = 256, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new window.Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

type SectionStatus = "idle" | "saving" | "saved" | "error";

export default function SettingsPage() {
  const { t, setLang } = useLanguage();
  const { user } = useAuth();
  const { shop } = useShop();
  const role = getEffectiveRole(user ?? null, shop?.is_active === true);
  const isCustomer = role === "CUSTOMER";

  // Form state
  const [shopForm, setShopForm]   = useState<ShopForm>(SHOP_DEFAULTS);
  const [opsForm, setOpsForm]     = useState<OperationalForm>(OPS_DEFAULTS);
  const [pwForm, setPwForm]       = useState<PwForm>(PW_DEFAULTS);

  // Saved snapshot (what was last successfully loaded/saved)
  const savedShop = useRef<ShopForm>(SHOP_DEFAULTS);
  const savedOps  = useRef<OperationalForm>(OPS_DEFAULTS);

  // Section status
  const [shopStatus, setShopStatus] = useState<SectionStatus>("idle");
  const [opsStatus, setOpsStatus]   = useState<SectionStatus>("idle");
  const [pwStatus, setPwStatus]     = useState<SectionStatus>("idle");

  const [shopErr, setShopErr] = useState("");
  const [opsErr, setOpsErr]   = useState("");
  const [pwErr, setPwErr]     = useState("");

  const [logoUrl, setLogoUrl]       = useState("");
  const savedLogoUrl                = useRef("");
  const [logoLoading, setLogoLoading] = useState(false);
  const logoDirty = logoUrl !== savedLogoUrl.current;

  const [loading, setLoading]   = useState(true);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showPw, setShowPw]     = useState(false);
  const [pwOpen, setPwOpen]     = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Dirty checks
  const shopDirty = !deepEq(shopForm, savedShop.current);
  const opsDirty  = !deepEq(opsForm,  savedOps.current);
  const pwDirty   = pwForm.current.length > 0 || pwForm.next.length > 0;

  const anyDirty = shopDirty || opsDirty || logoDirty;

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    try {
      setLoading(true);
      const [settRes, shopRes] = await Promise.allSettled([
        settingsRequest("/settings/"),
        getMyShop(),
      ]);

      const s    = settRes.status === "fulfilled" ? settRes.value?.data : null;
      const shop = shopRes.status === "fulfilled" ? shopRes.value : null;

      const newShop: ShopForm = {
        shop_name:   shop?.name        || s?.shop_name || "",
        phone:       shop?.phone       || s?.phone     || "",
        address:     shop?.address     || s?.address   || "",
        description: shop?.description || "",
      };
      const newOps: OperationalForm = {
        currency:            s?.currency            ?? "RWF",
        language:            s?.language            ?? "en",
        low_stock_threshold: s?.low_stock_threshold ?? 10,
        tax_rate:            s?.tax_rate            ?? 0,
      };

      const logo = shop?.logo_url || "";
      setShopForm(newShop);
      setOpsForm(newOps);
      setLogoUrl(logo);
      savedShop.current    = { ...newShop };
      savedOps.current     = { ...newOps };
      savedLogoUrl.current = logo;
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function statusTimer(set: (s: SectionStatus) => void) {
    setTimeout(() => set("idle"), 3000);
  }

  async function saveShop() {
    if (!shopForm.address) { setShopErr("Please select a district."); return; }
    setShopStatus("saving"); setShopErr("");
    try {
      await updateMyShop({
        name:        shopForm.shop_name,
        phone:       shopForm.phone,
        address:     shopForm.address,
        description: shopForm.description,
        logo_url:    logoUrl || undefined,
      });
      // Also sync to settings-service
      await settingsRequest("/settings/", {
        method: "PUT",
        body: JSON.stringify({
          shop_name: shopForm.shop_name,
          phone:     shopForm.phone,
          address:   shopForm.address,
        }),
      }).catch(() => {}); // best-effort
      savedShop.current    = { ...shopForm };
      savedLogoUrl.current = logoUrl;
      setShopStatus("saved");
      setLastSaved(new Date());
      statusTimer(setShopStatus);
    } catch (err) {
      setShopErr(err instanceof Error ? err.message : "Failed to save shop info.");
      setShopStatus("error");
    }
  }

  async function handleLogoFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setLogoLoading(true);
    try {
      const compressed = await compressImage(file);
      setLogoUrl(compressed);
    } finally {
      setLogoLoading(false);
    }
  }

  async function saveOps() {
    setOpsStatus("saving"); setOpsErr("");
    try {
      await settingsRequest("/settings/", {
        method: "PUT",
        body: JSON.stringify({
          currency:            opsForm.currency,
          language:            opsForm.language,
          low_stock_threshold: opsForm.low_stock_threshold,
          tax_rate:            opsForm.tax_rate,
        }),
      });
      savedOps.current = { ...opsForm };
      setOpsStatus("saved");
      setLastSaved(new Date());
      if (opsForm.language) setLang(opsForm.language as Lang);
      statusTimer(setOpsStatus);
    } catch (err) {
      setOpsErr(err instanceof Error ? err.message : "Failed to save settings.");
      setOpsStatus("error");
    }
  }

  async function saveAll() {
    const ps: Promise<void>[] = [];
    if (shopDirty) ps.push(saveShop());
    if (opsDirty)  ps.push(saveOps());
    await Promise.allSettled(ps);
  }

  async function savePassword() {
    setPwErr(""); setPwStatus("saving");
    if (!pwForm.current) { setPwErr("Current password is required."); setPwStatus("error"); return; }
    if (pwForm.next.length < 6) { setPwErr("New password must be at least 6 characters."); setPwStatus("error"); return; }
    if (pwForm.next !== pwForm.confirm) { setPwErr("Passwords do not match."); setPwStatus("error"); return; }
    try {
      await changePassword(pwForm.current, pwForm.next);
      setPwForm(PW_DEFAULTS);
      setPwStatus("saved");
      setPwOpen(false);
      statusTimer(setPwStatus);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to change password.";
      setPwErr(msg.includes("400") || msg.toLowerCase().includes("incorrect")
        ? "Current password is incorrect."
        : msg);
      setPwStatus("error");
    }
  }

  const inputCls = "border border-slate-200 bg-white text-gray-800 placeholder:text-gray-400 rounded-lg px-3 py-2.5 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition";

  if (loading) return <PageSkeleton cards={0} showTable={false} showForm />;

  return (
    <div className="min-h-screen pb-32">
      <div className="max-w-3xl mx-auto px-3 sm:px-5 py-3 sm:py-4 space-y-4">

        {/* ── HEADER ─────────────────────────────── */}
        <div className="bg-linear-to-r from-slate-700 to-slate-900 text-white rounded-2xl p-5">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Shop logo" className="w-10 h-10 rounded-xl object-cover border-2 border-white/20" />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Settings size={19} />
                </div>
              )}
              <div>
                <h1 className="text-base font-semibold">{t("settings.title")}</h1>
                <p className="text-slate-400 text-xs mt-0.5">
                  {lastSaved
                    ? `Last saved ${lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : "Configure your shop preferences"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {anyDirty && (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 rounded-full">
                  <Pencil size={10} /> Unsaved changes
                </span>
              )}
              <button onClick={load} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition">
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* ── MY ACCOUNT (CUSTOMER only) ────────── */}
        {isCustomer && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                <ShieldCheck size={14} className="text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">My Account</p>
                <p className="text-[11px] text-slate-400">Your Higoverse account information</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {user?.name && (
                <div className="flex items-center justify-between py-2 border-b border-slate-50">
                  <span className="text-xs font-medium text-slate-500">Name</span>
                  <span className="text-sm font-semibold text-slate-800">{user.name}</span>
                </div>
              )}
              <div className="flex items-center justify-between py-2 border-b border-slate-50">
                <span className="text-xs font-medium text-slate-500">Email</span>
                <span className="text-sm text-slate-700">{user?.email}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-xs font-medium text-slate-500">Account Type</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                  Customer
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── SHOP PROFILE (SHOP OWNER / ADMIN only) ─── */}
        {!isCustomer && <Section
          icon={<Store size={15} />}
          title={t("settings.shop_info")}
          dirty={shopDirty || logoDirty}
          status={shopStatus}
          onSave={saveShop}
          saveLabel="Save Profile"
        >
          {shopErr && <ErrorBanner msg={shopErr} />}

          <div className="space-y-4">
            {/* Logo */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">
                Shop Logo <span className="text-slate-400">(optional)</span>
              </label>
              <div className="flex items-center gap-4">
                {logoUrl ? (
                  <div className="relative w-16 h-16 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoUrl} alt="Shop logo" className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
                    <button
                      type="button"
                      onClick={() => setLogoUrl("")}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-300 shrink-0">
                    {logoLoading ? <Loader2 size={20} className="animate-spin text-blue-400" /> : <ImagePlus size={20} />}
                  </div>
                )}
                <label className="cursor-pointer flex-1">
                  <div className="h-10 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition flex items-center justify-center gap-2 text-sm text-slate-500 font-medium">
                    <ImagePlus size={14} /> {logoUrl ? "Change logo" : "Upload logo"}
                  </div>
                  <input
                    type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); }}
                  />
                </label>
              </div>
              {logoDirty && !logoLoading && (
                <p className="text-[11px] text-amber-600 mt-1.5">Logo has unsaved changes — click Save Profile to apply.</p>
              )}
            </div>

            <Field label={t("settings.shop_name")} required>
              <input
                className={inputCls}
                placeholder="e.g. Duka rya Kalisa"
                value={shopForm.shop_name}
                onChange={(e) => setShopForm({ ...shopForm, shop_name: e.target.value })}
              />
            </Field>

            <div className="grid md:grid-cols-2 gap-4">
              <Field label={<><Phone size={11} className="inline mr-1" />{t("common.phone")}</>}>
                <input
                  className={inputCls}
                  placeholder="07XXXXXXXX"
                  value={shopForm.phone}
                  onChange={(e) => setShopForm({ ...shopForm, phone: e.target.value })}
                />
              </Field>
              <Field label={<><MapPin size={11} className="inline mr-1" />{t("common.address")} <span className="text-red-400">*</span></>}>
                <div className="relative">
                  <select
                    className={`${inputCls} appearance-none pr-9 pl-3 ${!shopForm.address ? "text-gray-400 border-red-300 focus:border-red-400 focus:ring-red-500/20" : ""}`}
                    value={shopForm.address}
                    onChange={(e) => setShopForm({ ...shopForm, address: e.target.value })}
                  >
                    <option value="" disabled>Select your district…</option>
                    <optgroup label="── Kigali City ──">
                      {["Gasabo","Kicukiro","Nyarugenge"].map(d=><option key={d} value={`${d}, Kigali`}>{d}</option>)}
                    </optgroup>
                    <optgroup label="── Eastern Province ──">
                      {["Bugesera","Gatsibo","Kayonza","Kirehe","Ngoma","Nyagatare","Rwamagana"].map(d=><option key={d} value={`${d}, Eastern Province`}>{d}</option>)}
                    </optgroup>
                    <optgroup label="── Western Province ──">
                      {["Karongi","Ngororero","Nyabihu","Nyamasheke","Rubavu","Rusizi","Rutsiro"].map(d=><option key={d} value={`${d}, Western Province`}>{d}</option>)}
                    </optgroup>
                    <optgroup label="── Northern Province ──">
                      {["Burera","Gakenke","Gicumbi","Musanze","Rulindo"].map(d=><option key={d} value={`${d}, Northern Province`}>{d}</option>)}
                    </optgroup>
                    <optgroup label="── Southern Province ──">
                      {["Gisagara","Huye","Kamonyi","Muhanga","Nyamagabe","Nyanza","Nyaruguru","Ruhango"].map(d=><option key={d} value={`${d}, Southern Province`}>{d}</option>)}
                    </optgroup>
                  </select>
                  <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                {!shopForm.address && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={11} /> District is required
                  </p>
                )}
              </Field>
            </div>

            <Field label={<><FileText size={11} className="inline mr-1" />About your shop</>}>
              <textarea
                rows={3}
                className={inputCls + " resize-none"}
                placeholder="Brief description of your business…"
                value={shopForm.description}
                onChange={(e) => setShopForm({ ...shopForm, description: e.target.value })}
              />
            </Field>
          </div>
        </Section>}

        {/* ── FINANCIAL / OPERATIONAL (SHOP OWNER / ADMIN only) ─── */}
        {!isCustomer && <Section
          icon={<DollarSign size={15} />}
          title={t("settings.financial")}
          dirty={opsDirty}
          status={opsStatus}
          onSave={saveOps}
          saveLabel="Save Settings"
        >
          {opsErr && <ErrorBanner msg={opsErr} />}

          <div className="grid md:grid-cols-3 gap-4">
            <Field label={<><DollarSign size={11} className="inline mr-1" />{t("settings.currency")}</>}>
              <select
                className={inputCls}
                value={opsForm.currency}
                onChange={(e) => setOpsForm({ ...opsForm, currency: e.target.value })}
              >
                <option value="RWF">RWF — Rwandan Franc</option>
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="KES">KES — Kenyan Shilling</option>
                <option value="UGX">UGX — Ugandan Shilling</option>
                <option value="TZS">TZS — Tanzanian Shilling</option>
                <option value="BIF">BIF — Burundian Franc</option>
                <option value="CDF">CDF — Congolese Franc</option>
              </select>
            </Field>

            <Field label={<><BarChart size={11} className="inline mr-1" />{t("settings.low_threshold")}</>}>
              <input
                type="number" min="0"
                className={inputCls}
                placeholder="10"
                value={opsForm.low_stock_threshold}
                onChange={(e) => setOpsForm({ ...opsForm, low_stock_threshold: Number(e.target.value) })}
              />
              <p className="text-[10px] text-slate-400 mt-1">Alert when stock falls below this number</p>
            </Field>

            <Field label={<>{t("settings.tax_rate")} (%)</>}>
              <input
                type="number" min="0" max="100" step="0.1"
                className={inputCls}
                placeholder="0"
                value={opsForm.tax_rate}
                onChange={(e) => setOpsForm({ ...opsForm, tax_rate: Number(e.target.value) })}
              />
              <p className="text-[10px] text-slate-400 mt-1">Applied on proforma invoices</p>
            </Field>
          </div>
        </Section>}

        {/* ── LANGUAGE ─────────────────────────── */}
        <Section
          icon={<Globe size={15} />}
          title={t("settings.language_section")}
          dirty={opsDirty}
          status={opsStatus}
          onSave={saveOps}
          saveLabel="Save Language"
        >
          <div className="max-w-xs">
            <Field label={t("settings.language")}>
              <select
                className={inputCls}
                value={opsForm.language}
                onChange={(e) => setOpsForm({ ...opsForm, language: e.target.value })}
              >
                <option value="en">🇬🇧 English</option>
                <option value="rw">🇷🇼 Kinyarwanda</option>
                <option value="fr">🇫🇷 Français</option>
                <option value="sw">🇹🇿 Kiswahili</option>
              </select>
            </Field>
          </div>
        </Section>

        {/* ── SECURITY / CHANGE PASSWORD ─────────── */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition text-left"
            onClick={() => { setPwOpen((v) => !v); setPwErr(""); setPwStatus("idle"); }}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                <ShieldCheck size={14} className="text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Security — Change Password</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Update your account password</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {pwStatus === "saved" && (
                <span className="flex items-center gap-1 text-[11px] text-green-600 font-medium">
                  <CheckCircle2 size={12} /> Changed
                </span>
              )}
              <ChevronDown size={15} className={`text-slate-400 transition-transform ${pwOpen ? "rotate-180" : ""}`} />
            </div>
          </button>

          {pwOpen && (
            <div className="px-5 pb-5 border-t border-slate-100">
              <div className="pt-4 space-y-4">
                {pwErr && <ErrorBanner msg={pwErr} />}
                {pwStatus === "saved" && (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 text-sm text-green-700">
                    <CheckCircle2 size={14} /> Password changed successfully.
                  </div>
                )}

                <Field label="Current Password" required>
                  <div className="relative">
                    <input
                      type={showCurrent ? "text" : "password"}
                      className={inputCls + " pr-10"}
                      placeholder="Your current password"
                      value={pwForm.current}
                      onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
                    />
                    <button type="button" onClick={() => setShowCurrent((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </Field>

                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="New Password" required>
                    <div className="relative">
                      <input
                        type={showNext ? "text" : "password"}
                        className={inputCls + " pr-10"}
                        placeholder="Min. 6 characters"
                        value={pwForm.next}
                        onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })}
                      />
                      <button type="button" onClick={() => setShowNext((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showNext ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {pwForm.next.length > 0 && (
                      <PasswordStrength pw={pwForm.next} />
                    )}
                  </Field>

                  <Field label="Confirm New Password" required>
                    <div className="relative">
                      <input
                        type={showConfirm ? "text" : "password"}
                        className={inputCls + " pr-10" + (pwForm.confirm && pwForm.next !== pwForm.confirm ? " border-red-300 focus:border-red-400" : "")}
                        placeholder="Repeat new password"
                        value={pwForm.confirm}
                        onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                      />
                      <button type="button" onClick={() => setShowConfirm((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {pwForm.confirm && pwForm.next !== pwForm.confirm && (
                      <p className="text-[11px] text-red-500 mt-1">Passwords do not match</p>
                    )}
                    {pwForm.confirm && pwForm.next === pwForm.confirm && pwForm.next.length >= 6 && (
                      <p className="text-[11px] text-green-600 mt-1 flex items-center gap-1"><CheckCircle2 size={11} /> Match</p>
                    )}
                  </Field>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    onClick={savePassword}
                    disabled={pwStatus === "saving" || !pwDirty}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 transition disabled:opacity-50"
                  >
                    <Lock size={13} />
                    {pwStatus === "saving" ? "Changing…" : "Change Password"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── STICKY SAVE BAR ─────────────────────── */}
      {anyDirty && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-lg">
          <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 text-sm text-slate-600">
              <Pencil size={14} className="text-amber-500" />
              <span>
                {[shopDirty && "Shop profile", opsDirty && "Operational settings"]
                  .filter(Boolean).join(" & ")} {shopDirty && opsDirty ? "have" : "has"} unsaved changes
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShopForm({ ...savedShop.current });
                  setOpsForm({ ...savedOps.current });
                  setLogoUrl(savedLogoUrl.current);
                }}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition"
              >
                Discard
              </button>
              <button
                onClick={saveAll}
                disabled={shopStatus === "saving" || opsStatus === "saving"}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 transition disabled:opacity-60"
              >
                <Save size={14} />
                {(shopStatus === "saving" || opsStatus === "saving") ? "Saving…" : "Save All Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────── */

function Section({
  icon, title, dirty, status, onSave, saveLabel, children,
}: {
  icon: React.ReactNode;
  title: string;
  dirty: boolean;
  status: SectionStatus;
  onSave: () => void;
  saveLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-white rounded-xl border transition-all ${dirty ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"}`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
            {icon}
          </div>
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          {dirty && (
            <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              Modified
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status === "saved" && (
            <span className="flex items-center gap-1 text-[11px] text-green-600 font-medium">
              <CheckCircle2 size={12} /> Saved
            </span>
          )}
          {status === "error" && (
            <span className="flex items-center gap-1 text-[11px] text-red-500 font-medium">
              <AlertCircle size={12} /> Failed
            </span>
          )}
          {dirty && (
            <button
              onClick={onSave}
              disabled={status === "saving"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700 transition disabled:opacity-60"
            >
              <Save size={12} />
              {status === "saving" ? "Saving…" : saveLabel}
            </button>
          )}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Field({ label, required, children }: {
  label: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
      <AlertCircle size={14} className="shrink-0 mt-0.5" />
      <span>{msg}</span>
    </div>
  );
}

function PasswordStrength({ pw }: { pw: string }) {
  const hasLower  = /[a-z]/.test(pw);
  const hasUpper  = /[A-Z]/.test(pw);
  const hasNumber = /\d/.test(pw);
  const hasSymbol = /[^a-zA-Z0-9]/.test(pw);
  const longEnough = pw.length >= 8;

  const score = [hasLower, hasUpper, hasNumber, hasSymbol, longEnough].filter(Boolean).length;
  const label = score <= 2 ? "Weak" : score === 3 ? "Fair" : score === 4 ? "Good" : "Strong";
  const color = score <= 2 ? "bg-red-400" : score === 3 ? "bg-amber-400" : score === 4 ? "bg-blue-500" : "bg-green-500";
  const textColor = score <= 2 ? "text-red-500" : score === 3 ? "text-amber-600" : score === 4 ? "text-blue-600" : "text-green-600";

  return (
    <div className="mt-1.5">
      <div className="flex gap-0.5 mb-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= score ? color : "bg-slate-200"}`} />
        ))}
      </div>
      <p className={`text-[10px] font-medium ${textColor}`}>{label} password</p>
    </div>
  );
}
