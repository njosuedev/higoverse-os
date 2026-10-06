"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { settingsRequest } from "@/lib/settings-api";
import { updateMyShop } from "@/lib/shop-api";
import { changePassword } from "@/lib/auth-api";
import { useLanguage } from "@/lib/language-context";
import { useShop } from "@/lib/shop-context";
import { type Lang } from "@/lib/i18n";
import { parseShopAddress, decodeShopHumanInfo } from "@/lib/product-meta";
import { cleanTin, normalizePhone, phoneError, prettyPhone, shopTin, splitAddress, tinError, bankErrors, RWANDA_BANKS, type BankAccount } from "@/lib/company";
import { useAuth } from "@/lib/auth-context";
import { CAR_TYPES, carTypeLabel } from "@/lib/business-layout";
import { useShopSettings } from "@/lib/shop-settings-context";
import { compressImage } from "@/lib/image";
import PageSkeleton from "@/app/components/dashboard/PageSkeleton";
import {
  Save, Store, Phone, MapPin, DollarSign, AlertCircle, FileText, Lock, Eye, EyeOff, CheckCircle2, ChevronDown, Globe, BarChart, ShieldCheck, Pencil, ImagePlus, X, Loader2, Target, Car, Plus, Settings, RefreshCw, Landmark,
} from "lucide-react";

const HigoMapPicker = dynamic(() => import("@/app/components/ui/HigoMapPicker"), { ssr: false });

