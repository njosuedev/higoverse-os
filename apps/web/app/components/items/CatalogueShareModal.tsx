"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download, ExternalLink, Loader2, MessageCircle, X } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { useShopSettings } from "@/lib/shop-settings-context";
import { itemRequest } from "@/lib/product-api";
import { PRODUCT_API } from "@/lib/api-config";
import { LANGUAGES, type Lang } from "@/lib/i18n";
import { notify } from "@/lib/dialogs";

/** Models per Status card (lib/catalogue.ts MODELS_PER_CARD). */
const PER_CARD = 6;
/** Most one-car adverts made at once (a phone shares up to ~30 pictures). */
const MAX_ADVERTS = 20;

/**
 * Share the company's catalogue of cars on sale: as WhatsApp Status cards
 * (1080×1920, one per 6 models), as downloaded pictures, or as a public
 * link. The link is signed by product-service; whether prices show and in
 * which currency are part of it.
 */
export default function CatalogueShareModal({ onClose }: { onClose: () => void }) {
  const { t, lang: appLang } = useLanguage();
  const { currency } = useShopSettings();
  const [prices, setPrices] = useState(true);
  const [lang, setLang] = useState<Lang>(appLang);
  const [token, setToken] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  const [cars, setCars] = useState(0);
  const [names, setNames] = useState<string[]>([]);
  // "pages": the catalogue, 6 models a card; "cars": one advert per car name.
  const [mode, setMode] = useState<"pages" | "cars">("pages");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<"" | "status" | "download">("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await itemRequest(`/catalogue/link?prices=${prices ? "true" : "false"}&currency=${encodeURIComponent(currency)}`);
        const tok = r?.data?.token as string | undefined;
        if (!tok) throw new Error("no token");
        const res = await fetch(`${PRODUCT_API}/catalogue/public/${tok}?size=160`);
        const data = res.ok ? (await res.json())?.data : null;
        if (!alive) return;
        setToken(tok);
        setCars(data?.total ?? 0);
        setPages(Math.max(1, Math.ceil((data?.models?.length ?? 0) / PER_CARD)));
        setNames(((data?.models ?? []) as { name: string }[]).map((m) => m.name).slice(0, MAX_ADVERTS));
      } catch (e) {
        console.warn(e);
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
  }, [prices, currency]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = token ? `${origin}/catalogue/${token}?lang=${lang}` : "";
  // The pictures for the chosen mode: catalogue pages, or one advert per car.
  const cards = mode === "pages"
    ? Array.from({ length: pages }, (_, i) => ({
      key: `p${i + 1}`, file: `catalogue-${i + 1}.jpg`, alt: `${t("catalogue.title")} ${i + 1}/${pages}`,
      url: `/catalogue/${token}/status?page=${i + 1}&lang=${lang}`,
    }))
    : names.map((n, i) => ({
      key: `c${n}`, file: `${String(i + 1).padStart(2, "0")}-${n.replace(/[^\w-]+/g, "-")}.jpg`, alt: n,
      url: `/catalogue/${token}/status?car=${encodeURIComponent(n)}&lang=${lang}`,
    }));

  async function cardFiles(): Promise<File[]> {
    return Promise.all(cards.map(async (c) => {
      const res = await fetch(c.url);
      if (!res.ok) throw new Error(`${c.file}: ${res.status}`);
      return new File([await res.blob()], c.file, { type: "image/jpeg" });
    }));
  }

  function save(files: File[]) {
    for (const f of files) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(f);
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    }
  }

  // On a phone the share sheet offers WhatsApp → "My status"; the link goes
  // along as the caption, where customers can tap it.
  async function toStatus() {
    setBusy("status");
    try {
      const files = await cardFiles();
      if (navigator.canShare?.({ files })) {
        try { await navigator.share({ files, text: link }); } catch (e) {
          if ((e as Error).name !== "AbortError") throw e;
        }
      } else {
        save(files);
        notify(t("catalogue.status_on_phone"), "info");
      }
    } catch (e) {
      console.warn(e);
      notify(t("catalogue.card_failed"));
    } finally { setBusy(""); }
  }

  async function download() {
    setBusy("download");
    try { save(await cardFiles()); } catch (e) {
      console.warn(e);
      notify(t("catalogue.card_failed"));
    } finally { setBusy(""); }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { notify(link, "info"); }
  }

  const btn = "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition disabled:opacity-50";

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[92dvh] flex flex-col" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby="catalogue-title">
        <div className="flex justify-between items-center px-4 sm:px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <h2 id="catalogue-title" className="text-base font-semibold text-slate-800">{t("catalogue.title")}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{t("catalogue.subtitle")}</p>
          </div>
          <button onClick={onClose} aria-label={t("common.close")} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={17} /></button>
        </div>

        <div className="px-4 sm:px-6 py-4 space-y-4 overflow-y-auto flex-1">
          {/* Options */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={prices} onChange={(e) => { setPrices(e.target.checked); setToken(null); setFailed(false); }} className="h-4 w-4 accent-[#0a66c2]" />
              {t("catalogue.show_prices")}
            </label>
            <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t("catalogue.language")}
              className="ml-auto border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-gray-800">
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
            </select>
          </div>

          {/* What to make */}
          <div role="radiogroup" aria-label={t("catalogue.mode")} className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            {(["pages", "cars"] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {t(v === "pages" ? "catalogue.mode_pages" : "catalogue.mode_cars")}
              </button>
            ))}
          </div>

          {/* Cards */}
          {failed ? (
            <p className="rounded-xl bg-red-50 px-3 py-3 text-sm text-red-600">{t("catalogue.load_failed")}</p>
          ) : !token ? (
            <div className="flex h-56 items-center justify-center text-slate-400"><Loader2 className="animate-spin" size={22} /></div>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                {t(cars === 1 ? "catalogue.one_in_stock" : "catalogue.n_in_stock").replace("{n}", String(cars))}
                {cards.length > 1 && <> · {t("catalogue.n_cards").replace("{n}", String(cards.length))}</>}
              </p>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {cards.map((c) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={`${token}-${lang}-${c.key}`} src={c.url} alt={c.alt} loading="lazy"
                    className="h-64 w-36 shrink-0 rounded-xl border border-slate-200 bg-slate-100 object-cover" />
                ))}
              </div>
            </>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={toStatus} disabled={!token || !!busy} className={`${btn} col-span-2 bg-[#25d366] text-[#06260f] hover:brightness-95`}>
              {busy === "status" ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />} {t("catalogue.to_status")}
            </button>
            <button onClick={download} disabled={!token || !!busy} className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`}>
              {busy === "download" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {t("catalogue.download")}
            </button>
            <button onClick={copy} disabled={!token} className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`}>
              {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? t("catalogue.copied") : t("catalogue.copy_link")}
            </button>
            <a href={token ? `https://wa.me/?text=${encodeURIComponent(link)}` : undefined} target="_blank" rel="noopener noreferrer"
              aria-disabled={!token} className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50 ${token ? "" : "pointer-events-none opacity-50"}`}>
              <MessageCircle size={16} /> {t("catalogue.send_link")}
            </a>
            <a href={link || undefined} target="_blank" rel="noopener noreferrer"
              aria-disabled={!token} className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50 ${token ? "" : "pointer-events-none opacity-50"}`}>
              <ExternalLink size={16} /> {t("catalogue.open_page")}
            </a>
          </div>
          {token && <p className="break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-500">{link}</p>}
          <p className="text-xs text-slate-400">{t("catalogue.privacy_note")}</p>
        </div>
      </div>
    </div>
  );
}
