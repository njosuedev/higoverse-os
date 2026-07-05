import type { MetadataRoute } from "next";

const BASE_URL = "https://higoverse-os.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        "/products",
        "/categories",
        "/category/",
        "/product/",
        "/shop/",
        "/suppliers",
        "/search",
        "/about",
        "/contact",
        "/login",
        "/register",
      ],
      disallow: [
        "/dashboard",
        "/items",
        "/sales",
        "/purchases",
        "/expenses",
        "/partners",
        "/reports",
        "/proforma",
        "/settings",
        "/admin",
        "/advisor",
        "/messages",
        "/notifications",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
