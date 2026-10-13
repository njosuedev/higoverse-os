import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarCheck, Car, MapPin, MessageCircle, Navigation, Phone, Sparkles, Tag } from "lucide-react";
import { SITE } from "@/lib/site";
import { PRODUCT_API } from "@/lib/api-config";
import {
  type CatalogueModel, catalogueLang, cataloguePath, catalogueT, colorHex, getCatalogue, getCatalogueShop,
  isCode, phoneDigits, withParam,
} from "@/lib/catalogue";
import CatalogueBrowser, { type Labels, type ModelView } from "./CatalogueBrowser";
import ShareLinkButton from "./ShareLinkButton";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string | string[]; car?: string | string[] }>;
};

// Stock changes through the day: read again at most every minute.
export const revalidate = 60;

async function load(props: Props) {
  const [{ token }, sp] = await Promise.all([props.params, props.searchParams]);
  // No photos in the data: the page loads each one as a cached image, so
  // the page itself stays small.
  const cat = await getCatalogue(token, 640, false);
  const shop = cat && (await getCatalogueShop(cat.shop_id));
  const car = Array.isArray(sp.car) ? sp.car[0] : sp.car;
  // A short link carries its language; ?lang= still wins when given.
  const lang = catalogueLang(sp.lang ?? cat?.lang ?? null);
  return { token, lang, cat, shop, car: car ?? null, path: cataloguePath(token, lang) };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { token, lang, cat, shop, path } = await load(props);
  if (!cat || !shop) return { title: "Catalogue", robots: { index: false } };
  const t = catalogueT(lang);
  const title = t("catalogue.page_title", { shop: shop.name });
  // Short, as WhatsApp shows it under the link.
  const description = t(cat.total === 1 ? "catalogue.one_in_stock" : "catalogue.n_in_stock", { n: cat.total });
  const image = isCode(token) ? `${SITE.url}/c/${token}/preview` : `${SITE.url}/catalogue/${token}/preview?lang=${lang}`;
  return {
    title,
    description,
    // Shared by link only; search engines keep out.
    robots: { index: false, follow: false },
    openGraph: {
      title, description, type: "website", url: `${SITE.url}${path}`,
      images: [{ url: image, width: 1200, height: 630, type: "image/jpeg", alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

const money = (n: number) => Math.round(n).toLocaleString("en-US");
const span = (a: number, b: number, unit: string) => `${money(a)}${b > a ? `–${money(b)}` : ""} ${unit}`;

/**
 * A car company's cars on sale, for customers: the shop, a summary of the
 * stock, filters and sorting, one card per car name (photo, price, specs,
 * colours) opening a gallery with every detail, and how to reach the shop.
 * In the Higoverse logo's orange on white, like the WhatsApp Status cards
 * (lib/catalogue-card.tsx). Only what the catalogue holds is shown: no
 * claims the shop hasn't made.
 */
export default async function CataloguePage(props: Props) {
  const { token, lang, cat, shop, car, path } = await load(props);
  if (!cat || !shop) notFound();
  const t = catalogueT(lang);
  const phone = phoneDigits(shop.phone);
  const link = `${SITE.url}${path}`;
  const coverUrl = (name: string) => `${PRODUCT_API}/catalogue/public/${token}/cover?name=${encodeURIComponent(name)}&size=640`;
  const wa = (text: string) => (phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : null);
  const label = (key: string) => {
    const v = t(key);
    return v === key ? null : v;
  };

  const models: ModelView[] = cat.models.map((m: CatalogueModel) => {
    const body = m.car_types.length === 1 ? m.car_types[0] : null;
    const condition = m.conditions.length === 1 && (m.conditions[0] === "new" || m.conditions[0] === "used") ? m.conditions[0] : null;
    const years = m.years.length ? (m.years[0] === m.years[m.years.length - 1] ? String(m.years[0]) : `${m.years[0]}–${m.years[m.years.length - 1]}`) : null;
    const counts = m.color_counts ?? Object.fromEntries(m.colors.map((c) => [c, 0]));
    return {
      name: m.name,
      count: m.count,
      minPrice: m.min_price,
      maxPrice: m.max_price,
      cover: m.has_cover || m.cover ? coverUrl(m.name) : null,
      photos: m.photos ?? (m.has_cover ? 1 : 0),
      newArrival: !!m.new_arrival,
      body,
      bodyLabel: body ? (label(`vehicle.car_type_${body}`) ?? body) : null,
      condition,
      conditionLabel: condition ? t(`proforma.condition_${condition}`) : null,
      year: years,
      range: m.battery_range ? span(m.battery_range[0], m.battery_range[1], "km") : null,
      mileage: m.mileage && condition !== "new" ? span(m.mileage[0], m.mileage[1], "km") : null,
      colors: Object.entries(counts).map(([name, count]) => ({ name, count, hex: colorHex(name) })),
      lastAdded: m.last_added ?? null,
      // The link in the message opens this very car.
      ask: wa(t("catalogue.ask_model", { shop: shop.name, model: m.name, link: withParam(link, "car", m.name) })),
      testDrive: wa(t("catalogue.test_drive_msg", { shop: shop.name, model: m.name })),
    };
  });

  const L = Object.fromEntries(([
    "all", "new", "used", "sort", "sort_recommended", "sort_price_low", "sort_price_high", "sort_newest", "search",
    "no_results", "from", "price_on_request", "badge_new", "badge_last", "ask", "test_drive", "details", "close",
    "photos", "spec_year", "spec_body", "spec_range", "spec_mileage", "spec_condition", "spec_colours",
    "spec_available", "spec_price", "call", "one_available", "n_available", "n_photos", "only_left",
  ] as (keyof Labels)[]).map((k) => [k, t(`catalogue.${k}`)])) as Labels;

  // The stock in four numbers.
  const prices = cat.models.map((m) => m.min_price).filter((p): p is number => p != null);
  const stats = [
    { icon: Car, value: String(cat.total), label: t("catalogue.stat_cars") },
    { icon: Tag, value: String(cat.models.length), label: t("catalogue.stat_models") },
    prices.length ? { icon: Sparkles, value: money(Math.min(...prices)), label: t("catalogue.stat_from", { currency: cat.currency }) } : null,
    { icon: CalendarCheck, value: String(cat.models.filter((m) => m.new_arrival).length), label: t("catalogue.stat_new") },
  ].filter(Boolean) as { icon: typeof Car; value: string; label: string }[];

  const directions = shop.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${shop.name}, ${shop.address}`)}` : null;
  const logo = (size: string, text: string) => shop.logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={shop.logo} alt="" className={`${size} shrink-0 rounded-full border-2 border-[#e7e7ea] bg-white object-cover`} />
  ) : (
    <div className={`${size} ${text} flex shrink-0 items-center justify-center rounded-full bg-[#ff6800] font-bold text-white`}>
      {shop.name.trim().charAt(0).toUpperCase()}
    </div>
  );

  return (
    <main className="min-h-dvh bg-[#f7f7f8] text-[#1d2330]" lang={lang === "zh" ? "zh-CN" : lang}
      // Keyboard focus rings in the catalogue's orange, not the app's blue.
      style={{ "--color-ink": "#1d2330" } as React.CSSProperties}>
      <header className="relative overflow-hidden border-b border-[#e7e7ea] bg-white">
        <div aria-hidden className="absolute -right-28 -top-28 h-64 w-64 rounded-full bg-[#f4f4f5] sm:-right-24 sm:-top-20 sm:h-80 sm:w-80" />
        <div className="relative mx-auto max-w-5xl px-4 pb-5 pt-4 sm:pb-6 sm:pt-6">
          <div className="flex min-w-0 items-center gap-3">
            {logo("h-11 w-11 sm:h-12 sm:w-12", "text-xl")}
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold uppercase tracking-wide">{shop.name}</p>
              {shop.address && (
                <p className="flex items-center gap-1 truncate text-xs text-[#6b7280]"><MapPin size={12} className="shrink-0" /> {shop.address}</p>
              )}
            </div>
            {/* Phones: share sits in the corner; WhatsApp and Call live in the bottom bar. */}
            <div className="sm:hidden">
              <ShareLinkButton url={link} title={t("catalogue.page_title", { shop: shop.name })} label={t("catalogue.share")} copied={t("catalogue.copied")} iconOnly />
            </div>
          </div>
          <span aria-hidden className="mt-5 block h-1.5 w-12 rounded-full bg-[#ff6800] sm:mt-6" />
          <h1 className="mt-3 text-3xl font-extrabold uppercase leading-none tracking-tight text-[#1d2330] sm:text-5xl">{t("catalogue.headline")}</h1>
          <p className="mt-2.5 max-w-xl text-[15px] leading-snug text-[#4b5563] sm:mt-3 sm:text-base">{t("catalogue.intro")}</p>
          <div className="mt-5 hidden flex-wrap gap-2 sm:flex">
            {phone && (
              <>
                <a href={wa(t("catalogue.ask_shop", { shop: shop.name, link }))!} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-[#ff6800] px-4 py-2 text-sm font-bold text-white hover:bg-[#e85f00]">
                  <MessageCircle size={16} /> WhatsApp
                </a>
                <a href={`tel:+${phone}`}
                  className="inline-flex items-center gap-2 rounded-full border-2 border-[#d4d4d8] bg-white px-4 py-1.5 text-sm font-bold text-[#1d2330] hover:bg-[#f4f4f5]">
                  <Phone size={16} /> {shop.phone}
                </a>
              </>
            )}
            <ShareLinkButton url={link} title={t("catalogue.page_title", { shop: shop.name })} label={t("catalogue.share")} copied={t("catalogue.copied")} />
          </div>

          {/* Summary */}
          <dl className="hgv-stories -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:mt-6 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0">
            {stats.map(({ icon: Icon, value, label: l }) => (
              <div key={l} className="flex shrink-0 items-center gap-2.5 rounded-2xl border border-[#f0e6de] bg-white px-3 py-2 sm:gap-3 sm:py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f4f4f5] text-[#52525b] sm:h-9 sm:w-9"><Icon size={17} /></span>
                <div className="flex min-w-0 flex-col-reverse">
                  <dt className="truncate text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">{l}</dt>
                  <dd className="truncate text-base font-extrabold leading-tight tabular-nums sm:text-lg">{value}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </header>

      {cat.models.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-[#6b7280]">
          <Car size={44} strokeWidth={1.5} />
          <p>{t("catalogue.empty")}</p>
        </div>
      ) : (
        <CatalogueBrowser token={token} models={models} currency={cat.currency} L={L}
          phoneLink={phone ? `tel:+${phone}` : null} phone={shop.phone} initialCar={car} />
      )}

      {/* Visit / contact */}
      <section className="mx-auto max-w-5xl px-4 pb-10">
        <div className="relative overflow-hidden rounded-3xl bg-[#1d2330] p-6 text-white sm:p-8">
          <div aria-hidden className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
          <h2 className="relative text-2xl font-extrabold uppercase sm:text-3xl">{t("catalogue.visit_title")}</h2>
          <p className="relative mt-1 max-w-lg text-sm text-white/90">{t("catalogue.visit_text")}</p>
          <div className="relative mt-5 flex flex-wrap gap-2">
            {phone && (
              <a href={wa(t("catalogue.ask_shop", { shop: shop.name, link }))!} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#ff6800] px-4 py-2 text-sm font-bold text-white hover:bg-[#e85f00]">
                <MessageCircle size={16} /> WhatsApp
              </a>
            )}
            {phone && (
              <a href={`tel:+${phone}`} className="inline-flex items-center gap-2 rounded-full border-2 border-white px-4 py-1.5 text-sm font-bold text-white hover:bg-white/10">
                <Phone size={16} /> {shop.phone}
              </a>
            )}
            {directions && (
              <a href={directions} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border-2 border-white px-4 py-1.5 text-sm font-bold text-white hover:bg-white/10">
                <Navigation size={16} /> {t("catalogue.directions")}
              </a>
            )}
          </div>
          {shop.address && <p className="relative mt-4 flex items-center gap-1.5 text-sm text-white/90"><MapPin size={14} /> {shop.address}</p>}
        </div>
      </section>

      {/* Phones: the two things a buyer does, always under the thumb. */}
      {phone && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#f0e6de] bg-white/95 px-3 pt-2.5 backdrop-blur sm:hidden"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <a href={wa(t("catalogue.ask_shop", { shop: shop.name, link }))!} target="_blank" rel="noopener noreferrer"
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#ff6800] text-base font-bold text-white active:bg-[#e85f00]">
              <MessageCircle size={19} /> WhatsApp
            </a>
            <a href={`tel:+${phone}`} aria-label={`${t("catalogue.call")} ${shop.phone}`}
              className="flex h-12 items-center justify-center gap-2 rounded-full border-2 border-[#d4d4d8] px-5 text-base font-bold text-[#1d2330] active:bg-[#f4f4f5]">
              <Phone size={19} /> {t("catalogue.call")}
            </a>
          </div>
        </div>
      )}

      <footer className={`border-t border-[#e7e7ea] bg-white ${phone ? "pb-24 sm:pb-0" : ""}`}>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-5">
          {logo("h-10 w-10", "text-base")}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold uppercase">{shop.name}</p>
            {shop.phone && <p className="text-xs text-[#6b7280]">{t("catalogue.call_or_whatsapp")} {shop.phone}</p>}
          </div>
          <p className="ml-auto text-xs text-[#6b7280]">
            {t("catalogue.updated", { time: new Date(cat.generated_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kigali" }) })}
            {" · "}
            <a href={SITE.url} className="font-semibold text-[#1d2330] underline-offset-2 hover:underline">{t("catalogue.powered")}</a>
          </p>
        </div>
      </footer>
    </main>
  );
}
