import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: SITE.name,
    short_name: SITE.name,
    description: SITE.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "en",
    categories: ["business", "productivity", "finance"],
    background_color: "#ffffff",
    theme_color: SITE.themeColor,
    icons: [
      { src: SITE.logo, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: SITE.logo, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
