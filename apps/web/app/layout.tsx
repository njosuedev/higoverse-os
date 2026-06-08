import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthGuard from "@/app/components/AuthGuard";
import DeviceGuard from "@/components/DeviceGuard";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Higoverse",
  description: "Shop connection",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthGuard>
          <DeviceGuard>
            {children}
          </DeviceGuard>
        </AuthGuard>
      </body>
    </html>
  );
}
