// The catalogue as pictures, laid out like a printed sales flyer in the
// Higoverse logo's orange on white: a white header with an orange headline,
// an orange strip, a white grid of cars (price tag, big price, photo, name,
// specs, corner badges) and an orange bar with the shop's phone. Two sizes: the
// 1080×1920 WhatsApp Status card (one page of up to MODELS_PER_CARD models)
// and the 1200×630 preview WhatsApp shows under a shared link.
//
// Drawn with next/og, then turned into JPEG: Status recompresses anything it
// gets, and WhatsApp drops a link preview whose image is over ~300 KB.
//
// WhatsApp lays its own bars over a Status: the sender's name across the
// top (~250 px) and the reply box along the bottom (~400 px). Everything a
// customer must read stays between them; the bands just run on underneath.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import type { Lang } from "@/lib/i18n";
import {
  type Catalogue, type CatalogueModel, type CatalogueShop, MODELS_PER_CARD,
  catalogueT, colorHex, drawable, modelFacts,
} from "@/lib/catalogue";

// The logo's orange on a mostly white page (public/higoverse-logo.png).
const ORANGE = "#ff6800";
const ORANGE_SOFT = "#fff1e6";
const INK = "#1d2330";
const MUTED = "#6b7280";
const LINE = "#e7e7ea";

const W = 1080;
const H = 1920;
const SAFE_BOTTOM = H - 420; // 1500
const BAND = 520; // orange band; its words sit below WhatsApp's top bar (~230 px)
const STRIP = 64; // blue strip under it
const FOOT = 92; // contact row, last thing inside the safe zone
const GRID_TOP = BAND + STRIP;
const GRID_H = SAFE_BOTTOM - FOOT - GRID_TOP; // 824

type T = ReturnType<typeof catalogueT>;

// Geist, regular and bold (lib/fonts, SIL Open Font License): next/og's
// own font has no bold for names and prices.
let files: Promise<Buffer[]> | null = null;
async function fonts() {
  files ??= Promise.all(["Geist-Regular.woff", "Geist-Bold.woff"].map((f) => readFile(join(process.cwd(), "lib/fonts", f))));
  const [regular, bold] = await files;
  return [
    { name: "Geist", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Geist", data: bold, weight: 700 as const, style: "normal" as const },
  ];
}

async function toJpeg(image: ImageResponse, quality: number, maxBytes?: number): Promise<Buffer> {
  const png = Buffer.from(await image.arrayBuffer());
  let q = quality;
  let out = await sharp(png).jpeg({ quality: q, mozjpeg: true }).toBuffer();
  while (maxBytes && out.length > maxBytes && q > 40) {
    q -= 10;
    out = await sharp(png).jpeg({ quality: q, mozjpeg: true }).toBuffer();
  }
  return out;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const money = (n: number) => Math.round(n).toLocaleString("en-US");

/** A plain car outline for models without a photo (no emoji: next/og
 *  downloads emoji images while drawing). */
function CarIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" />
      <path d="M9 17h6" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  );
}

function Logo({ shop, size, ring = ORANGE }: { shop: CatalogueShop; size: number; ring?: string }) {
  const src = drawable(shop.logo);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={size} height={size} alt="" style={{ borderRadius: size, objectFit: "cover", background: "#fff", border: `4px solid ${ring}` }} />
  ) : (
    <div style={{
      width: size, height: size, borderRadius: size, background: ORANGE, color: "#fff", border: `4px solid ${ring}`,
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.48, fontWeight: 700,
    }}>{shop.name.trim().charAt(0).toUpperCase() || "H"}</div>
  );
}

