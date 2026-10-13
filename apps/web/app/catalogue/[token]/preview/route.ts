import { catalogueLang, getCatalogue, getCatalogueShop } from "@/lib/catalogue";
import { previewCard } from "@/lib/catalogue-card";

// GET /catalogue/<token>/preview: the picture WhatsApp, Facebook and others
// show under a shared catalogue link (the page's og:image).
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cat = await getCatalogue(token, 480);
  const shop = cat && (await getCatalogueShop(cat.shop_id));
  if (!cat || !shop) return new Response("Not found", { status: 404 });

  const jpeg = await previewCard(cat, shop, catalogueLang(new URL(req.url).searchParams.get("lang") ?? cat.lang ?? null));
  return new Response(new Uint8Array(jpeg), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=300" },
  });
}