interface ShopForm {
  shop_name: string;
  phone: string;
  /** RRA TIN, 9 digits: printed on proformas. */
  tin: string;
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

const SHOP_DEFAULTS: ShopForm = { shop_name: "", phone: "", tin: "", address: "", description: "" };
const OPS_DEFAULTS: OperationalForm = { currency: "RWF", language: "en", low_stock_threshold: 10, tax_rate: 0 };
const PW_DEFAULTS: PwForm = { current: "", next: "", confirm: "" };

function deepEq<T>(a: T, b: T) { return JSON.stringify(a) === JSON.stringify(b); }


type SectionStatus = "idle" | "saving" | "saved" | "error";

export default function SettingsPage() {
  const { t, setLang, layout } = useLanguage();
  const isCar = layout === "car";
  const { shop, loading: shopLoading, reload: reloadShop } = useShop();
  // Saved values are pushed here so every page picks them up without a reload.
  const { apply: applySettings } = useShopSettings();

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

  // Car companies: their own car types, on top of the built-in CAR_TYPES.
  const [carTypes, setCarTypes]     = useState<string[]>([]);
  const savedCarTypes               = useRef<string[]>([]);
  const [newCarType, setNewCarType] = useState("");
  const [carStatus, setCarStatus]   = useState<SectionStatus>("idle");
  const [carErr, setCarErr]         = useState("");

  // Where customers pay: printed on every proforma. Required for car
  // companies; only the owner may change it (settings-service enforces it).
  const { user } = useAuth();
  const canEditBank = user?.role === "owner" || user?.role === "admin";
  // Every bank account the company takes payments on; one is the default
  // a new proforma starts with. Proformas pick from these, never edit them.
  const [banks, setBanks]           = useState<BankAccount[]>([]);
  const savedBanks                  = useRef<BankAccount[]>([]);
  const [bankStatus, setBankStatus] = useState<SectionStatus>("idle");
  const [bankErr, setBankErr]       = useState("");
  const [bankTried, setBankTried]   = useState(false);

  const [logoUrl, setLogoUrl]       = useState("");
  const savedLogoUrl                = useRef("");
  const rawDescRef                  = useRef<string>("");
  const [logoLoading, setLogoLoading] = useState(false);
  const logoDirty = logoUrl !== savedLogoUrl.current;

  // Map pin
  const [pinLat, setPinLat]       = useState<number | null>(null);
  const [pinLng, setPinLng]       = useState<number | null>(null);
  const [showMap, setShowMap]     = useState(false);

  // Address live-search
  type NomResult = { display_name: string; lat: string; lon: string };
  const [addrResults,  setAddrResults]  = useState<NomResult[]>([]);
  const [addrSearching,setAddrSearching]= useState(false);
  const [addrDropOpen, setAddrDropOpen] = useState(false);
  const addrDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addrAbort    = useRef<AbortController | null>(null);

  async function searchAddress(q: string) {
    addrAbort.current?.abort();
    if (q.length < 2) { setAddrResults([]); setAddrDropOpen(false); return; }
    const ctrl = new AbortController(); addrAbort.current = ctrl;
    setAddrSearching(true);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=rw&format=json&limit=6&addressdetails=1`,
        { headers: { "Accept-Language": "en", "User-Agent": "Higoverse/1.0" }, signal: ctrl.signal }
      );
      const d: NomResult[] = await r.json();
      setAddrResults(d ?? []);
      setAddrDropOpen((d ?? []).length > 0);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") setAddrResults([]);
    } finally { setAddrSearching(false); }
  }

  function onAddrInput(val: string) {
    setShopForm(f => ({ ...f, address: val }));
    if (addrDebounce.current) clearTimeout(addrDebounce.current);
    addrDebounce.current = setTimeout(() => searchAddress(val), 350);
  }

  function selectAddr(r: NomResult) {
    setShopForm(f => ({ ...f, address: r.display_name }));
    setPinLat(parseFloat(r.lat));
    setPinLng(parseFloat(r.lon));
    setAddrResults([]); setAddrDropOpen(false);
  }

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
  const carDirty  = isCar && !deepEq(carTypes, savedCarTypes.current);
  const bankDirty = canEditBank && !deepEq(banks, savedBanks.current);

  const anyDirty = shopDirty || opsDirty || logoDirty || carDirty || bankDirty;

  // Wait for shop context to be ready before loading settings (avoids redundant getMyShop call)
  useEffect(() => {
    if (!shopLoading) load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopLoading]);

  async function load() {
    try {
      setLoading(true);
      const settRes = await settingsRequest("/settings/");
      const s = settRes?.data ?? null;

      const rawDesc = shop?.description || "";
      rawDescRef.current = rawDesc;
      const newShop: ShopForm = {
        shop_name:   shop?.name        || s?.shop_name || "",
        phone:       prettyPhone(shop?.phone || s?.phone || ""),
        tin:         shopTin(shop),
        // What people read: an older "TIN:…|Province:…" address shows as text.
        address:     splitAddress(shop?.address || s?.address || "").text,
        description: decodeShopHumanInfo(rawDesc).desc || "",
      };
      const newOps: OperationalForm = {
        currency:            s?.currency            ?? "RWF",
        language:            s?.language            ?? "en",
        low_stock_threshold: s?.low_stock_threshold ?? 10,
        tax_rate:            s?.tax_rate            ?? 0,
      };

      const logo = shop?.logo_url || "";
      // Restore any previously saved GPS pin (the text above already has it stripped)
      const parsed = parseShopAddress(shop?.address || s?.address || "");
      if (parsed.lat != null) setPinLat(parsed.lat);
      if (parsed.lng != null) setPinLng(parsed.lng);
      setShopForm(newShop);
      setOpsForm(newOps);
      const loadedBanks: BankAccount[] = Array.isArray(s?.bank_accounts) ? s.bank_accounts : [];
      setBanks(loadedBanks);
      savedBanks.current = loadedBanks;
      const types: string[] = Array.isArray(s?.car_types) ? s.car_types : [];
      setCarTypes(types);
      savedCarTypes.current = types;
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

  // Errors show after the first Save, then follow the typing.
  const [shopTried, setShopTried] = useState(false);
  const shopErrs = {
    phone: (() => { const k = phoneError(shopForm.phone); return k ? t(k) : null; })(),
    tin: (() => { const k = tinError(shopForm.tin); return k ? t(k) : null; })(),
  };
  const shopBad = (k: keyof typeof shopErrs) => (shopTried ? shopErrs[k] : null);

  async function saveShop() {
    setShopTried(true);
    if (!shopForm.shop_name.trim()) { setShopErr(t("admin.err_shop_name_required")); return; }
    if (shopErrs.phone || shopErrs.tin) { setShopErr(t("company.fix_errors")); return; }
    if (!shopForm.address) { setShopErr(t("settings.err_address_required")); return; }
    const phone = normalizePhone(shopForm.phone) ?? shopForm.phone.trim();
    setShopStatus("saving"); setShopErr("");
    // Encode GPS coords into address string if a pin was set
    const finalAddress = pinLat != null && pinLng != null
      ? `${shopForm.address}|Lat:${pinLat.toFixed(6)}|Lng:${pinLng.toFixed(6)}`
      : shopForm.address;
    // Merge updated description text back into the existing JSON structure
    let encodedDesc: string;
    try {
      const existing = rawDescRef.current ? JSON.parse(rawDescRef.current) as Record<string, unknown> : {};
      existing._d = shopForm.description;
      encodedDesc = JSON.stringify(existing);
    } catch {
      encodedDesc = shopForm.description;
    }
    rawDescRef.current = encodedDesc;

    try {
      await updateMyShop({
        name:        shopForm.shop_name.trim(),
        phone,
        tin:         cleanTin(shopForm.tin),
        address:     finalAddress,
        description: encodedDesc,
        logo_url:    logoUrl || undefined,
      });
      // Also sync to settings-service
      await settingsRequest("/settings/", {
        method: "PUT",
        body: JSON.stringify({
          shop_name: shopForm.shop_name.trim(),
          phone,
          address:   finalAddress,
        }),
      }).catch(() => {}); // best-effort
      savedShop.current    = { ...shopForm };
      savedLogoUrl.current = logoUrl;
      reloadShop();
      setShopStatus("saved");
      setLastSaved(new Date());
      statusTimer(setShopStatus);
    } catch (err) {
      setShopErr(err instanceof Error ? err.message : t("settings.err_save_shop_failed"));
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
    const threshold = Number(opsForm.low_stock_threshold);
    const tax = Number(opsForm.tax_rate);
    if (!Number.isInteger(threshold) || threshold < 0) { setOpsErr(t("settings.err_threshold")); setOpsStatus("error"); return; }
    if (!Number.isFinite(tax) || tax < 0 || tax > 100) { setOpsErr(t("settings.err_tax_rate")); setOpsStatus("error"); return; }
    setOpsStatus("saving"); setOpsErr("");
    try {
      const res = await settingsRequest("/settings/", {
        method: "PUT",
        body: JSON.stringify({
          currency:            opsForm.currency,
          language:            opsForm.language,
          low_stock_threshold: opsForm.low_stock_threshold,
          tax_rate:            opsForm.tax_rate,
        }),
      });
      // settingsRequest returns null instead of throwing on 401/network errors.
      if (!res?.success) throw new Error(t("settings.err_save_settings_failed"));
      savedOps.current = { ...opsForm };
      applySettings({ currency: opsForm.currency, lowStock: threshold, taxRate: tax });
      setOpsStatus("saved");
      setLastSaved(new Date());
      if (opsForm.language) setLang(opsForm.language as Lang);
      statusTimer(setOpsStatus);
    } catch (err) {
      setOpsErr(err instanceof Error ? err.message : t("settings.err_save_settings_failed"));
      setOpsStatus("error");
    }
  }

  function addCarType() {
    const name = newCarType.trim();
    if (!name) return;
    const taken = [...CAR_TYPES.map((c) => carTypeLabel(t, c)), ...carTypes].some((c) => c.toLowerCase() === name.toLowerCase());
    if (taken) { setCarErr(t("settings.car_type_exists")); return; }
    setCarTypes([...carTypes, name]);
    setNewCarType(""); setCarErr("");
  }

  async function saveCarTypes() {
    setCarStatus("saving"); setCarErr("");
    try {
      const res = await settingsRequest("/settings/", {
        method: "PUT",
        body: JSON.stringify({ car_types: carTypes }),
      });
      if (!res?.success) throw new Error(t("settings.err_save_settings_failed"));
      const saved: string[] = Array.isArray(res?.data?.car_types) ? res.data.car_types : carTypes;
      applySettings({ carTypes: saved });
      setCarTypes(saved);
      savedCarTypes.current = saved;
      setCarStatus("saved");
      setLastSaved(new Date());
      statusTimer(setCarStatus);
    } catch (err) {
      setCarErr(err instanceof Error ? err.message : t("settings.err_save_settings_failed"));
      setCarStatus("error");
    }
  }

  const bankErrs = banks.map((b) => bankErrors(b, true));
  const bankBad = (i: number, k: keyof BankAccount) => {
    const key = bankTried ? bankErrs[i]?.[k as "bank_name" | "bank_account" | "bank_holder"] : undefined;
    return key ? t(key) : null;
  };
  const setBankRow = (i: number, patch: Partial<BankAccount>) =>
    setBanks((list) => list.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const addBank = () =>
    setBanks((list) => [...list, { bank_name: "", bank_account: "", bank_holder: list[0]?.bank_holder ?? "", is_default: list.length === 0 }]);
  const removeBank = (i: number) =>
    setBanks((list) => {
      const next = list.filter((_, j) => j !== i);
      if (next.length && !next.some((b) => b.is_default)) next[0] = { ...next[0], is_default: true };
      return next;
    });
  const makeDefault = (i: number) => setBanks((list) => list.map((b, j) => ({ ...b, is_default: j === i })));

  async function saveBank() {
    setBankTried(true);
    if (isCar && banks.length === 0) { setBankErr(t("bank.need_one")); setBankStatus("error"); return; }
    if (bankErrs.some((e) => Object.keys(e).length)) { setBankErr(t("company.fix_errors")); setBankStatus("error"); return; }
    setBankStatus("saving"); setBankErr("");
    try {
      const res = await settingsRequest("/settings/", {
        method: "PUT",
        body: JSON.stringify({
          bank_accounts: banks.map((b) => ({
            ...(b.id ? { id: b.id } : {}),
            bank_name: b.bank_name.trim(), bank_account: b.bank_account.trim(), bank_holder: b.bank_holder.trim(),
            is_default: !!b.is_default,
          })),
        }),
      });
      if (!res?.success) throw new Error(t("settings.err_save_settings_failed"));
      const saved: BankAccount[] = Array.isArray(res.data.bank_accounts) ? res.data.bank_accounts : [];
      setBanks(saved);
      savedBanks.current = saved;
      setBankTried(false);
      setBankStatus("saved");
      setLastSaved(new Date());
      statusTimer(setBankStatus);
    } catch (err) {
      // "Settings API error: 403 {"detail": "…"}" → the server's sentence.
      const m = /error: \d+ ([\s\S]*)$/.exec(err instanceof Error ? err.message : "");
      let msg = err instanceof Error ? err.message : t("settings.err_save_settings_failed");
      try {
        const d = m && JSON.parse(m[1])?.detail;
        if (typeof d === "string") msg = d;
        else if (Array.isArray(d)) msg = d.map((x) => String(x?.msg ?? "").replace(/^Value error, /, "")).join("; ");
      } catch { /* keep msg */ }
      setBankErr(msg);
      setBankStatus("error");
    }
  }

  async function saveAll() {
    const ps: Promise<void>[] = [];
    if (shopDirty) ps.push(saveShop());
    if (opsDirty)  ps.push(saveOps());
    if (carDirty)  ps.push(saveCarTypes());
    if (bankDirty) ps.push(saveBank());
    await Promise.allSettled(ps);
  }

  async function savePassword() {
    setPwErr(""); setPwStatus("saving");
    if (!pwForm.current) { setPwErr(t("settings.err_current_password_required")); setPwStatus("error"); return; }
    if (pwForm.next.length < 6) { setPwErr(t("settings.err_password_too_short")); setPwStatus("error"); return; }
    if (pwForm.next !== pwForm.confirm) { setPwErr(t("settings.err_passwords_mismatch")); setPwStatus("error"); return; }
    try {
      await changePassword(pwForm.current, pwForm.next);
      setPwForm(PW_DEFAULTS);
      setPwStatus("saved");
      setPwOpen(false);
      statusTimer(setPwStatus);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("settings.err_change_password_failed");
      setPwErr(msg.includes("400") || msg.toLowerCase().includes("incorrect")
        ? t("settings.err_current_password_incorrect")
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
                <img src={logoUrl} alt={t("settings.shop_logo")} className="w-10 h-10 rounded-xl object-cover border-2 border-white/20" />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Settings size={19} />
                </div>
              )}
              <div>
                <h1 className="text-base font-semibold">{t("settings.title")}</h1>
                <p className="text-slate-400 text-xs mt-0.5">
                  {lastSaved
                    ? `${t("settings.last_saved")} ${lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : t("settings.configure_subtitle")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {anyDirty && (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 rounded-full">
                  <Pencil size={10} /> {t("settings.unsaved_changes")}
                </span>
              )}
              <button onClick={load} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition">
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* ── SHOP PROFILE ─── */}
        <Section
          icon={<Store size={15} />}
          title={t("settings.shop_info")}
          dirty={shopDirty || logoDirty}
          status={shopStatus}
          onSave={saveShop}
          saveLabel={t("settings.save_profile")}
        >
          {shopErr && <ErrorBanner msg={shopErr} />}

          <div className="space-y-4">
            {/* Logo */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">
                {t("settings.shop_logo")} <span className="text-slate-400">({t("common.optional")})</span>
              </label>
              <div className="flex items-center gap-4">
                {logoUrl ? (
                  <div className="relative w-16 h-16 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoUrl} alt={t("settings.shop_logo")} className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
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
                    <ImagePlus size={14} /> {logoUrl ? t("settings.change_logo") : t("settings.upload_logo")}
                  </div>
                  <input
                    type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); }}
                  />
                </label>
              </div>
              {logoDirty && !logoLoading && (
                <p className="text-[11px] text-amber-600 mt-1.5">{t("settings.logo_unsaved_hint")}</p>
              )}
            </div>

            <Field label={t("settings.shop_name")} required>
              <input
                className={inputCls}
                placeholder={t("settings.shop_name_placeholder")}
                value={shopForm.shop_name}
                onChange={(e) => setShopForm({ ...shopForm, shop_name: e.target.value })}
              />
            </Field>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label={<><Phone size={11} className="inline mr-1" />{t("common.phone")}</>} required>
                  <input
                    className={`${inputCls} ${shopBad("phone") ? "!border-red-400" : ""}`}
                    placeholder="0788 123 456"
                    inputMode="tel" autoComplete="tel"
                    aria-invalid={!!shopBad("phone")}
                    value={shopForm.phone}
                    onChange={(e) => setShopForm({ ...shopForm, phone: e.target.value })}
                    onBlur={() => { const n = normalizePhone(shopForm.phone); if (n) setShopForm((f) => ({ ...f, phone: prettyPhone(n) })); }}
                  />
                  {shopBad("phone") && <p className="text-[11px] text-red-600 mt-1">{shopBad("phone")}</p>}
                </Field>
                <Field label={t("company.tin")} required>
                  <input
                    className={`${inputCls} tabular-nums tracking-wider ${shopBad("tin") ? "!border-red-400" : ""}`}
                    placeholder="123456789"
                    inputMode="numeric"
                    aria-invalid={!!shopBad("tin")}
                    value={shopForm.tin}
                    onChange={(e) => setShopForm({ ...shopForm, tin: e.target.value.replace(/[^\d ]/g, "").slice(0, 11) })}
                  />
                  {shopBad("tin") ? <p className="text-[11px] text-red-600 mt-1">{shopBad("tin")}</p>
                    : <p className="text-[11px] text-gray-400 mt-1">{t("company.tin_hint")}</p>}
                </Field>
              </div>
              <Field label={<><MapPin size={11} className="inline mr-1" />{t("common.address")} <span className="text-red-400">*</span></>}>
                {/* Live address search — replaces old district dropdown */}
                <div className="relative">
                  <div className="relative">
                    <MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      value={shopForm.address}
                      onChange={(e) => onAddrInput(e.target.value)}
                      onBlur={() => setTimeout(() => setAddrDropOpen(false), 150)}
                      onFocus={() => addrResults.length > 0 && setAddrDropOpen(true)}
                      placeholder={t("settings.address_search_placeholder")}
                      autoComplete="off"
                      className={`${inputCls} pl-8 pr-8 ${!shopForm.address ? "border-red-300 focus:border-red-400 focus:ring-red-500/20" : ""}`}
                    />
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      {addrSearching
                        ? <Loader2 size={13} className="animate-spin text-[#0a66c2]" />
                        : shopForm.address
                          ? <button type="button" onClick={() => { setShopForm(f=>({...f,address:""})); setAddrResults([]); setAddrDropOpen(false); }}
                              className="text-slate-300 hover:text-slate-500 transition"><X size={13} /></button>
                          : null
                      }
                    </div>
                  </div>

                  {/* Live results dropdown */}
                  {addrDropOpen && addrResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-xl shadow-2xl z-30 overflow-hidden">
                      {addrResults.map((r, i) => (
                        <button key={i} type="button" onMouseDown={() => selectAddr(r)}
                          className="w-full text-left px-3.5 py-2.5 hover:bg-blue-50 text-xs text-slate-700 border-b border-slate-50 last:border-0 transition flex items-start gap-2">
                          <MapPin size={11} className="text-[#0a66c2] mt-0.5 shrink-0" />
                          <span className="line-clamp-2">{r.display_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pin on map — works together with search above */}
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowMap(true)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition"
                    style={pinLat != null
                      ? { background: "#e8f1fd", borderColor: "#0a66c2", color: "#0a66c2" }
                      : { background: "#f8fafc", borderColor: "#e2e8f0", color: "#475569" }
                    }
                  >
                    <Target size={13} />
                    {pinLat != null ? t("settings.update_pin") : t("settings.pin_location")}
                  </button>
                  {pinLat != null && (
                    <span className="text-[11px] font-mono text-slate-400">
                      {pinLat.toFixed(5)}, {pinLng?.toFixed(5)}
                    </span>
                  )}
                </div>
                {pinLat != null && (
                  <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                    <MapPin size={10} /> {t("settings.gps_pinned_hint")}
                  </p>
                )}
                {!shopForm.address && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={11} /> {t("settings.address_required")}
                  </p>
                )}
              </Field>
            </div>

            <Field label={<><FileText size={11} className="inline mr-1" />{t("settings.about_shop")}</>}>
              <textarea
                rows={3}
                className={inputCls + " resize-none"}
                placeholder={t("settings.about_shop_placeholder")}
                value={shopForm.description}
                onChange={(e) => setShopForm({ ...shopForm, description: e.target.value })}
              />
            </Field>
          </div>
        </Section>

        {/* ── FINANCIAL / OPERATIONAL ─── */}
        <Section
          icon={<DollarSign size={15} />}
          title={t("settings.financial")}
          dirty={opsDirty}
          status={opsStatus}
          onSave={saveOps}
          saveLabel={t("settings.save")}
        >
          {opsErr && <ErrorBanner msg={opsErr} />}

          <div className="grid md:grid-cols-3 gap-4">
            <Field label={<><DollarSign size={11} className="inline mr-1" />{t("settings.currency")}</>}>
              <select
                className={inputCls}
                value={opsForm.currency}
                onChange={(e) => setOpsForm({ ...opsForm, currency: e.target.value })}
              >
                <option value="RWF">RWF ({t("settings.currency_rwf")})</option>
                <option value="USD">USD ({t("settings.currency_usd")})</option>
                <option value="EUR">EUR ({t("settings.currency_eur")})</option>
                <option value="KES">KES ({t("settings.currency_kes")})</option>
                <option value="UGX">UGX ({t("settings.currency_ugx")})</option>
                <option value="TZS">TZS ({t("settings.currency_tzs")})</option>
                <option value="BIF">BIF ({t("settings.currency_bif")})</option>
                <option value="CDF">CDF ({t("settings.currency_cdf")})</option>
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
              <p className="text-[11px] text-slate-400 mt-1">{t("settings.low_threshold_hint")}</p>
            </Field>

            <Field label={t("settings.tax_rate")}>
              <input
                type="number" min="0" max="100" step="0.1"
                className={inputCls}
                placeholder="0"
                value={opsForm.tax_rate}
                onChange={(e) => setOpsForm({ ...opsForm, tax_rate: Number(e.target.value) })}
              />
              <p className="text-[11px] text-slate-400 mt-1">{t("settings.tax_rate_hint")}</p>
            </Field>
          </div>
        </Section>

        {/* ── BANK ACCOUNT (printed on proformas) ─── */}
        <Section
          icon={<Landmark size={15} />}
          title={t("bank.section")}
          dirty={bankDirty}
          status={bankStatus}
          onSave={saveBank}
          saveLabel={t("settings.save")}
        >
          {bankErr && <ErrorBanner msg={bankErr} />}
          <p className="text-xs text-slate-500 mb-3">{t(isCar ? "bank.hint_required" : "bank.hint")}</p>
          {!canEditBank && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">{t("bank.owner_only")}</p>}
          <datalist id="hgv-banks">{RWANDA_BANKS.map((b) => <option key={b} value={b} />)}</datalist>
          <fieldset disabled={!canEditBank} className="space-y-3">
            {banks.length === 0 && (
              <p className="text-sm text-slate-500 border border-dashed border-slate-300 rounded-lg px-4 py-6 text-center">{t("bank.none_yet")}</p>
            )}
            {banks.map((b, i) => (
              <div key={b.id ?? `new-${i}`} className={`rounded-xl border p-3 ${b.is_default ? "border-[#0a66c2]/40 bg-[#EBF2FD]/40" : "border-slate-200"}`}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                    <input type="radio" name="default-bank" checked={!!b.is_default} onChange={() => makeDefault(i)} />
                    {b.is_default ? t("bank.default") : t("bank.make_default")}
                  </label>
                  <button type="button" onClick={() => removeBank(i)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-600">
                    <X size={12} /> {t("common.delete")}
                  </button>
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  <Field label={t("bank.bank_name")} required>
                    <input className={`${inputCls} ${bankBad(i, "bank_name") ? "!border-red-400" : ""}`} list="hgv-banks" placeholder="Equity Bank" aria-invalid={!!bankBad(i, "bank_name")}
                      value={b.bank_name} onChange={(e) => setBankRow(i, { bank_name: e.target.value })} />
                    {bankBad(i, "bank_name") && <p className="text-[11px] text-red-600 mt-1">{bankBad(i, "bank_name")}</p>}
                  </Field>
                  <Field label={t("bank.account_no")} required>
                    <input className={`${inputCls} ${bankBad(i, "bank_account") ? "!border-red-400" : ""} tabular-nums tracking-wide`} inputMode="numeric" placeholder="4002201237868" aria-invalid={!!bankBad(i, "bank_account")}
                      value={b.bank_account} onChange={(e) => setBankRow(i, { bank_account: e.target.value.replace(/[^\d -]/g, "").slice(0, 40) })} />
                    {bankBad(i, "bank_account") && <p className="text-[11px] text-red-600 mt-1">{bankBad(i, "bank_account")}</p>}
                  </Field>
                  <Field label={t("bank.holder")} required>
                    <input className={`${inputCls} ${bankBad(i, "bank_holder") ? "!border-red-400" : ""}`} placeholder={t("bank.holder_ph")} aria-invalid={!!bankBad(i, "bank_holder")}
                      value={b.bank_holder} onChange={(e) => setBankRow(i, { bank_holder: e.target.value })} />
                    {bankBad(i, "bank_holder") && <p className="text-[11px] text-red-600 mt-1">{bankBad(i, "bank_holder")}</p>}
                  </Field>
                </div>
              </div>
            ))}
            {banks.length < 10 && (
              <button type="button" onClick={addBank}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                <Plus size={13} /> {t("bank.add")}
              </button>
            )}
            <p className="text-[11px] text-slate-400">{t("bank.holder_hint")}</p>
          </fieldset>
        </Section>

        {/* ── CAR TYPES (car companies) ─── */}
        {isCar && (
          <Section
            icon={<Car size={15} />}
            title={t("settings.car_types")}
            dirty={carDirty}
            status={carStatus}
            onSave={saveCarTypes}
            saveLabel={t("settings.save")}
          >
            {carErr && <ErrorBanner msg={carErr} />}
            <p className="text-xs text-slate-500 mb-3">{t("settings.car_types_hint")}</p>

            <div className="flex flex-wrap gap-1.5 mb-3">
              {CAR_TYPES.map((c) => (
                <span key={c} className="px-2.5 py-1 rounded-full text-xs bg-slate-100 text-slate-500 border border-slate-200">
                  {carTypeLabel(t, c)}
                </span>
              ))}
              {carTypes.map((c) => (
                <span key={c} className="flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium bg-[#EBF2FD] text-[#0a66c2] border border-[#0a66c2]/30">
                  {c}
                  <button
                    type="button"
                    onClick={() => setCarTypes(carTypes.filter((x) => x !== c))}
                    title={t("common.delete")}
                    aria-label={`${t("common.delete")} ${c}`}
                    className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-[#0a66c2]/15 transition"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2 max-w-md">
              <input
                className={inputCls}
                maxLength={50}
                placeholder={t("settings.car_type_placeholder")}
                value={newCarType}
                onChange={(e) => { setNewCarType(e.target.value); setCarErr(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCarType(); } }}
              />
              <button
                type="button"
                onClick={addCarType}
                disabled={!newCarType.trim()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 shrink-0"
              >
                <Plus size={13} /> {t("settings.car_type_add")}
              </button>
            </div>
          </Section>
        )}

        {/* ── LANGUAGE ─────────────────────────── */}
        <Section
          icon={<Globe size={15} />}
          title={t("settings.language_section")}
          dirty={opsDirty}
          status={opsStatus}
          onSave={saveOps}
          saveLabel={t("settings.save")}
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
                <option value="zh">🇨🇳 中文</option>
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
                <p className="text-sm font-semibold text-slate-700">{t("settings.security_title")}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{t("settings.security_subtitle")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {pwStatus === "saved" && (
                <span className="flex items-center gap-1 text-[11px] text-green-600 font-medium">
                  <CheckCircle2 size={12} /> {t("settings.changed")}
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
                    <CheckCircle2 size={14} /> {t("settings.password_changed")}
                  </div>
                )}

                <Field label={t("settings.current_password")} required>
                  <div className="relative">
                    <input
                      type={showCurrent ? "text" : "password"}
                      className={inputCls + " pr-10"}
                      placeholder={t("settings.current_password_placeholder")}
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
                  <Field label={t("settings.new_password")} required>
                    <div className="relative">
                      <input
                        type={showNext ? "text" : "password"}
                        className={inputCls + " pr-10"}
                        placeholder={t("settings.min_chars_placeholder")}
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

                  <Field label={t("settings.confirm_password")} required>
                    <div className="relative">
                      <input
                        type={showConfirm ? "text" : "password"}
                        className={inputCls + " pr-10" + (pwForm.confirm && pwForm.next !== pwForm.confirm ? " border-red-300 focus:border-red-400" : "")}
                        placeholder={t("settings.repeat_password_placeholder")}
                        value={pwForm.confirm}
                        onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                      />
                      <button type="button" onClick={() => setShowConfirm((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {pwForm.confirm && pwForm.next !== pwForm.confirm && (
                      <p className="text-[11px] text-red-500 mt-1">{t("settings.passwords_mismatch")}</p>
                    )}
                    {pwForm.confirm && pwForm.next === pwForm.confirm && pwForm.next.length >= 6 && (
                      <p className="text-[11px] text-green-600 mt-1 flex items-center gap-1"><CheckCircle2 size={11} /> {t("settings.match")}</p>
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
                    {pwStatus === "saving" ? t("settings.changing") : t("settings.change_password")}
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
              <Pencil size={14} className="text-slate-500" />
              <span>
                {[shopDirty && t("settings.shop_profile_label"), opsDirty && t("settings.operational_settings_label"), carDirty && t("settings.car_types")]
                  .filter(Boolean).join(" & ")} {t("settings.unsaved_suffix")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShopForm({ ...savedShop.current });
                  setOpsForm({ ...savedOps.current });
                  setCarTypes(savedCarTypes.current);
                  setLogoUrl(savedLogoUrl.current);
                }}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition"
              >
                {t("common.discard")}
              </button>
              <button
                onClick={saveAll}
                disabled={shopStatus === "saving" || opsStatus === "saving" || carStatus === "saving"}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 transition disabled:opacity-60"
              >
                <Save size={14} />
                {(shopStatus === "saving" || opsStatus === "saving") ? t("common.saving") : t("settings.save_all_changes")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Higoverse Map Picker modal */}
      {showMap && (
        <HigoMapPicker
          initialLat={pinLat}
          initialLng={pinLng}
          onConfirm={(pos, lbl) => {
            setPinLat(pos.lat);
            setPinLng(pos.lng);
            // Sync address text with the reverse-geocoded label from the map
            if (lbl) setShopForm(f => ({ ...f, address: lbl }));
            setShowMap(false);
          }}
          onClose={() => setShowMap(false)}
        />
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
  const { t } = useLanguage();
  return (
    <div className={`bg-white rounded-xl border transition-all ${dirty ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"}`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
            {icon}
          </div>
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          {dirty && (
            <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              {t("settings.modified")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status === "saved" && (
            <span className="flex items-center gap-1 text-[11px] text-green-600 font-medium">
              <CheckCircle2 size={12} /> {t("settings.saved_status")}
            </span>
          )}
          {status === "error" && (
            <span className="flex items-center gap-1 text-[11px] text-red-500 font-medium">
              <AlertCircle size={12} /> {t("settings.failed_status")}
            </span>
          )}
          {dirty && (
            <button
              onClick={onSave}
              disabled={status === "saving"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700 transition disabled:opacity-60"
            >
              <Save size={12} />
              {status === "saving" ? t("common.saving") : saveLabel}
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
  const { t } = useLanguage();
  const hasLower  = /[a-z]/.test(pw);
  const hasUpper  = /[A-Z]/.test(pw);
  const hasNumber = /\d/.test(pw);
  const hasSymbol = /[^a-zA-Z0-9]/.test(pw);
  const longEnough = pw.length >= 8;

  const score = [hasLower, hasUpper, hasNumber, hasSymbol, longEnough].filter(Boolean).length;
  const label = score <= 2 ? t("settings.pw_weak") : score === 3 ? t("settings.pw_fair") : score === 4 ? t("settings.pw_good") : t("settings.pw_strong");
  const color = score <= 2 ? "bg-red-500" : "bg-[#0a66c2]";
  const textColor = score <= 2 ? "text-red-600" : "text-slate-700";

  return (
    <div className="mt-1.5">
      <div className="flex gap-0.5 mb-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= score ? color : "bg-slate-200"}`} />
        ))}
      </div>
      <p className={`text-[11px] font-medium ${textColor}`}>{label} {t("settings.password_label")}</p>
    </div>
  );
}
