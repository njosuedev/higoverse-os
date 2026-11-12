"use client";

// Car rentals (car companies, Sales → Rentals): who rents which car, when,
// for how much, and the deposit. Each one prints as the rental agreement in
// the language picked at print time (lib/rental-print.ts).

import AmountInput from "@/app/components/ui/AmountInput";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CarFront, Pencil, Plus, Printer, RefreshCw, RotateCcw, Search, Trash2, X, Ban } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { settingsRequest } from "@/lib/settings-api";
import { loadCustomers, type Customer } from "@/lib/supplier-api";
import { carTypeLabel, parseAttributes } from "@/lib/business-layout";
import { itemRequest } from "@/lib/product-api";
import ProductPicker, { type PickerProduct } from "@/app/components/ui/ProductPicker";
import CustomerPicker from "@/app/components/ui/CustomerPicker";
import { printHtml } from "@/lib/print-frame";
import { getPrintShop } from "@/lib/print-shop";
import { askConfirm, notify } from "@/lib/dialogs";
import { AGREEMENT_LANGS, rentalAgreementHtml, rentalDays, type AgreementLang } from "@/lib/rental-print";
import {
  cancelRental, deleteRental, listRentals, RENTAL_MANAGER_ROLES, returnRental, saveRental,
  type Rental, type RentalInput, type RentalStatus,
} from "@/lib/rental-api";

function apiDetail(err: unknown, fallback: string): string {
  const m = /error: \d+ ([\s\S]*)$/.exec(err instanceof Error ? err.message : "");
  try {
    const d = m && JSON.parse(m[1])?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg).replace(/^Value error, /, "");
  } catch { /* not JSON */ }
  return fallback;
}

const today = () => new Date().toISOString().slice(0, 10);
const money = (n: number) => Math.round(n || 0).toLocaleString();
const LANG_KEY = "hgv-rental-lang";

function carLabel(p: PickerProduct): string {
  const a = parseAttributes(p.attributes);
  return [p.name, a.plate_no || a.chassis_no].filter(Boolean).join(" - ");
}

const STATUS_STYLE: Record<RentalStatus, string> = {
  active: "bg-blue-50 text-blue-700 border-blue-200",
  returned: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
};

function emptyForm(currency: string): RentalInput {
  return {
    customer_id: null, customer: "", customer_phone: "", customer_id_no: "", customer_address: "",
    product_id: null, car_name: "", car_type: "", plate_no: "", chassis_no: "",
    start_date: today(), end_date: "", agreement_date: today(),
    rent_amount: 0, deposit: 0, currency, notes: "",
  };
}

/** `rentCarId`: open a new rental for this car straight away (the vehicle
 *  card's "Rent" button). */
