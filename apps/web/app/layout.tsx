import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

import AuthGuard from "@/app/components/AuthGuard";
import DeviceGuard from "@/app/components/DeviceGuard";
import { LanguageProvider } from "@/lib/language-context";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  metadataBase: new URL("https://higoverse-os.vercel.app"),

  title: {
    default: "Higoverse | Business Technology Company",
    template: "%s | Higoverse",
  },

  description:
    "Higoverse is a modern business technology platform that helps shops and enterprises manage products, suppliers, customers, purchases, sales, inventory, and business operations efficiently.",

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
    title: "Higoverse | Business Technology Company",
    description:
      "Manage products, suppliers, customers, purchases, sales, and inventory from one powerful platform.",

    url: "https://higoverse-os.vercel.app",

    siteName: "Higoverse",

    images: [
      {
        url: "/higoverse.png",
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
    title: "Higoverse | Business Technology Company",
    description:
      "Modern inventory, sales, supplier, and customer management software for businesses.",
    images: ["/higoverse.png"],
  },

  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/higoverse.png",
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
            <AuthGuard>
              <DeviceGuard>{children}</DeviceGuard>
            </AuthGuard>
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
