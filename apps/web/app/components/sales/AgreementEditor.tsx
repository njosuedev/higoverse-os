"use client";

// A car company's own wording of the rental agreement (Rentals → Agreement
// wording): per language, the title, the intro, the articles and the closing,
// with placeholders filled from each rental when printing. A live preview
// shows the agreement as it will print. Saved in sale-service
// (PUT /rentals/agreement-template); see lib/rental-print.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, FileText, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { askConfirm, notify } from "@/lib/dialogs";
import { getPrintShop } from "@/lib/print-shop";
import type { PrintShop } from "@/lib/proforma-print";
import { saveAgreementTemplate, type Rental } from "@/lib/rental-api";
import {
  AGREEMENT_LANGS, AGREEMENT_PLACEHOLDERS, DEFAULT_AGREEMENT, agreementTemplate, rentalAgreementHtml,
  type AgreementLang, type AgreementTemplate, type AgreementTemplates,
} from "@/lib/rental-print";

const clone = (t: AgreementTemplate): AgreementTemplate => ({ ...t, articles: t.articles.map((a) => ({ ...a })) });
const same = (a: AgreementTemplate, b: AgreementTemplate) => JSON.stringify(a) === JSON.stringify(b);

/** A rental to preview on: the latest one, or a made-up one. */
function sampleRental(): Rental {
  const d = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  return {
    id: "preview", rental_no: "RENT-0000", customer: "Jean Mugisha", customer_phone: "0788 000 000", customer_id_no: "1199080000000000",
    customer_address: "Kigali", car_name: "Toyota RAV4", car_type: "SUV", plate_no: "RAB 000 A", chassis_no: "JTMBFREV00D000000",
    start_date: d, end_date: end, agreement_date: d, rent_amount: 350000, deposit: 200000, currency: "RWF", notes: "",
    status: "active", return_note: "", created_by_name: "",
  };
}

type Field = { lang: AgreementLang; path: "title" | "intro" | "closing" | `a${number}.title` | `a${number}.body` };

