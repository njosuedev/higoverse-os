// Single source of truth for public-facing SEO copy, shared by metadata,
// robots, sitemap, the OG image and JSON-LD.
export const SITE = {
  name: "Higoverse",
  url: "https://higoverse.com",
  title: "Higoverse | Business Management Platform for Shops & Car Dealers",
  shortTitle: "Business management platform",
  description:
    "Higoverse is the business management platform for shops and car dealers in Rwanda: inventory and stock, sales, purchases, expenses, customer debts, proforma invoices, payroll and real-time reports, on the web, Android and Windows.",
  logo: "/higoverse-logo.png",
  locale: "en_US",
  themeColor: "#0a66c2",
  background: "#f4f2ee",
  /** Public contact for privacy and account questions (privacy policy, app stores). */
  contactEmail: "higoverse@gmail.com",
  /** As on the Google Business Profile, so search engines match the two. */
  phone: "+250790885174",
  /** Official social profiles (JSON-LD sameAs). */
  social: [
    "https://www.facebook.com/people/Higoverse/100080225144892/",
    "https://www.instagram.com/higoverse",
    "https://x.com/higoverse",
  ],
  city: "Kigali",
  country: "RW",
} as const;
