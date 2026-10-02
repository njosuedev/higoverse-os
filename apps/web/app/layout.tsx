import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

import { LanguageProvider } from "@/lib/language-context";
import { AuthProvider } from "@/lib/auth-context";
import { QueryProvider } from "@/lib/query-provider";

export const metadata: Metadata = {
  metadataBase: new URL("https://higoverse.com"),

  title: {
    default: "Higoverse | Business Records & Transactions Platform",
    template: "%s | Higoverse",
  },

  description:
    "Higoverse is a modern business platform that helps shops and enterprises manage business records and transactions — products, suppliers, customers, purchases, sales, inventory, and business operations efficiently.",

  keywords: [
    "Higoverse",
    "business software",
    "inventory management",
    "shop management",
    "supplier management",
    "customer management",
    "sales management",
    "purchase management",
    "stock management",
    "business platform",
    "retail software",
    "enterprise software",
    "Rwanda technology",
    "Africa technology",
  ],

  authors: [
    {
      name: "Higoverse",
    },
  ],

  creator: "Higoverse",
  publisher: "Higoverse",

  manifest: "/manifest.json",

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

  openGraph: {
    title: "Higoverse | Business Records & Transactions Platform",
    description:
      "Manage business records and transactions — products, suppliers, customers, purchases, sales, and inventory — from one powerful platform.",

    url: "https://higoverse.com",

    siteName: "Higoverse",

    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
        alt: "Higoverse Business Platform",
      },
    ],

    locale: "en_US",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "Higoverse | Business Records & Transactions Platform",
    description:
      "Modern inventory, sales, supplier, and customer management software for businesses.",
    images: ["/logo.png"],
  },

  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },

  category: "Business",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head />
      <body className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} ${plexSans.className}`}>
        <AuthProvider>
          <LanguageProvider>
            <QueryProvider>{children}</QueryProvider>
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
