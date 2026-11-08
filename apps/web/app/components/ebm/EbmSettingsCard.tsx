"use client";

// Settings → RRA EBM: the business's TIN, branch and EBM device, connecting
// it to RRA, the default item classification and tax type, and each
// product's tax type. Only the owner (or an admin) changes it; sale-service
// enforces the same.

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, CheckCircle2, Landmark, Loader2, RefreshCw, Search } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { useShop } from "@/lib/shop-context";
import { shopTin } from "@/lib/company";
import { itemRequest } from "@/lib/product-api";
import { ebmApi, type EbmCodes, type EbmConfig, type EbmItem, type EbmItemClass } from "@/lib/ebm-api";

interface Product { id: string; name: string }

const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#0a66c2] disabled:opacity-60";

export default function EbmSettingsCard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { shop } = useShop();
  const canEdit = user?.role === "owner" || user?.role === "admin";

  const [cfg, setCfg] = useState<EbmConfig | null>(null);
  const [codes, setCodes] = useState<EbmCodes | null>(null);
  const [form, setForm] = useState({ tin: "", bhf_id: "00", device_serial: "" });
  const [busy, setBusy] = useState<"" | "save" | "connect" | "sync" | "toggle">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    ebmApi.config().then((r) => {
      setCfg(r.data); setCodes(r.codes);
      setForm({ tin: r.data.tin || (shop ? shopTin(shop) || "" : ""), bhf_id: r.data.bhf_id || "00", device_serial: r.data.device_serial || "" });
    }).catch((e) => setMsg({ ok: false, text: e.message }));
  }, [shop]);

  const deviceDirty = !!cfg && (form.tin !== (cfg.tin || "") || form.bhf_id !== cfg.bhf_id || form.device_serial !== (cfg.device_serial || ""));

  async function run(kind: typeof busy, fn: () => Promise<{ data: EbmConfig } | void>, done?: string) {
    setBusy(kind); setMsg(null);
    try {
      const r = await fn();
      if (r && "data" in r) setCfg(r.data);
      if (done) setMsg({ ok: true, text: done });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("common.error") });
    } finally { setBusy(""); }
  }

  const saveDevice = () => run("save", () => ebmApi.saveConfig(form), t("settings.saved_status"));
  const connect = () => run("connect", async () => {
    if (deviceDirty) await ebmApi.saveConfig(form);
    return ebmApi.connect();
  }, t("ebm.connected_ok"));
  const sync = () => run("sync", async () => {
    const r = await ebmApi.syncItemClasses();
    setMsg({ ok: true, text: t("ebm.classes_synced").replace("{n}", String(r.data.count)) });
  });
  const patch = (p: Partial<EbmConfig>) => run("toggle", () => ebmApi.saveConfig(p));

  if (!cfg) {
    return (
      <Card>
        {msg ? <p className="px-5 py-4 text-sm text-red-600">{msg.text}</p>
          : <p className="flex items-center gap-2 px-5 py-4 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> {t("common.loading")}</p>}
      </Card>
    );
  }

  return (
    <Card status={cfg.ready ? <span className="flex items-center gap-1 text-[11px] font-semibold text-green-600"><BadgeCheck size={13} /> {t("ebm.status_ready")}</span>
      : cfg.connected ? <span className="text-[11px] font-semibold text-slate-500">{t("ebm.status_off")}</span>
      : <span className="text-[11px] font-semibold text-amber-600">{t("ebm.status_not_connected")}</span>}>
      <div className="divide-y divide-slate-100">
        <p className="px-5 py-3 text-xs leading-relaxed text-slate-500">{t("ebm.intro")}</p>
        {!cfg.server_ready && (
          <p className="mx-5 my-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("ebm.server_not_ready")}</p>
        )}
        {!canEdit && <p className="px-5 py-2.5 text-xs text-slate-500">{t("ebm.owner_only")}</p>}

        {/* The device */}
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
          <label className="text-xs font-medium text-slate-600">{t("ebm.tin")}
            <input className={`${input} mt-1`} inputMode="numeric" maxLength={9} disabled={!canEdit} value={form.tin}
              onChange={(e) => setForm({ ...form, tin: e.target.value.replace(/\D/g, "") })} placeholder="123456789" />
          </label>
          <label className="text-xs font-medium text-slate-600">{t("ebm.branch")}
            <input className={`${input} mt-1`} inputMode="numeric" maxLength={2} disabled={!canEdit} value={form.bhf_id}
              onChange={(e) => setForm({ ...form, bhf_id: e.target.value.replace(/\D/g, "") })} placeholder="00" />
          </label>
          <label className="text-xs font-medium text-slate-600">{t("ebm.device_serial")}
            <input className={`${input} mt-1`} maxLength={100} disabled={!canEdit} value={form.device_serial}
              onChange={(e) => setForm({ ...form, device_serial: e.target.value.trim() })} />
          </label>
          <p className="text-[11px] text-slate-400 sm:col-span-3">{t("ebm.device_hint")}</p>
          {canEdit && (
            <div className="flex flex-wrap gap-2 sm:col-span-3">
              {deviceDirty && (
                <button type="button" onClick={saveDevice} disabled={!!busy}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {busy === "save" ? t("common.saving") : t("settings.save")}
                </button>
              )}
              <button type="button" onClick={connect} disabled={!!busy || !cfg.server_ready || form.tin.length !== 9 || !form.device_serial}
                className="flex items-center gap-1.5 rounded-lg bg-[#0a66c2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#004182] disabled:opacity-40">
                {busy === "connect" ? <Loader2 size={13} className="animate-spin" /> : <Landmark size={13} />}
                {cfg.connected ? t("ebm.reconnect") : t("ebm.connect")}
              </button>
            </div>
          )}
        </div>

        {cfg.connected && (
          <div className="grid gap-x-6 gap-y-1 px-5 py-3 text-xs sm:grid-cols-2">
            <Info k={t("ebm.taxpayer")} v={cfg.taxpayer_name} />
            <Info k={t("ebm.branch_name")} v={cfg.branch_name} />
            <Info k="SDC ID" v={cfg.sdc_id} />
            <Info k="MRC" v={cfg.mrc_no} />
            <Info k={t("ebm.last_invoice")} v={String(cfg.last_invoice_no)} />
            <Info k={t("ebm.cis_version")} v={cfg.cis_version} />
          </div>
        )}
        {cfg.last_error && <p className="px-5 py-2 text-xs text-red-600">{cfg.last_error}</p>}

        {cfg.connected && (
          <>
            <div className="flex flex-wrap items-end gap-3 px-5 py-4">
              <div className="min-w-[16rem] flex-1">
                <p className="mb-1 text-xs font-medium text-slate-600">{t("ebm.default_class")}</p>
                <ClassPicker value={cfg.default_item_class} disabled={!canEdit} onPick={(code) => patch({ default_item_class: code })} />
              </div>
              <label className="text-xs font-medium text-slate-600">{t("ebm.default_origin")}
                <input className={`${input} mt-1 w-20 uppercase`} disabled={!canEdit} maxLength={2} defaultValue={cfg.default_origin}
                  key={cfg.default_origin} placeholder="RW"
                  onBlur={(e) => { const v = e.target.value.trim().toUpperCase(); if (/^[A-Z]{2}$/.test(v) && v !== cfg.default_origin) patch({ default_origin: v }); }} />
              </label>
              <label className="text-xs font-medium text-slate-600">{t("ebm.default_tax")}
                <select className={`${input} mt-1`} disabled={!canEdit} value={cfg.default_tax_type}
                  onChange={(e) => patch({ default_tax_type: e.target.value })}>
                  {Object.entries(codes?.tax_types || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              {canEdit && (
                <button type="button" onClick={sync} disabled={!!busy}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  <RefreshCw size={13} className={busy === "sync" ? "animate-spin" : ""} /> {t("ebm.sync_classes")}
                </button>
              )}
            </div>
            <Toggle label={t("ebm.enabled")} hint={t("ebm.enabled_hint")} on={cfg.enabled} disabled={!canEdit || !!busy}
              onChange={(v) => patch({ enabled: v })} />
            <Toggle label={t("ebm.report_stock")} hint={t("ebm.report_stock_hint")} on={cfg.report_stock} disabled={!canEdit || !!busy}
              onChange={(v) => patch({ report_stock: v })} />
            <ProductTaxes codes={codes} canEdit={user?.role === "owner" || user?.role === "admin" || user?.role === "manager"} />
          </>
        )}
        {msg && <p className={`px-5 py-2.5 text-xs ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.ok && <CheckCircle2 size={12} className="mr-1 inline" />}{msg.text}</p>}
      </div>
    </Card>
  );
}

function Card({ children, status }: { children: React.ReactNode; status?: React.ReactNode }) {
  const { t } = useLanguage();
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><Landmark size={15} /></div>
        <h2 className="mr-auto text-sm font-semibold text-slate-700">{t("ebm.title")}</h2>
        {status}
      </div>
      {children}
    </div>
  );
}

function Info({ k, v }: { k: string; v: string | null }) {
  return <p className="flex justify-between gap-3 py-0.5"><span className="text-slate-500">{k}</span><span className="font-medium text-slate-800">{v || "—"}</span></p>;
}

function Toggle({ label, hint, on, disabled, onChange }: { label: string; hint: string; on: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-[#0a66c2]" : "bg-slate-300"}`}>
        <span style={{ backgroundColor: "#fff" }} className={`absolute top-0.5 h-5 w-5 rounded-full shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

/** Searches RRA's item classification list (downloaded with "Download RRA list"). */
function ClassPicker({ value, disabled, onPick }: { value: string | null; disabled?: boolean; onPick: (code: string) => void }) {
  const { t } = useLanguage();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<EbmItemClass[]>([]);
  const [cached, setCached] = useState<number | null>(null);
  // The chosen class's name, looked up in RRA's list ("5020230100 · Soft drinks").
  const [named, setNamed] = useState<{ code: string; text: string } | null>(null);
  useEffect(() => {
    if (!value) return;
    ebmApi.itemClasses(value).then((r) => {
      const hit = r.data.find((c) => c.code === value);
      if (hit) setNamed({ code: hit.code, text: `${hit.code} · ${hit.name}` });
    }).catch(() => {});
  }, [value]);
  const label = named?.code === value ? named.text : value;

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      ebmApi.itemClasses(q).then((r) => { setRows(r.data); setCached(r.cached); }).catch(() => setRows([]));
    }, 250);
    return () => clearTimeout(id);
  }, [q, open]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
        <Search size={13} className="text-slate-400" />
        <input className="w-full bg-transparent text-sm outline-none disabled:opacity-60" disabled={disabled}
          value={open ? q : label || value || ""} placeholder={t("ebm.class_search")}
          onFocus={() => { setOpen(true); setQ(""); }} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => setQ(e.target.value)} />
      </div>
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {cached === 0 && <p className="px-3 py-2 text-xs text-slate-500">{t("ebm.classes_empty")}</p>}
          {rows.map((r) => (
            <button key={r.code} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(r.code); setOpen(false); }}
              className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50">
              <span className="font-mono text-slate-500">{r.code}</span>
              <span className="flex-1 text-slate-800">{r.name}</span>
              {r.tax_type && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">{r.tax_type}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Each product's tax type and classification. Products not listed here use
 *  the defaults above when first sold. */
function ProductTaxes({ codes, canEdit }: { codes: EbmCodes | null; canEdit: boolean }) {
  const { t } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<Record<string, EbmItem>>({});
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    Promise.all([itemRequest("/products?limit=500"), ebmApi.items()]).then(([p, i]) => {
      setProducts(p?.data?.items || []);
      setItems(Object.fromEntries(i.data.map((x) => [x.product_id, x])));
    }).catch(() => {});
  }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => !s || p.name.toLowerCase().includes(s)).slice(0, 50);
  }, [products, q]);

  async function save(pid: string, patch: Partial<EbmItem>) {
    setSaving(pid); setErr("");
    try {
      const r = await ebmApi.saveItem(pid, patch);
      setItems((m) => ({ ...m, [pid]: r.data }));
    } catch (e) { setErr(e instanceof Error ? e.message : t("common.error")); }
    finally { setSaving(""); }
  }

  return (
    <div className="px-5 py-4">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm font-medium text-slate-800">{t("ebm.products_title")}</p>
        <input className="w-48 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-[#0a66c2]"
          value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search")} />
      </div>
      <p className="mb-2 text-xs text-slate-500">{t("ebm.products_hint")}</p>
      {err && <p className="mb-2 text-xs text-red-600">{err}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-[11px] uppercase text-slate-400">
            <th className="py-1.5 pr-2">{t("ebm.product")}</th><th className="py-1.5 pr-2">{t("ebm.tax_type")}</th>
            <th className="py-1.5 pr-2">{t("ebm.class_code")}</th><th className="py-1.5 pr-2">{t("ebm.origin")}</th><th className="py-1.5">{t("ebm.item_code")}</th>
          </tr></thead>
          <tbody>
            {shown.map((p) => {
              const it = items[p.id];
              return (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="py-1.5 pr-2 text-slate-800">{p.name}</td>
                  <td className="py-1.5 pr-2">
                    <select className="rounded border border-slate-200 px-1.5 py-1 disabled:opacity-60" disabled={!canEdit || saving === p.id}
                      value={it?.tax_type || ""} onChange={(e) => save(p.id, { tax_type: e.target.value })}>
                      {!it && <option value="">{t("ebm.use_default")}</option>}
                      {Object.entries(codes?.tax_types || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input className="w-28 rounded border border-slate-200 px-1.5 py-1 font-mono disabled:opacity-60" disabled={!canEdit || saving === p.id}
                      defaultValue={it?.item_class || ""} placeholder={t("ebm.use_default")} inputMode="numeric" maxLength={10}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== it?.item_class) save(p.id, { item_class: v }); }} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input className="w-12 rounded border border-slate-200 px-1.5 py-1 font-mono uppercase disabled:opacity-60"
                      disabled={!canEdit || saving === p.id || !!it?.registered} title={it?.registered ? t("ebm.origin_locked") : undefined}
                      defaultValue={it?.origin || ""} placeholder={t("ebm.use_default")} maxLength={2}
                      onBlur={(e) => { const v = e.target.value.trim().toUpperCase(); if (/^[A-Z]{2}$/.test(v) && v !== it?.origin) save(p.id, { origin: v }); }} />
                  </td>
                  <td className="py-1.5 font-mono text-slate-500">{it?.item_code || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
