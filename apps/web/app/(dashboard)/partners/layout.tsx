import type { Metadata } from "next";
import AuthGuard from "@/app/components/AuthGuard";

export const metadata: Metadata = {
  title: "Partners",
  description: "Manage suppliers, customers, and business partners for your shop.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}