export default function AgreementEditor({ own, latest, onClose, onSaved }: {
  own: AgreementTemplates | null;
  latest?: Rental | null;
  onClose: () => void;
  onSaved: (t: AgreementTemplates | null) => void;
}) {
  const { t } = useLanguage();
  const [lang, setLang] = useState<AgreementLang>(() => {
    try { const l = localStorage.getItem("hgv-rental-lang"); if (l === "rw" || l === "en" || l === "fr") return l; } catch { /* private mode */ }
    return "rw";
  });
  const [drafts, setDrafts] = useState<Record<AgreementLang, AgreementTemplate>>(() => ({
    rw: clone(agreementTemplate("rw", own)), en: clone(agreementTemplate("en", own)), fr: clone(agreementTemplate("fr", own)),
  }));
  const [shop, setShop] = useState<PrintShop>({ name: "" });
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  // The text box last typed in: a placeholder chip goes there, at the cursor.
  const focused = useRef<{ field: Field; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);

  useEffect(() => { getPrintShop().then(setShop).catch(() => {}); }, []);

  const d = drafts[lang];
  const edit = (patch: (x: AgreementTemplate) => AgreementTemplate) => {
    setDrafts((all) => ({ ...all, [lang]: patch(clone(all[lang])) }));
    setDirty(true);
  };
  const setPath = (path: Field["path"], value: string) => edit((x) => {
    const m = /^a(\d+)\.(title|body)$/.exec(path);
    if (m) x.articles[Number(m[1])][m[2] as "title" | "body"] = value;
    else x[path as "title" | "intro" | "closing"] = value;
    return x;
  });

  function insert(key: string) {
    const f = focused.current;
    const token = `{${key}}`;
    if (!f || f.field.lang !== lang || !f.el.isConnected) {
      navigator.clipboard?.writeText(token).catch(() => {});
      notify(t("rental.tpl_copied").replace("{x}", token), "success");
      return;
    }
    const el = f.el;
    const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? s;
    const next = el.value.slice(0, s) + token + el.value.slice(e);
    setPath(f.field.path, next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
  }

  const preview = useMemo(
    () => rentalAgreementHtml(latest ?? sampleRental(), shop, lang, { template: { [lang]: d } }),
    [latest, shop, lang, d],
  );

  async function save() {
    if (drafts.rw.title.trim() === "" || drafts.en.title.trim() === "" || drafts.fr.title.trim() === "") {
      notify(t("rental.tpl_err_title")); return;
    }
    // Only what differs from the standard wording is kept.
    const changed: AgreementTemplates = {};
    for (const { code } of AGREEMENT_LANGS) if (!same(drafts[code], DEFAULT_AGREEMENT[code])) changed[code] = drafts[code];
    setBusy(true);
    try {
      const res = await saveAgreementTemplate(changed);
      notify(t("rental.tpl_saved"), "success");
      setDirty(false);
      onSaved(res?.templates ?? null);
    } catch { notify(t("common.error")); }
    finally { setBusy(false); }
  }

  async function resetLang() {
    if (!(await askConfirm({ message: t("rental.tpl_reset_q") }))) return;
    setDrafts((all) => ({ ...all, [lang]: clone(DEFAULT_AGREEMENT[lang]) }));
    setDirty(true);
  }

  async function close() {
    if (dirty && !(await askConfirm({ message: t("rental.tpl_discard_q"), danger: true }))) return;
    onClose();
  }

  const inputCls = "w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2]";
  const box = (path: Field["path"], value: string, rows?: number) => {
    const common = {
      value,
      onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { focused.current = { field: { lang, path }, el: e.currentTarget }; },
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setPath(path, e.target.value),
      className: inputCls,
    };
    return rows ? <textarea {...common} rows={rows} /> : <input {...common} />;
  };
  const moveArticle = (i: number, by: -1 | 1) => edit((x) => {
    const j = i + by;
    if (j < 0 || j >= x.articles.length) return x;
    [x.articles[i], x.articles[j]] = [x.articles[j], x.articles[i]];
    return x;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4" onClick={() => !busy && void close()}>
      <div role="dialog" aria-modal="true" className="flex h-full max-h-[94vh] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div>
            <p className="flex items-center gap-2 font-bold text-slate-800"><FileText size={17} className="text-blue-600" /> {t("rental.tpl_title")}</p>
            <p className="mt-0.5 text-xs text-slate-500">{t("rental.tpl_hint")}</p>
          </div>
          <button onClick={() => void close()} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label={t("common.close")}><X size={16} /></button>
        </div>

        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-2 flex-wrap">
          {AGREEMENT_LANGS.map((l) => (
            <button key={l.code} onClick={() => setLang(l.code)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${lang === l.code ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
              {l.label}{!same(drafts[l.code], DEFAULT_AGREEMENT[l.code]) && <span className="ml-1 opacity-70">•</span>}
            </button>
          ))}
          <button onClick={() => void resetLang()} disabled={same(d, DEFAULT_AGREEMENT[lang])}
            className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-400 disabled:opacity-40">
            <RotateCcw size={12} /> {t("rental.tpl_reset")}
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
          <div className="min-h-0 overflow-y-auto px-5 py-4 space-y-3">
            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-500">{t("rental.tpl_placeholders")}</p>
              <div className="flex flex-wrap gap-1">
                {AGREEMENT_PLACEHOLDERS.map((k) => (
                  <button key={k} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(k)} title={t(`rental.ph_${k}`)}
                    className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] text-blue-700 hover:bg-blue-100">
                    {`{${k}}`}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{t("rental.tpl_lists")}</p>
            </div>

            <label className="block text-[11px] font-medium text-slate-500">{t("rental.tpl_doc_title")}</label>
            {box("title", d.title)}
            <label className="block text-[11px] font-medium text-slate-500">{t("rental.tpl_intro")}</label>
            {box("intro", d.intro, 4)}

            {d.articles.map((a, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2">
                <div className="flex items-center gap-1">
                  <div className="flex-1">{box(`a${i}.title`, a.title)}</div>
                  <button onClick={() => moveArticle(i, -1)} disabled={i === 0} className="h-8 w-7 flex items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-30" title={t("rental.tpl_up")}><ArrowUp size={14} /></button>
                  <button onClick={() => moveArticle(i, 1)} disabled={i === d.articles.length - 1} className="h-8 w-7 flex items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-30" title={t("rental.tpl_down")}><ArrowDown size={14} /></button>
                  <button onClick={() => edit((x) => { x.articles.splice(i, 1); return x; })} className="h-8 w-7 flex items-center justify-center text-slate-400 hover:text-red-600" title={t("common.delete")}><Trash2 size={14} /></button>
                </div>
                {box(`a${i}.body`, a.body, Math.min(10, Math.max(3, a.body.split("\n").length + 1)))}
              </div>
            ))}
            <button onClick={() => edit((x) => { x.articles.push({ title: "", body: "" }); return x; })} disabled={d.articles.length >= 30}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2 text-xs font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40">
              <Plus size={13} /> {t("rental.tpl_add_article")}
            </button>

            <label className="block text-[11px] font-medium text-slate-500">{t("rental.tpl_closing")}</label>
            {box("closing", d.closing, 2)}
          </div>

          <div className="hidden min-h-0 flex-col border-l border-slate-100 bg-slate-50 lg:flex">
            <p className="px-4 pt-3 text-[11px] font-medium text-slate-500">{t("rental.tpl_preview")}{latest ? ` · ${latest.rental_no}` : ` · ${t("rental.tpl_sample")}`}</p>
            <div className="min-h-0 flex-1 p-3">
              <iframe title={t("rental.tpl_preview")} srcDoc={preview} sandbox="" className="h-full w-full rounded-lg border border-slate-200 bg-white" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button onClick={() => void close()} disabled={busy} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">{t("common.cancel")}</button>
          <button onClick={() => void save()} disabled={busy || !dirty} className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: "#0a66c2" }}>
            {busy ? "…" : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
