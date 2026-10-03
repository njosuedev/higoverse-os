import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { LanguageProvider } from "@/lib/language-context";
import { AuthProvider } from "@/lib/auth-context";
import { QueryProvider } from "@/lib/query-provider";
import { DialogHost } from "@/lib/dialogs";
import { SITE } from "@/lib/site";

// Inter: a typeface drawn for screens — crisp at small sizes, with real
// semibold/bold weights. Downloaded at build time and served by the app.
const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  applicationName: SITE.name,

  title: {
    default: SITE.title,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,

  keywords: [
    "Higoverse",
    "shop management software",
    "inventory management",
    "stock management",
    "point of sale",
    "sales tracking",
    "purchase management",
    "expense tracking",
    "customer debt tracking",
    "proforma invoice",
    "business reports",
    "small business software",
    "retail software",
    "Rwanda business software",
    "Africa business software",
  ],

  authors: [{ name: SITE.name, url: SITE.url }],
  creator: SITE.name,
  publisher: SITE.name,
  category: "Business",

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-video-preview": -1,
      "max-snippet": -1,
    },
  },

  // og:image / twitter fallback come from app/opengraph-image.tsx (1200×630).
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
    url: "/",
    locale: SITE.locale,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description: SITE.description,
  },

  appleWebApp: { capable: true, title: SITE.name, statusBarStyle: "default" },
  formatDetection: { telephone: false, email: false, address: false },

  icons: {
    icon: SITE.logo,
    shortcut: SITE.logo,
    apple: SITE.logo,
  },

  // Paste the token from Google Search Console / Bing Webmaster Tools into
  // these env vars to verify ownership of higoverse.com.
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : undefined,
  },
};

export const viewport: Viewport = {
  themeColor: SITE.themeColor,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AuthProvider>
          <LanguageProvider>
            <QueryProvider>{children}</QueryProvider>
            <DialogHost />
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
