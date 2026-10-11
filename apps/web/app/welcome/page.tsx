import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { latestReleases } from "@/lib/app-releases";
import { HOME_FAQ } from "./faq";
import Landing from "./Landing";

// The public home page. Served at higoverse.com/ to everyone not signed in
// (proxy.ts), so its address for search engines is "/".
const shareImage = { url: "/opengraph-image", width: 1200, height: 630, alt: `${SITE.name} · ${SITE.shortTitle}` };

export const metadata: Metadata = {
  title: { absolute: "Higoverse | Business Software for Shops and Car Dealers in Rwanda" },
  description:
    "Record stock, sales, purchases, expenses, customer debts, proforma invoices and salaries, and track every vehicle by chassis and plate. On the web, Android and Windows, in English, Kinyarwanda, French, Swahili and Chinese.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: "Higoverse | Business Software for Shops and Car Dealers in Rwanda",
    description: "Stock, sales, debts, proformas, payroll and reports in one place, on the web, Android and Windows.",
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
        email: SITE.contactEmail,
        telephone: SITE.phone,
        address: { "@type": "PostalAddress", addressLocality: SITE.city, addressCountry: SITE.country },
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
        operatingSystem: "Web, Android, Windows",
        description: SITE.description,
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