function Photo({ src, width, height, radius = 14 }: { src: string | null; width: number; height: number; radius?: number }) {
  const img = drawable(src);
  return img ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={img} width={width} height={height} alt="" style={{ objectFit: "cover", borderRadius: radius }} />
  ) : (
    <div style={{ width, height, borderRadius: radius, display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6" }}>
      <CarIcon size={Math.min(width, height) * 0.55} color="#c4c8cf" />
    </div>
  );
}

/** Round corner badge, like a flyer's "BEST DEAL" sticker. */
function Badge({ text, filled, size }: { text: string; filled: boolean; size: number }) {
  return (
    <div style={{
      position: "absolute", top: -size * 0.18, right: -size * 0.12, width: size, height: size, borderRadius: size,
      background: filled ? ORANGE : "#fff", color: filled ? "#fff" : ORANGE, border: `4px solid ${filled ? "#fff" : ORANGE}`, display: "flex", alignItems: "center", justifyContent: "center",
      textAlign: "center", fontSize: size * 0.18, fontWeight: 700, lineHeight: 1.05, padding: size * 0.12, textTransform: "uppercase",
    }}>{text}</div>
  );
}

function badgeFor(m: CatalogueModel, t: T): { text: string; filled: boolean } | null {
  if (m.new_arrival) return { text: t("catalogue.badge_new"), filled: false };
  if (m.count === 1) return { text: t("catalogue.badge_last"), filled: true };
  return null;
}

/** "6 available", or a true scarcity signal when few are left: "Only 2 left". */
function availability(m: CatalogueModel, t: T): string {
  return m.count <= 3 ? t("catalogue.only_left", { n: m.count }) : t("catalogue.n_available", { n: m.count });
}

/** The availability as an outlined tag (orange when few are left). */
function Avail({ m, t, scale }: { m: CatalogueModel; t: T; scale: number }) {
  const few = m.count <= 3;
  return (
    <div style={{ display: "flex" }}>
      <span style={{
        fontSize: 16 * scale, fontWeight: 700, padding: `${2 * scale}px ${9 * scale}px`, borderRadius: 6 * scale,
        textTransform: "uppercase", letterSpacing: 0.5, border: `2px solid ${ORANGE}`,
        background: few ? ORANGE : "#fff", color: few ? "#fff" : ORANGE,
      }}>{availability(m, t)}</span>
    </div>
  );
}

/** The price as an orange ticket, the most contrasted thing in the cell:
 *  small "From" and currency, big white amount. */
function Price({ m, cat, t, scale }: { m: CatalogueModel; cat: Catalogue; t: T; scale: number }) {
  const from = m.max_price != null && m.min_price != null && m.max_price > m.min_price;
  if (m.min_price == null) {
    return <span style={{ fontSize: 24 * scale, fontWeight: 700, color: INK }}>{t("catalogue.price_on_request")}</span>;
  }
  return (
    <div style={{ display: "flex" }}>
      <div style={{
        display: "flex", flexDirection: "column", background: ORANGE, color: "#fff",
        padding: `${6 * scale}px ${12 * scale}px ${7 * scale}px`, borderRadius: 10 * scale,
        borderTopLeftRadius: 2 * scale, boxShadow: "0 6px 14px rgba(255,104,0,0.25)",
      }}>
        {from && <span style={{ fontSize: 14 * scale, fontWeight: 700, textTransform: "uppercase", opacity: 0.9, lineHeight: 1.1 }}>{t("catalogue.from")}</span>}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 5 * scale }}>
          <span style={{ fontSize: 30 * scale, fontWeight: 700, lineHeight: 1, letterSpacing: -1, flexShrink: 0 }}>{money(m.min_price)}</span>
          <span style={{ fontSize: 15 * scale, fontWeight: 700, marginBottom: 2 * scale, flexShrink: 0 }}>{cat.currency}</span>
        </div>
      </div>
    </div>
  );
}

/** The colours in stock as small dots (unknown names get a striped dot). */
function Dots({ m, size }: { m: CatalogueModel; size: number }) {
  if (!m.colors.length) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.4 }}>
      {m.colors.slice(0, 6).map((c) => (
        <div key={c} style={{
          width: size, height: size, borderRadius: size, border: "2px solid rgba(0,0,0,0.15)",
          background: colorHex(c) ?? "repeating-linear-gradient(45deg, #e5e7eb 0px, #e5e7eb 3px, #ffffff 3px, #ffffff 6px)",
        }} />
      ))}
      {m.colors.length > 6 && <span style={{ fontSize: size * 0.9, color: MUTED }}>+{m.colors.length - 6}</span>}
    </div>
  );
}

/** A grid cell: words on the left, photo on the right, as in a flyer. */
function Cell({ m, cat, t, width, height, scale, photoW }: {
  m: CatalogueModel; cat: Catalogue; t: T; width: number; height: number; scale: number; photoW: number;
}) {
  const badge = badgeFor(m, t);
  const facts = modelFacts(m, t);
  const photoH = Math.round(photoW * 10 / 16);
  return (
    <div style={{ width, height, display: "flex", alignItems: "center", padding: `0 ${22 * scale}px`, gap: 16 * scale }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 * scale, minWidth: 0 }}>
        <Avail m={m} t={t} scale={scale} />
        <span style={{ fontSize: 23 * scale, fontWeight: 700, color: INK, lineHeight: 1.1, textTransform: "uppercase" }}>{clip(m.name, 30)}</span>
        <Price m={m} cat={cat} t={t} scale={scale} />
        {facts.length > 0 && (
          <span style={{ fontSize: 16 * scale, color: MUTED, lineHeight: 1.3 }}>{clip(facts.join(" · "), 70)}</span>
        )}
        <Dots m={m} size={16 * scale} />
      </div>
      <div style={{ display: "flex", position: "relative" }}>
        <Photo src={m.cover} width={photoW} height={photoH} />
        {badge && <Badge text={badge.text} filled={badge.filled} size={84 * scale} />}
      </div>
    </div>
  );
}