export default function RentalPanel({ rentCarId }: { rentCarId?: string | null } = {}) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const canDelete = RENTAL_MANAGER_ROLES.has(user?.role ?? "");
  const [items, setItems] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RentalStatus | "all">("active");
  const [search, setSearch] = useState("");
  const [currency, setCurrency] = useState("RWF");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState<RentalInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState<Rental | null>(null);
  const [returning, setReturning] = useState<Rental | null>(null);

  const load = useCallback(async () => {
    try { setItems(await listRentals()); } catch (e) { notify(apiDetail(e, t("common.error"))); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => {
    void load();
    settingsRequest("/settings").then((s) => s?.data?.currency && setCurrency(s.data.currency)).catch(() => {});
    loadCustomers().then(setCustomers).catch(() => {});
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, active: 0, returned: 0, cancelled: 0 };
    items.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [items]);
  const today_ = today();
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((r) => (filter === "all" || r.status === filter) && (!q
      || [r.rental_no, r.customer, r.customer_phone, r.car_name, r.plate_no, r.chassis_no].some((x) => (x || "").toLowerCase().includes(q))));
  }, [items, filter, search]);

  function openNew() { setEditingId(null); setForm(emptyForm(currency)); }
  useEffect(() => {
    if (!rentCarId) return;
    let live = true;
    itemRequest(`/products/${encodeURIComponent(rentCarId)}`)
      .then((res) => {
        const p = res?.data as PickerProduct | undefined;
        if (!live || !p) return;
        const a = parseAttributes(p.attributes);
        setEditingId(null);
        setForm({ ...emptyForm(currency), product_id: p.id, car_name: p.name, car_type: a.car_type ? carTypeLabel(t, a.car_type) : "",
          plate_no: a.plate_no || "", chassis_no: a.chassis_no || "" });
      })
      .catch(() => {});
    return () => { live = false; };
  }, [rentCarId]); // eslint-disable-line react-hooks/exhaustive-deps
  function openEdit(r: Rental) {
    setEditingId(r.id);
    setForm({
      customer_id: r.customer_id ?? null, customer: r.customer, customer_phone: r.customer_phone, customer_id_no: r.customer_id_no,
      customer_address: r.customer_address, product_id: r.product_id ?? null, car_name: r.car_name, car_type: r.car_type,
      plate_no: r.plate_no, chassis_no: r.chassis_no, start_date: r.start_date, end_date: r.end_date, agreement_date: r.agreement_date,
      rent_amount: r.rent_amount, deposit: r.deposit, currency: r.currency, notes: r.notes,
    });
  }
  const set = (patch: Partial<RentalInput>) => setForm((f) => (f ? { ...f, ...patch } : f));

  function pickCustomer(id: string) {
    const c = customers.find((x) => x.id === id);
    if (!c) { set({ customer_id: null }); return; }
    set({ customer_id: c.id, customer: c.name, customer_phone: c.phone || "", customer_id_no: c.id_number || "", customer_address: c.address || "" });
  }
  function pickCar(p: PickerProduct) {
    const a = parseAttributes(p.attributes);
    set({
      product_id: p.id, car_name: p.name, car_type: a.car_type ? carTypeLabel(t, a.car_type) : "",
      plate_no: a.plate_no || "", chassis_no: a.chassis_no || "",
    });
  }

  async function submit() {
    if (!form) return;
    if (!form.customer_id) { notify(t("rental.err_renter")); return; }
    if (!form.product_id) { notify(t("rental.err_car")); return; }
    if (!form.start_date || !form.end_date) { notify(t("rental.err_dates")); return; }
    if (form.end_date < form.start_date) { notify(t("rental.err_dates")); return; }
    setBusy(true);
    try {
      const saved = await saveRental(form, editingId ?? undefined);
      setForm(null);
      setEditingId(null);
      await load();
      notify(t("rental.saved"), "success");
      if (!editingId && saved) setPrinting(saved);
    } catch (e) { notify(apiDetail(e, t("common.error"))); }
    finally { setBusy(false); }
  }

  async function print(r: Rental, lang: AgreementLang) {
    try { localStorage.setItem(LANG_KEY, lang); } catch { /* private mode */ }
    setPrinting(null);
    const shop = await getPrintShop();
    printHtml(rentalAgreementHtml(r, shop, lang, { autoPrint: true }));
  }

  async function cancel(r: Rental) {
    if (!(await askConfirm({ message: t("rental.cancel_q"), danger: true }))) return;
    try { await cancelRental(r.id); await load(); } catch (e) { notify(apiDetail(e, t("common.error"))); }
  }
  async function remove(r: Rental) {
    if (!(await askConfirm({ message: t("rental.delete_q"), danger: true }))) return;
    try { await deleteRental(r.id); await load(); } catch (e) { notify(apiDetail(e, t("common.delete_failed"))); }
  }

  const inputCls = "w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2]";
  const label = (k: string, req = false) => (
    <label className="block text-[11px] font-medium text-slate-500 mb-0.5">{t(k)}{req && <span className="text-red-400"> *</span>}</label>
  );

  return (
    <div>
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><CarFront size={15} className="text-blue-600" /> {t("rental.title")}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t("rental.hint")}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setLoading(true); void load(); }} title={t("common.refresh")} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-blue-600">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
            <button onClick={openNew} className="flex items-center gap-1.5 text-white text-xs font-bold px-3 py-2 rounded-lg hover:opacity-90" style={{ background: "#0a66c2" }}>
              <Plus size={13} strokeWidth={3} /> {t("rental.new")}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {(["active", "returned", "cancelled", "all"] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition ${filter === s ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
              {s === "all" ? t("sales.all") : t(`rental.status_${s}`)} <span className="ml-1 opacity-70">{counts[s] ?? 0}</span>
            </button>
          ))}
          <div className="hgv-search hgv-search--sm hgv-page-search ml-auto w-full sm:w-72">
            <Search size={15} className="hgv-search-icon" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("rental.search")} className="hgv-search-input text-sm" />
            {search && <button type="button" onClick={() => setSearch("")} className="hgv-search-clear"><X size={13} /></button>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading && items.length === 0 ? (
          <div className="divide-y divide-slate-100">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <div className="flex-1 space-y-1.5"><div className="hgv-shimmer h-3 w-1/3 rounded" /><div className="hgv-shimmer h-2.5 w-1/4 rounded" /></div>
              </div>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center py-14 text-center px-4">
            <CarFront size={30} className="text-slate-200 mb-2" />
            <p className="text-sm font-medium text-slate-500">{t("rental.none")}</p>
            <button onClick={openNew} className="mt-3 flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "#0a66c2" }}>
              <Plus size={12} /> {t("rental.new")}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {shown.map((r) => {
              const late = r.status === "active" && r.end_date < today_;
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition flex-wrap sm:flex-nowrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {r.customer} <span className="text-slate-400 font-normal">· {r.rental_no}</span>
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {[r.car_name, r.plate_no].filter(Boolean).join(" · ")} · {r.start_date} → {r.end_date} ({rentalDays(r)} {t("rental.days")})
                    </p>
                    {r.status === "returned" && r.deposit > 0 && (
                      <p className="text-[11px] text-slate-400">{t("rental.deposit_back")}: {money(r.deposit_returned ?? 0)} / {money(r.deposit)}{r.return_note ? ` · ${r.return_note}` : ""}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-slate-800">{money(r.rent_amount)} <span className="text-[11px] font-medium text-slate-400">{r.currency}</span></p>
                    {r.deposit > 0 && <p className="text-[11px] text-slate-500">{t("rental.deposit")}: {money(r.deposit)}</p>}
                  </div>
                  <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border ${late ? "bg-red-50 text-red-700 border-red-200" : STATUS_STYLE[r.status]}`}>
                    {late ? t("rental.late") : t(`rental.status_${r.status}`)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPrinting(r)} title={t("rental.print")} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:text-blue-600"><Printer size={14} /></button>
                    {r.status === "active" && <>
                      <button onClick={() => setReturning(r)} title={t("rental.mark_returned")} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:text-emerald-600"><RotateCcw size={14} /></button>
                      <button onClick={() => openEdit(r)} title={t("common.edit")} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:text-blue-600"><Pencil size={14} /></button>
                      <button onClick={() => void cancel(r)} title={t("rental.cancel")} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:text-amber-600"><Ban size={14} /></button>
                    </>}
                    {canDelete && <button onClick={() => void remove(r)} title={t("common.delete")} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:text-red-600"><Trash2 size={14} /></button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── New / edit ── */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={() => !busy && setForm(null)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
              <p className="font-bold text-slate-800">{t(editingId ? "rental.edit" : "rental.new")}</p>
              <button onClick={() => setForm(null)} aria-label={t("common.close")} className="p-1 rounded hover:bg-slate-100"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-4">
              <section>
                <p className="text-xs font-bold text-slate-700 mb-1.5">{t("rental.renter")}</p>
                {/* The renter's details come from Customers only: shown, not typed. */}
                <CustomerPicker customers={customers} value={form.customer_id} onChange={pickCustomer}
                  placeholder={t("rental.pick_customer")} />
                {form.customer_id && (
                  <Details items={[
                    [t("rental.renter_name"), form.customer],
                    [t("rental.id_no"), form.customer_id_no],
                    [t("rental.phone"), form.customer_phone],
                    [t("rental.address"), form.customer_address],
                  ]} missing={t("rental.missing_customer")} />
                )}
              </section>

              <section>
                <p className="text-xs font-bold text-slate-700 mb-1.5">{t("rental.car")}</p>
                {/* The car's details come from Vehicles only: shown, not typed. */}
                <ProductPicker onSelect={pickCar} label={carLabel} placeholder={t("rental.pick_car")} status="available"
                  selected={form.product_id ? { id: form.product_id, name: form.car_name, quantity: 1, selling_price: 0, cost_price: 0, attributes: JSON.stringify({ plate_no: form.plate_no, chassis_no: form.chassis_no }) } : null} />
                {form.product_id && (
                  <Details items={[
                    [t("rental.car_name"), form.car_name],
                    [t("rental.car_type"), form.car_type],
                    [t("rental.plate"), form.plate_no],
                    [t("rental.chassis"), form.chassis_no],
                  ]} missing={t("rental.missing_vehicle")} />
                )}
              </section>

              <section>
                <p className="text-xs font-bold text-slate-700 mb-1.5">{t("rental.period_money")}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div>{label("rental.start", true)}<input type="date" className={inputCls} value={form.start_date} onChange={(e) => set({ start_date: e.target.value })} /></div>
                  <div>{label("rental.end", true)}<input type="date" className={inputCls} value={form.end_date} min={form.start_date} onChange={(e) => set({ end_date: e.target.value })} /></div>
                  <div>{label("rental.signed_on")}<input type="date" className={inputCls} value={form.agreement_date} onChange={(e) => set({ agreement_date: e.target.value })} /></div>
                  <div>{label("rental.rent", true)}<AmountInput min="0" className={inputCls} value={form.rent_amount || ""} onChange={(e) => set({ rent_amount: Number(e.target.value) || 0 })} /></div>
                  <div>{label("rental.deposit")}<AmountInput min="0" className={inputCls} value={form.deposit || ""} onChange={(e) => set({ deposit: Number(e.target.value) || 0 })} /></div>
                  <div className="flex items-end pb-1.5 text-xs text-slate-500">
                    {form.start_date && form.end_date && form.end_date >= form.start_date ? `${rentalDays(form)} ${t("rental.days")} · ${form.currency}` : form.currency}
                  </div>
                </div>
                <div className="mt-2">{label("common.notes")}<textarea rows={2} className={inputCls} value={form.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
              </section>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100 sticky bottom-0 bg-white">
              <button onClick={() => setForm(null)} disabled={busy} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm">{t("common.cancel")}</button>
              <button onClick={() => void submit()} disabled={busy} className="px-4 py-1.5 rounded-lg text-white text-sm font-semibold disabled:opacity-50" style={{ background: "#0a66c2" }}>
                {busy ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {printing && <PrintChoice rental={printing} onPick={(l) => void print(printing, l)} onClose={() => setPrinting(null)} />}
      {returning && <ReturnDialog rental={returning} onClose={() => setReturning(null)} onDone={async () => { setReturning(null); await load(); }} />}
    </div>
  );
}

/** Details copied from Customers or Vehicles: read-only; a blank one says where to add it. */
function Details({ items, missing }: { items: [string, string][]; missing: string }) {
  const blank = items.some(([, v]) => !v?.trim());
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        {items.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[11px] font-medium text-slate-500">{k}</dt>
            <dd className={`truncate text-sm ${v?.trim() ? "font-semibold text-slate-800" : "text-slate-400"}`}>{v?.trim() || "—"}</dd>
          </div>
        ))}
      </dl>
      {blank && <p className="mt-1.5 text-[11px] text-amber-700">{missing}</p>}
    </div>
  );
}

/** Which language the agreement prints in (the last choice comes first). */
function PrintChoice({ rental, onPick, onClose }: { rental: Rental; onPick: (l: AgreementLang) => void; onClose: () => void }) {
  const { t } = useLanguage();
  let last: string | null = null;
  try { last = localStorage.getItem(LANG_KEY); } catch { /* private mode */ }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="flex items-center gap-2 font-bold text-slate-800"><Printer size={17} className="text-blue-600" /> {t("rental.print")}</p>
        <p className="mt-1 text-sm text-slate-500">{t("rental.print_lang")} · {rental.rental_no}</p>
        <div className="mt-4 grid gap-2">
          {AGREEMENT_LANGS.map((l) => (
            <button key={l.code} onClick={() => onPick(l.code)}
              className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold hover:border-blue-400 hover:bg-blue-50 ${last === l.code ? "border-blue-400 bg-blue-50/60" : "border-slate-200"}`}>
              {l.label}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-4 w-full rounded-lg border border-slate-200 px-4 py-2 text-sm">{t("common.cancel")}</button>
      </div>
    </div>
  );
}

/** The car came back: how much of the deposit is given back, and why not all. */
function ReturnDialog({ rental, onClose, onDone }: { rental: Rental; onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useLanguage();
  const [back, setBack] = useState(String(rental.deposit || 0));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    const n = Number(back) || 0;
    if (n < 0 || n > rental.deposit) { notify(t("rental.err_deposit_back")); return; }
    setBusy(true);
    try { await returnRental(rental.id, n, note.trim()); notify(t("rental.returned_ok"), "success"); await onDone(); }
    catch (e) { notify(apiDetail(e, t("common.error"))); }
    finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="flex items-center gap-2 font-bold text-slate-800"><RotateCcw size={17} className="text-emerald-600" /> {t("rental.mark_returned")}</p>
        <p className="mt-1 text-sm text-slate-500">{rental.customer} · {rental.car_name}</p>
        <label className="mt-4 block text-[11px] font-medium text-slate-500 mb-0.5">{t("rental.deposit_back")} ({t("rental.deposit")}: {money(rental.deposit)})</label>
        <AmountInput min="0" max={rental.deposit} value={back} onChange={(e) => setBack(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
        <label className="mt-3 block text-[11px] font-medium text-slate-500 mb-0.5">{t("rental.return_note")}</label>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm">{t("common.cancel")}</button>
          <button onClick={() => void save()} disabled={busy} className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">{t("common.save")}</button>
        </div>
      </div>
    </div>
  );
}
