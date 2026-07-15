import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

import { LanguageProvider } from "@/lib/language-context";
import { AuthProvider } from "@/lib/auth-context";
import { QueryProvider } from "@/lib/query-provider";

export const metadata: Metadata = {
  metadataBase: new URL("https://aandtconsultants.vercel.app"),

  title: {
    default: "A & T Consultants | Business Technology Company",
    template: "%s | A & T Consultants",
  },

  description:
    "A & T Consultants is a modern business technology platform that helps shops and enterprises manage products, suppliers, customers, purchases, sales, inventory, and business operations efficiently.",

  keywords: [
    "A & T Consultants",
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
      name: "A & T Consultants",
    },
  ],

  creator: "A & T Consultants",
  publisher: "A & T Consultants",

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
    title: "A & T Consultants | Business Technology Company",
    description:
      "Manage products, suppliers, customers, purchases, sales, and inventory from one powerful platform.",

    url: "https://aandtconsultants.vercel.app",

    siteName: "A & T Consultants",

    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
        alt: "A & T Consultants Business Platform",
      },
    ],

    locale: "en_US",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "A & T Consultants | Business Technology Company",
    description:
      "Modern inventory, sales, supplier, and customer management software for businesses.",
    images: ["/logo.png"],
  },

  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
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
      <body className={`${sora.variable} ${sora.className}`}>
        <AuthProvider>
          <LanguageProvider>
            <QueryProvider>{children}</QueryProvider>
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
