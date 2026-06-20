import type { Metadata } from "next";
import AuthGuard from "@/app/components/AuthGuard";

export const metadata: Metadata = {
  title: "Purchases",
  description: "Track stock purchases, restock orders, and supplier costs.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}