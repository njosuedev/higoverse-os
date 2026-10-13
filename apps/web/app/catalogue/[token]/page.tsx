import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Car, MapPin, MessageCircle, Phone } from "lucide-react";
import { SITE } from "@/lib/site";
import {
  catalogueLang, catalogueT, getCatalogue, getCatalogueShop, modelFacts, modelPrice, phoneDigits,
} from "@/lib/catalogue";
import ShareLinkButton from "./ShareLinkButton";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
};

// Stock changes through the day: read again at most every minute.
export const revalidate = 60;

async function load(props: Props) {
  const [{ token }, sp] = await Promise.all([props.params, props.searchParams]);
  const cat = await getCatalogue(token, 480);
  const shop = cat && (await getCatalogueShop(cat.shop_id));
  return { token, lang: catalogueLang(sp.lang), cat, shop };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { token, lang, cat, shop } = await load(props);
  if (!cat || !shop) return { title: "Catalogue", robots: { index: false } };
  const t = catalogueT(lang);
  const title = t("catalogue.page_title", { shop: shop.name });
  const description = t(cat.total === 1 ? "catalogue.one_in_stock" : "catalogue.n_in_stock", { n: cat.total })
    + (cat.models.length ? ` · ${cat.models.slice(0, 4).map((m) => m.name).join(", ")}` : "");
  const image = `${SITE.url}/catalogue/${token}/preview?lang=${lang}`;
  return {
    title,
    description,
    // Shared by link only; search engines keep out.
    robots: { index: false, follow: false },
    openGraph: {
      title, description, type: "website", url: `${SITE.url}/catalogue/${token}?lang=${lang}`,
      images: [{ url: image, width: 1200, height: 630, type: "image/jpeg", alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

/** A car company's cars on sale, one card per car name, for customers. */
export default async function CataloguePage(props: Props) {
  const { token, lang, cat, shop } = await load(props);
  if (!cat || !shop) notFound();
  const t = catalogueT(lang);
  const phone = phoneDigits(shop.phone);
  const link = `${SITE.url}/catalogue/${token}?lang=${lang}`;
  const ask = (model?: string) =>
    `https://wa.me/${phone}?text=${encodeURIComponent(
      model ? t("catalogue.ask_model", { shop: shop.name, model, link }) : t("catalogue.ask_shop", { shop: shop.name, link }),
    )}`;

  return (
    <main className="min-h-dvh bg-paper text-text" lang={lang === "zh" ? "zh-CN" : lang}>
      <header className="bg-[#0b1f3a] text-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            {shop.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shop.logo} alt="" className="h-14 w-14 shrink-0 rounded-xl bg-white object-cover" />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-ink text-2xl font-bold">
                {shop.name.trim().charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold sm:text-2xl">{shop.name}</h1>
              <p className="text-sm text-[#9fb6d4]">
                {t(cat.total === 1 ? "catalogue.one_in_stock" : "catalogue.n_in_stock", { n: cat.total })}
              </p>
              {shop.address && (
                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-[#9fb6d4]"><MapPin size={12} className="shrink-0" /> {shop.address}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            {phone && (
              <>
                <a href={ask()} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-[#25d366] px-4 py-2 text-sm font-bold text-[#06260f] hover:brightness-95">
                  <MessageCircle size={16} /> WhatsApp
                </a>
                <a href={`tel:+${phone}`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 px-4 py-2 text-sm font-semibold hover:bg-white/10">
                  <Phone size={16} /> {shop.phone}
                </a>
              </>
            )}
            <ShareLinkButton url={link} title={t("catalogue.page_title", { shop: shop.name })} label={t("catalogue.share")} copied={t("catalogue.copied")} />
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-6">
        {cat.models.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-24 text-text-muted">
            <Car size={44} strokeWidth={1.5} />
            <p>{t("catalogue.empty")}</p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cat.models.map((m) => {
              const price = modelPrice(m, cat.currency, t);
              const facts = modelFacts(m, t);
              return (
                <li key={m.name} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-white">
                  <div className="relative aspect-[16/10] bg-paper-dim">
                    {m.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.cover} alt={m.name} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-border-strong"><Car size={56} strokeWidth={1.25} /></div>
                    )}
                    <span className="absolute left-3 top-3 rounded-full bg-[#06111f]/80 px-3 py-1 text-xs font-bold text-white">
                      {t(m.count === 1 ? "catalogue.one_available" : "catalogue.n_available", { n: m.count })}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 p-4">
                    <h2 className="text-lg font-bold leading-tight">{m.name}</h2>
                    {price && <p className="text-base font-bold text-ink">{price}</p>}
                    {facts.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5 pt-1">
                        {facts.map((f) => <li key={f} className="rounded-full bg-paper px-2.5 py-0.5 text-xs text-text-muted">{f}</li>)}
                      </ul>
                    )}
                    {m.colors.length > 0 && (
                      <p className="text-xs text-text-faint">{t("catalogue.colors")}: {m.colors.join(", ")}</p>
                    )}
                    {phone && (
                      <div className="mt-auto pt-3">
                        <a href={ask(m.name)} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 rounded-full bg-[#25d366] px-4 py-2 text-sm font-bold text-[#06260f] hover:brightness-95">
                          <MessageCircle size={16} /> {t("catalogue.ask")}
                        </a>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-8 text-center text-xs text-text-faint">
          {t("catalogue.updated", { time: new Date(cat.generated_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kigali" }) })}
          {" · "}
          <a href={SITE.url} className="hover:text-ink">{t("catalogue.powered")}</a>
        </p>
      </section>
    </main>
  );
}
