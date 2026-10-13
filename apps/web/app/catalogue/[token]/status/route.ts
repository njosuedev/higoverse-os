import { catalogueLang, getCatalogue, getCatalogueShop } from "@/lib/catalogue";
import { carCard, statusCard } from "@/lib/catalogue-card";

// GET /catalogue/<token>/status?page=1&lang=rw: one page of the catalogue as
// a 1080×1920 JPEG for WhatsApp Status (downloaded or shared by the app).
// GET /catalogue/<token>/status?car=<name>: that one car as a Status advert.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cat = await getCatalogue(token, 960);
  const shop = cat && (await getCatalogueShop(cat.shop_id));
  if (!cat || !shop) return new Response("Not found", { status: 404 });

  const url = new URL(req.url);
  const lang = catalogueLang(url.searchParams.get("lang") ?? cat.lang ?? null);
  const car = url.searchParams.get("car");
  const page = Number(url.searchParams.get("page")) || 1;
  const jpeg = car ? await carCard(cat, shop, lang, car) : await statusCard(cat, shop, lang, page);
  if (!jpeg) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `inline; filename="${car ? "car" : `catalogue-${page}`}.jpg"`,
      "Cache-Control": "public, max-age=60",
    },
  });
}
