"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Car, Clock, Pencil, ShieldAlert, ShieldCheck, ShieldQuestion, ShoppingCart, UserCheck, UserX, X } from "lucide-react";
import { itemRequest } from "@/lib/product-api";
import { loadCustomers, type Customer } from "@/lib/supplier-api";
import { useLanguage } from "@/lib/language-context";
import { askConfirm, notify } from "@/lib/dialogs";
import {
  carTypeLabel, daysSince, parseAttributes, stringifyAttributes, vehicleStatus,
  PENALTY_RECHECK_DAYS, type Attributes,
} from "@/lib/business-layout";

export interface Vehicle {
  id: string;
  name: string;
  selling_price: number;
  quantity: number;
  thumbnail?: string | null;
  attributes?: string | null;
}

interface Props {
  vehicles: Vehicle[];
  currency: string;
  onOpenGallery: (v: Vehicle) => void;
  onEdit: (v: Vehicle) => void;
  /** Called after a status/penalty change so the page can reload. */
  onChanged: () => void;
  /** Open this car's fines or pending form once it's shown (from a link). */
  autoForm?: { id: string; form: "fines" | "pending" } | null;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Re-read the vehicle and merge changes into its attributes, so a status
 *  update never overwrites details someone else just edited. Empty values
 *  remove a field. */
async function patchAttributes(id: string, changes: Attributes) {
  const fresh = await itemRequest(`/products/${id}`);
  const merged = { ...parseAttributes(fresh?.data?.attributes), ...changes };
  await itemRequest(`/products/${id}`, { method: "PUT", body: JSON.stringify({ attributes: stringifyAttributes(merged) }) });
}

const CLEAR_PENDING: Attributes = { sale_status: "", buyer_name: "", buyer_phone: "", buyer_id_no: "", pending_since: "", pending_at: "", pending_note: "" };

export default function VehicleGrid({ vehicles, currency, onOpenGallery, onEdit, onChanged, autoForm }: Props) {
  const { t } = useLanguage();
  const [pendingFor, setPendingFor] = useState<Vehicle | null>(null);
  const [penaltyFor, setPenaltyFor] = useState<Vehicle | null>(null);

  // A link asked for this car's form: open it once, as soon as the car is
  // listed (state adjusted during render, React's pattern for prop changes).
  const [handledForm, setHandledForm] = useState<string | null>(null);
  const formKey = autoForm ? `${autoForm.id}:${autoForm.form}` : null;
  if (autoForm && formKey !== handledForm) {
    const v = vehicles.find((x) => x.id === autoForm.id);
    if (v) {
      setHandledForm(formKey);
      const a = parseAttributes(v.attributes);
      if (autoForm.form === "fines") setPenaltyFor(v);
      else if (v.quantity > 0 && a.sale_status !== "pending") setPendingFor(v);
    }
  }

  async function release(v: Vehicle) {
    const ok = await askConfirm({ title: t("vehicle.release_title"), message: t("vehicle.release_confirm"), confirmLabel: t("vehicle.release") });
    if (!ok) return;
    try { await patchAttributes(v.id, CLEAR_PENDING); notify(t("vehicle.released"), "success"); onChanged(); }
    catch { notify(t("items.update_failed")); }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {vehicles.map((v) => (
          <VehicleCard
            key={v.id}
            v={v}
            currency={currency}
            onGallery={() => onOpenGallery(v)}
            onEdit={() => onEdit(v)}
            onPending={() => setPendingFor(v)}
            onRelease={() => release(v)}
            onPenalties={() => setPenaltyFor(v)}
          />
        ))}
      </div>
      {pendingFor && <PendingForm v={pendingFor} onClose={() => setPendingFor(null)} onSaved={() => { setPendingFor(null); onChanged(); }} />}
      {penaltyFor && <PenaltyForm v={penaltyFor} onClose={() => setPenaltyFor(null)} onSaved={() => { setPenaltyFor(null); onChanged(); }} />}
    </>
  );
}

function VehicleCard({ v, currency, onGallery, onEdit, onPending, onRelease, onPenalties }: {
  v: Vehicle; currency: string;
  onGallery: () => void; onEdit: () => void; onPending: () => void; onRelease: () => void; onPenalties: () => void;
}) {
  const { t } = useLanguage();
  const a = parseAttributes(v.attributes);
  const status = vehicleStatus(v.quantity, a);
  const meta = [a.year, a.color, a.car_type ? carTypeLabel(t, a.car_type) : ""].filter(Boolean).join(" · ");
  const ids = [a.plate_no, a.chassis_no].filter(Boolean).join(" · ");
  const pendingDays = daysSince(a.pending_since);

  const STATUS = {
    available: { label: t("vehicle.status_available"), cls: "bg-success text-white" },
    pending:   { label: t("vehicle.status_pending"),   cls: "bg-warning text-white" },
    sold:      { label: t("vehicle.status_sold"),      cls: "bg-text-muted text-white" },
  }[status];

  const sub = [a.year, a.color, a.plate_no].filter(Boolean).join(" · ");

  return (
    <article className={`flex flex-col overflow-hidden rounded-data border border-border bg-white transition hover:border-border-strong hover:shadow-[0_6px_18px_-10px_rgb(0_0_0_/_0.25)] ${status === "sold" ? "opacity-75" : ""}`}>
      {/* Photo with status (left) and fines shield (right) */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-paper-dim">
        <button type="button" onClick={onGallery} className="group block h-full w-full" aria-label={t("vehicle.view_photos")} title={t("vehicle.view_photos")}>
          {v.thumbnail
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={v.thumbnail} alt={v.name} loading="lazy" className={`h-full w-full object-cover transition group-hover:scale-[1.03] ${status === "sold" ? "grayscale" : ""}`} />
            : <span className="flex h-full w-full items-center justify-center"><Car size={30} className="text-text-faint" /></span>}
        </button>
        <span className={`pointer-events-none absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide shadow-sm ${STATUS.cls}`}>{STATUS.label}</span>
        <PenaltyBadge a={a} onClick={onPenalties} />
      </div>

      {/* Details */}
      <div className="flex flex-1 flex-col gap-0.5 px-2.5 pb-2 pt-2">
        <h3 className="truncate text-sm font-semibold text-text" title={[v.name, meta, ids].filter(Boolean).join(" · ")}>{v.name}</h3>
        {sub && <p className="truncate text-xs text-text-muted">{sub}</p>}
        <p className="hgv-figure mt-0.5 text-sm font-bold text-text">
          {Number(v.selling_price || 0).toLocaleString()} <span className="text-[11px] font-medium text-text-muted">{currency}</span>
        </p>
        {status === "pending" && (
          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs font-semibold text-warning"
            title={[t("vehicle.pending_docs"), a.buyer_name, a.buyer_phone, a.buyer_id_no && `${t("vehicle.id_short")}: ${a.buyer_id_no}`, a.pending_note].filter(Boolean).join(" · ")}>
            <Clock size={12} className="shrink-0" />
            <span className="truncate">{a.buyer_name || t("vehicle.pending_docs")}</span>
            {pendingDays !== null && <span className="shrink-0 font-normal text-text-muted">· {pendingDays} {t("vehicle.days")}</span>}
          </p>
        )}
      </div>

      {/* Actions: one compact row */}
      <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
        {status !== "sold" ? (
          <Link href={`/sales?new=1&product=${v.id}`} title={status === "pending" ? t("vehicle.complete_sale") : t("vehicle.sell")}
            className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-full bg-ink px-2 text-xs font-semibold text-white hover:bg-ink-dark">
            <ShoppingCart size={13} className="shrink-0" /> <span className="truncate">{t("vehicle.sell")}</span>
          </Link>
        ) : <span className="flex-1" />}
        {status === "available" && (
          <IconBtn onClick={onPending} label={t("vehicle.mark_pending")} className="hover:text-warning"><UserCheck size={15} /></IconBtn>
        )}
        {status === "pending" && (
          <IconBtn onClick={onRelease} label={t("vehicle.release")} className="hover:text-ink"><UserX size={15} /></IconBtn>
        )}
        <IconBtn onClick={onEdit} label={t("common.edit")} className="hover:text-ink"><Pencil size={14} /></IconBtn>
      </div>
    </article>
  );
}

function IconBtn({ onClick, label, className = "", children }: { onClick: () => void; label: string; className?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-paper-dim ${className}`}>
      {children}
    </button>
  );
}

/** Fines status as a small chip on the photo: grey ? not checked, green
 *  shield clear, red shield with the count. Opens the penalties form. */
function PenaltyBadge({ a, onClick }: { a: Attributes; onClick: () => void }) {
  const { t } = useLanguage();
  const checkedDays = daysSince(a.penalty_checked);
  const count = Number(a.penalty_count || 0);
  const stale = checkedDays !== null && checkedDays > PENALTY_RECHECK_DAYS;
  let icon = <ShieldQuestion size={13} />, cls = "bg-white/90 text-text-muted", text = t("vehicle.penalties_unchecked");
  if (checkedDays !== null && count > 0) {
    icon = <ShieldAlert size={13} />; cls = "bg-accent text-white";
    text = `${count} ${count === 1 ? t("vehicle.fine") : t("vehicle.fines")}${a.penalty_amount ? ` · ${Number(a.penalty_amount).toLocaleString()}` : ""}`;
  } else if (checkedDays !== null) {
    icon = <ShieldCheck size={13} />; cls = "bg-white/90 text-success"; text = t("vehicle.no_fines");
  }
  const when = checkedDays === null ? "" : stale ? t("vehicle.recheck") : checkedDays === 0 ? t("vehicle.today") : `${checkedDays} ${t("vehicle.days_ago")}`;
  return (
    <button type="button" onClick={onClick} title={[text, when].filter(Boolean).join(" · ")} aria-label={[t("vehicle.traffic_penalties"), text, when].filter(Boolean).join(" · ")}
      className={`absolute right-2 top-2 flex h-6 items-center gap-1 rounded-full px-1.5 text-[11px] font-bold shadow-sm ${cls} ${stale ? "ring-2 ring-warning" : ""}`}>
      {icon}{count > 0 && checkedDays !== null && <span>{count}</span>}
    </button>
  );
}

// ── Forms ──────────────────────────────────────────────────────────────────
function Sheet({ title, subtitle, onClose, children, footer }: {
  title: string; subtitle: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative flex max-h-[92vh] w-full max-w-md flex-col rounded-data border border-border bg-white shadow-[0_24px_60px_-12px_rgb(0_0_0_/_0.35)]">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-text">{title}</h2>
            <p className="truncate text-sm text-text-muted">{subtitle}</p>
          </div>
          <button onClick={onClose} aria-label={t("common.close")} className="rounded-full p-1 text-text-faint hover:bg-paper-dim hover:text-text"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-border-strong bg-white px-3 py-2.5 text-[15px] text-text outline-none focus:border-ink focus:ring-2 focus:ring-ink/20";
const labelCls = "mb-1 block text-sm font-medium text-text";
const readOnlyCls = "truncate rounded-lg border border-border bg-paper-dim px-3 py-2.5 text-[15px] text-text";

function PendingForm({ v, onClose, onSaved }: { v: Vehicle; onClose: () => void; onSaved: () => void }) {
  const { t } = useLanguage();
  const a = parseAttributes(v.attributes);
  // Plate and chassis identify the car and come from its record; they're
  // changed with Edit, never here.
  const plate = a.plate_no ?? "";
  const chassis = a.chassis_no ?? "";
  const idsMissing = !plate.trim() || !chassis.trim();
  // The buyer is always one of the saved customers (added in Customers).
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const buyer = customers.find((c) => c.id === customerId);
  const buyerIncomplete = !!buyer && !(buyer.name?.trim() && buyer.phone?.trim() && buyer.id_number?.trim());

  // Load now, and again on coming back from Customers in another tab.
  useEffect(() => {
    const load = () => loadCustomers().then(setCustomers).catch(() => {});
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  async function save() {
    if (idsMissing) { notify(t("vehicle.ids_missing")); return; }
    setTried(true);
    if (!buyer) { notify(t("buyer.pick_required")); return; }
    if (buyerIncomplete) { notify(t("buyer.incomplete")); return; }
    setSaving(true);
    try {
      await patchAttributes(v.id, {
        sale_status: "pending", buyer_name: buyer.name.trim(), buyer_phone: (buyer.phone ?? "").trim(),
        buyer_id_no: (buyer.id_number ?? "").trim(), pending_note: note.trim(), pending_since: today(), pending_at: new Date().toISOString(),
      });
      notify(t("vehicle.marked_pending"), "success");
      onSaved();
    } catch { notify(t("items.update_failed")); }
    finally { setSaving(false); }
  }

  return (
    <Sheet title={t("vehicle.mark_pending")} subtitle={v.name} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="h-10 rounded-full border border-border-strong px-5 text-sm font-semibold text-text hover:bg-paper-dim">{t("common.cancel")}</button>
        <button onClick={save} disabled={saving || idsMissing} className="h-10 rounded-full bg-warning px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{t("vehicle.mark_pending")}</button>
      </>}>
      <p className="text-sm text-text-muted">{t("vehicle.pending_explain")}</p>
      <p className="pt-1 text-xs font-bold uppercase tracking-wide text-text-muted">{t("vehicle.section_vehicle")}</p>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><dt className={labelCls}>{t("vehicle.plate_no")}</dt>
          <dd className={`${readOnlyCls} font-mono uppercase ${plate ? "" : "text-text-faint"}`}>{plate || "-"}</dd></div>
        <div><dt className={labelCls}>{t("vehicle.chassis_no")}</dt>
          <dd className={`${readOnlyCls} font-mono uppercase ${chassis ? "" : "text-text-faint"}`}>{chassis || "-"}</dd></div>
      </dl>
      <p className={`text-xs ${idsMissing ? "font-semibold text-accent" : "text-text-muted"}`}>{t(idsMissing ? "vehicle.ids_missing" : "vehicle.ids_locked")}</p>
      <p className="pt-1 text-xs font-bold uppercase tracking-wide text-text-muted">{t("vehicle.section_buyer")}</p>
      <div><label className={labelCls}>{t("buyer.customer")} <span className="text-accent">*</span></label>
        <select autoFocus className={`${inputCls} ${tried && !buyer ? "border-accent ring-2 ring-accent/20" : ""}`}
          value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="" disabled>{t(customers.length ? "buyer.pick_placeholder" : "buyer.none")}</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
        </select>
        <p className="mt-1 text-xs text-text-muted">
          {t("buyer.only_saved")}{" "}
          <Link href="/partners" target="_blank" className="font-semibold text-ink hover:underline">{t("buyer.add_link")}</Link>
        </p></div>
      {buyer && (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {([
            [t("vehicle.buyer_phone"), buyer.phone],
            [t("vehicle.buyer_id"), buyer.id_number],
          ] as const).map(([label, value]) => (
            <div key={label}><dt className={labelCls}>{label}</dt>
              <dd className={`${readOnlyCls} ${value?.trim() ? "" : "border-accent text-accent"}`}>{value?.trim() || t("buyer.missing")}</dd></div>
          ))}
        </dl>
      )}
      {buyerIncomplete && <p className="text-xs font-semibold text-accent">{t("buyer.incomplete")}</p>}
      <div><label className={labelCls}>{t("vehicle.pending_note")}</label>
        <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("vehicle.pending_note_placeholder")} /></div>
    </Sheet>
  );
}

function PenaltyForm({ v, onClose, onSaved }: { v: Vehicle; onClose: () => void; onSaved: () => void }) {
  const { t } = useLanguage();
  const a = parseAttributes(v.attributes);
  const [count, setCount] = useState(a.penalty_count ?? "0");
  const [amount, setAmount] = useState(a.penalty_amount ?? "");
  const [checked, setChecked] = useState(today());
  const [saving, setSaving] = useState(false);

  async function save() {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 0) { notify(t("vehicle.fines_invalid")); return; }
    setSaving(true);
    try {
      await patchAttributes(v.id, {
        penalty_count: String(n),
        penalty_amount: n > 0 && amount.trim() ? String(Math.max(0, Number(amount) || 0)) : "",
        penalty_checked: checked,
        penalty_saved_at: new Date().toISOString(),
      });
      notify(t("vehicle.penalties_saved"), "success");
      onSaved();
    } catch { notify(t("items.update_failed")); }
    finally { setSaving(false); }
  }

  return (
    <Sheet title={t("vehicle.traffic_penalties")} subtitle={[v.name, a.plate_no].filter(Boolean).join(" · ")} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="h-10 rounded-full border border-border-strong px-5 text-sm font-semibold text-text hover:bg-paper-dim">{t("common.cancel")}</button>
        <button onClick={save} disabled={saving} className="h-10 rounded-full bg-ink px-5 text-sm font-semibold text-white hover:bg-ink-dark disabled:opacity-50">{t("common.save")}</button>
      </>}>
      <p className="text-sm text-text-muted">{t("vehicle.penalties_explain")}</p>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>{t("vehicle.fines_count")}</label>
          <input type="number" min="0" className={inputCls} value={count} onChange={(e) => setCount(e.target.value)} /></div>
        <div><label className={labelCls}>{t("vehicle.fines_amount")}</label>
          <input type="number" min="0" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={Number(count) === 0} /></div>
      </div>
      <div><label className={labelCls}>{t("vehicle.checked_on")}</label>
        <input type="date" className={inputCls} value={checked} max={today()} onChange={(e) => setChecked(e.target.value)} /></div>
    </Sheet>
  );
}
