// The catalogue as pictures: a 1080×1920 WhatsApp Status card (one page of
// up to MODELS_PER_CARD models) and the 1200×630 preview WhatsApp shows
// under a shared link. Drawn with next/og, then turned into JPEG: Status
// recompresses anything it gets, and WhatsApp drops a link preview whose
// image is over ~300 KB, which a PNG with photos easily is.
//
// WhatsApp lays its own bars over a Status: the sender's name across the
// top (~250 px) and the reply box along the bottom (~400 px). Everything
// a customer must read stays between them.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import type { Lang } from "@/lib/i18n";
import {
  type Catalogue, type CatalogueModel, type CatalogueShop, MODELS_PER_CARD,
  catalogueT, drawable, modelFacts, modelPrice,
} from "@/lib/catalogue";

const NAVY = "#0b1f3a";
const NAVY_DEEP = "#06111f";
const BLUE = "#0a66c2";
const GREEN = "#25d366"; // WhatsApp's

const STATUS = { width: 1080, height: 1920, top: 230, bottom: 420, side: 56 };

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

function Logo({ shop, size }: { shop: CatalogueShop; size: number }) {
  const src = drawable(shop.logo);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={size} height={size} alt="" style={{ borderRadius: size / 4, objectFit: "cover", background: "#fff" }} />
  ) : (
    <div style={{
      width: size, height: size, borderRadius: size / 4, background: BLUE, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.45, fontWeight: 700,
    }}>{shop.name.trim().charAt(0).toUpperCase() || "H"}</div>
  );
}

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

function Photo({ src, width, height, radius }: { src: string | null; width: number; height: number; radius: number }) {
  const img = drawable(src);
  return img ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={img} width={width} height={height} alt="" style={{ objectFit: "cover", borderTopLeftRadius: radius, borderTopRightRadius: radius }} />
  ) : (
    <div style={{
      width, height, display: "flex", alignItems: "center", justifyContent: "center",
      background: "#e8eef6", borderTopLeftRadius: radius, borderTopRightRadius: radius,
    }}><CarIcon size={height * 0.5} color="#8aa0bb" /></div>
  );
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function Tile({ m, cat, t, width, photo, big }: {
  m: CatalogueModel; cat: Catalogue; t: ReturnType<typeof catalogueT>; width: number; photo: number; big: boolean;
}) {
  const price = modelPrice(m, cat.currency, t);
  const facts = modelFacts(m, t).join(" · ");
  return (
    <div style={{ width, display: "flex", flexDirection: "column", background: "#fff", borderRadius: 28, overflow: "hidden" }}>
      <div style={{ display: "flex", position: "relative" }}>
        <Photo src={m.cover} width={width} height={photo} radius={28} />
        <div style={{
          position: "absolute", top: 16, left: 16, display: "flex", padding: "6px 16px", borderRadius: 999,
          background: "rgba(6,17,31,0.78)", color: "#fff", fontSize: big ? 28 : 22, fontWeight: 700,
        }}>{t(m.count === 1 ? "catalogue.one_available" : "catalogue.n_available", { n: m.count })}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", padding: big ? "22px 28px 26px" : "16px 20px 20px", gap: big ? 8 : 4 }}>
        <span style={{ fontSize: big ? 46 : 32, fontWeight: 700, color: NAVY, lineHeight: 1.1 }}>{clip(m.name, big ? 34 : 24)}</span>
        {price && <span style={{ fontSize: big ? 38 : 28, fontWeight: 700, color: BLUE }}>{price}</span>}
        {facts && <span style={{ fontSize: big ? 28 : 21, color: "#5b6b80" }}>{clip(facts, big ? 60 : 38)}</span>}
      </div>
    </div>
  );
}