/** One car filling the grid: big photo on top, words under it. */
function Hero({ m, cat, t }: { m: CatalogueModel; cat: Catalogue; t: T }) {
  const badge = badgeFor(m, t);
  const facts = modelFacts(m, t);
  return (
    <div style={{ width: W, height: GRID_H, display: "flex", flexDirection: "column", padding: "34px 48px", gap: 26 }}>
      <div style={{ display: "flex", position: "relative" }}>
        <Photo src={m.cover} width={W - 96} height={Math.round((W - 96) * 10 / 16)} radius={20} />
        {badge && <Badge text={badge.text} filled={badge.filled} size={150} />}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          <Avail m={m} t={t} scale={1.5} />
          <span style={{ fontSize: 46, fontWeight: 700, color: INK, textTransform: "uppercase", lineHeight: 1.05 }}>{clip(m.name, 32)}</span>
          {facts.length > 0 && <span style={{ fontSize: 26, color: MUTED }}>{clip(facts.join(" · "), 60)}</span>}
          <Dots m={m} size={26} />
        </div>
        <Price m={m} cat={cat} t={t} scale={1.35} />
      </div>
    </div>
  );
}

/** The stock in numbers for the header: cars, models, lowest price. */
function summary(cat: Catalogue, t: T): { value: string; label: string; labelFirst?: boolean }[] {
  const prices = cat.models.map((m) => m.min_price).filter((p): p is number => p != null);
  return [
    { value: String(cat.total), label: t("catalogue.stat_cars") },
    { value: String(cat.models.length), label: t("catalogue.stat_models") },
    ...(prices.length ? [{ value: `${money(Math.min(...prices))} ${cat.currency}`, label: t("catalogue.from"), labelFirst: true }] : []),
  ];
}

function Shell({ shop, cat, t, page, pages, children, headline, pills }: {
  shop: CatalogueShop; cat: Catalogue; t: T; page: number; pages: number; children: ReactNode;
  headline?: string; pills?: { value: string; label: string; labelFirst?: boolean }[];
}) {
  const title = headline ?? t("catalogue.headline");
  // Long car names step down so the headline stays on one or two lines.
  // (two lines at most, starting below WhatsApp's top bar).
  const titleSize = title.length > 24 ? 64 : title.length > 16 ? 80 : 104;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#fff", position: "relative" }}>
      {/* White header: the shop, and the headline in orange */}
      <div style={{
        height: BAND, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "0 56px 34px",
        background: "#fff", color: INK, position: "relative",
      }}>
        {/* Soft orange circles in the corner, as on a printed flyer */}
        <div style={{ position: "absolute", right: -140, top: -80, width: 460, height: 460, borderRadius: 460, background: ORANGE_SOFT }} />
        <div style={{ position: "absolute", right: 70, top: 150, width: 170, height: 170, borderRadius: 170, border: `12px solid ${ORANGE}` }} />
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 14 }}>
          <Logo shop={shop} size={70} />
          <span style={{ fontSize: 34, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{clip(shop.name, 30)}</span>
        </div>
        <span style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 0.95, textTransform: "uppercase", letterSpacing: -2, color: ORANGE }}>
          {clip(title, 40)}
        </span>
        <div style={{ display: (pills ?? summary(cat, t)).length ? "flex" : "none", gap: 12, marginTop: 18 }}>
          {(pills ?? summary(cat, t)).map(({ value, label, labelFirst }) => (
            <div key={label} style={{
              display: "flex", alignItems: "baseline", gap: 8, padding: "8px 18px", borderRadius: 999,
              flexDirection: labelFirst ? "row-reverse" : "row", background: ORANGE_SOFT, border: `2px solid #ffd9bf`,
            }}>
              <span style={{ fontSize: 30, fontWeight: 700, color: ORANGE }}>{value}</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: INK, textTransform: "uppercase" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Orange strip */}
      <div style={{
        height: STRIP, display: "flex", alignItems: "center", justifyContent: "center", background: ORANGE, color: "#fff",
        fontSize: 28, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5,
      }}>{t("catalogue.strip")}</div>

      {/* Cars */}
      <div style={{ height: GRID_H, display: "flex", flexWrap: "wrap", alignContent: "flex-start", overflow: "hidden" }}>{children}</div>

      {/* Orange bar with the phone (inside the safe zone); white below, under WhatsApp's reply box */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#fff" }}>
        <div style={{ height: FOOT, display: "flex", alignItems: "center", padding: "0 56px", gap: 18, background: ORANGE, color: "#fff" }}>
          <span style={{ fontSize: 22, fontWeight: 700, textTransform: "uppercase", opacity: 0.95, maxWidth: 330, lineHeight: 1.1 }}>{t("catalogue.reply_cta")}</span>
          <span style={{ fontSize: 42, fontWeight: 700, letterSpacing: 0.5 }}>{shop.phone ?? ""}</span>
          {pages > 1 && <span style={{ marginLeft: "auto", fontSize: 26, fontWeight: 700, background: "rgba(0,0,0,0.18)", padding: "6px 16px", borderRadius: 999 }}>{page} / {pages}</span>}
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 40, fontSize: 22, color: MUTED }}>
          {t("catalogue.powered")}
        </div>
      </div>
    </div>
  );
}

