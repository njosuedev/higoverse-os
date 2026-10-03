"use client";

import { useState } from "react";
import Link from "next/link";
import { Car, Clock, Images, Pencil, ShieldAlert, ShieldCheck, ShieldQuestion, ShoppingCart, UserCheck, X } from "lucide-react";
import { itemRequest } from "@/lib/product-api";
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

const CLEAR_PENDING: Attributes = { sale_status: "", buyer_name: "", buyer_phone: "", pending_since: "", pending_note: "" };

export default function VehicleGrid({ vehicles, currency, onOpenGallery, onEdit, onChanged }: Props) {
  const { t } = useLanguage();
  const [pendingFor, setPendingFor] = useState<Vehicle | null>(null);
  const [penaltyFor, setPenaltyFor] = useState<Vehicle | null>(null);

  async function release(v: Vehicle) {
    const ok = await askConfirm({ title: t("vehicle.release_title"), message: t("vehicle.release_confirm"), confirmLabel: t("vehicle.release") });
    if (!ok) return;
    try { await patchAttributes(v.id, CLEAR_PENDING); notify(t("vehicle.released"), "success"); onChanged(); }
    catch { notify(t("items.update_failed")); }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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

  return (
    <article className={`flex flex-col overflow-hidden rounded-data border border-border bg-white transition hover:border-border-strong hover:shadow-[0_8px_24px_-12px_rgb(0_0_0_/_0.25)] ${status === "sold" ? "opacity-80" : ""}`}>
      {/* Photo + status */}
      <button type="button" onClick={onGallery} className="group relative aspect-[4/3] w-full overflow-hidden bg-paper-dim" aria-label={t("vehicle.view_photos")}>
        {v.thumbnail
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={v.thumbnail} alt={v.name} loading="lazy" className={`h-full w-full object-cover transition group-hover:scale-[1.02] ${status === "sold" ? "grayscale" : ""}`} />
          : <div className="flex h-full w-full items-center justify-center"><Car size={40} className="text-text-faint" /></div>}
        <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide shadow-sm ${STATUS.cls}`}>{STATUS.label}</span>
        {v.thumbnail && (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
            <Images size={12} /> {t("vehicle.view_photos")}
          </span>
        )}
      </button>

      {/* Details */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="truncate text-base font-semibold text-text" title={v.name}>{v.name}</h3>
          {meta && <p className="truncate text-sm text-text-muted">{meta}</p>}
          {ids && <p className="mt-0.5 truncate font-mono text-[13px] text-text-muted" title={ids}>{ids}</p>}
        </div>
        <p className="hgv-figure text-lg font-semibold text-text">
          {Number(v.selling_price || 0).toLocaleString()} <span className="text-sm font-medium text-text-muted">{currency}</span>
        </p>

        {status === "pending" && (
          <div className="rounded-press border border-warning/30 bg-warning-soft px-3 py-2 text-[13px] text-text">
            <p className="flex items-center gap-1.5 font-semibold text-warning">
              <Clock size={13} /> {t("vehicle.pending_docs")}
              {pendingDays !== null && <span className="font-normal text-text-muted">· {pendingDays} {t("vehicle.days")}</span>}
            </p>
            {a.buyer_name && <p className="mt-0.5 truncate">{a.buyer_name}{a.buyer_phone ? ` · ${a.buyer_phone}` : ""}</p>}
            {a.pending_note && <p className="truncate text-text-muted" title={a.pending_note}>{a.pending_note}</p>}
          </div>
        )}

        <PenaltyBadge a={a} onClick={onPenalties} />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border p-3">
        {status !== "sold" && (
          <Link href={`/sales?new=1&product=${v.id}`}
            className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-ink-dark">
            <ShoppingCart size={15} /> {status === "pending" ? t("vehicle.complete_sale") : t("vehicle.sell")}
          </Link>
        )}
        {status === "available" && (
          <button onClick={onPending} className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border-strong px-3 py-2 text-sm font-semibold text-text hover:border-warning hover:text-warning">
            <UserCheck size={15} /> {t("vehicle.mark_pending")}
          </button>
        )}
        {status === "pending" && (
          <button onClick={onRelease} className="whitespace-nowrap rounded-full border border-border-strong px-3 py-2 text-sm font-semibold text-text-muted hover:border-ink hover:text-ink">
            {t("vehicle.release")}
          </button>
        )}
        <button onClick={onEdit} title={t("common.edit")} aria-label={t("common.edit")}
          className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-paper-dim hover:text-ink">
          <Pencil size={16} />
        </button>
      </div>
    </article>
  );
}

function PenaltyBadge({ a, onClick }: { a: Attributes; onClick: () => void }) {
  const { t } = useLanguage();
  const checkedDays = daysSince(a.penalty_checked);
  const count = Number(a.penalty_count || 0);
  const stale = checkedDays !== null && checkedDays > PENALTY_RECHECK_DAYS;
  let icon = <ShieldQuestion size={15} />, cls = "text-text-muted", text = t("vehicle.penalties_unchecked");
  if (checkedDays !== null && count > 0) {
    icon = <ShieldAlert size={15} />; cls = "text-accent-dark";
    text = `${count} ${count === 1 ? t("vehicle.fine") : t("vehicle.fines")}${a.penalty_amount ? ` · ${Number(a.penalty_amount).toLocaleString()}` : ""}`;
  } else if (checkedDays !== null) {
    icon = <ShieldCheck size={15} />; cls = "text-success"; text = t("vehicle.no_fines");
  }
  return (
    <button onClick={onClick} className="mt-auto flex w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-press px-1 py-1 text-left text-[13px] hover:bg-paper-dim">
      <span className={`flex items-center gap-1.5 font-medium ${cls}`}>{icon} <span>{text}</span></span>
      {checkedDays !== null && (
        <span className={`ml-auto shrink-0 whitespace-nowrap ${stale ? "font-semibold text-warning" : "text-text-faint"}`}>
          {stale ? t("vehicle.recheck") : checkedDays === 0 ? t("vehicle.today") : `${checkedDays} ${t("vehicle.days_ago")}`}
        </span>
      )}
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
      <div role="dialog" aria-modal="true" className="relative w-full max-w-md rounded-data border border-border bg-white shadow-[0_24px_60px_-12px_rgb(0_0_0_/_0.35)]">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-text">{title}</h2>
            <p className="truncate text-sm text-text-muted">{subtitle}</p>
          </div>
          <button onClick={onClose} aria-label={t("common.close")} className="rounded-full p-1 text-text-faint hover:bg-paper-dim hover:text-text"><X size={18} /></button>
        </div>
        <div className="space-y-3 px-5 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-border-strong bg-white px-3 py-2.5 text-[15px] text-text outline-none focus:border-ink focus:ring-2 focus:ring-ink/20";
const labelCls = "mb-1 block text-sm font-medium text-text";

function PendingForm({ v, onClose, onSaved }: { v: Vehicle; onClose: () => void; onSaved: () => void }) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { notify(t("vehicle.buyer_required")); return; }
    setSaving(true);
    try {
      await patchAttributes(v.id, {
        sale_status: "pending", buyer_name: name.trim(), buyer_phone: phone.trim(),
        pending_note: note.trim(), pending_since: today(),
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
        <button onClick={save} disabled={saving} className="h-10 rounded-full bg-warning px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{t("vehicle.mark_pending")}</button>
      </>}>
      <p className="text-sm text-text-muted">{t("vehicle.pending_explain")}</p>
      <div><label className={labelCls}>{t("vehicle.buyer_name")} <span className="text-accent">*</span></label>
        <input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div><label className={labelCls}>{t("vehicle.buyer_phone")}</label>
        <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XXXXXXXX" inputMode="tel" /></div>
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
