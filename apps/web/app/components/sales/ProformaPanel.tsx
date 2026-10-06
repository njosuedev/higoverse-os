"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { settingsRequest } from "@/lib/settings-api";
import { getMyShop } from "@/lib/shop-api";
import { loadCustomers, partnerRequest, type Customer } from "@/lib/supplier-api";
import { formatPublicAddress, parseShopAddress, decodeShopHumanInfo } from "@/lib/product-meta";
import { CAR_TYPES, carTypeLabel, parseAttributes } from "@/lib/business-layout";
import ProductPicker, { type PickerProduct } from "@/app/components/ui/ProductPicker";
import {
  listProformas, createProforma, updateProforma, approveProforma, sellProforma, deleteProforma,
  proformaStage, PROFORMA_APPROVER_ROLES,
  type Proforma, type ProformaLine, type ProformaPayload,
} from "@/lib/proforma-api";
import {
  Plus, Trash2, Printer, X, FileText, User, Car, Wallet, ScrollText, Save, CheckCircle2,
  ShoppingBag, Search, ChevronLeft, Lock, AlertCircle, Pencil, RefreshCw,
} from "lucide-react";
import { askConfirm, notify } from "@/lib/dialogs";

type Stage = "draft" | "approved" | "sold" | "expired";
type Line = ProformaLine & { key: string };
type Form = Omit<ProformaPayload, "lines"> & { lines: Line[] };
type Cust = Customer & { email?: string | null };
interface ShopInfo { name: string; phone?: string; address?: string; email?: string; logo_url?: string; tin?: string; }

const PAY_METHODS = ["cash", "mtn", "airtel", "bank", "card", "debt"] as const;
const ENERGY_TYPES = ["Full electric", "Hybrid", "Plug-in hybrid", "Petrol", "Diesel"];
const STAGE_STYLE: Record<Stage, string> = {
  draft:    "bg-slate-100 text-slate-600 border-slate-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  sold:     "bg-green-50 text-green-700 border-green-200",
  expired:  "bg-red-50 text-red-600 border-red-200",
};

function key() { return Math.random().toString(36).slice(2, 9); }
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(from: string, n: number) { const d = new Date(from + "T00:00:00"); d.setDate(d.getDate() + n); return toDateStr(d); }
function today() { return toDateStr(new Date()); }
/** 2026.10.05 — the way car dealers print dates. */
function dotDate(s: string) { return (s || "").replaceAll("-", "."); }
function money(n: number) { return Math.round(n || 0).toLocaleString(); }
function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
/** The server's own message out of "Sale API error: 409 {"detail": "..."}". */
function apiDetail(err: unknown, fallback: string): string {
  const m = /error: \d+ ([\s\S]*)$/.exec(err instanceof Error ? err.message : "");
  try { const d = m && JSON.parse(m[1])?.detail; if (typeof d === "string") return d; } catch { /* not JSON */ }
  return fallback;
}
/** Shown as expired once the validity date has passed, unless it's sold. */
function stageOf(p: Pick<Proforma, "status" | "valid_until">): Stage {
  const s = proformaStage(p.status);
  if (s !== "sold" && p.valid_until && p.valid_until < today()) return "expired";
  return s;
}

type Errors = Record<string, string>;

const YEAR_NOW = new Date().getFullYear();

/** Field → i18n key of what's wrong with it. Lines are keyed `line.<key>.<field>`. */
function validate(f: Form, isCar: boolean, total: number): Errors {
  const e: Errors = {};
  const txt = (v: unknown) => String(v ?? "").trim();
  const digits = (v: string) => v.replace(/\D/g, "");
  if (!txt(f.invoice_no)) e.invoice_no = "proforma.err_required";
  if (!f.date) e.date = "proforma.err_required";
  if (!f.valid_until) e.valid_until = "proforma.err_required";
  else if (f.date && f.valid_until < f.date) e.valid_until = "proforma.err_dates";

  if (txt(f.customer).length < 2) e.customer = "proforma.err_required";
  const phone = txt(f.customer_phone);
  if (!phone) { if (isCar) e.customer_phone = "proforma.err_required"; }
  // 07XXXXXXXX in Rwanda, or an international number (+250…).
  else if (!/^\+?[\d\s-]+$/.test(phone) || digits(phone).length < 9 || digits(phone).length > 15
    || (phone.startsWith("0") && !/^07\d{8}$/.test(digits(phone)))) e.customer_phone = "proforma.err_phone";
  // National ID: 16 digits; passport: 6–12 letters/digits.
  const idNo = txt(f.customer_id_no).replace(/\s/g, "");
  if (!idNo) { if (isCar) e.customer_id_no = "proforma.err_required"; }
  else if (!/^(\d{16}|[A-Za-z0-9]{6,12})$/.test(idNo)) e.customer_id_no = "proforma.err_id";
  if (txt(f.customer_tin) && !/^\d{9}$/.test(txt(f.customer_tin).replace(/\s/g, ""))) e.customer_tin = "proforma.err_tin";
  if (txt(f.customer_email) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(txt(f.customer_email))) e.customer_email = "proforma.err_email";
  if (isCar && !txt(f.customer_address)) e.customer_address = "proforma.err_required";

  const filled = f.lines.filter((l) => txt(l.product_name) || l.product_id);
  if (filled.length === 0) e.lines = isCar ? "proforma.need_vehicle" : "proforma.no_lines";
  const seen = new Set<string>();
  for (const l of filled) {
    const k = `line.${l.key}.`;
    if (!txt(l.product_name)) e[k + "product_name"] = "proforma.err_required";
    if (!(Number(l.unit_price) > 0)) e[k + "unit_price"] = "proforma.err_price";
    if (!Number.isInteger(Number(l.qty)) || Number(l.qty) < 1) e[k + "qty"] = "proforma.err_qty";
    if (!isCar) continue;
    const ch = txt(l.chassis_no).toUpperCase();
    if (!ch) e[k + "chassis_no"] = "proforma.err_required";
    else if (!/^[A-Z0-9]{6,20}$/.test(ch)) e[k + "chassis_no"] = "proforma.err_chassis";
    else if (seen.has(ch)) e[k + "chassis_no"] = "proforma.err_dup_chassis";
    seen.add(ch);
    if (txt(l.plate_no) && !/^[A-Z0-9 ]{4,10}$/i.test(txt(l.plate_no))) e[k + "plate_no"] = "proforma.err_plate";
    const y = txt(l.year);
    if (y && (!/^\d{4}$/.test(y) || Number(y) < 1950 || Number(y) > YEAR_NOW + 1)) e[k + "year"] = "proforma.err_year";
    if (txt(l.mileage) && !/^\d[\d,. ]*$/.test(txt(l.mileage))) e[k + "mileage"] = "proforma.err_mileage";
  }
  const dep = Number(f.deposit_amount) || 0;
  if (dep < 0 || dep > total) e.deposit_amount = "proforma.err_deposit";
  return e;
}

