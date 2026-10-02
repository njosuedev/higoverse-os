import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// Dashboard routes stay crawlable on purpose: they carry a `noindex` meta tag
// (see app/(dashboard)/layout.tsx), and a crawler can only honour that tag if
// robots.txt lets it fetch the page. Blocking them here would let Google
// index the bare URLs it discovers from links.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
