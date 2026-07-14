"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useShop } from "@/lib/shop-context";
import { listShops, updateMyShop, createShopApplication } from "@/lib/shop-api";
import {
  encodeShopAddress, encodeShopDescription, decodeShopHumanInfo,
  parseShopAddress, getApplicationStatus, compressImage,
} from "@/lib/product-meta";
import { createSelfNotification } from "@/lib/notifications-api";
import {
  Store, Building2, FileText, Mail, ChevronDown, ImagePlus,
  CheckCircle2, Loader2, X, Clock, AlertCircle,
} from "lucide-react";

const BRAND = "#ff6a00";

const inputStyle = "w-full rounded-lg border border-slate-200 px-3 py-2.5 pl-9 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400";
const label = "mb-1.5 block text-xs font-semibold text-slate-700";

export default function ApplyShopPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { shop, loading: shopLoading } = useShop();

  const [form, setForm] = useState({
    shop_name: "", tin: "", business_type: "", owner_name: "", phone: "", email: "",
    province: "", district: "", sector: "", address: "", description: "", logo_url: "", banner_url: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const appStatus = getApplicationStatus(shop?.description, shop?.address, shop?.is_active === true);
  const rejectionInfo = decodeShopHumanInfo(shop?.description);

  // Pre-fill from any existing shop record (supports rejection re-edit)
  useEffect(() => {
    if (!shop) return;
    const descInfo = decodeShopHumanInfo(shop.description);
    const addrInfo = parseShopAddress(shop.address);
    setForm((f) => ({
      ...f,
      shop_name:     f.shop_name     || shop.name          || "",
      phone:         f.phone         || shop.phone         || "",
      logo_url:      f.logo_url      || shop.logo_url      || "",
      business_type: f.business_type || descInfo.type      || "",
      description:   f.description   || descInfo.desc      || "",
      owner_name:    f.owner_name    || descInfo.ownerName  || "",
      email:         f.email         || descInfo.email      || "",
      banner_url:    f.banner_url    || descInfo.bannerUrl  || "",
      tin:           f.tin           || addrInfo.tin        || "",
      province:      f.province      || addrInfo.province   || "",
      district:      f.district      || addrInfo.district   || "",
      sector:        f.sector        || addrInfo.sector     || "",
      address:       f.address       || addrInfo.addr       || "",
    }));
  }, [shop?.id]);

  async function submit() {
    setError("");
    if (!form.shop_name.trim())  { setError("Shop name is required."); return; }
    if (!form.tin.trim())        { setError("TIN / Tax ID is required. Admin will verify it."); return; }
    if (!form.business_type)     { setError("Select a business type."); return; }
    if (!form.district)          { setError("Select your district."); return; }
    if (!form.phone.trim())      { setError("Phone number is required."); return; }

    const normalName  = form.shop_name.trim().toLowerCase();
    const normalPhone = form.phone.replace(/\s/g, "");
    const { items: allShops } = await listShops({ limit: 200 });
    if (allShops.some((s) => s.id !== shop?.id && (s.name ?? "").trim().toLowerCase() === normalName)) {
      setError("A shop with this name already exists. Please choose a unique shop name.");
      return;
    }
    if (allShops.some((s) => s.id !== shop?.id && (s.phone ?? "").replace(/\s/g, "") === normalPhone)) {
      setError("This phone number is already registered to another shop. Please use a different number.");
      return;
    }

    setSubmitting(true);
    try {
      const address = encodeShopAddress({
        tin: form.tin.trim(), province: form.province, district: form.district,
        sector: form.sector, addr: form.address.trim(),
      });
      const description = encodeShopDescription({
        type: form.business_type, desc: form.description.trim(),
        ownerName: form.owner_name.trim(), email: form.email.trim(),
        bannerUrl: form.banner_url || undefined,
      });
      const payload = {
        name: form.shop_name.trim(), phone: form.phone.trim(), address, description,
        logo_url: form.logo_url || undefined,
      };

      if (!shop) await createShopApplication(payload);
      else await updateMyShop(payload);

      setSubmitted(true);
      createSelfNotification(
        "Application submitted — pending admin review",
        "Higoverse admin will review your shop details and notify you once approved. This usually takes 1–2 business days.",
      ).catch(() => {});
    } catch {
      setError("Failed to submit application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (shopLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={28} className="animate-spin text-slate-300" />
      </div>
    );
  }

  if (shop?.is_active === true) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <CheckCircle2 size={30} className="text-emerald-500" />
        <p className="text-lg font-bold text-slate-900">Your shop is already active</p>
        <p className="max-w-sm text-sm text-slate-500">You already have an approved shop on Higoverse.</p>
        <button
          onClick={() => router.push("/dashboard")}
          className="mt-2 rounded-lg px-5 py-2.5 text-sm font-bold text-white"
          style={{ background: BRAND }}
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <Clock size={30} className="text-orange-500" />
        <p className="text-lg font-bold text-slate-900">Application submitted</p>
        <p className="max-w-sm text-sm text-slate-500">
          The Higoverse admin is reviewing your shop application. You&apos;ll get full dashboard access once approved — this usually takes 1–2 business days.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32">
      <div className="mx-auto max-w-xl space-y-4 px-3 py-4 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: BRAND }}>
            <Store size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900">
              {user?.shop_id && appStatus === "REJECTED" ? "Edit & Resubmit Application" : "Create Your Shop"}
            </h1>
            <p className="text-xs text-slate-400">Fill in your shop details for Higoverse admin review</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
            <X size={13} /> {error}
          </div>
        )}

        {appStatus === "REJECTED" && rejectionInfo.rejectionReason && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5">
            <p className="mb-1 text-xs font-bold text-red-900">Previous rejection reason:</p>
            <p className="text-xs text-red-800">{rejectionInfo.rejectionReason}</p>
          </div>
        )}

        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>Your application will be reviewed by the Higoverse admin. Make sure your TIN is correct — we verify it with RRA.</span>
        </div>

        {/* Shop information */}
        <section className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Shop Information</p>

          <div>
            <label className={label}>Shop Name <span className="text-red-500">*</span></label>
            <div className="relative">
              <Store size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={form.shop_name}
                onChange={(e) => setForm((f) => ({ ...f, shop_name: e.target.value }))}
                placeholder="e.g. Kigali Electronics Shop"
                className={inputStyle}
              />
            </div>
          </div>

          <div>
            <label className={label}>Business Type <span className="text-red-500">*</span></label>
            <div className="relative">
              <Building2 size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={form.business_type}
                onChange={(e) => setForm((f) => ({ ...f, business_type: e.target.value }))}
                className={`${inputStyle} appearance-none pr-8 ${form.business_type ? "text-slate-900" : "text-slate-400"}`}
              >
                <option value="">Select business type</option>
                <option value="Retail Shop">Retail Shop</option>
                <option value="Wholesale / Distribution">Wholesale / Distribution</option>
                <option value="Restaurant / Food">Restaurant / Food</option>
                <option value="Electronics">Electronics</option>
                <option value="Fashion & Apparel">Fashion &amp; Apparel</option>
                <option value="Agriculture & Farming">Agriculture &amp; Farming</option>
                <option value="Health & Pharmacy">Health &amp; Pharmacy</option>
                <option value="Furniture & Home">Furniture &amp; Home</option>
                <option value="Vehicles">Vehicles</option>
                <option value="Gas & Accessories">Gas &amp; Accessories</option>
                <option value="Spare Parts">Spare Parts</option>
                <option value="Constructions">Constructions</option>
                <option value="Services">Services</option>
                <option value="Other">Other</option>
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          <div>
            <label className={label}>TIN / Tax Identification Number <span className="text-red-500">*</span></label>
            <div className="relative">
              <FileText size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={form.tin}
                onChange={(e) => setForm((f) => ({ ...f, tin: e.target.value.replace(/\D/g, "").slice(0, 15) }))}
                placeholder="e.g. 123456789"
                inputMode="numeric"
                className={`${inputStyle} font-mono tracking-wide ${form.tin ? "border-orange-300" : ""}`}
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-400">Your Rwanda Revenue Authority (RRA) tax number. Admin verifies this before approval.</p>
          </div>
        </section>

        {/* Owner information */}
        <section className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Owner Information</p>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={label}>Owner Name</label>
              <input
                value={form.owner_name}
                onChange={(e) => setForm((f) => ({ ...f, owner_name: e.target.value }))}
                placeholder="Full name"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className={label}>Phone Number <span className="text-red-500">*</span></label>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+250 7XX XXX XXX"
                type="tel"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
              />
            </div>
          </div>

          <div>
            <label className={label}>Business Email</label>
            <div className="relative">
              <Mail size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="shop@example.com"
                type="email"
                className={inputStyle}
              />
            </div>
          </div>
        </section>

        {/* Location */}
        <section className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Location</p>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={label}>Province</label>
              <div className="relative">
                <select
                  value={form.province}
                  onChange={(e) => setForm((f) => ({ ...f, province: e.target.value, district: "" }))}
                  className={`w-full appearance-none rounded-lg border border-slate-200 px-3 py-2.5 pr-8 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 ${form.province ? "text-slate-900" : "text-slate-400"}`}
                >
                  <option value="">Select province</option>
                  <option value="Kigali City">Kigali City</option>
                  <option value="Northern Province">Northern Province</option>
                  <option value="Southern Province">Southern Province</option>
                  <option value="Eastern Province">Eastern Province</option>
                  <option value="Western Province">Western Province</option>
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
            <div>
              <label className={label}>District <span className="text-red-500">*</span></label>
              <div className="relative">
                <select
                  value={form.district}
                  onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                  className={`w-full appearance-none rounded-lg border border-slate-200 px-3 py-2.5 pr-8 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 ${form.district ? "text-slate-900" : "text-slate-400"}`}
                >
                  <option value="">Select district</option>
                  {form.province === "Kigali City" && <>
                    <option>Gasabo</option><option>Kicukiro</option><option>Nyarugenge</option>
                  </>}
                  {form.province === "Northern Province" && <>
                    <option>Burera</option><option>Gakenke</option><option>Gicumbi</option><option>Musanze</option><option>Rulindo</option>
                  </>}
                  {form.province === "Southern Province" && <>
                    <option>Gisagara</option><option>Huye</option><option>Kamonyi</option><option>Muhanga</option><option>Nyamagabe</option><option>Nyanza</option><option>Nyaruguru</option><option>Ruhango</option>
                  </>}
                  {form.province === "Eastern Province" && <>
                    <option>Bugesera</option><option>Gatsibo</option><option>Kayonza</option><option>Kirehe</option><option>Ngoma</option><option>Nyagatare</option><option>Rwamagana</option>
                  </>}
                  {form.province === "Western Province" && <>
                    <option>Karongi</option><option>Ngororero</option><option>Nyabihu</option><option>Nyamasheke</option><option>Rubavu</option><option>Rusizi</option><option>Rutsiro</option>
                  </>}
                  {!form.province && ["Nyarugenge","Gasabo","Kicukiro","Bugesera","Gatsibo","Kayonza","Kirehe","Ngoma","Nyagatare","Rwamagana","Burera","Gakenke","Gicumbi","Musanze","Rulindo","Gisagara","Huye","Kamonyi","Muhanga","Nyamagabe","Nyanza","Ruhango","Karongi","Ngororero","Nyabihu","Nyamasheke","Rubavu","Rusizi","Rutsiro"].map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={label}>Sector</label>
              <input
                value={form.sector}
                onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
                placeholder="e.g. Kimironko"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className={label}>Street / Building</label>
              <input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="e.g. KG 123 St"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
              />
            </div>
          </div>
        </section>

        {/* Shop profile */}
        <section className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Shop Profile</p>

          <div>
            <label className={label}>About Your Shop</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Briefly describe your products, services, or what makes your shop unique..."
              rows={3}
              className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className={label}>Shop Logo</label>
              <div className="flex flex-col items-center gap-2">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="Logo" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50">
                    <ImagePlus size={22} className="text-slate-400" />
                  </div>
                )}
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700">
                  <ImagePlus size={12} /> {form.logo_url ? "Change" : "Upload"}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]; if (!file) return;
                      const c = await compressImage(file, 400);
                      setForm((f) => ({ ...f, logo_url: c })); e.target.value = "";
                    }} />
                </label>
                {form.logo_url && (
                  <button onClick={() => setForm((f) => ({ ...f, logo_url: "" }))} className="text-[11px] text-slate-400">
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className={label}>Shop Banner</label>
              <div className="flex flex-col items-center gap-2">
                {form.banner_url ? (
                  <img src={form.banner_url} alt="Banner" className="h-16 w-full rounded-lg border border-slate-200 object-cover" />
                ) : (
                  <div className="flex h-16 w-full items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50">
                    <ImagePlus size={22} className="text-slate-400" />
                  </div>
                )}
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700">
                  <ImagePlus size={12} /> {form.banner_url ? "Change" : "Upload"}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]; if (!file) return;
                      const c = await compressImage(file, 1200, 0.7);
                      setForm((f) => ({ ...f, banner_url: c })); e.target.value = "";
                    }} />
                </label>
                {form.banner_url && (
                  <button onClick={() => setForm((f) => ({ ...f, banner_url: "" }))} className="text-[11px] text-slate-400">
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <button
          onClick={submit}
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: BRAND }}
        >
          {submitting
            ? <><Loader2 size={15} className="animate-spin" /> Submitting...</>
            : <><CheckCircle2 size={15} /> {appStatus === "REJECTED" ? "Resubmit Application" : "Submit Application"}</>}
        </button>
        <p className="text-center text-[11px] text-slate-400">
          Higoverse admin will review your application and respond within 1–2 business days.
        </p>
      </div>
    </div>
  );
}
