import type { Metadata } from "next";
import AuthGuard from "@/app/components/AuthGuard";

export const metadata: Metadata = {
  title: "Settings",
  description: "Configure your shop profile, currency, language, and preferences.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