/** "BYD Yuan Up - LL31233343": the car and its chassis number. */
function carLabel(p: PickerProduct): string {
  const ch = parseAttributes(p.attributes).chassis_no;
  return ch ? `${p.name} - ${ch}` : p.name;
}

function emptyLine(): Line { return { key: key(), product_name: "", qty: 1, unit_price: 0 }; }

function Badge({ s }: { s: Stage }) {
  const { t } = useLanguage();
  return <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STAGE_STYLE[s]}`}>{t(`proforma.stage_${s}`)}</span>;
}

/** draft → approved → sold, with the current step highlighted. */
function Steps({ s }: { s: Stage }) {
  const { t } = useLanguage();
  const order: Stage[] = ["draft", "approved", "sold"];
  const at = s === "expired" ? 1 : order.indexOf(s);
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-semibold">
      {order.map((o, i) => (
        <span key={o} className="flex items-center gap-1.5">
          <span className={`px-2 py-0.5 rounded-full border ${i <= at ? STAGE_STYLE[o] : "border-slate-200 text-slate-400"}`}>{i + 1}. {t(`proforma.stage_${o}`)}</span>
          {i < order.length - 1 && <span className="text-slate-300">→</span>}
        </span>
      ))}
    </div>
  );
}

export default function ProformaPanel({ onSold }: { onSold?: () => void }) {
  const { t, layout } = useLanguage();
  const { user } = useAuth();
  const isCar = layout === "car";
  const canApprove = PROFORMA_APPROVER_ROLES.has(user?.role ?? "");

  const [shop, setShop] = useState<ShopInfo>({ name: "" });
  const [currency, setCurrency] = useState("RWF");
  const [taxRate, setTaxRate] = useState(0);
  const [customers, setCustomers] = useState<Cust[]>([]);

  const [view, setView] = useState<"list" | "editor">("list");
  const [items, setItems] = useState<Proforma[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<"all" | Stage>("all");
  const [search, setSearch] = useState("");

  const [current, setCurrent] = useState<Proforma | null>(null);
  const [form, setForm] = useState<Form>(() => blankForm());
  const [busy, setBusy] = useState(false);
  // Errors show once a save has been tried, then update as fields change.
  const [tried, setTried] = useState(false);
  const [selling, setSelling] = useState<Proforma | null>(null);

  function blankForm(prev?: Proforma): Form {
    const date = today();
    return {
      invoice_no: `PRO-${Date.now().toString().slice(-6)}`,
      date,
      valid_until: addDays(date, isCar ? 5 : 30),
      salesperson: prev?.salesperson || user?.name || "",
      customer_id: null, customer: "", customer_phone: "", customer_address: "",
      customer_id_no: "", customer_tin: "", customer_email: "",
      customer_country: prev?.customer_country || "Rwanda", customer_company: "",
      notes: "",
      lines: [emptyLine()],
      subtotal: 0, tax_rate: 0, tax_amount: 0, grand_total: 0,
      currency,
      // A new proforma carries the business's usual payment terms over.
      payment_method: prev?.payment_method || "",
      bank_details: prev?.bank_details || "",
      deposit_amount: 0,
      terms: prev?.terms || t("proforma.default_terms"),
    };
  }

  useEffect(() => {
    Promise.allSettled([settingsRequest("/settings"), getMyShop(), loadCustomers()]).then(([sett, sh, cust]) => {
      if (sett.status === "fulfilled" && sett.value?.data) {
        setCurrency(sett.value.data.currency || "RWF");
        setTaxRate(Number(sett.value.data.tax_rate) || 0);
      }
      if (sh.status === "fulfilled" && sh.value) {
        const s = sh.value;
        setShop({
          name: s.name || "", phone: s.phone, address: s.address, logo_url: s.logo_url,
          email: s.email || decodeShopHumanInfo(s.description).email,
          tin: parseShopAddress(s.address).tin,
        });
      }
      if (cust.status === "fulfilled") setCustomers(cust.value as Cust[]);
    });
  }, []);

  const loadList = useCallback(async () => {
    try { setItems((await listProformas({ limit: 200 })).items || []); }
    catch { /* non-fatal: the list stays as it was */ }
    finally { setListLoading(false); }
  }, []);
  useEffect(() => {
    listProformas({ limit: 200 })
      .then((r) => setItems(r.items || []))
      .catch(() => {})
      .finally(() => setListLoading(false));
  }, []);

  // ── Editor ────────────────────────────────────────────────────────────────
  const subtotal = form.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0);
  // Car prices are quoted with taxes included (terms, point 4).
  const rate = isCar ? 0 : taxRate;
  const taxAmount = Math.round(subtotal * rate / 100);
  const grandTotal = subtotal + taxAmount;
  const balance = Math.max(0, grandTotal - (Number(form.deposit_amount) || 0));
  const stage: Stage = current ? stageOf(current) : "draft";
  const locked = current?.status === "sold";
  const filled = form.lines.filter((l) => l.product_name.trim());

  const input = "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition disabled:bg-slate-50 disabled:text-slate-600";
  const label = "block text-xs font-medium text-gray-500 mb-1";
  const errors = validate(form, isCar, grandTotal);
  const bad = (k: string) => (tried ? errors[k] : undefined);
  const cls = (k: string) => (bad(k) ? `${input} !border-red-400 focus:!ring-red-500/20` : input);
  const msg = (k: string) => (bad(k) ? <p className="text-[11px] text-red-600 mt-0.5">{t(errors[k])}</p> : null);

  function set<K extends keyof Form>(k: K, v: Form[K]) { setForm((f) => ({ ...f, [k]: v })); }
  function setLine(k: string, patch: Partial<Line>) {
    setForm((f) => ({ ...f, lines: f.lines.map((l) => l.key === k ? { ...l, ...patch } : l) }));
  }
  function removeLine(k: string) {
    setForm((f) => ({ ...f, lines: f.lines.length > 1 ? f.lines.filter((l) => l.key !== k) : [emptyLine()] }));
  }
  function addLine() { setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] })); }

  function pickProduct(k: string, p: PickerProduct) {
    if (form.lines.some((l) => l.key !== k && l.product_id === p.id)) { notify(t("proforma.err_same_car")); return; }
    const a = parseAttributes(p.attributes);
    setLine(k, {
      product_id: p.id, product_name: p.name, unit_price: Number(p.selling_price) || 0, qty: 1,
      ...(isCar ? {
        car_type: a.car_type ? carTypeLabel(t, a.car_type) : "",
        year: a.year ?? "", color: a.color ?? "",
        chassis_no: a.chassis_no ?? "", plate_no: a.plate_no ?? "",
        energy: a.battery_range ? "Full electric" : "",
      } : {}),
    });
  }

  function pickCustomer(id: string) {
    const c = customers.find((x) => x.id === id);
    if (!c) { set("customer_id", null); return; }
    setForm((f) => ({
      ...f, customer_id: c.id, customer: c.name, customer_phone: c.phone || "",
      customer_address: c.address || "", customer_id_no: c.id_number || "", customer_email: c.email || f.customer_email,
    }));
  }

  function newProforma() {
    setCurrent(null);
    setTried(false);
    setForm(blankForm(items[0]));
    setView("editor");
  }

  function openProforma(p: Proforma) {
    setCurrent(p);
    setTried(false);
    setForm({
      invoice_no: p.invoice_no, date: p.date, valid_until: p.valid_until, salesperson: p.salesperson,
      customer_id: p.customer_id ?? null, customer: p.customer, customer_phone: p.customer_phone,
      customer_address: p.customer_address, customer_id_no: p.customer_id_no, customer_tin: p.customer_tin,
      customer_email: p.customer_email, customer_country: p.customer_country, customer_company: p.customer_company,
      notes: p.notes,
      lines: (p.lines.length ? p.lines : [{ product_name: "", qty: 1, unit_price: 0 }]).map((l) => ({ ...l, key: key() })),
      subtotal: p.subtotal, tax_rate: p.tax_rate, tax_amount: p.tax_amount, grand_total: p.grand_total,
      currency: p.currency, payment_method: p.payment_method, bank_details: p.bank_details,
      deposit_amount: p.deposit_amount, terms: p.terms,
    });
    setView("editor");
  }

  function payload(): ProformaPayload {
    return {
      ...form,
      currency,
      // `key` is only for React; undefined drops out of the JSON.
      lines: filled.map((l) => ({ ...l, key: undefined, qty: Number(l.qty) || 1, unit_price: Number(l.unit_price) || 0 })),
      subtotal, tax_rate: rate, tax_amount: taxAmount, grand_total: grandTotal,
      deposit_amount: Number(form.deposit_amount) || 0,
    };
  }

  async function save(): Promise<Proforma | null> {
    setTried(true);
    const first = Object.keys(errors)[0];
    if (first) {
      notify(t(first === "lines" ? errors.lines : "proforma.fix_errors"));
      // Jump to the first field that needs fixing.
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return null;
    }
    setBusy(true);
    try {
      const saved = current ? await updateProforma(current.id, payload()) : await createProforma(payload());
      if (saved) { setCurrent(saved); await loadList(); }
      return saved;
    } catch (e) { notify(apiDetail(e, t("proforma.save_failed"))); return null; }
    finally { setBusy(false); }
  }

  async function saveOnly() {
    const was = current ? stageOf(current) : "draft";
    const p = await save();
    if (!p) return;
    notify(was === "approved" && proformaStage(p.status) === "draft" ? t("proforma.back_to_draft") : t("proforma.saved_success"), "success");
  }

  async function approve(p?: Proforma | null) {
    const target = p ?? (await save());
    if (!target) return;
    setBusy(true);
    try {
      const done = await approveProforma(target.id);
      if (!p || current?.id === done.id) setCurrent(done);
      await loadList();
      notify(t("proforma.approved_ok"), "success");
    } catch (e) { notify(apiDetail(e, t("common.error"))); }
    finally { setBusy(false); }
  }

  async function remove(p: Proforma) {
    if (!(await askConfirm({ message: t("sales.confirm_delete_proforma"), danger: true }))) return;
    try {
      await deleteProforma(p.id);
      if (current?.id === p.id) { setCurrent(null); setView("list"); }
      await loadList();
    } catch (e) { notify(apiDetail(e, t("common.delete_failed"))); }
  }

  async function printNow() {
    if (!locked) { const p = await save(); if (!p) return; printProforma(p); }
    else if (current) printProforma(current);
  }

  // ── Print (A4, laid out like a dealer's proforma) ─────────────────────────
  function printProforma(p: Proforma) {
    const publicAddr = formatPublicAddress(shop.address);
    const row = (a: string, av: string, b?: string, bv?: string) => `
      <tr><th>${esc(a)}</th><td>${av}</td>${b !== undefined ? `<th>${esc(b)}</th><td>${bv ?? ""}</td>` : `<td colspan="2" class="blank"></td>`}</tr>`;
    const val = (v: unknown) => esc(v || "N/A");
    const vehicles = isCar
      ? p.lines.map((l, i) => `
        ${p.lines.length > 1 ? `<p class="sub">${esc(t("proforma.vehicle"))} ${i + 1}</p>` : ""}
        <table class="grid">
          ${row(t("proforma.brand"), `<b>${esc(l.product_name)}</b>`, t("proforma.genre"), esc(l.car_type || ""))}
          ${row(t("vehicle.year"), esc(l.year || ""), t("proforma.energy"), esc(l.energy || ""))}
          ${row(t("proforma.colour"), esc(l.color || ""), t("proforma.condition"), esc(l.condition ? t(`proforma.condition_${l.condition}`) : ""))}
          ${row(t("proforma.mileage"), esc(l.mileage || ""), t("proforma.quantity"), esc(l.qty))}
          ${row(t("vehicle.chassis_no"), esc(l.chassis_no || ""), t("vehicle.plate_no"), esc(l.plate_no || ""))}
          ${row(t("proforma.col_price"), `${money(l.unit_price)} ${esc(p.currency)}`, t("proforma.total_price"), `<b>${money(l.unit_price * l.qty)} ${esc(p.currency)}</b>`)}
        </table>`).join("")
      : `<table class="items">
          <thead><tr><th>#</th><th>${esc(t("proforma.description_col"))}</th><th class="r">${esc(t("proforma.col_qty"))}</th><th class="r">${esc(t("proforma.col_price"))}</th><th class="r">${esc(t("proforma.col_total"))}</th></tr></thead>
          <tbody>${p.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.product_name)}</td><td class="r">${esc(l.qty)}</td><td class="r">${money(l.unit_price)}</td><td class="r">${money(l.unit_price * l.qty)}</td></tr>`).join("")}</tbody>
          <tfoot>
            <tr><td colspan="4" class="r">${esc(t("proforma.subtotal"))}</td><td class="r">${money(p.subtotal)}</td></tr>
            ${p.tax_rate > 0 ? `<tr><td colspan="4" class="r">${esc(t("proforma.tax"))} (${p.tax_rate}%)</td><td class="r">${money(p.tax_amount)}</td></tr>` : ""}
            <tr class="gt"><td colspan="4" class="r">${esc(t("proforma.grand_total"))}</td><td class="r">${money(p.grand_total)} ${esc(p.currency)}</td></tr>
          </tfoot>
        </table>`;
    const terms = (p.terms || "").split("\n").map((s) => s.trim()).filter(Boolean);
    const due = Math.max(0, p.grand_total - (p.deposit_amount || 0));
    const footer = `${esc(shop.name)} — ${esc(t("proforma.print_title"))} &nbsp; <i>${esc(t("proforma.not_tax_invoice"))}</i>`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(t("proforma.print_title"))} ${esc(p.invoice_no)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:12.5px}
  .page{max-width:794px;margin:0 auto;padding:36px 44px}
  .head{display:flex;align-items:center;gap:22px;margin-bottom:22px}
  .head img{width:110px;height:110px;object-fit:contain;border-radius:50%}
  .co{flex:1;font-size:13px;line-height:1.35}
  .co .n{font-size:15px;text-transform:uppercase}
  .co b{display:block}
  .title{text-align:center;min-width:180px}
  .title .t{font-size:24px;letter-spacing:.5px;line-height:1.1;text-transform:uppercase}
  .title .s{font-size:10.5px;color:#444;margin-top:2px}
  h2{color:#1f3a68;font-size:14.5px;text-transform:uppercase;margin:24px 0 10px;padding:0 0 6px 10px;border-bottom:1px solid #1f3a68}
  table{width:100%;border-collapse:collapse}
  table.grid th,table.grid td{border:1px solid #d4d4d4;padding:7px 10px;text-align:left;vertical-align:top;font-size:12.5px}
  table.grid th{background:#f3f3f3;color:#444;font-weight:bold;width:19%}
  table.grid td{width:31%}
  table.grid td.blank{border:none;background:none}
  .sub{font-weight:bold;color:#1f3a68;margin:10px 0 6px}
  table.items th{background:#1f3a68;color:#fff;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase}
  table.items td{padding:8px 10px;border-bottom:1px solid #e5e5e5}
  table.items .r{text-align:right}
  table.items tfoot td{border:none;color:#444}
  table.items tr.gt td{background:#1f3a68;color:#fff;font-weight:bold}
  .terms{background:#f3f3f3;border:1px solid #d4d4d4;padding:10px 14px;font-size:11.5px;color:#333;line-height:1.45}
  .terms p{margin:2px 0}
  .notes{margin-top:10px;font-size:11.5px;color:#333}
  .sig{display:flex;gap:40px;margin-top:6px}
  .sig>div{flex:1}
  .sig h3{color:#1f3a68;font-size:12.5px;text-transform:uppercase;margin:10px 0 40px}
  .sig .l{border-top:1px solid #333;margin-top:34px;padding-top:4px;font-size:11px;color:#555}
  .thanks{text-align:center;font-style:italic;color:#444;margin:26px 0 10px}
  .foot{border-top:1px solid #1f3a68;margin-top:18px;padding-top:4px;font-size:10px;color:#555}
  .stamp{display:inline-block;margin-top:6px;font-size:10.5px;color:#1f3a68;border:1px solid #1f3a68;border-radius:4px;padding:2px 6px}
  @media print{.page{padding:14mm 14mm}@page{size:A4 portrait;margin:0}.keep{break-inside:avoid}}
</style></head><body><div class="page">
  <div class="head">
    ${shop.logo_url ? `<img src="${esc(shop.logo_url)}" alt="">` : ""}
    <div class="co">
      <div class="n">${esc(shop.name)}</div>
      ${shop.tin ? `<b>TIN: ${esc(shop.tin)}</b>` : ""}
      ${shop.phone ? `<b>Tel: ${esc(shop.phone)}</b>` : ""}
      ${shop.email ? `<b>EMAIL: ${esc(shop.email)}</b>` : ""}
      ${publicAddr ? `<b>${esc(publicAddr.toUpperCase())}</b>` : ""}
    </div>
    <div class="title"><div class="t">${esc(t("proforma.print_title_1"))}<br>${esc(t("proforma.print_title_2"))}</div><div class="s">${esc(t("proforma.non_binding"))}</div>
      ${proformaStage(p.status) === "approved" || p.status === "sold" ? `<div class="stamp">${esc(t("proforma.stage_approved"))}${p.approved_by ? ` · ${esc(p.approved_by)}` : ""}</div>` : ""}
    </div>
  </div>
  <table class="grid">
    ${row(t("proforma.number_short"), esc(p.invoice_no), t("proforma.date_issued"), esc(dotDate(p.date)))}
    ${row(t("proforma.valid_until"), esc(dotDate(p.valid_until)), t("proforma.salesperson"), esc(p.salesperson || shop.name))}
  </table>

  <div class="keep"><h2>${esc(t("proforma.customer_info"))}</h2>
  <table class="grid">
    ${row(t("proforma.full_name"), `<b>${esc(p.customer)}</b>`, t("proforma.id_passport"), val(p.customer_id_no))}
    ${row("TIN", val(p.customer_tin), t("proforma.phone"), val(p.customer_phone))}
    ${row(t("proforma.address"), val(p.customer_address), t("proforma.email"), val(p.customer_email))}
    ${row(t("proforma.country"), val(p.customer_country), t("proforma.company"), val(p.customer_company))}
  </table></div>

  <h2>${esc(t(isCar ? "proforma.vehicle_details" : "proforma.items_services"))}</h2>
  ${vehicles}

  <div class="keep"><h2>${esc(t("proforma.payment_terms"))}</h2>
  <table class="grid">
    ${row(t("proforma.payment_method"), esc(p.payment_method || ""), t("proforma.currency"), esc(p.currency))}
    ${row(t("proforma.deposit"), money(p.deposit_amount), t("proforma.balance_due"), `<b>${money(due)}</b>`)}
    ${p.bank_details ? `<tr><th>${esc(t("proforma.bank_details"))}</th><td colspan="3">${esc(p.bank_details).replace(/\n/g, "<br>")}</td></tr>` : ""}
  </table></div>

  ${terms.length ? `<div class="keep"><h2>${esc(t("proforma.terms"))}</h2><div class="terms">${terms.map((s) => `<p>${esc(s)}</p>`).join("")}</div></div>` : ""}
  ${p.notes ? `<div class="notes"><b>${esc(t("proforma.notes"))}:</b> ${esc(p.notes)}</div>` : ""}

  <div class="keep"><h2>${esc(t("proforma.signatures"))}</h2>
  <div class="sig">
    <div><h3>${esc(t("proforma.sig_customer"))}</h3><div class="l">${esc(t("proforma.signature"))}</div><div class="l">${esc(t("proforma.name_date"))}</div></div>
    <div><h3>${esc(t("proforma.sig_dealer"))}</h3><div class="l">${esc(t("proforma.signature"))}</div><div class="l">${esc(t("proforma.name_date"))}</div></div>
  </div></div>
  <p class="thanks">${esc(t("proforma.thanks").replace("{shop}", shop.name))}</p>
  <div class="foot">${footer}</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},400);};window.onafterprint=function(){window.close();};</script>
</body></html>`;
    const w = window.open("", "_blank", "width=860,height=1000,scrollbars=yes,resizable=yes");
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
  }

  // ── List ──────────────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Record<Stage, number> = { draft: 0, approved: 0, sold: 0, expired: 0 };
    items.forEach((p) => { c[stageOf(p)]++; });
    return c;
  }, [items]);
  const shown = items.filter((p) => {
    if (stageFilter !== "all" && stageOf(p) !== stageFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [p.invoice_no, p.customer, p.customer_phone, ...p.lines.flatMap((l) => [l.product_name, l.plate_no, l.chassis_no])]
      .some((x) => (x || "").toLowerCase().includes(q));
  });


  if (view === "list") {
    return (
      <div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><FileText size={15} className="text-blue-600" /> {t("proforma.title")}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{t("proforma.flow_hint")}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setListLoading(true); loadList(); }} title={t("common.refresh")} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-blue-600">
                <RefreshCw size={13} className={listLoading ? "animate-spin" : ""} />
              </button>
              <button onClick={newProforma} className="flex items-center gap-1.5 text-white text-xs font-bold px-3 py-2 rounded-lg hover:opacity-90" style={{ background: "#0a66c2" }}>
                <Plus size={13} strokeWidth={3} /> {t("sales.new_proforma")}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {(["all", "draft", "approved", "sold", "expired"] as const).map((s) => (
              <button key={s} onClick={() => setStageFilter(s)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition ${stageFilter === s ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                {s === "all" ? t("sales.all") : t(`proforma.stage_${s}`)}
                <span className="ml-1 opacity-70">{s === "all" ? items.length : counts[s]}</span>
              </button>
            ))}
            <div className="hgv-search hgv-search--sm ml-auto w-full sm:w-72">
              <Search size={15} className="hgv-search-icon" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("proforma.search_hint")} className="hgv-search-input text-sm" />
              {search && <button type="button" onClick={() => setSearch("")} className="hgv-search-clear"><X size={13} /></button>}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {listLoading && items.length === 0 ? (
            <div className="divide-y divide-slate-100">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex-1 space-y-1.5"><div className="hgv-shimmer h-3 w-1/3 rounded" /><div className="hgv-shimmer h-2.5 w-1/4 rounded" /></div>
                  <div className="hgv-shimmer h-3 w-20 rounded" />
                </div>
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-center px-4">
              <FileText size={30} className="text-slate-200 mb-2" />
              <p className="text-sm font-medium text-slate-500">{search || stageFilter !== "all" ? t("proforma.no_match_search") : t("sales.no_proformas")}</p>
              {!search && stageFilter === "all" && (
                <button onClick={newProforma} className="mt-3 flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "#0a66c2" }}>
                  <Plus size={12} /> {t("sales.create_proforma")}
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {shown.map((p) => {
                const s = stageOf(p);
                const what = p.lines.map((l) => [l.product_name, l.chassis_no].filter(Boolean).join(" - ")).join(", ");
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition">
                    <button onClick={() => openProforma(p)} className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-sm text-blue-700">{p.invoice_no}</span>
                        <Badge s={s} />
                        <span className="text-sm font-semibold text-slate-800 truncate">{p.customer || <i className="font-normal text-slate-400">{t("proforma.no_customer")}</i>}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{what || "—"}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {dotDate(p.date)} · {t("proforma.valid_until_short")} {dotDate(p.valid_until)}
                        {p.approved_by && s !== "draft" ? ` · ${t("proforma.approved_by")} ${p.approved_by}` : ""}
                      </p>
                    </button>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-slate-800 tabular-nums text-sm">{money(p.grand_total)} <span className="text-[11px] font-normal text-slate-400">{p.currency}</span></p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {s === "draft" && canApprove && (
                        <button onClick={() => approve(p)} disabled={busy} className="text-[11px] font-bold px-2 py-1 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-40">
                          {t("proforma.approve")}
                        </button>
                      )}
                      {(s === "approved" || (s === "expired" && proformaStage(p.status) === "approved")) && (
                        <button onClick={() => setSelling(p)} className="text-[11px] font-bold px-2 py-1 rounded-lg text-white bg-green-600 hover:bg-green-700">
                          {t("proforma.sell")}
                        </button>
                      )}
                      <button onClick={() => printProforma(p)} title={t("common.print")} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600"><Printer size={14} /></button>
                      {p.status !== "sold" && (
                        <button onClick={() => remove(p)} title={t("common.delete")} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {selling && (
          <SellDialog p={selling} customers={customers} isCar={isCar}
            onClose={() => setSelling(null)}
            onCustomers={setCustomers}
            onDone={async (done) => { setSelling(null); if (current?.id === done.id) setCurrent(done); await loadList(); onSold?.(); }} />
        )}
      </div>
    );
  }

  // ── Editor view ───────────────────────────────────────────────────────────
  return (
    <div>
      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-2 flex items-center gap-3 flex-wrap">
        <button onClick={() => { setView("list"); setCurrent(null); }} className="flex items-center gap-1 text-xs font-semibold text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600 px-2.5 py-1.5 rounded-lg">
          <ChevronLeft size={13} /> {t("proforma.all_proformas")}
        </button>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span className="font-mono text-blue-700">{form.invoice_no}</span> {current && <Badge s={stage} />}
          </p>
          {current?.approved_by && stage !== "draft" && <p className="text-[11px] text-slate-500">{t("proforma.approved_by")} {current.approved_by}</p>}
        </div>
        <div className="ml-auto"><Steps s={current ? stage : "draft"} /></div>
      </div>

      {locked && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 text-xs rounded-lg px-3 py-2 mb-2">
          <Lock size={13} /> {t("proforma.sold_locked")}
        </div>
      )}
      {!locked && stage === "approved" && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-lg px-3 py-2 mb-2">
          <AlertCircle size={13} /> {t("proforma.edit_unapproves")}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_300px] gap-3">
        <fieldset disabled={locked || busy} className="space-y-3 min-w-0">
          {/* Proforma details */}
          <section className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#1f3a68] mb-3 flex items-center gap-2"><FileText size={14} /> {t("proforma.details")}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><label className={label}>{t("proforma.number_short")} *</label><input className={cls("invoice_no")} aria-invalid={!!bad("invoice_no")} value={form.invoice_no} onChange={(e) => set("invoice_no", e.target.value)} />{msg("invoice_no")}</div>
              <div><label className={label}>{t("proforma.date_issued")}</label><input type="date" className={cls("date")} aria-invalid={!!bad("date")} value={form.date} onChange={(e) => set("date", e.target.value)} />{msg("date")}</div>
              <div>
                <label className={label}>{t("proforma.valid_until")} *</label>
                <input type="date" className={cls("valid_until")} aria-invalid={!!bad("valid_until")} value={form.valid_until} onChange={(e) => set("valid_until", e.target.value)} />{msg("valid_until")}
                <div className="flex gap-1 mt-1">
                  {[5, 7, 14, 30].map((d) => (
                    <button key={d} type="button" onClick={() => set("valid_until", addDays(form.date || today(), d))}
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300">{d}{t("proforma.days_unit")}</button>
                  ))}
                </div>
              </div>
              <div><label className={label}>{t("proforma.salesperson")}</label><input className={input} value={form.salesperson} placeholder={shop.name} onChange={(e) => set("salesperson", e.target.value)} /></div>
            </div>
          </section>

          {/* Customer information */}
          <section className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#1f3a68] mb-3 flex items-center gap-2"><User size={14} /> {t("proforma.customer_info")}</h3>
            <div className="mb-3">
              <label className={label}>{t("proforma.pick_customer")}</label>
              <select className={input} value={form.customer_id ?? ""} onChange={(e) => pickCustomer(e.target.value)}>
                <option value="">{t("proforma.new_customer_typed")}</option>
                {[...customers].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>
                ))}
              </select>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div><label className={label}>{t("proforma.full_name")} *</label><input className={cls("customer")} aria-invalid={!!bad("customer")} value={form.customer} onChange={(e) => set("customer", e.target.value)} placeholder={t("partners.name_placeholder")} />{msg("customer")}</div>
              <div><label className={label}>{t("proforma.id_passport")}{isCar && " *"}</label><input className={cls("customer_id_no")} aria-invalid={!!bad("customer_id_no")} value={form.customer_id_no} onChange={(e) => set("customer_id_no", e.target.value)} />{msg("customer_id_no")}</div>
              <div><label className={label}>TIN</label><input className={cls("customer_tin")} aria-invalid={!!bad("customer_tin")} value={form.customer_tin} onChange={(e) => set("customer_tin", e.target.value)} />{msg("customer_tin")}</div>
              <div><label className={label}>{t("proforma.phone")}{isCar && " *"}</label><input className={cls("customer_phone")} aria-invalid={!!bad("customer_phone")} value={form.customer_phone} onChange={(e) => set("customer_phone", e.target.value)} placeholder="07XXXXXXXX" />{msg("customer_phone")}</div>
              <div><label className={label}>{t("proforma.address")}{isCar && " *"}</label><input className={cls("customer_address")} aria-invalid={!!bad("customer_address")} value={form.customer_address} onChange={(e) => set("customer_address", e.target.value)} placeholder={t("proforma.address_placeholder")} />{msg("customer_address")}</div>
              <div><label className={label}>{t("proforma.email")}</label><input type="email" className={cls("customer_email")} aria-invalid={!!bad("customer_email")} value={form.customer_email} onChange={(e) => set("customer_email", e.target.value)} />{msg("customer_email")}</div>
              <div><label className={label}>{t("proforma.country")}</label><input className={input} value={form.customer_country} onChange={(e) => set("customer_country", e.target.value)} /></div>
              <div><label className={label}>{t("proforma.company")}</label><input className={input} value={form.customer_company} onChange={(e) => set("customer_company", e.target.value)} /></div>
            </div>
          </section>

          {/* Vehicles / items */}
          <section className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#1f3a68] flex items-center gap-2">
                {isCar ? <Car size={14} /> : <ShoppingBag size={14} />} {t(isCar ? "proforma.vehicle_details" : "proforma.items_services")}
              </h3>
              <button type="button" onClick={addLine} className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg">
                <Plus size={12} /> {t(isCar ? "proforma.add_vehicle" : "proforma.add_line")}
              </button>
            </div>
            <div className="space-y-3">
              {form.lines.map((l, i) => (
                <div key={l.key} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-slate-500">{isCar ? `${t("proforma.vehicle")} ${i + 1}` : `#${i + 1}`}</span>
                    {l.product_id
                      ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">{t("proforma.from_stock")}</span>
                      : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">{t("proforma.typed_in")}</span>}
                    {!locked && (
                      <div className="flex-1 max-w-sm">
                        <ProductPicker
                          onSelect={(p) => pickProduct(l.key, p)}
                          selected={l.product_id ? { id: l.product_id, name: l.product_name, quantity: 1, selling_price: l.unit_price, cost_price: 0, attributes: JSON.stringify({ chassis_no: l.chassis_no }) } : null}
                          // Cars in stock that nobody has booked, as "BYD Yuan Up - LL31233343".
                          status={isCar ? "available" : undefined}
                          label={isCar ? carLabel : undefined}
                          placeholder={t(isCar ? "proforma.pick_vehicle" : "proforma.pick_from_inventory")}
                          className="text-xs"
                        />
                      </div>
                    )}
                    <button type="button" onClick={() => removeLine(l.key)} className="ml-auto p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500"><X size={14} /></button>
                  </div>
                  <div className={`grid gap-2 ${isCar ? "grid-cols-2 md:grid-cols-4" : "grid-cols-[1fr_80px_120px]"}`}>
                    <div className={isCar ? "col-span-2" : ""}>
                      <label className={label}>{t(isCar ? "proforma.brand" : "proforma.description_col")}</label>
                      <input className={cls(`line.${l.key}.product_name`)} aria-invalid={!!bad(`line.${l.key}.product_name`)} value={l.product_name} onChange={(e) => setLine(l.key, { product_name: e.target.value, product_id: null })} placeholder={isCar ? "Neta V" : t("proforma.product_placeholder")} />{msg(`line.${l.key}.product_name`)}
                    </div>
                    {isCar && (<>
                      <div>
                        <label className={label}>{t("proforma.genre")}</label>
                        <input className={input} list="pf-genres" value={l.car_type ?? ""} onChange={(e) => setLine(l.key, { car_type: e.target.value })} />
                      </div>
                      <div><label className={label}>{t("vehicle.year")}</label><input className={cls(`line.${l.key}.year`)} aria-invalid={!!bad(`line.${l.key}.year`)} inputMode="numeric" value={l.year ?? ""} onChange={(e) => setLine(l.key, { year: e.target.value })} />{msg(`line.${l.key}.year`)}</div>
                      <div><label className={label}>{t("proforma.colour")}</label><input className={input} value={l.color ?? ""} onChange={(e) => setLine(l.key, { color: e.target.value })} /></div>
                      <div><label className={label}>{t("proforma.mileage")}</label><input className={cls(`line.${l.key}.mileage`)} aria-invalid={!!bad(`line.${l.key}.mileage`)} value={l.mileage ?? ""} onChange={(e) => setLine(l.key, { mileage: e.target.value })} />{msg(`line.${l.key}.mileage`)}</div>
                      <div>
                        <label className={label}>{t("proforma.energy")}</label>
                        <input className={input} list="pf-energy" value={l.energy ?? ""} onChange={(e) => setLine(l.key, { energy: e.target.value })} />
                      </div>
                      <div>
                        <label className={label}>{t("proforma.condition")}</label>
                        <select className={input} value={l.condition ?? ""} onChange={(e) => setLine(l.key, { condition: e.target.value })}>
                          <option value="">—</option>
                          <option value="new">{t("proforma.condition_new")}</option>
                          <option value="used">{t("proforma.condition_used")}</option>
                        </select>
                      </div>
                      <div className="col-span-2"><label className={label}>{t("vehicle.chassis_no")} *</label><input className={cls(`line.${l.key}.chassis_no`)} aria-invalid={!!bad(`line.${l.key}.chassis_no`)} value={l.chassis_no ?? ""} onChange={(e) => setLine(l.key, { chassis_no: e.target.value.toUpperCase() })} />{msg(`line.${l.key}.chassis_no`)}</div>
                      <div className="col-span-2"><label className={label}>{t("vehicle.plate_no")}</label><input className={cls(`line.${l.key}.plate_no`)} aria-invalid={!!bad(`line.${l.key}.plate_no`)} value={l.plate_no ?? ""} onChange={(e) => setLine(l.key, { plate_no: e.target.value.toUpperCase() })} />{msg(`line.${l.key}.plate_no`)}</div>
                    </>)}
                    <div><label className={label}>{t("proforma.quantity")}</label><input type="number" min={1} className={cls(`line.${l.key}.qty`)} aria-invalid={!!bad(`line.${l.key}.qty`)} value={l.qty} onChange={(e) => setLine(l.key, { qty: Math.max(1, Number(e.target.value) || 1) })} />{msg(`line.${l.key}.qty`)}</div>
                    <div><label className={label}>{t("proforma.col_price")} ({currency}) *</label><input type="number" min={0} className={cls(`line.${l.key}.unit_price`)} aria-invalid={!!bad(`line.${l.key}.unit_price`)} value={l.unit_price} onChange={(e) => setLine(l.key, { unit_price: Math.max(0, Number(e.target.value) || 0) })} />{msg(`line.${l.key}.unit_price`)}</div>
                    {isCar && (
                      <div className="col-span-2 flex items-end justify-end">
                        <p className="text-sm text-slate-500">{t("proforma.total_price")}: <b className="text-slate-900 tabular-nums">{money((Number(l.qty) || 0) * (Number(l.unit_price) || 0))} {currency}</b></p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <datalist id="pf-genres">{CAR_TYPES.map((c) => <option key={c} value={carTypeLabel(t, c)} />)}</datalist>
            <datalist id="pf-energy">{ENERGY_TYPES.map((c) => <option key={c} value={c} />)}</datalist>
          </section>

          {/* Payment & finance terms */}
          <section className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#1f3a68] mb-3 flex items-center gap-2"><Wallet size={14} /> {t("proforma.payment_terms")}</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div><label className={label}>{t("proforma.payment_method")}</label><input className={input} value={form.payment_method} onChange={(e) => set("payment_method", e.target.value)} placeholder={t("proforma.payment_method_ph")} /></div>
              <div><label className={label}>{t("proforma.currency")}</label><input className={input} value={currency} disabled /></div>
              <div><label className={label}>{t("proforma.deposit")}</label><input type="number" min={0} className={cls("deposit_amount")} aria-invalid={!!bad("deposit_amount")} value={form.deposit_amount} onChange={(e) => set("deposit_amount", Math.max(0, Number(e.target.value) || 0))} />{msg("deposit_amount")}</div>
              <div><label className={label}>{t("proforma.balance_due")}</label><input className={input + " font-semibold"} value={money(balance)} disabled /></div>
              <div className="md:col-span-2">
                <label className={label}>{t("proforma.bank_details")}</label>
                <textarea rows={2} className={input + " resize-y"} value={form.bank_details} onChange={(e) => set("bank_details", e.target.value)} placeholder={t("proforma.bank_details_ph")} />
              </div>
            </div>
          </section>

          {/* Terms & notes */}
          <section className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#1f3a68] mb-3 flex items-center gap-2"><ScrollText size={14} /> {t("proforma.terms")}</h3>
            <textarea rows={8} className={input + " resize-y text-xs leading-relaxed"} value={form.terms} onChange={(e) => set("terms", e.target.value)} />
            <label className={label + " mt-3"}>{t("proforma.notes")}</label>
            <textarea rows={2} className={input + " resize-y"} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </section>
        </fieldset>

        {/* Summary + actions */}
        <aside className="space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 lg:sticky lg:top-3">
            <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wide mb-3">{t("proforma.invoice_summary")}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-2"><span className="text-slate-500">{t("proforma.full_name")}</span><span className="font-medium text-slate-800 truncate">{form.customer || "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{t(isCar ? "proforma.vehicles" : "proforma.line_items_label")}</span><span className="font-medium">{filled.length}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{t("proforma.subtotal")}</span><span className="tabular-nums">{money(subtotal)}</span></div>
              {rate > 0 && <div className="flex justify-between"><span className="text-slate-500">{t("proforma.tax")} ({rate}%)</span><span className="tabular-nums">{money(taxAmount)}</span></div>}
              <div className="flex justify-between"><span className="text-slate-500">{t("proforma.deposit")}</span><span className="tabular-nums">{money(Number(form.deposit_amount) || 0)}</span></div>
              <div className="rounded-lg px-3 py-2.5 flex justify-between items-center text-white" style={{ background: "#1f3a68" }}>
                <span className="text-xs font-semibold uppercase">{t("proforma.grand_total")}</span>
                <span className="font-bold tabular-nums">{money(grandTotal)} {currency}</span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {!locked && (
                <button onClick={saveOnly} disabled={busy} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-blue-600 text-blue-700 font-semibold hover:bg-blue-50 disabled:opacity-40 text-sm">
                  <Save size={15} /> {busy ? t("proforma.saving") : t(current ? "proforma.update_proforma" : "proforma.save_draft")}
                </button>
              )}
              {!locked && stage !== "approved" && (canApprove ? (
                <button onClick={() => approve()} disabled={busy} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-40 text-sm">
                  <CheckCircle2 size={15} /> {t("proforma.save_approve")}
                </button>
              ) : (
                <p className="text-[11px] text-slate-500 text-center">{t("proforma.wait_approval")}</p>
              ))}
              {current && proformaStage(current.status) === "approved" && (
                <button onClick={() => setSelling(current)} disabled={busy} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-40 text-sm">
                  <ShoppingBag size={15} /> {t("proforma.sell")}
                </button>
              )}
              <button onClick={printNow} disabled={busy} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 disabled:opacity-40 text-sm">
                <Printer size={15} /> {t(locked ? "common.print" : "proforma.save_print_pdf")}
              </button>
              {current && !locked && (
                <button onClick={() => remove(current)} className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-red-600 hover:bg-red-50 text-xs font-semibold">
                  <Trash2 size={13} /> {t("common.delete")}
                </button>
              )}
              {locked && onSold && (
                <button onClick={onSold} className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-blue-700 hover:bg-blue-50 text-xs font-semibold">
                  <Pencil size={13} /> {t("proforma.see_in_sales")}
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>

      {selling && (
        <SellDialog p={selling} customers={customers} isCar={isCar}
          onClose={() => setSelling(null)}
          onCustomers={setCustomers}
          onDone={async (done) => { setSelling(null); setCurrent(done); openProforma(done); await loadList(); onSold?.(); }} />
      )}
    </div>
  );
}

// ── Record the sale ─────────────────────────────────────────────────────────
function SellDialog({ p, customers, isCar, onClose, onDone, onCustomers }: {
  p: Proforma; customers: Cust[]; isCar: boolean;
  onClose: () => void; onDone: (p: Proforma) => void; onCustomers: (c: Cust[]) => void;
}) {
  const { t } = useLanguage();
  const linked = customers.find((c) => c.id === p.customer_id);
  const [customerId, setCustomerId] = useState(linked?.id ?? "");
  const [method, setMethod] = useState<string>("bank");
  const [paid, setPaid] = useState(String(Math.round(p.grand_total)));
  const [busy, setBusy] = useState(false);
  const typed = p.lines.filter((l) => !l.product_id);
  const expired = p.valid_until && p.valid_until < today();
  const owed = Math.max(0, p.grand_total - (Number(paid) || 0));

  // The buyer's details a car sale needs (as in Sales → the buyer).
  const missing = isCar
    ? ([["proforma.phone", p.customer_phone], ["proforma.id_passport", p.customer_id_no], ["proforma.address", p.customer_address]] as const)
        .filter(([, v]) => !v.trim()).map(([k]) => t(k))
    : [];

  async function confirm() {
    if (typed.length) return;
    setBusy(true);
    try {
      let cid = customerId;
      // Not a saved customer yet: save them from the proforma's details.
      if (!cid && isCar) {
        if (missing.length) { notify(`${t("proforma.customer_missing")} ${missing.join(", ")}`); return; }
        const res = await partnerRequest("/suppliers", {
          method: "POST",
          body: JSON.stringify({
            name: p.customer.trim(), phone: p.customer_phone.trim() || null, email: p.customer_email.trim() || null,
            address: p.customer_address.trim() || null, ...(isCar ? { id_number: p.customer_id_no.trim() || null } : {}),
          }),
        });
        cid = res?.data?.id ?? "";
        if (cid) onCustomers([...customers, res.data]);
      }
      const done = await sellProforma(p.id, {
        payment_method: method,
        amount_paid: method === "debt" && paid === "" ? 0 : Number(paid) || 0,
        ...(cid ? { customer_id: cid } : {}),
      });
      notify(t("proforma.sold_ok"), "success");
      onDone(done);
    } catch (e) { notify(apiDetail(e, t("common.error"))); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">{t("proforma.sell_title")}</h3>
            <p className="text-xs text-slate-500">{p.invoice_no} · {p.customer}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm space-y-1">
            {p.lines.map((l, i) => (
              <div key={i} className="flex justify-between gap-2">
                <span className="truncate">{l.product_name}{l.plate_no ? ` · ${l.plate_no}` : ""}{l.qty > 1 ? ` ×${l.qty}` : ""}</span>
                <span className="tabular-nums font-medium">{money(l.unit_price * l.qty)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-slate-200 pt-1 mt-1 font-bold"><span>{t("proforma.grand_total")}</span><span className="tabular-nums">{money(p.grand_total)} {p.currency}</span></div>
          </div>

          {typed.length > 0 && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
              {t("proforma.typed_cant_sell")} {typed.map((l) => l.product_name).join(", ")}
            </p>
          )}
          {expired && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">{t("proforma.sell_expired_warn")}</p>}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t("proforma.buyer")}</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              <option value="">{isCar ? t("proforma.save_as_customer").replace("{name}", p.customer || "—") : t("proforma.no_saved_customer")}</option>
              {[...customers].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>
              ))}
            </select>
            {!customerId && missing.length > 0 && (
              <p className="text-[11px] text-amber-700 mt-1">{t("proforma.customer_missing")} {missing.join(", ")}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t("sales.payment_method")}</label>
            <div className="grid grid-cols-3 gap-1.5">
              {PAY_METHODS.map((m) => (
                <button key={m} type="button" onClick={() => { setMethod(m); if (m === "debt") setPaid("0"); }}
                  className={`text-xs font-semibold py-2 rounded-lg border transition ${method === m ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                  {t(`sales.pm_${m}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t("proforma.paid_now")} ({p.currency})</label>
            <input type="number" min={0} value={paid} onChange={(e) => setPaid(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            {owed > 0 && <p className="text-[11px] text-amber-700 mt-1">{t("proforma.rest_as_debt").replace("{amount}", `${money(owed)} ${p.currency}`)}</p>}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold">{t("common.cancel")}</button>
          <button onClick={confirm} disabled={busy || typed.length > 0}
            className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-bold disabled:opacity-40">
            {busy ? t("proforma.saving") : t("proforma.confirm_sale")}
          </button>
        </div>
      </div>
    </div>
  );
}