/** A spec as a labelled box, for the one-car advert. */
function SpecBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", padding: "12px 18px", borderRadius: 16, background: ORANGE_SOFT,
      border: "2px solid #ffd9bf", minWidth: 200,
    }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: "#9a6b4a", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      <span style={{ fontSize: 30, fontWeight: 700, color: INK }}>{value}</span>
    </div>
  );
}

/** One car as a Status advert: the car is the headline, then a big photo,
 *  its price ticket and availability, labelled specs and the colours. */
function Advert({ m, cat, t }: { m: CatalogueModel; cat: Catalogue; t: T }) {
  const badge = badgeFor(m, t);
  const years = m.years.length ? (m.years[0] === m.years[m.years.length - 1] ? String(m.years[0]) : `${m.years[0]}–${m.years[m.years.length - 1]}`) : null;
  const specs = [
    years && [t("catalogue.spec_year"), years],
    m.car_types.length === 1 && [t("catalogue.spec_body"), carTypeName(m.car_types[0], t)],
    m.battery_range && [t("catalogue.spec_range"), `${money(m.battery_range[0])} km`],
    m.mileage && m.conditions[0] !== "new" && [t("catalogue.spec_mileage"), `${money(m.mileage[0])} km`],
    m.conditions.length === 1 && [t("catalogue.spec_condition"), t(`proforma.condition_${m.conditions[0]}`)],
  ].filter(Boolean).slice(0, 4) as [string, string][];
  return (
    <div style={{ width: W, height: GRID_H, display: "flex", flexDirection: "column", padding: "28px 48px", gap: 22 }}>
      <div style={{ display: "flex", position: "relative" }}>
        <Photo src={m.cover} width={W - 96} height={470} radius={22} />
        {badge && <Badge text={badge.text} filled={badge.filled} size={150} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
        <Price m={m} cat={cat} t={t} scale={1.7} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          <Avail m={m} t={t} scale={1.5} />
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        {specs.map(([label, value]) => <SpecBox key={label} label={label} value={value} />)}
      </div>
      {m.colors.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#9a6b4a", textTransform: "uppercase" }}>{t("catalogue.spec_colours")}</span>
          {m.colors.slice(0, 5).map((c) => (
            <div key={c} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px 6px 6px", borderRadius: 999, border: `2px solid ${LINE}` }}>
              <div style={{
                width: 26, height: 26, borderRadius: 26, border: "2px solid rgba(0,0,0,0.15)",
                background: colorHex(c) ?? "repeating-linear-gradient(45deg, #e5e7eb 0px, #e5e7eb 3px, #ffffff 3px, #ffffff 6px)",
              }} />
              <span style={{ fontSize: 22, fontWeight: 700, color: INK }}>{clip(c, 14)}{m.color_counts?.[c] ? ` × ${m.color_counts[c]}` : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function carTypeName(value: string, t: T): string {
  const key = `vehicle.car_type_${value}`;
  const label = t(key);
  return label === key ? value : label;
}

/** One car (by name) as a 1080×1920 Status advert, as JPEG; null if it isn't on sale. */
export async function carCard(cat: Catalogue, shop: CatalogueShop, lang: Lang, name: string): Promise<Buffer | null> {
  const t = catalogueT(lang);
  const m = cat.models.find((x) => x.name === name);
  if (!m) return null;
  // The advert's own lines say availability and price; the header leads with the car alone.
  const pills: { value: string; label: string }[] = [];
  const image = new ImageResponse(
    <Shell shop={shop} cat={cat} t={t} page={1} pages={1} headline={m.name} pills={pills}>
      <Advert m={m} cat={cat} t={t} />
    </Shell>,
    { width: W, height: H, fonts: await fonts() },
  );
  return toJpeg(image, 88);
}

/** Page `page` (1-based) of the Status card, as JPEG. */
export async function statusCard(cat: Catalogue, shop: CatalogueShop, lang: Lang, page: number): Promise<Buffer> {
  const t = catalogueT(lang);
  const pages = Math.max(1, Math.ceil(cat.models.length / MODELS_PER_CARD));
  const p = Math.min(Math.max(page, 1), pages);
  const models = cat.models.slice((p - 1) * MODELS_PER_CARD, p * MODELS_PER_CARD);

  let body: ReactNode;
  if (models.length === 0) {
    body = (
      <div style={{ width: W, height: GRID_H, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
        <CarIcon size={200} color="#c4c8cf" />
        <span style={{ fontSize: 40, color: MUTED }}>{t("catalogue.empty")}</span>
      </div>
    );
  } else if (models.length === 1) {
    body = <Hero m={models[0]} cat={cat} t={t} />;
  } else if (models.length === 2) {
    // Two wide rows.
    const h = GRID_H / 2;
    body = models.map((m, i) => (
      <div key={m.name} style={{ display: "flex", borderTop: i ? `2px solid ${LINE}` : "none" }}>
        <Cell m={m} cat={cat} t={t} width={W} height={h - (i ? 2 : 0)} scale={1.45} photoW={560} />
      </div>
    ));
  } else {
    // Two columns, three rows, with flyer-style hairlines between cells.
    const cw = W / 2;
    const ch = GRID_H / 3;
    body = models.map((m, i) => (
      <div key={m.name} style={{
        display: "flex", width: cw, height: ch,
        borderLeft: i % 2 ? `2px solid ${LINE}` : "none", borderTop: i >= 2 ? `2px solid ${LINE}` : "none",
      }}>
        <Cell m={m} cat={cat} t={t} width={cw - (i % 2 ? 2 : 0)} height={ch - (i >= 2 ? 2 : 0)} scale={1} photoW={226} />
      </div>
    ));
  }

  const image = new ImageResponse(
    <Shell shop={shop} cat={cat} t={t} page={p} pages={pages}>{body}</Shell>,
    { width: W, height: H, fonts: await fonts() },
  );
  return toJpeg(image, 88);
}

/** The 1200×630 link preview, as JPEG under WhatsApp's ~300 KB limit. */
export async function previewCard(cat: Catalogue, shop: CatalogueShop, lang: Lang): Promise<Buffer> {
  const t = catalogueT(lang);
  const photos = cat.models.map((m) => drawable(m.cover)).filter((s): s is string => !!s).slice(0, 4);
  const one = photos.length === 1;
  const image = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#fff" }}>
        <div style={{
          width: 540, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 52px", gap: 16,
          background: "#fff", color: INK, borderRight: `10px solid ${ORANGE}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Logo shop={shop} size={78} />
            <span style={{ fontSize: 30, fontWeight: 700, textTransform: "uppercase", lineHeight: 1.1 }}>{clip(shop.name, 28)}</span>
          </div>
          <span style={{ fontSize: 76, fontWeight: 700, lineHeight: 0.95, textTransform: "uppercase", letterSpacing: -1.5, marginTop: 8, color: ORANGE }}>
            {t("catalogue.headline")}
          </span>
          <span style={{ fontSize: 28, fontWeight: 700, color: MUTED }}>
            {t(cat.total === 1 ? "catalogue.one_in_stock" : "catalogue.n_in_stock", { n: cat.total })}
          </span>
          {shop.phone && (
            <div style={{ display: "flex" }}>
              <span style={{ background: ORANGE, color: "#fff", fontSize: 30, fontWeight: 700, padding: "10px 24px", borderRadius: 999 }}>{shop.phone}</span>
            </div>
          )}
        </div>
        <div style={{ flex: 1, display: "flex", flexWrap: "wrap", padding: 8, gap: 8, background: "#fff" }}>
          {photos.length ? photos.map((src, i) => {
            const w = one ? 644 : 318;
            const h = photos.length <= 2 ? 614 : 303;
            // eslint-disable-next-line @next/next/no-img-element
            return <img key={i} src={src} alt="" width={w} height={h} style={{ objectFit: "cover", width: w, height: h, borderRadius: 12 }} />;
          }) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><CarIcon size={300} color="#c4c8cf" /></div>
          )}
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: await fonts() },
  );
  return toJpeg(image, 82, 290_000);
}
