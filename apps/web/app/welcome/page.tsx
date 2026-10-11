import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { latestReleases } from "@/lib/app-releases";
import { HOME_FAQ } from "./faq";
import Landing from "./Landing";

// The public home page. Served at higoverse.com/ to everyone not signed in
// (next.config.ts rewrites), so its address for search engines is "/".
const shareImage = { url: "/opengraph-image", width: 1200, height: 630, alt: `${SITE.name} · ${SITE.shortTitle}` };

export const metadata: Metadata = {
  title: { absolute: "Business Management Platform in Rwanda | Higoverse" },
  description:
    "Higoverse is the business management platform for shops and car dealers in Rwanda: stock, sales, purchases, expenses, customer debts, proformas, payroll and reports, on the web, Android and Windows.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: "Business Management Platform in Rwanda | Higoverse",
    description: "Run your whole business from one platform: stock, sales, debts, proformas, payroll and reports, on the web, Android and Windows.",
    url: "/",
    locale: SITE.locale,
    images: [shareImage],
  },
  twitter: { card: "summary_large_image", images: [shareImage] },
};

// The versions shown on the page are read again at most every five minutes.
export const revalidate = 300;

export default async function WelcomePage() {
  const releases = await latestReleases();
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE.url}/#organization`,
        name: SITE.name,
        url: SITE.url,
        logo: `${SITE.url}${SITE.logo}`,
        description: SITE.description,
        slogan: "Run your whole business from one platform",
        email: SITE.contactEmail,
        telephone: SITE.phone,
        address: { "@type": "PostalAddress", addressLocality: SITE.city, addressCountry: SITE.country },
        areaServed: { "@type": "Country", name: "Rwanda" },
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "sales",
          telephone: SITE.phone,
          email: SITE.contactEmail,
          areaServed: SITE.country,
          availableLanguage: ["English", "Kinyarwanda", "French", "Swahili", "Chinese"],
        },
        sameAs: SITE.social,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE.url}/#website`,
        name: SITE.name,
        url: SITE.url,
        publisher: { "@id": `${SITE.url}/#organization` },
        inLanguage: ["en", "rw", "fr", "sw", "zh"],
      },
      {
        "@type": "SoftwareApplication",
        name: SITE.name,
        url: SITE.url,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Business management platform",
        operatingSystem: "Web, Android, Windows",
        description: SITE.description,
        featureList: [
          "Inventory and stock management",
          "Sales and point of sale",
          "Purchases and suppliers",
          "Expense tracking",
          "Customer debt tracking",
          "Proforma invoices",
          "Payroll",
          "Business reports",
          "Car dealer vehicle tracking by chassis and plate",
          "Team roles and permissions",
        ],
        inLanguage: ["en", "rw", "fr", "sw", "zh"],
        publisher: { "@id": `${SITE.url}/#organization` },
        ...(releases.android ? { softwareVersion: releases.android.version, downloadUrl: `${SITE.url}/download` } : {}),
      },
      {
        "@type": "FAQPage",
        mainEntity: HOME_FAQ.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      },
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Landing releases={releases} />
    </>
  );
}
