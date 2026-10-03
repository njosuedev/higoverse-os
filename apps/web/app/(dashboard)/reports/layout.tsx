import type { Metadata } from "next";
import AuthGuard from "@/app/components/AuthGuard";
import OwnerOnly from "@/app/components/OwnerOnly";

export const metadata: Metadata = {
  title: "Reports",
  description: "View daily revenue, profit trends, and business performance analytics.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AuthGuard><OwnerOnly>{children}</OwnerOnly></AuthGuard>;
}