/** Page `page` (1-based) of the Status card, as JPEG. */
export async function statusCard(cat: Catalogue, shop: CatalogueShop, lang: Lang, page: number): Promise<Buffer> {
  const t = catalogueT(lang);
  const pages = Math.max(1, Math.ceil(cat.models.length / MODELS_PER_CARD));
  const p = Math.min(Math.max(page, 1), pages);
  const models = cat.models.slice((p - 1) * MODELS_PER_CARD, p * MODELS_PER_CARD);
  const inner = STATUS.width - STATUS.side * 2;
  const big = models.length <= 2;
  const colW = big ? inner : (inner - 20) / 2;
  // Sized so three rows (or two big tiles) fit between the shop and the
  // contact button, inside the safe zone.
  const photo = big ? (models.length === 1 ? 560 : 290) : 168;

  const image = new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        padding: `${STATUS.top}px ${STATUS.side}px ${STATUS.bottom}px`,
        background: `linear-gradient(180deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`, color: "#fff",
      }}>
        {/* Shop */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <Logo shop={shop} size={104} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <span style={{ fontSize: 50, fontWeight: 700, lineHeight: 1.1 }}>{clip(shop.name, 26)}</span>
            <span style={{ fontSize: 30, color: "#9fb6d4", marginTop: 6 }}>
              {t(cat.total === 1 ? "catalogue.one_in_stock" : "catalogue.n_in_stock", { n: cat.total })}
            </span>
          </div>
        </div>

        {/* Cars */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 28, flex: 1, alignContent: "flex-start", overflow: "hidden" }}>
          {models.length ? models.map((m) => <Tile key={m.name} m={m} cat={cat} t={t} width={colW} photo={photo} big={big} />) : (
            <span style={{ fontSize: 40, color: "#9fb6d4" }}>{t("catalogue.empty")}</span>
          )}
        </div>

        {/* Contact */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 24 }}>
          {shop.phone && (
            <div style={{
              display: "flex", alignItems: "center", gap: 14, padding: "16px 30px", borderRadius: 999,
              background: GREEN, color: "#06260f", fontSize: 36, fontWeight: 700,
            }}>{t("catalogue.call_or_whatsapp")} {shop.phone}</div>
          )}
          {pages > 1 && <span style={{ marginLeft: "auto", fontSize: 30, color: "#9fb6d4" }}>{p} / {pages}</span>}
        </div>
      </div>
    ),
    { width: STATUS.width, height: STATUS.height, fonts: await fonts() },
  );
  return toJpeg(image, 88);
}

/** The 1200×630 link preview, as JPEG under WhatsApp's ~300 KB limit. */
export async function previewCard(cat: Catalogue, shop: CatalogueShop, lang: Lang): Promise<Buffer> {
  const t = catalogueT(lang);
  const photos = cat.models.map((m) => drawable(m.cover)).filter((s): s is string => !!s).slice(0, 4);
  const image = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: NAVY, color: "#fff" }}>
        <div style={{ width: 560, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 56px", gap: 22 }}>
          <Logo shop={shop} size={96} />
          <span style={{ fontSize: 54, fontWeight: 700, lineHeight: 1.1 }}>{clip(shop.name, 30)}</span>
          <span style={{ fontSize: 32, color: "#9fb6d4" }}>
            {t(cat.total === 1 ? "catalogue.one_in_stock" : "catalogue.n_in_stock", { n: cat.total })}
          </span>
          {shop.phone && <span style={{ fontSize: 30, color: GREEN, fontWeight: 700 }}>{shop.phone}</span>}
        </div>
        <div style={{ flex: 1, display: "flex", flexWrap: "wrap" }}>
          {photos.length ? photos.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt="" width={photos.length === 1 ? 640 : 320} height={photos.length <= 2 ? 630 : 315}
              style={{ objectFit: "cover", width: photos.length === 1 ? 640 : 320, height: photos.length <= 2 ? 630 : 315 }} />
          )) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><CarIcon size={300} color="#3d5a80" /></div>
          )}
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: await fonts() },
  );
  return toJpeg(image, 80, 290_000);
}
